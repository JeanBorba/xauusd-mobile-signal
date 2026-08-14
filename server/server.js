/* XAUUSD Mobile Signal - history sync engine v16
 * Historical OHLC is seeded from Twelve Data REST, persisted on disk,
 * and then kept live by Twelve Data WebSocket ticks.
 * The mobile client can reconnect at any time and immediately receive
 * the historical candles again; it never has to rebuild history from ticks.
 */
'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const API_KEY = process.env.TWELVEDATA_API_KEY || '';
const SYMBOL = 'XAU/USD';
const HISTORY_LIMIT = Math.max(200, Math.min(2000, Number(process.env.HISTORY_LIMIT || 1000)));
const CACHE_FILE = process.env.HISTORY_CACHE_FILE || path.join(process.cwd(), 'history-cache.json');
const VALID_TF = new Set(['5m', '15m', '30m', '1h']);
const TF_MIN = { '5m': 5, '15m': 15, '30m': 30, '1h': 60 };

const clients = new Set();
const state = new Map();
const lastTick = { price: null, bid: null, ask: null, ts: 0, source: 'Twelve Data WebSocket' };
let td = null;
let reconnectTimer = null;
let seedInFlight = false;
let lastSeedAt = 0;
let cacheWriteTimer = null;

function now() { return Date.now(); }
function tfMs(tf) { return TF_MIN[tf] * 60000; }
function bucket(ts, tf) { return Math.floor(ts / tfMs(tf)) * tfMs(tf); }
function finite(v) { return Number.isFinite(Number(v)); }
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function emptyState() { return { candles: [], current: null, lastUpdate: 0, source: 'none', historyAsOf: null, historyLoadedAt: 0 }; }
function ensureState(tf) { if (!state.has(tf)) state.set(tf, emptyState()); return state.get(tf); }

function closedOnly(rows, tf, at = now()) {
  const cut = bucket(at, tf);
  return rows.filter(r => Number.isFinite(r.t) && r.t < cut);
}

function normalizeHistorical(values) {
  const rows = (values || []).map(v => ({
    t: Date.parse(String(v.datetime).endsWith('Z') ? String(v.datetime) : String(v.datetime) + 'Z'),
    o: num(v.open), h: num(v.high), l: num(v.low), c: num(v.close)
  })).filter(x => Number.isFinite(x.t) && [x.o, x.h, x.l, x.c].every(finite));
  const dedup = new Map();
  for (const r of rows) dedup.set(r.t, r);
  return [...dedup.values()].sort((a, b) => a.t - b.t);
}

async function tdFetch(pathname) {
  if (!API_KEY) throw new Error('TWELVEDATA_API_KEY ausente');
  const r = await fetch('https://api.twelvedata.com' + pathname, { headers: { Authorization: 'apikey ' + API_KEY, Accept: 'application/json' } });
  if (!r.ok) throw new Error('Twelve Data HTTP ' + r.status);
  const j = await r.json();
  if (j && j.status === 'error') throw new Error(j.message || 'Twelve Data error');
  return j;
}

function loadCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return false;
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    for (const tf of VALID_TF) {
      const rows = Array.isArray(raw?.[tf]?.candles) ? raw[tf].candles : [];
      if (!rows.length) continue;
      const s = ensureState(tf);
      s.candles = closedOnly(rows.map(r => ({ t: Number(r.t), o: Number(r.o), h: Number(r.h), l: Number(r.l), c: Number(r.c) })), tf).slice(-HISTORY_LIMIT);
      s.source = 'disk-cache';
      s.historyAsOf = s.candles.length ? s.candles[s.candles.length - 1].t : null;
      s.historyLoadedAt = now();
    }
    return true;
  } catch (e) {
    console.error('[CACHE] load:', e.message);
    return false;
  }
}

