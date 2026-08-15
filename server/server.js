import 'dotenv/config';
import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';

const PORT = Number(process.env.PORT || 10000);
const SYMBOL = 'XAUUSD';
const TF = { '5m': 300, '15m': 900, '30m': 1800, '1h': 3600 };
const VALID_TF = new Set(Object.keys(TF));
const HISTORY_SIZE = Math.max(200, Math.min(1000, Number(process.env.HISTORY_SIZE || 500)));
const MIN_HISTORY = 40;

const BROKERET_KEY = process.env.BROKERET_API_KEY || 'demo';
const BR_TZ = 'America/Sao_Paulo';
const XAUS_SPOT = 'https://xaus.com/api/v1/spot';
const XAUS_INTRADAY = 'https://xaus.com/api/v1/intraday';
const KRAKEN_PAXG_TICKER = 'https://api.kraken.com/0/public/Ticker?pair=PAXGUSD';
const KRAKEN_PAXG_OHLC = 'https://api.kraken.com/0/public/OHLC?pair=PAXGUSD&interval=5';
const XAUS_REFRESH_MS = 30_000;
const XAUS_STALE_SEC = 90;
const OFFICIAL_STALE_SEC = 45;
const HISTORY_REFRESH_MS = 10 * 60_000;
const DXY_REFRESH_MS = 60_000;
const DXY_STALE_SEC = 120;
const DXY_MAX_AGE_SEC = 600;
const HTTP_TIMEOUT_MS = 12_000;

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/stream' });

const clients = new Set();
const candleStore = new Map(Object.keys(TF).map(tf => [tf, []]));

let upstream = null;
let upstreamState = 'disconnected';
let reconnectTimer = null;
let backoff = 1000;
let lastOfficialTickAt = 0;
let lastTick = null;
let feedName = 'starting';
let historySource = 'none';
let historyLoadedAt = 0;
let historyAsOf = null;
let historyState = 'waiting';
let historyBusy = false;
let lastMode = null;
let dxyState = { value: null, source: null, asOf: null, ageSec: null, status: 'SEM FEED', error: null };

function finite(v) { return Number.isFinite(Number(v)); }
function n(v) { const x = Number(v); return Number.isFinite(x) ? x : null; }
function now() { return Date.now(); }
function bucket(ts, sec) { return Math.floor(Number(ts) / 1000 / sec) * sec * 1000; }
function closedOnly(arr) { return (arr || []).filter(c => c.closed !== false); }

function brtParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BR_TZ, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(date);
  const out = {};
  for (const p of parts) if (p.type !== 'literal') out[p.type] = p.value;
  const day = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 }[out.weekday];
  return { day, minutes: Number(out.hour) * 60 + Number(out.minute) };
}

function isWeekendMode(date = new Date()) {
  const { day, minutes } = brtParts(date);
  return day === 6 || (day === 5 && minutes >= 16 * 60) || (day === 0 && minutes < 19 * 60);
}
function marketMode(date = new Date()) { return isWeekendMode(date) ? 'OTC' : 'NORMAL'; }

function sessionActive(name, date = new Date()) {
  const { minutes:m } = brtParts(date);
  const ranges = {
    Sydney: [19*60, 4*60],
    'Tóquio': [21*60, 6*60],
    Londres: [4*60, 12*60],
    'N. York': [9*60, 16*60]
  };
  const [a,b] = ranges[name];
  if (a > b) return m >= a || m < b;
  return m >= a && m < b;
}
function activeSessions(date = new Date()) {
  if (isWeekendMode(date)) return [];
  return ['Sydney','Tóquio','Londres','N. York'].filter(x => sessionActive(x, date));
}

