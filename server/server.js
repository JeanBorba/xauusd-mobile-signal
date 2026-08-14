/* XAUUSD Mobile Signal - history sync engine v16 FREE-TIER SAFE
 * One 5M historical bootstrap per server process; no periodic history polling.
 * History remains in memory while the Render instance is alive and is sent to
 * every reconnecting mobile client. A Render restart causes one fresh bootstrap.
 * Live ticks continue through the existing Twelve Data WebSocket.
 */
'use strict';
require('dotenv').config();
const http = require('http');
const WebSocket = require('ws');

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const API_KEY = process.env.TWELVEDATA_API_KEY || '';
const SYMBOL = 'XAU/USD';
const TF = '5m';
const TF_MS = 5 * 60 * 1000;
const HISTORY_LIMIT = Math.max(100, Math.min(1000, Number(process.env.HISTORY_LIMIT || 1000)));
const MIN_HISTORY = 40;
const clients = new Set();
const history = [];
let current = null;
let historySource = 'none';
let historyAsOf = null;
let historyLoadedAt = 0;
let td = null;
let tdReconnectTimer = null;
let bootstrapPromise = null;
let lastTick = { price: null, bid: null, ask: null, ts: 0 };
let wsSubscriptionAttempts = 0;

function now() { return Date.now(); }
function finite(v) { return Number.isFinite(Number(v)); }
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function bucket(ts) { return Math.floor(ts / TF_MS) * TF_MS; }
function isClosed(ts) { return Number(ts) < bucket(now()); }

function normalizeTwelve(values) {
  const map = new Map();
  for (const v of Array.isArray(values) ? values : []) {
    const raw = String(v.datetime || '');
    const t = Date.parse(raw.endsWith('Z') ? raw : raw + 'Z');
    const row = { t, o: num(v.open), h: num(v.high), l: num(v.low), c: num(v.close) };
    if (Number.isFinite(t) && [row.o, row.h, row.l, row.c].every(finite) && isClosed(t)) map.set(t, row);
  }
  return [...map.values()].sort((a, b) => a.t - b.t).slice(-HISTORY_LIMIT);
}

async function twelveHistory() {
  if (!API_KEY) throw new Error('TWELVEDATA_API_KEY ausente');
  const url = 'https://api.twelvedata.com/time_series?symbol=' + encodeURIComponent(SYMBOL) + '&interval=' + TF + '&outputsize=' + HISTORY_LIMIT + '&order=asc&format=JSON';
  const r = await fetch(url, { headers: { Authorization: 'apikey ' + API_KEY, Accept: 'application/json' } });
  if (!r.ok) throw new Error('Twelve Data HTTP ' + r.status);
  const j = await r.json();
  if (j?.status === 'error') throw new Error(j.message || 'Twelve Data error');
  return normalizeTwelve(j?.values);
}

async function yahooHistoryFallback() {
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/XAUUSD=X?range=5d&interval=5m&includePrePost=true&events=div%2Csplits';
  const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'XAUUSD-Mobile-Signal/16' } });
  if (!r.ok) throw new Error('Yahoo HTTP ' + r.status);
  const j = await r.json();
  const result = j?.chart?.result?.[0];
  const ts = result?.timestamp || [];
  const q = result?.indicators?.quote?.[0];
  if (!Array.isArray(ts) || !q) throw new Error('Yahoo OHLC ausente');
  const map = new Map();
  for (let i = 0; i < ts.length; i++) {
    const t = Number(ts[i]) * 1000;
    const row = { t, o: num(q.open?.[i]), h: num(q.high?.[i]), l: num(q.low?.[i]), c: num(q.close?.[i]) };
    if (Number.isFinite(t) && [row.o, row.h, row.l, row.c].every(finite) && isClosed(t)) map.set(t, row);
  }
  return [...map.values()].sort((a, b) => a.t - b.t).slice(-HISTORY_LIMIT);
}