function scheduleCacheWrite() {
  clearTimeout(cacheWriteTimer);
  cacheWriteTimer = setTimeout(() => {
    try {
      const out = {};
      for (const tf of VALID_TF) out[tf] = { candles: ensureState(tf).candles.slice(-HISTORY_LIMIT), savedAt: now() };
      const tmp = CACHE_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(out), 'utf8');
      fs.renameSync(tmp, CACHE_FILE);
    } catch (e) { console.error('[CACHE] write:', e.message); }
  }, 500);
}

async function seed(tf) {
  const j = await tdFetch('/time_series?symbol=' + encodeURIComponent(SYMBOL) + '&interval=' + tf + '&outputsize=' + HISTORY_LIMIT + '&order=asc&format=JSON');
  const rows = closedOnly(normalizeHistorical(j.values).slice(-HISTORY_LIMIT), tf);
  if (rows.length < 50) throw new Error('histórico insuficiente: ' + rows.length + ' candles');
  const s = ensureState(tf);
  s.candles = rows;
  s.source = 'Twelve Data REST';
  s.historyAsOf = rows[rows.length - 1].t;
  s.historyLoadedAt = now();
  s.current = null;
  scheduleCacheWrite();
  console.log('[SEED]', tf, rows.length, 'candles');
}

async function seedAll(force = false) {
  if (seedInFlight) return;
  if (!force && now() - lastSeedAt < 30000) return;
  seedInFlight = true;
  try {
    for (const tf of VALID_TF) {
      try { await seed(tf); }
      catch (e) { const s = ensureState(tf); console.error('[SEED]', tf, e.message); if (s.candles.length) s.source = 'disk-cache'; }
    }
    lastSeedAt = now();
    broadcastAll();
  } finally { seedInFlight = false; }
}

function applyTick(price, ts, bid = null, ask = null) {
  if (!finite(price) || !Number.isFinite(ts)) return;
  lastTick.price = Number(price);
  lastTick.bid = finite(bid) ? Number(bid) : lastTick.bid;
  lastTick.ask = finite(ask) ? Number(ask) : lastTick.ask;
  lastTick.ts = ts;

  for (const tf of VALID_TF) {
    const s = ensureState(tf);
    const b = bucket(ts, tf);
    if (!s.current || s.current.t !== b) {
      if (s.current && s.current.t < b) {
        s.candles.push(s.current);
        s.candles = s.candles.filter(x => x.t < b).slice(-HISTORY_LIMIT);
        scheduleCacheWrite();
      }
      s.current = { t: b, o: Number(price), h: Number(price), l: Number(price), c: Number(price), closed: false };
    } else {
      s.current.c = Number(price);
      s.current.h = Math.max(s.current.h, Number(price));
      s.current.l = Math.min(s.current.l, Number(price));
    }
    s.lastUpdate = ts;
  }
  broadcastAll();
}

function calcRSI(closes, p = 14) {
  if (!Array.isArray(closes) || closes.length < p + 1) return null;
  let gain = 0, loss = 0;
  for (let i = 1; i <= p; i++) { const d = closes[i] - closes[i - 1]; if (d >= 0) gain += d; else loss -= d; }
  let ag = gain / p, al = loss / p;
  for (let i = p + 1; i < closes.length; i++) { const d = closes[i] - closes[i - 1]; ag = (ag * (p - 1) + Math.max(d, 0)) / p; al = (al * (p - 1) + Math.max(-d, 0)) / p; }
  if (al === 0) return 100; if (ag === 0) return 0;
  return +(100 - 100 / (1 + ag / al)).toFixed(2);
}

function calcEMA(closes, p = 20) {
  if (!Array.isArray(closes) || closes.length < p) return null;
  let e = 0; for (let i = 0; i < p; i++) e += closes[i]; e /= p;
  const k = 2 / (p + 1); for (let i = p; i < closes.length; i++) e = closes[i] * k + e * (1 - k);
  return +e.toFixed(2);
}

