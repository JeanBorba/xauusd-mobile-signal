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
const TWELVE_KEY = process.env.TWELVE_DATA_API_KEY || '';
const HISTORY_REFRESH_MS = 15 * 60 * 1000;
const CLIENT_HISTORY_COOLDOWN_MS = 2 * 60 * 1000;
const DXY_REFRESH_MS = 60 * 1000;
const DXY_STALE_SEC = 120;
const DXY_MAX_AGE_SEC = 600;
const HTTP_TIMEOUT_MS = 12000;

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/stream' });
const clients = new Set();
let upstream = null;
let upstreamState = 'disconnected';
let feedName = 'brokeret-demo';
let lastTick = null;
let reconnectTimer = null;
let backoff = 1000;
let historySource = 'none';
let historyLoadedAt = 0;
let historyAsOf = null;
let historyBootstrapState = 'waiting';
let historyPromise = null;
let dxyState = { value: null, source: null, asOf: null, ageSec: null, status: 'SEM FEED', error: null };

const candleStore = new Map(Object.keys(TF).map(tf => [tf, []]));

function finite(v) { return Number.isFinite(Number(v)); }
function n(v) { const x = Number(v); return Number.isFinite(x) ? x : null; }
function now() { return Date.now(); }
function bucket(ts, seconds) { return Math.floor(Number(ts) / 1000 / seconds) * seconds * 1000; }
function closedOnly(arr) { return arr.filter(c => c.closed !== false); }
function send(c, msg) { if (c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(msg)); }
function broadcast(msg) { for (const c of clients) send(c, msg); }
function timeoutSignal(ms = HTTP_TIMEOUT_MS) { const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms); return { signal: ac.signal, done: () => clearTimeout(t) }; }

function normalizeRows(timestamps, q, intervalSec = 300) {
  if (!Array.isArray(timestamps) || !q) return [];
  const cutoff = bucket(now(), intervalSec);
  const map = new Map();
  for (let i = 0; i < timestamps.length; i++) {
    const t = Number(timestamps[i]) * 1000;
    const row = { t, o: n(q.open?.[i]), h: n(q.high?.[i]), l: n(q.low?.[i]), c: n(q.close?.[i]), closed: t < cutoff };
    if (Number.isFinite(t) && row.closed && [row.o, row.h, row.l, row.c].every(finite)) map.set(t, row);
  }
  return [...map.values()].sort((a, b) => a.t - b.t).slice(-HISTORY_SIZE);
}