function timeoutSignal(ms = HTTP_TIMEOUT_MS) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  return { signal: ac.signal, done: () => clearTimeout(timer) };
}
async function fetchJson(url, headers = {}) {
  const ctl = timeoutSignal();
  try {
    const r = await fetch(url, { headers: { Accept:'application/json', ...headers }, signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { ctl.done(); }
}
function send(client, msg) {
  if (client.ws.readyState === WebSocket.OPEN) client.ws.send(JSON.stringify(msg));
}
function broadcast(msg) { for (const c of clients) send(c, msg); }

function normalizeXausTime(v) {
  if (v == null) return NaN;
  if (typeof v === 'string') {
    const p = Date.parse(v);
    if (Number.isFinite(p)) return p;
  }
  const x = Number(v);
  if (!Number.isFinite(x)) return NaN;
  return x < 1e12 ? x * 1000 : x;
}

function rebuildHigherTf(tf) {
  const sec = TF[tf];
  const base = closedOnly(candleStore.get('5m'));
  const map = new Map();
  for (const c of base) {
    const bt = bucket(c.t, sec);
    let x = map.get(bt);
    if (!x) {
      x = { t:bt, o:c.o, h:c.h, l:c.l, c:c.c, closed:true, marketSource:c.marketSource };
      map.set(bt, x);
    } else {
      x.h = Math.max(x.h, c.h);
      x.l = Math.min(x.l, c.l);
      x.c = c.c;
      if (x.marketSource !== c.marketSource) x.marketSource = 'MIXED';
    }
  }
  const arr = candleStore.get(tf);
  arr.length = 0;
  arr.push(...[...map.values()].sort((a,b)=>a.t-b.t).slice(-HISTORY_SIZE));
}

function replaceHistory(rows, source) {
  const arr = candleStore.get('5m');
  arr.length = 0;
  arr.push(...rows.slice(-HISTORY_SIZE));
  for (const tf of ['15m','30m','1h']) rebuildHigherTf(tf);
  historySource = source;
  historyLoadedAt = now();
  historyAsOf = arr.length ? arr[arr.length-1].t : null;
  historyState = arr.length >= MIN_HISTORY ? 'ready' : 'warming';
  broadcastHistory();
  broadcastMarket();
}

function updateCandle(price, ts, marketSource) {
  for (const [tf, sec] of Object.entries(TF)) {
    const bt = bucket(ts, sec);
    const arr = candleStore.get(tf);
    let c = arr[arr.length - 1];
    if (!c || c.t !== bt || (c.marketSource && c.marketSource !== marketSource && tf === '5m')) {
      if (c) c.closed = true;
      c = { t:bt, o:price, h:price, l:price, c:price, volume:1, delta:0, closed:false, marketSource };
      arr.push(c);
      if (arr.length > HISTORY_SIZE) arr.shift();
    } else {
      const dir = price > c.c ? 1 : price < c.c ? -1 : 0;
      c.h = Math.max(c.h, price);
      c.l = Math.min(c.l, price);
      c.c = price;
      c.volume = (c.volume || 0) + 1;
      c.delta = (c.delta || 0) + dir;
    }
  }
  const base = closedOnly(candleStore.get('5m'));
  if (base.length) historyAsOf = base[base.length - 1].t;
}

function emitTick(price, ts, source) {
  if (!finite(price) || price <= 0 || !finite(ts)) return;
  const src = source?.name || 'unknown';
  const mode = marketMode(new Date(ts));
  const sourceMode = source?.marketSource === 'OTC' ? 'OTC' : 'NORMAL';
  if (mode !== sourceMode) return;

  lastTick = { price:Number(price), ts:Number(ts), source };
  feedName = src;
  updateCandle(Number(price), Number(ts), source?.marketSource || (src === 'xaus-otc' ? 'OTC' : src === 'brokeret' || src === 'brokeret-demo' ? 'OFFICIAL' : 'SPOT_FALLBACK'));
  broadcast({
    type:'tick', symbol:SYMBOL, price:Number(price), ts:Number(ts),
    source, serverTs:now(), marketMode:marketMode(), sessions:activeSessions()
  });
  broadcastMarket();
}

async function fetchXausSpot() {
  const j = await fetchJson(`${XAUS_SPOT}?compact=1&fresh=${Date.now()}`, { 'User-Agent':'XAUUSD-Mobile-Signal/2.0' });
  const price = n(j?.spot_usd_oz ?? j?.xau?.price);
  const asOf = normalizeXausTime(j?.data_state?.as_of ?? j?.price_as_of ?? j?.updated_at);
  const state = j?.data_state?.status || (j?.stale ? 'stale' : 'fresh');
  const ageSec = Number.isFinite(asOf) ? Math.max(0,(now()-asOf)/1000) : Infinity;
  if (!finite(price) || price <= 0 || !Number.isFinite(asOf)) throw new Error('XAUS spot inválido');
  return { price, asOf, ageSec, stale:j?.stale === true || state === 'stale', state };
}

async function fetchKrakenPaxgTicker() {
  const j = await fetchJson(`${KRAKEN_PAXG_TICKER}&_=${Date.now()}`, { 'User-Agent':'XAUUSD-Mobile-Signal/2.0' });
  if (Array.isArray(j?.error) && j.error.length) throw new Error(`Kraken: ${j.error.join(', ')}`);
  const result = j?.result || {};
  const key = Object.keys(result)[0];
  const row = key ? result[key] : null;
  const price = n(row?.c?.[0]);
  const bid = n(row?.b?.[0]);
  const ask = n(row?.a?.[0]);
  if (!finite(price) || price <= 0) throw new Error('Kraken PAXG/USD sem preço');
  return { price, bid, ask, asOf: now() };
}

async function fetchKrakenPaxgHistory() {
  const j = await fetchJson(`${KRAKEN_PAXG_OHLC}&_=${Date.now()}`, { 'User-Agent':'XAUUSD-Mobile-Signal/2.0' });
  if (Array.isArray(j?.error) && j.error.length) throw new Error(`Kraken OHLC: ${j.error.join(', ')}`);
  const result = j?.result || {};
  const key = Object.keys(result).find(k => k !== 'last');
  const rows = key && Array.isArray(result[key]) ? result[key] : [];
  const cutoff = bucket(now(), 300);
  const out = [];
  for (const r of rows) {
    const t = Number(r?.[0]) * 1000;
    if (!Number.isFinite(t) || t >= cutoff || marketMode(new Date(t)) !== 'OTC') continue;
    const o=n(r?.[1]), h=n(r?.[2]), l=n(r?.[3]), c=n(r?.[4]);
    if (![o,h,l,c].every(finite)) continue;
    out.push({ t:bucket(t,300), o,h,l,c, volume:n(r?.[6]), delta:null, closed:true, marketSource:'OTC' });
  }
  return out.sort((a,b)=>a.t-b.t).slice(-HISTORY_SIZE);
}

async function fetchXausHistory(mode = marketMode()) {
  const j = await fetchJson(`${XAUS_INTRADAY}?symbol=xau&hours=48&fresh=${Date.now()}`, { 'User-Agent':'XAUUSD-Mobile-Signal/2.0' });
  const points = Array.isArray(j?.points) ? j.points : [];
  const map = new Map();
  const cutoff = bucket(now(), 300);
  for (const p of points) {
    const t = normalizeXausTime(p?.t ?? p?.time ?? p?.timestamp);
    const price = n(p?.p ?? p?.price ?? p?.c);
    if (!Number.isFinite(t) || !finite(price) || price <= 0 || t >= cutoff) continue;
    const pMode = marketMode(new Date(t));
    if (pMode !== mode) continue;
    const bt = bucket(t, 300);
    let c = map.get(bt);
    const source = mode === 'OTC' ? 'OTC' : 'SPOT_FALLBACK';
    if (!c) {
      c = { t:bt, o:price, h:price, l:price, c:price, volume:1, delta:0, closed:true, marketSource:source };
      map.set(bt,c);
    } else {
      const dir = price > c.c ? 1 : price < c.c ? -1 : 0;
      c.h = Math.max(c.h,price);
      c.l = Math.min(c.l,price);
      c.c = price;
      c.volume += 1;
      c.delta += dir;
    }
  }
  return [...map.values()].sort((a,b)=>a.t-b.t).slice(-HISTORY_SIZE);
}

async function bootstrapHistory(reason='startup', force=false) {
  if (historyBusy) return;
  if (!force && historyLoadedAt && now()-historyLoadedAt < 120_000 && candleStore.get('5m').length >= MIN_HISTORY) return;
  historyBusy = true;
  historyState = 'loading';
  broadcastMarket();
  try {
    const mode = marketMode();
    let rows = [];
    let source = '';
    if (mode === 'OTC') {
      try {
        rows = await fetchKrakenPaxgHistory();
        if (rows.length) source = 'KRAKEN PAXG/USD 5M · OTC PROXY';
      } catch (e) { console.warn('[KRAKEN HISTORY]', e.message); }
    }
    if (!rows.length) {
      rows = await fetchXausHistory(mode);
      if (rows.length) source = mode === 'OTC' ? 'XAUS OTC 2M→5M · FALLBACK' : 'XAUS XAUUSD SPOT 2M→5M';
    }
    if (rows.length) replaceHistory(rows, source);
    else {
      historyState = candleStore.get('5m').length >= MIN_HISTORY ? 'ready-stale' : 'warming';
      console.warn(`[HISTORY] ${reason}: XAUS sem candles para modo ${mode}`);
    }
  } catch(e) {
    historyState = candleStore.get('5m').length >= MIN_HISTORY ? 'ready-stale' : 'failed';
    console.warn('[HISTORY]', e.message);
  } finally {
    historyBusy = false;
    broadcastHistory();
    broadcastMarket();
  }
}

function rsi(closes,p=14) {
  if (closes.length < p+1) return null;
  let g=0,l=0;
  for(let i=1;i<=p;i++){const d=closes[i]-closes[i-1];if(d>=0)g+=d;else l-=d;}
  let ag=g/p,al=l/p;
  for(let i=p+1;i<closes.length;i++){const d=closes[i]-closes[i-1];ag=(ag*(p-1)+Math.max(d,0))/p;al=(al*(p-1)+Math.max(-d,0))/p;}
  if(al===0)return 100;if(ag===0)return 0;
  return +(100-100/(1+ag/al)).toFixed(2);
}
function ema(closes,p=20) {
  if(closes.length<p)return null;
  let e=closes.slice(0,p).reduce((a,b)=>a+b,0)/p,k=2/(p+1);
  for(let i=p;i<closes.length;i++)e=closes[i]*k+e*(1-k);
  return +e.toFixed(2);
}
function adx(highs,lows,closes,p=14) {
  if(highs.length<p*2+1)return null;
  const tr=[],pd=[],md=[];
  for(let i=1;i<highs.length;i++){
    const up=highs[i]-highs[i-1],down=lows[i-1]-lows[i];
    tr.push(Math.max(highs[i]-lows[i],Math.abs(highs[i]-closes[i-1]),Math.abs(lows[i]-closes[i-1])));
    pd.push(up>down&&up>0?up:0);md.push(down>up&&down>0?down:0);
  }
  let atr=0,plus=0,minus=0;
  for(let i=0;i<p;i++){atr+=tr[i];plus+=pd[i];minus+=md[i];}
  atr/=p;plus/=p;minus/=p;
  const dx=[]; const push=()=>{const pi=atr?100*plus/atr:0,mi=atr?100*minus/atr:0;dx.push(pi+mi?100*Math.abs(pi-mi)/(pi+mi):0);};
  push();
  for(let i=p;i<tr.length;i++){atr=(atr*(p-1)+tr[i])/p;plus=(plus*(p-1)+pd[i])/p;minus=(minus*(p-1)+md[i])/p;push();}
  if(dx.length<p)return null;
  let a=dx.slice(0,p).reduce((x,y)=>x+y,0)/p;
  for(let i=p;i<dx.length;i++)a=(a*(p-1)+dx[i])/p;
  return +a.toFixed(1);
}
function marketState(tf='5m') {
  const rows = closedOnly(candleStore.get(tf));
  const closes=rows.map(x=>x.c), highs=rows.map(x=>x.h), lows=rows.map(x=>x.l);
  const age = lastTick ? Math.max(0,(now()-lastTick.ts)/1000) : null;
  return {
    type:'market_state', symbol:SYMBOL, tf, serverTime:now(),
    marketMode:marketMode(), sessions:activeSessions(),
    price:lastTick?.price ?? null, bid:lastTick?.source?.bid ?? null, ask:lastTick?.source?.ask ?? null,
    priceAgeSec:age, feed:feedName, upstream:upstreamState,
    candles:rows.length, historyRequired:MIN_HISTORY, historyReady:rows.length>=MIN_HISTORY,
    historySource, historyAsOf, historyLoadedAt, historyState,
    RSI:rsi(closes), EMA20:ema(closes), ADX:adx(highs,lows,closes),
    dxy:dxyState
  };
}
function historyPayload(tf='5m') {
  const rows=closedOnly(candleStore.get(tf));
  return {
    type:'history',symbol:SYMBOL,tf,candles:rows.map(x=>({...x,closed:true})),
    count:rows.length,required:MIN_HISTORY,ready:rows.length>=MIN_HISTORY,
    source:historySource,asOf:historyAsOf,loadedAt:historyLoadedAt,state:historyState,
    marketMode:marketMode()
  };
}
function broadcastHistory(){for(const c of clients)send(c,historyPayload(c.tf));}
function broadcastMarket(){for(const c of clients)send(c,marketState(c.tf));}

async function fetchDxy(symbol,label) {
  for (const host of ['query1.finance.yahoo.com','query2.finance.yahoo.com']) {
    try {
      const url=`https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1m&includePrePost=true`;
      const j=await fetchJson(url,{'User-Agent':'Mozilla/5.0 XAUUSD-Mobile-Signal/2.0'});
      const result=j?.chart?.result?.[0], ts=result?.timestamp||[], closes=result?.indicators?.quote?.[0]?.close||[];
      let i=closes.length-1; while(i>=0&&!finite(closes[i]))i--;
      const value=i>=0?n(closes[i]):n(result?.meta?.regularMarketPrice);
      const asOf=i>=0&&finite(ts[i])?Number(ts[i])*1000:n(result?.meta?.regularMarketTime)*1000;
      if(!finite(value)||value<=0||!finite(asOf))continue;
      const ageSec=Math.max(0,(now()-asOf)/1000);
      return {value,source:label,asOf,ageSec,status:ageSec>DXY_MAX_AGE_SEC?'SEM FEED':ageSec>DXY_STALE_SEC?'DADO ATRASADO':'LIVE',error:null};
    } catch(_) {}
  }
  return null;
}
async function updateDxy() {
  let q=null;
  for(const [s,l] of [['DX=F','DXY Futures · Yahoo'],['DX-Y.NYB','DXY Index · Yahoo'],['^DXY','DXY · Yahoo']]){
    q=await fetchDxy(s,l); if(q)break;
  }
  if(q)dxyState=q;
  else dxyState={...dxyState,ageSec:dxyState.asOf?Math.max(0,(now()-dxyState.asOf)/1000):null,status:'SEM FEED',error:'fontes DXY indisponíveis'};
  broadcastMarket();
}
function connectBrokeret() {
  if (upstream && [WebSocket.OPEN,WebSocket.CONNECTING].includes(upstream.readyState)) return;
  const baseName = BROKERET_KEY === 'demo' ? 'brokeret-demo' : 'brokeret';
  upstreamState='connecting';
  const ws=new WebSocket(`wss://feed.brokeret.com/ws?apikey=${encodeURIComponent(BROKERET_KEY)}`);
  upstream=ws;
  ws.on('open',()=>{
    backoff=1000;upstreamState='connected';
    try{ws.send(JSON.stringify({action:'subscribe',symbols:[SYMBOL]}));}catch(_){}
    broadcastMarket();
  });
  ws.on('message',raw=>{
    try{
      const m=JSON.parse(raw);
      if(m.type==='heartbeat'){try{ws.send(JSON.stringify({action:'pong'}));}catch(_){}return;}
      if(isWeekendMode())return;
      const rows = (m.type==='ticks'||m.type==='snapshot') && Array.isArray(m.data) ? m.data : [];
      for(const x of rows){
        if(x.s&&x.s!==SYMBOL)continue;
        const bid=n(x.b??x.Bid),ask=n(x.a??x.Ask),last=n(x.last??x.Last);
        const price=finite(last)&&last>0?last:finite(bid)&&bid>0?bid:ask;
        const ts0=n(x.t??x.Time??m.ts??now()),ts=ts0<1e12?ts0*1000:ts0;
        if(finite(price)&&price>0){
          lastOfficialTickAt=now();
          emitTick(price,ts,{name:baseName,bid:finite(bid)?bid:null,ask:finite(ask)?ask:null,marketSource:'OFFICIAL'});
        }
      }
    }catch(e){console.warn('[BROKERET]',e.message);}
  });
  ws.on('close',()=>{
    upstream=null;upstreamState='disconnected';broadcastMarket();
    clearTimeout(reconnectTimer);reconnectTimer=setTimeout(connectBrokeret,backoff);backoff=Math.min(backoff*2,30_000);
  });
  ws.on('error',e=>console.warn('[BROKERET]',e.message));
}

async function updateMarketFeed() {
  const mode = marketMode();
  if (mode === 'OTC') {
    /* Fim de semana: PAXG/USD da Kraken é uma referência 24/7 dinâmica,
       sem chave. É explicitamente um proxy OTC do ouro, não o XAUUSD
       executável de uma corretora. XAUS fica como fallback de referência. */
    try {
      const q = await fetchKrakenPaxgTicker();
      emitTick(q.price, q.asOf, {
        name:'kraken-paxg-usd-otc-proxy', bid:q.bid, ask:q.ask,
        marketSource:'OTC', indicative:true, proxy:true
      });
      return;
    } catch (e) { console.warn('[KRAKEN PAXG]', e.message); }
    try {
      const q = await fetchXausSpot();
      if (!q.stale && q.ageSec <= XAUS_STALE_SEC) {
        emitTick(q.price,q.asOf,{name:'xaus-otc-fallback',bid:null,ask:null,marketSource:'OTC',indicative:true});
      }
    } catch(e) { console.warn('[XAUS OTC]',e.message); }
    return;
  }

  /* Mercado normal: Brokeret/WSS é prioritário. Se não entregar tick
     recente, XAUS assume gratuitamente até o feed oficial retornar. */
  const officialFresh=lastOfficialTickAt>0&&(now()-lastOfficialTickAt)/1000<=OFFICIAL_STALE_SEC;
  if (officialFresh) return;
  try {
    const q=await fetchXausSpot();
    if(!q.stale&&q.ageSec<=XAUS_STALE_SEC){
      emitTick(q.price,q.asOf,{name:'xaus-spot-fallback',bid:null,ask:null,marketSource:'SPOT_FALLBACK',indicative:true});
    }
  } catch(e) { console.warn('[XAUS]',e.message); }
}

async function monitorMode() {
  const mode=marketMode();
  if(lastMode===null){lastMode=mode;return;}
  if(mode!==lastMode){
    console.log(`[MODE] ${lastMode} -> ${mode}`);
    lastMode=mode;
    const arr=candleStore.get('5m');arr.length=0;
    for(const tf of ['15m','30m','1h'])candleStore.get(tf).length=0;
    historyLoadedAt=0;historyState='waiting';historySource='none';historyAsOf=null;
    lastTick=null;
    await bootstrapHistory('mode-switch',true);
    await updateMarketFeed();
    broadcastMarket();
  }
}

app.get('/',(_q,r)=>r.json({
  ok:true,service:'xauusd-mobile-signal',symbol:SYMBOL,websocket:'/stream',
  marketMode:marketMode(),sessions:activeSessions(),feed:feedName
}));
app.get('/health',(_q,r)=>{
  r.set('Cache-Control','no-store');
  const m=marketState('5m');
  r.json({
    ok:true,symbol:SYMBOL,marketMode:m.marketMode,sessions:m.sessions,
    primary:feedName,upstream:upstreamState,clients:clients.size,
    lastTick:lastTick?new Date(lastTick.ts).toISOString():null,lastPrice:lastTick?.price??null,
    latencyAgeSec:m.priceAgeSec,
    history:{count:m.candles,required:m.historyRequired,ready:m.historyReady,source:historySource,asOf:historyAsOf,loadedAt:historyLoadedAt,state:historyState},
    dxy:dxyState,serverTime:new Date().toISOString()
  });
});
app.get('/history',(q,r)=>{
  r.set('Cache-Control','no-store');
  const tf=VALID_TF.has(String(q.query.tf||'5m'))?String(q.query.tf||'5m'):'5m';
  r.json(historyPayload(tf));
});
app.get('/dxy',(_q,r)=>{r.set('Cache-Control','no-store');r.json({ok:dxyState.value!=null,dxy:dxyState});});

wss.on('connection',ws=>{
  const client={ws,tf:'5m'};clients.add(client);
  send(client,{type:'server',status:upstreamState,source:feedName,marketMode:marketMode(),sessions:activeSessions(),ts:now()});
  if(lastTick)send(client,{type:'tick',symbol:SYMBOL,price:lastTick.price,ts:lastTick.ts,source:lastTick.source,serverTs:now(),marketMode:marketMode()});
  send(client,historyPayload(client.tf));send(client,marketState(client.tf));
  ws.on('message',raw=>{
    try{
      const m=JSON.parse(raw);
      if((m.type==='config'||m.type==='set_tf')&&VALID_TF.has(m.tf)){client.tf=m.tf;send(client,historyPayload(client.tf));send(client,marketState(client.tf));}
      else if(m.type==='ping')send(client,{type:'pong',ts:now()});
      else if(m.type==='refresh_history')bootstrapHistory('client',true).then(()=>{send(client,historyPayload(client.tf));send(client,marketState(client.tf));});
    }catch(_){send(client,{type:'error',message:'Invalid client message',ts:now()});}
  });
  ws.on('close',()=>clients.delete(client));ws.on('error',()=>clients.delete(client));
});

lastMode=marketMode();
connectBrokeret();
bootstrapHistory('startup',true);
updateMarketFeed();
updateDxy();

setInterval(updateMarketFeed,XAUS_REFRESH_MS);
setInterval(()=>bootstrapHistory('scheduled'),HISTORY_REFRESH_MS);
setInterval(updateDxy,DXY_REFRESH_MS);
setInterval(monitorMode,15_000);

server.listen(PORT,'0.0.0.0',()=>console.log(`XAUUSD Mobile Signal V29 listening on ${PORT} | mode=${marketMode()}`));