async function bootstrapHistory(force = false) {
  if (bootstrapPromise && !force) return bootstrapPromise;
  bootstrapPromise = (async () => {
    let rows = [];
    try {
      rows = await twelveHistory();
      if (rows.length >= MIN_HISTORY) historySource = 'Twelve Data REST';
    } catch (e) { console.warn('[HISTORY] Twelve Data:', e.message); }
    if (rows.length < MIN_HISTORY) {
      try {
        rows = await yahooHistoryFallback();
        if (rows.length >= MIN_HISTORY) historySource = 'Yahoo XAUUSD=X fallback';
      } catch (e) { console.warn('[HISTORY] Yahoo fallback:', e.message); }
    }
    if (rows.length < MIN_HISTORY) throw new Error('histórico insuficiente: ' + rows.length + ' candles');
    history.length = 0;
    history.push(...rows);
    historyAsOf = rows[rows.length - 1].t;
    historyLoadedAt = now();
    console.log('[HISTORY] bootstrap:', rows.length, 'candles | source:', historySource);
    broadcast();
    return rows.length;
  })().finally(() => { bootstrapPromise = null; });
  return bootstrapPromise;
}

function pushClosedCandle(row) {
  if (!row || !isClosed(row.t)) return;
  const idx = history.findIndex(x => x.t === row.t);
  if (idx >= 0) history[idx] = row;
  else history.push(row);
  history.sort((a, b) => a.t - b.t);
  while (history.length > HISTORY_LIMIT) history.shift();
  historyAsOf = history.length ? history[history.length - 1].t : null;
}

function applyTick(price, ts, bid = null, ask = null) {
  if (!finite(price) || !Number.isFinite(ts)) return;
  price = Number(price); ts = Number(ts);
  lastTick = { price, bid: finite(bid) ? Number(bid) : lastTick.bid, ask: finite(ask) ? Number(ask) : lastTick.ask, ts };
  const b = bucket(ts);
  if (!current || current.t !== b) {
    if (current && current.t < b) pushClosedCandle(current);
    current = { t: b, o: price, h: price, l: price, c: price, closed: false };
  } else {
    current.c = price; current.h = Math.max(current.h, price); current.l = Math.min(current.l, price);
  }
  broadcast();
}

function completed() { return history.filter(x => x.t < bucket(now())).slice(-HISTORY_LIMIT); }

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
  const tr = [], pdm = [], mdm = [];
  for (let i = 1; i < highs.length; i++) {
    const up = highs[i] - highs[i - 1], down = lows[i - 1] - lows[i];
    tr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
    pdm.push(up > down && up > 0 ? up : 0); mdm.push(down > up && down > 0 ? down : 0);
  }
  let atr = 0, plus = 0, minus = 0;
  for (let i = 0; i < p; i++) { atr += tr[i]; plus += pdm[i]; minus += mdm[i]; }
  atr /= p; plus /= p; minus /= p;
  const dx = [];
  const one = () => { const pi = atr ? 100 * plus / atr : 0, mi = atr ? 100 * minus / atr : 0; dx.push(pi + mi ? 100 * Math.abs(pi - mi) / (pi + mi) : 0); };
  one();
  for (let i = p; i < tr.length; i++) { atr = (atr * (p - 1) + tr[i]) / p; plus = (plus * (p - 1) + pdm[i]) / p; minus = (minus * (p - 1) + mdm[i]) / p; one(); }
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
  return out.filter(z => { for (const r of rows) { if (r.t <= z.created) continue; if (z.tipo === 'ALTA' && r.l <= z.inf) return false; if (z.tipo === 'BAIXA' && r.h >= z.sup) return false; } return true; }).slice(-10);
}

function marketState() {
  const rows = completed();
  const closes = rows.map(x => x.c), highs = rows.map(x => x.h), lows = rows.map(x => x.l);
  return {
    type: 'market_state', symbol: SYMBOL, tf: TF, serverTime: now(),
    price: lastTick.price, bid: lastTick.bid ?? lastTick.price, ask: lastTick.ask ?? lastTick.price, ts: lastTick.ts,
    priceAgeSec: lastTick.ts ? (now() - lastTick.ts) / 1000 : null,
    candles: rows.length, historyRequired: MIN_HISTORY, historyReady: rows.length >= MIN_HISTORY,
    historySource, historyAsOf, historyLoadedAt,
    RSI: rsi(closes), EMA20: ema(closes), ADX: adx(highs, lows, closes), FVG: fvg(rows)
  };
}