function calcADX(highs, lows, closes, p = 14) {
  if (!highs || highs.length !== lows.length || highs.length !== closes.length || highs.length < p * 2 + 1) return null;
  const tr = [], plusDM = [], minusDM = [];
  for (let i = 1; i < highs.length; i++) {
    const up = highs[i] - highs[i - 1], down = lows[i - 1] - lows[i];
    tr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
    plusDM.push(up > down && up > 0 ? up : 0); minusDM.push(down > up && down > 0 ? down : 0);
  }
  let atr = 0, pdm = 0, mdm = 0; for (let i = 0; i < p; i++) { atr += tr[i]; pdm += plusDM[i]; mdm += minusDM[i]; }
  atr /= p; pdm /= p; mdm /= p;
  const dx = [], dip = [], dim = [];
  const push = () => { const a = atr > 0 ? 100 * pdm / atr : 0, b = atr > 0 ? 100 * mdm / atr : 0; dip.push(a); dim.push(b); dx.push(a + b === 0 ? 0 : 100 * Math.abs(a - b) / (a + b)); };
  push();
  for (let i = p; i < tr.length; i++) { atr = (atr * (p - 1) + tr[i]) / p; pdm = (pdm * (p - 1) + plusDM[i]) / p; mdm = (mdm * (p - 1) + minusDM[i]) / p; push(); }
  if (dx.length < p) return null;
  let adx = 0; for (let i = 0; i < p; i++) adx += dx[i]; adx /= p; for (let i = p; i < dx.length; i++) adx = (adx * (p - 1) + dx[i]) / p;
  const last = dip.length - 1;
  return { adx: +adx.toFixed(1), plusDI: +dip[last].toFixed(1), minusDI: +dim[last].toFixed(1), atr: +atr.toFixed(3) };
}

function detectFVG(highs, lows, atr, times) {
  if (!highs || highs.length < 5) return [];
  const minGap = atr > 0 ? Math.max(0.12, atr * 0.10) : 0.20; const zones = [];
  for (let i = 0; i < highs.length - 2; i++) {
    if (lows[i + 2] > highs[i]) { const gap = lows[i + 2] - highs[i]; if (gap >= minGap) zones.push({ tipo: 'ALTA', inf: highs[i], sup: lows[i + 2], tam: gap, created: times[i + 2] }); }
    if (highs[i + 2] < lows[i]) { const gap = lows[i] - highs[i + 2]; if (gap >= minGap) zones.push({ tipo: 'BAIXA', inf: highs[i + 2], sup: lows[i], tam: gap, created: times[i + 2] }); }
  }
  return zones.filter(z => { const idx = times.indexOf(z.created); if (idx < 0) return true; for (let j = idx + 1; j < lows.length; j++) { if (z.tipo === 'ALTA' && lows[j] <= z.inf) return false; if (z.tipo === 'BAIXA' && highs[j] >= z.sup) return false; } return true; }).slice(-10);
}

function compute(tf) {
  const s = ensureState(tf);
  const completed = s.candles.filter(x => x && x.t < bucket(now(), tf)).slice(-HISTORY_LIMIT);
  const opens = completed.map(x => x.o), highs = completed.map(x => x.h), lows = completed.map(x => x.l), closes = completed.map(x => x.c), times = completed.map(x => x.t);
  const adx = calcADX(highs, lows, closes, 14);
  const age = lastTick.ts ? Math.max(0, (now() - lastTick.ts) / 1000) : Infinity;
  const ohlcAge = times.length ? Math.max(0, (now() - times[times.length - 1]) / 1000) : Infinity;
  return {
    candles: completed.length, historyRequired: 40, historyReady: completed.length >= 40,
    historySource: s.source, historyAsOf: s.historyAsOf, historyLoadedAt: s.historyLoadedAt,
    price: lastTick.price, bid: lastTick.bid ?? lastTick.price, ask: lastTick.ask ?? lastTick.price,
    ts: lastTick.ts, priceAgeSec: age, ohlcAgeSec: ohlcAge, opens, highs, lows, closes, times,
    RSI: calcRSI(closes), EMA20: calcEMA(closes), ADX: adx?.adx ?? null, plusDI: adx?.plusDI ?? null,
    minusDI: adx?.minusDI ?? null, ATR: adx?.atr ?? null, FVG: detectFVG(highs, lows, adx?.atr || 0, times), serverTime: now()
  };
}