async function fetchJson(url, headers = {}) {
  const ctl = timeoutSignal();
  try {
    const r = await fetch(url, { headers, signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { ctl.done(); }
}

async function fetchYahooHistory(host = 'query1.finance.yahoo.com') {
  const url = `https://${host}/v8/finance/chart/XAUUSD=X?range=5d&interval=5m&includePrePost=true&events=div%2Csplits&lang=en-US&region=US`;
  const j = await fetchJson(url, { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 XAUUSD-Mobile-Signal/official' });
  const result = j?.chart?.result?.[0];
  const rows = normalizeRows(result?.timestamp, result?.indicators?.quote?.[0], 300);
  if (rows.length < MIN_HISTORY) throw new Error(`Yahoo retornou apenas ${rows.length} candles`);
  return rows;
}

async function fetchTwelveHistory() {
  if (!TWELVE_KEY) throw new Error('Twelve Data sem chave');
  const url = `https://api.twelvedata.com/time_series?symbol=XAU/USD&interval=5min&outputsize=${HISTORY_SIZE}&order=asc&format=JSON`;
  const j = await fetchJson(url, { Authorization: `apikey ${TWELVE_KEY}`, Accept: 'application/json' });
  if (j?.status === 'error') throw new Error(j.message || 'Twelve Data error');
  const cutoff = bucket(now(), 300);
  const map = new Map();
  for (const v of Array.isArray(j?.values) ? j.values : []) {
    const raw = String(v.datetime || '');
    const t = Date.parse(raw.endsWith('Z') ? raw : `${raw}Z`);
    const row = { t, o: n(v.open), h: n(v.high), l: n(v.low), c: n(v.close), closed: t < cutoff };
    if (Number.isFinite(t) && row.closed && [row.o, row.h, row.l, row.c].every(finite)) map.set(t, row);
  }
  const rows = [...map.values()].sort((a, b) => a.t - b.t).slice(-HISTORY_SIZE);
  if (rows.length < MIN_HISTORY) throw new Error(`Twelve Data retornou apenas ${rows.length} candles`);
  return rows;
}

async function fetchXausIntraday() {
  const url = 'https://xaus.com/api/v1/intraday?symbol=xau&hours=48';
  const j = await fetchJson(url, { Accept: 'application/json', 'User-Agent': 'XAUUSD-Mobile-Signal/official' });
  const points = Array.isArray(j?.points) ? j.points : Array.isArray(j?.data) ? j.data : [];
  if (points.length < 20) throw new Error('XAUS sem pontos intraday suficientes');
  const map = new Map();
  for (const p of points) {
    const tRaw = p?.t ?? p?.time ?? p?.timestamp;
    const price = n(p?.p ?? p?.price ?? p?.close ?? p?.value);
    const t = typeof tRaw === 'string' ? Date.parse(tRaw) : Number(tRaw) * (Number(tRaw) < 1e12 ? 1000 : 1);
    if (!Number.isFinite(t) || !finite(price) || price <= 0) continue;
    const bt = bucket(t, 300);
    const c = map.get(bt);
    if (!c) map.set(bt, { t: bt, o: price, h: price, l: price, c: price, closed: bt < bucket(now(), 300) });
    else { c.h = Math.max(c.h, price); c.l = Math.min(c.l, price); c.c = price; }
  }
  const rows = [...map.values()].filter(x => x.closed).sort((a, b) => a.t - b.t).slice(-HISTORY_SIZE);
  if (rows.length < MIN_HISTORY) throw new Error(`XAUS agregou apenas ${rows.length} candles de 5M`);
  return rows;
}

function replaceHistory(rows, source, reason) {
  const arr = candleStore.get('5m');
  arr.length = 0;
  arr.push(...rows.slice(-HISTORY_SIZE));
  for (const tf of ['15m', '30m', '1h']) rebuildHigherTf(tf);
  historySource = source;
  historyAsOf = arr.length ? arr[arr.length - 1].t : null;
  historyLoadedAt = now();
  historyBootstrapState = 'ready';
  console.log(`[HISTORY] ${reason}: ${arr.length} candles | ${source} | asOf=${historyAsOf ? new Date(historyAsOf).toISOString() : 'n/a'}`);
}

async function bootstrapHistory(reason = 'startup') {
  const age = historyLoadedAt ? now() - historyLoadedAt : Infinity;
  if (historyBootstrapState === 'ready' && age < CLIENT_HISTORY_COOLDOWN_MS) return candleStore.get('5m').length;
  if (historyPromise) return historyPromise;
  historyPromise = (async () => {
    historyBootstrapState = 'loading';
    broadcastMarket();
    const sources = [];
    if (TWELVE_KEY) sources.push(['Twelve Data REST', fetchTwelveHistory]);
    sources.push(['Yahoo XAUUSD=X 5M', () => fetchYahooHistory('query1.finance.yahoo.com')]);
    sources.push(['Yahoo XAUUSD=X 5M · fallback host', () => fetchYahooHistory('query2.finance.yahoo.com')]);
    sources.push(['XAUS intraday 2M→5M', fetchXausIntraday]);
    for (const [name, fn] of sources) {
      try {
        const rows = await fn();
        if (rows.length >= MIN_HISTORY) { replaceHistory(rows, name, reason); broadcastHistory(); broadcastMarket(); return rows.length; }
      } catch (e) { console.warn(`[HISTORY] ${name} falhou: ${e.message}`); }
    }
    historyBootstrapState = candleStore.get('5m').length >= MIN_HISTORY ? 'ready-stale' : 'failed';
    console.error('[HISTORY] nenhuma fonte externa entregou histórico 5M suficiente');
    broadcastHistory();
    broadcastMarket();
    return candleStore.get('5m').length;
  })().finally(() => { historyPromise = null; });
  return historyPromise;
}

function rebuildHigherTf(tf) {
  const sec = TF[tf];
  const base = closedOnly(candleStore.get('5m') || []);
  const map = new Map();
  for (const c of base) {
    const bt = bucket(c.t, sec);
    let x = map.get(bt);
    if (!x) { x = { t: bt, o: c.o, h: c.h, l: c.l, c: c.c, closed: true }; map.set(bt, x); }
    else { x.h = Math.max(x.h, c.h); x.l = Math.min(x.l, c.l); x.c = c.c; }
  }
  const arr = candleStore.get(tf); arr.length = 0; arr.push(...[...map.values()].sort((a, b) => a.t - b.t).slice(-HISTORY_SIZE));
}

function updateCandle(price, ts) {
  for (const [tf, sec] of Object.entries(TF)) {
    const bt = bucket(ts, sec);
    const arr = candleStore.get(tf);
    let c = arr[arr.length - 1];
    if (!c || c.t !== bt) {
      if (c) c.closed = true;
      c = { t: bt, o: price, h: price, l: price, c: price, closed: false };
      arr.push(c);
      if (arr.length > HISTORY_SIZE) arr.shift();
    } else {
      c.h = Math.max(c.h, price); c.l = Math.min(c.l, price); c.c = price;
    }
  }
  const base = closedOnly(candleStore.get('5m'));
  if (base.length) historyAsOf = base[base.length - 1].t;
}

function emitTick(price, ts, source) {
  lastTick = { price, ts, source };
  updateCandle(price, ts);
  broadcastMarket();
}

function rsi(closes, p = 14) {
  if (closes.length < p + 1) return null;
  let g = 0, l = 0;
  for (let i = 1; i <= p; i++) { const d = closes[i] - closes[i - 1]; if (d >= 0) g += d; else l -= d; }
  let ag = g / p, al = l / p;
  for (let i = p + 1; i < closes.length; i++) { const d = closes[i] - closes[i - 1]; ag = (ag * (p - 1) + Math.max(d, 0)) / p; al = (al * (p - 1) + Math.max(-d, 0)) / p; }
  if (al === 0) return 100; if (ag === 0) return 0;
  return +(100 - 100 / (1 + ag / al)).toFixed(2);
}

function ema(closes, p = 20) {
  if (closes.length < p) return null;
  let e = 0; for (let i = 0; i < p; i++) e += closes[i]; e /= p;
  const k = 2 / (p + 1); for (let i = p; i < closes.length; i++) e = closes[i] * k + e * (1 - k);
  return +e.toFixed(2);
}

function adx(highs, lows, closes, p = 14) {
  if (highs.length < p * 2 + 1) return null;
  const tr = [], pd = [], md = [];
  for (let i = 1; i < highs.length; i++) {
    const up = highs[i] - highs[i - 1], down = lows[i - 1] - lows[i];
    tr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
    pd.push(up > down && up > 0 ? up : 0); md.push(down > up && down > 0 ? down : 0);
  }
  let atr = 0, plus = 0, minus = 0; for (let i = 0; i < p; i++) { atr += tr[i]; plus += pd[i]; minus += md[i]; }
  atr /= p; plus /= p; minus /= p;
  const dx = [];
  const pushDx = () => { const pi = atr ? 100 * plus / atr : 0, mi = atr ? 100 * minus / atr : 0; dx.push(pi + mi ? 100 * Math.abs(pi - mi) / (pi + mi) : 0); };
  pushDx();
  for (let i = p; i < tr.length; i++) { atr = (atr * (p - 1) + tr[i]) / p; plus = (plus * (p - 1) + pd[i]) / p; minus = (minus * (p - 1) + md[i]) / p; pushDx(); }
  if (dx.length < p) return null;
  let a = 0; for (let i = 0; i < p; i++) a += dx[i]; a /= p;
  for (let i = p; i < dx.length; i++) a = (a * (p - 1) + dx[i]) / p;
  return +a.toFixed(1);
}

function fvg(rows) {
  if (rows.length < 3) return [];
  const out = [];
  for (let i = 0; i < rows.length - 2; i++) {
    if (rows[i + 2].l > rows[i].h) out.push({ tipo: 'ALTA', inf: rows[i].h, sup: rows[i + 2].l, created: rows[i + 2].t });
    if (rows[i + 2].h < rows[i].l) out.push({ tipo: 'BAIXA', inf: rows[i + 2].h, sup: rows[i].l, created: rows[i + 2].t });
  }
  return out.filter(z => {
    for (const r of rows) { if (r.t <= z.created) continue; if (z.tipo === 'ALTA' && r.l <= z.inf) return false; if (z.tipo === 'BAIXA' && r.h >= z.sup) return false; }
    return true;
  }).slice(-10);
}

function marketState(tf = '5m') {
  const rows = closedOnly(candleStore.get(tf) || []);
  const closes = rows.map(x => x.c), highs = rows.map(x => x.h), lows = rows.map(x => x.l);
  const age = lastTick?.ts ? Math.max(0, (now() - lastTick.ts) / 1000) : null;
  return {
    type: 'market_state', symbol: SYMBOL, tf, serverTime: now(),
    price: lastTick?.price ?? null,
    bid: lastTick?.source?.bid ?? lastTick?.price ?? null,
    ask: lastTick?.source?.ask ?? lastTick?.price ?? null,
    ts: lastTick?.ts ?? null, priceAgeSec: age,
    candles: rows.length, historyRequired: MIN_HISTORY, historyReady: rows.length >= MIN_HISTORY,
    historySource, historyAsOf, historyLoadedAt, historyState: historyBootstrapState,
    RSI: rsi(closes), EMA20: ema(closes), ADX: adx(highs, lows, closes), FVG: fvg(rows),
    dxy: dxyState, feed: feedName, upstream: upstreamState
  };
}

function historyPayload(tf = '5m') {
  const rows = closedOnly(candleStore.get(tf) || []);
  return { type: 'history', symbol: SYMBOL, tf, candles: rows.map(x => ({ ...x, closed: true })), count: rows.length, required: MIN_HISTORY, ready: rows.length >= MIN_HISTORY, source: historySource, asOf: historyAsOf, loadedAt: historyLoadedAt, state: historyBootstrapState };
}
function broadcastHistory() { for (const c of clients) send(c, historyPayload(c.tf)); }
function broadcastMarket() { for (const c of clients) send(c, marketState(c.tf)); }

async function fetchDxy(symbol, label, interval = '1m') {
  const hosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
  let lastError = null;
  for (const host of hosts) {
    try {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=${interval}&includePrePost=true&events=div%2Csplits&lang=en-US&region=US`;
      const j = await fetchJson(url, { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 XAUUSD-Mobile-Signal/official' });
      const result = j?.chart?.result?.[0];
      const ts = Array.isArray(result?.timestamp) ? result.timestamp : [];
      const closes = result?.indicators?.quote?.[0]?.close || [];
      let idx = closes.length - 1;
      while (idx >= 0 && !finite(closes[idx])) idx--;
      const price = idx >= 0 ? n(closes[idx]) : n(result?.meta?.regularMarketPrice);
      const asOf = idx >= 0 && finite(ts[idx]) ? Number(ts[idx]) * 1000 : n(result?.meta?.regularMarketTime) * 1000;
      if (!finite(price) || price <= 0 || !finite(asOf)) throw new Error(`${label} preço/tempo inválido`);
      const age = Math.max(0, (now() - asOf) / 1000);
      return { value: price, source: label, asOf, ageSec: age, status: age > DXY_MAX_AGE_SEC ? 'SEM FEED' : age > DXY_STALE_SEC ? 'DADO ATRASADO' : 'LIVE', error: null };
    } catch (e) { lastError = e; console.warn(`[DXY] ${label} ${host}: ${e.message}`); }
  }
  throw lastError || new Error('DXY indisponível');
}

async function updateDxy() {
  let q = null;
  for (const [symbol, label] of [
    ['DX=F', 'DXY Futures · Yahoo'],
    ['DX-Y.NYB', 'DXY Index · Yahoo fallback'],
    ['^DXY', 'DXY ^DXY · Yahoo fallback 2']
  ]) {
    try { q = await fetchDxy(symbol, label, '1m'); if (q?.value != null) break; } catch (_) {}
  }
  if (q) dxyState = q;
  else dxyState = { ...dxyState, ageSec: dxyState.asOf ? Math.max(0, (now() - dxyState.asOf) / 1000) : null, status: dxyState.asOf && ((now() - dxyState.asOf) / 1000) <= DXY_MAX_AGE_SEC ? 'DADO ATRASADO' : 'SEM FEED', error: 'fontes DXY indisponíveis' };
  broadcastMarket();
}

function connectBrokeret() {
  if (upstream && [WebSocket.OPEN, WebSocket.CONNECTING].includes(upstream.readyState)) return;
  feedName = BROKERET_KEY === 'demo' ? 'brokeret-demo' : 'brokeret'; upstreamState = 'connecting'; broadcastMarket();
  const ws = new WebSocket(`wss://feed.brokeret.com/ws?apikey=${encodeURIComponent(BROKERET_KEY)}`); upstream = ws;
  ws.on('open', () => { backoff = 1000; upstreamState = 'connected'; ws.send(JSON.stringify({ action: 'subscribe', symbols: [SYMBOL] })); broadcastMarket(); console.log(`[FEED] connected ${feedName}`); });
  ws.on('message', raw => {
    try {
      const m = JSON.parse(raw);
      if (m.type === 'heartbeat') { try { ws.send(JSON.stringify({ action: 'pong' })); } catch (_) {} return; }
      if (m.type === 'ticks' && Array.isArray(m.data)) for (const x of m.data) {
        if (x.s && x.s !== SYMBOL) continue;
        const bid = n(x.b ?? x.Bid), ask = n(x.a ?? x.Ask), last = n(x.last ?? x.Last);
        const price = finite(last) && last > 0 ? last : finite(bid) ? bid : ask;
        const ts0 = n(x.t ?? x.Time ?? m.ts ?? now()), ts = ts0 < 1e12 ? ts0 * 1000 : ts0;
        if (finite(price) && price > 0) emitTick(price, ts, { name: feedName, bid: finite(bid) ? bid : null, ask: finite(ask) ? ask : null });
      }
      if (m.type === 'snapshot' && Array.isArray(m.data)) for (const x of m.data) {
        if (x.s && x.s !== SYMBOL) continue;
        const bid = n(x.b ?? x.Bid), ask = n(x.a ?? x.Ask), price = finite(bid) ? bid : ask;
        const ts0 = n(x.t ?? x.Time ?? m.ts ?? now()), ts = ts0 < 1e12 ? ts0 * 1000 : ts0;
        if (finite(price) && price > 0) emitTick(price, ts, { name: feedName, bid: finite(bid) ? bid : null, ask: finite(ask) ? ask : null, snapshot: true });
      }
      if (m.type === 'error') broadcast({ type: 'error', source: feedName, message: m.message || 'Feed error', ts: now() });
    } catch (e) { console.error('[FEED] parse:', e.message); }
  });
  ws.on('close', () => { upstream = null; upstreamState = 'disconnected'; broadcastMarket(); clearTimeout(reconnectTimer); reconnectTimer = setTimeout(connectBrokeret, backoff); backoff = Math.min(backoff * 2, 30000); });
  ws.on('error', e => console.error('[FEED]', e.message));
}

app.get('/', (_q, r) => r.json({ service: 'xauusd-mobile-signal', ok: true, websocket: '/stream', history: 'server-side bootstrap', historySource, dxy: dxyState.status }));
app.get('/health', (_q, r) => { const m = marketState('5m'); r.set('Cache-Control', 'no-store'); r.json({ ok: true, symbol: SYMBOL, primary: feedName, upstream: upstreamState, clients: clients.size, lastTick: lastTick ? new Date(lastTick.ts).toISOString() : null, lastPrice: lastTick?.price ?? null, latencyAgeSec: m.priceAgeSec, history: { count: m.candles, required: m.historyRequired, ready: m.historyReady, source: historySource, asOf: historyAsOf, loadedAt: historyLoadedAt, state: historyBootstrapState }, dxy: dxyState, serverTime: new Date().toISOString() }); });
app.get('/history', (q, r) => { r.set('Cache-Control', 'no-store'); r.json(historyPayload(VALID_TF.has(String(q.query.tf || '5m')) ? String(q.query.tf || '5m') : '5m')); });
app.get('/dxy', (_q, r) => { r.set('Cache-Control', 'no-store'); r.json({ ok: dxyState.value != null, dxy: dxyState }); });

wss.on('connection', ws => {
  const client = { ws, tf: '5m' }; clients.add(client);
  send(client, { type: 'server', status: upstreamState, source: feedName, ts: now() });
  if (lastTick) send(client, { type: 'tick', symbol: SYMBOL, price: lastTick.price, ts: lastTick.ts, source: lastTick.source, serverTs: now() });
  send(client, historyPayload(client.tf)); send(client, marketState(client.tf));
  ws.on('message', raw => {
    try {
      const m = JSON.parse(raw);
      if (m.type === 'config' && VALID_TF.has(m.tf)) { client.tf = m.tf; send(client, historyPayload(client.tf)); send(client, marketState(client.tf)); }
      else if (m.type === 'ping') send(client, { type: 'pong', ts: now() });
      else if (m.type === 'refresh_history') bootstrapHistory('client refresh').then(() => { send(client, historyPayload(client.tf)); send(client, marketState(client.tf)); });
    } catch (e) { send(client, { type: 'error', message: 'Invalid client message', ts: now() }); }
  });
  ws.on('close', () => clients.delete(client)); ws.on('error', () => clients.delete(client));
});

connectBrokeret();
updateDxy();
bootstrapHistory('startup');
setInterval(() => { if (historyBootstrapState !== 'ready' || now() - historyLoadedAt > HISTORY_REFRESH_MS) bootstrapHistory('scheduled'); }, 60000);
setInterval(updateDxy, DXY_REFRESH_MS);
server.listen(PORT, '0.0.0.0', () => console.log(`XAUUSD Mobile Signal official listening on ${PORT} | history=${HISTORY_SIZE}`));