function historyPayload() {
  const rows = completed();
  return { type: 'history', symbol: SYMBOL, tf: TF, candles: rows.map(x => ({ ...x, closed: true })), count: rows.length, required: MIN_HISTORY, ready: rows.length >= MIN_HISTORY, source: historySource, asOf: historyAsOf, loadedAt: historyLoadedAt };
}

function send(ws, payload) { if (ws.readyState === WebSocket.OPEN) { try { ws.send(JSON.stringify(payload)); } catch (_) {} } }
function sendClient(ws) { send(ws, historyPayload()); send(ws, marketState()); }
function broadcast() { for (const ws of clients) sendClient(ws); }

function connectTwelveData() {
  if (!API_KEY) { console.warn('[TD] TWELVEDATA_API_KEY ausente; histórico pode usar fallback.'); return; }
  try { td?.close(); } catch (_) {}
  td = new WebSocket('wss://ws.twelvedata.com/v1/quotes/price?apikey=' + encodeURIComponent(API_KEY));
  td.on('open', () => {
    wsSubscriptionAttempts++;
    console.log('[TD] WebSocket conectado; assinatura #' + wsSubscriptionAttempts);
    td.send(JSON.stringify({ action: 'subscribe', params: { symbols: SYMBOL } }));
  });
  td.on('message', raw => {
    try {
      const m = JSON.parse(raw.toString());
      if (m.event === 'price' && finite(m.price)) {
        const t = Number(m.timestamp || m.ts || Math.floor(now() / 1000));
        applyTick(Number(m.price), t < 1e12 ? t * 1000 : t, m.bid, m.ask);
      }
    } catch (e) { console.error('[TD] parse:', e.message); }
  });
  td.on('error', e => console.error('[TD]', e.message));
  td.on('close', () => { clearTimeout(tdReconnectTimer); tdReconnectTimer = setTimeout(connectTwelveData, 5000); });
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    const m = marketState();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ ok: true, feed: lastTick.ts ? 'online' : 'waiting', price: lastTick.price, ageSec: m.priceAgeSec, history: { count: m.candles, required: m.historyRequired, ready: m.historyReady, source: historySource, asOf: historyAsOf, loadedAt: historyLoadedAt }, websocketSubscriptionsSinceStart: wsSubscriptionAttempts }));
  }
  if (req.url === '/history') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(historyPayload()));
  }
  res.writeHead(404); res.end('Not found');
});

const wss = new WebSocket.Server({ server, path: '/stream' });
wss.on('connection', ws => {
  clients.add(ws);
  send(ws, { type: 'hello', symbol: SYMBOL, tf: TF, serverTime: now(), historyLimit: HISTORY_LIMIT });
  sendClient(ws);
  ws.on('message', raw => {
    try {
      const m = JSON.parse(raw.toString());
      if (m.type === 'ping') send(ws, { type: 'pong', serverTime: now() });
      else if (m.type === 'config' || m.type === 'set_tf') sendClient(ws);
      else if (m.type === 'refresh_history') bootstrapHistory(true).then(() => sendClient(ws)).catch(e => send(ws, { type: 'error', message: e.message }));
    } catch (_) {}
  });
  ws.on('close', () => clients.delete(ws));
});

server.listen(PORT, HOST, async () => {
  console.log('[SERVER] listening on ' + HOST + ':' + PORT + ' | TF=' + TF + ' | HISTORY_LIMIT=' + HISTORY_LIMIT);
  try { await bootstrapHistory(false); } catch (e) { console.error('[HISTORY] bootstrap failed:', e.message); }
  connectTwelveData();
});