function send(ws, obj) { try { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); } catch (_) {} }
function sendHistory(ws) {
  const tf = ws.tf || '5m', c = compute(tf);
  send(ws, { type: 'history', tf, candles: c.closes.map((close, i) => ({ t: c.times[i], o: c.opens[i], h: c.highs[i], l: c.lows[i], c: close, closed: true })), count: c.candles, required: c.historyRequired, ready: c.historyReady, source: c.historySource, asOf: c.historyAsOf });
}
function sendState(ws) { send(ws, { type: 'market_state', ...compute(ws.tf || '5m') }); }
function broadcastAll() { for (const ws of clients) { sendHistory(ws); sendState(ws); } }

function connectTD() {
  if (!API_KEY) { console.warn('[TD] sem chave; cache histórico continua disponível.'); return; }
  try { td?.close(); } catch (_) {}
  td = new WebSocket('wss://ws.twelvedata.com/v1/quotes/price?apikey=' + encodeURIComponent(API_KEY));
  td.on('open', () => { console.log('[TD] conectado'); td.send(JSON.stringify({ action: 'subscribe', params: { symbols: SYMBOL } })); });
  td.on('message', raw => { try { const m = JSON.parse(raw.toString()); if (m.event === 'price' && m.price != null) { const ts0 = Number(m.timestamp || m.ts || Math.floor(now() / 1000)); applyTick(Number(m.price), ts0 < 1e12 ? ts0 * 1000 : ts0, m.bid, m.ask); } } catch (e) { console.error('[TD] parse', e.message); } });
  td.on('close', () => { console.warn('[TD] desconectado'); clearTimeout(reconnectTimer); reconnectTimer = setTimeout(connectTD, 3000); });
  td.on('error', e => console.error('[TD]', e.message));
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    const five = compute('5m'); res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ ok: true, feed: lastTick.ts ? 'online' : 'waiting', price: lastTick.price, ageSec: lastTick.ts ? (now() - lastTick.ts) / 1000 : null, history: { count: five.candles, required: five.historyRequired, ready: five.historyReady, source: five.historySource, asOf: five.historyAsOf } }));
  }
  res.writeHead(404); res.end();
});

const wss = new WebSocket.Server({ server, path: '/stream' });
wss.on('connection', ws => {
  clients.add(ws); ws.tf = '5m';
  send(ws, { type: 'hello', serverTime: now(), symbol: SYMBOL, availableTf: [...VALID_TF], historyLimit: HISTORY_LIMIT });
  sendHistory(ws); sendState(ws);
  ws.on('message', raw => { try { const m = JSON.parse(raw.toString()); if ((m.type === 'config' || m.type === 'set_tf') && VALID_TF.has(m.tf)) { ws.tf = m.tf; sendHistory(ws); sendState(ws); } else if (m.type === 'ping') send(ws, { type: 'pong', serverTime: now() }); else if (m.type === 'refresh_history') seedAll(true).then(() => { sendHistory(ws); sendState(ws); }); } catch (_) {} });
  ws.on('close', () => clients.delete(ws));
});

loadCache();
server.listen(PORT, HOST, () => console.log('[SERVER] listening on ' + HOST + ' | history limit=' + HISTORY_LIMIT));
seedAll(true).catch(e => console.error('[SEED]', e.message));
connectTD();
setInterval(() => seedAll(false), 15 * 60 * 1000).unref();
