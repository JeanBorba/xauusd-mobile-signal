import 'dotenv/config';
import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';

const PORT = Number(process.env.PORT || 10000);
const SYMBOL = 'XAUUSD';
const TF = { '5m': 300, '15m': 900, '30m': 1800, '1h': 3600 };
const VALID_TF = new Set(Object.keys(TF));
const HISTORY_SIZE = 200;
const BROKERET_KEY = process.env.BROKERET_API_KEY || 'demo';
const SIFTING_KEY = process.env.SIFTING_API_KEY || '';

const app = express();
app.get('/', (_q, r) => r.json({ service: 'xauusd-mobile-signal', ok: true, websocket: '/stream' }));
app.get('/health', (_q, r) => r.json({
  ok: true,
  symbol: SYMBOL,
  primary: feedName,
  upstream: upstreamState,
  clients: clients.size,
  lastTick: lastTick ? new Date(lastTick.ts).toISOString() : null,
  lastPrice: lastTick?.price ?? null,
  serverTime: new Date().toISOString()
}));
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/stream' });
const clients = new Set();
let upstream = null;
let upstreamState = 'disconnected';
let feedName = 'brokeret-demo';
let lastTick = null;
let reconnectTimer = null;
let backoff = 1000;

function broadcast(msg) {
  const raw = JSON.stringify(msg);
  for (const c of clients) if (c.ws.readyState === WebSocket.OPEN) c.ws.send(raw);
}
function send(c, msg) { if (c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(msg)); }
function bucket(ts, seconds) { return Math.floor(ts / 1000 / seconds) * seconds * 1000; }

const candleStore = new Map();
function updateCandle(price, ts) {
  for (const [tf, sec] of Object.entries(TF)) {
    const bt = bucket(ts, sec);
    let c = candleStore.get(tf);
    if (!c || c.t !== bt) {
      c = { t: bt, o: price, h: price, l: price, c: price, closed: false };
      candleStore.set(tf, c);
    } else {
      c.h = Math.max(c.h, price); c.l = Math.min(c.l, price); c.c = price;
    }
  }
}
function series(tf) {
  const c = candleStore.get(tf);
  return c ? [c] : [];
}
function emitTick(price, ts, source) {
  lastTick = { price, ts, source };
  updateCandle(price, ts);
  broadcast({ type: 'tick', symbol: SYMBOL, price, ts, source, serverTs: Date.now() });
}

function connectBrokeret() {
  if (upstream && [WebSocket.OPEN, WebSocket.CONNECTING].includes(upstream.readyState)) return;
  feedName = BROKERET_KEY === 'demo' ? 'brokeret-demo' : 'brokeret';
  upstreamState = 'connecting';
  const ws = new WebSocket(`wss://feed.brokeret.com/ws?apikey=${encodeURIComponent(BROKERET_KEY)}`);
  upstream = ws;
  ws.on('open', () => {
    backoff = 1000; upstreamState = 'connected';
    ws.send(JSON.stringify({ action: 'subscribe', symbols: [SYMBOL] }));
    broadcast({ type: 'server', status: 'upstream_connected', source: feedName, ts: Date.now() });
  });
  ws.on('message', raw => {
    try {
      const m = JSON.parse(raw);
      if (m.type === 'heartbeat') ws.send(JSON.stringify({ action: 'pong' }));
      if (m.type === 'ticks' && Array.isArray(m.data)) for (const x of m.data) {
        if (x.s && x.s !== SYMBOL) continue;
        const price = Number(x.p ?? x.last ?? x.b ?? x.Bid);
        const bid = Number(x.b ?? x.Bid);
        const ask = Number(x.a ?? x.Ask);
        const ts0 = Number(x.t ?? x.Time ?? Date.now());
        const ts = ts0 < 1e12 ? ts0 * 1000 : ts0;
        if (Number.isFinite(price)) emitTick(price, ts, { name: feedName, bid, ask });
      }
      if (m.type === 'snapshot' && Array.isArray(m.data)) for (const x of m.data) {
        if (x.s === SYMBOL) {
          const price = Number(x.p ?? x.last ?? x.b ?? x.Bid);
          const ts0 = Number(x.t ?? x.Time ?? Date.now());
          if (Number.isFinite(price)) emitTick(price, ts0 < 1e12 ? ts0 * 1000 : ts0, { name: feedName, snapshot: true });
        }
      }
      if (m.type === 'error') broadcast({ type: 'error', source: feedName, message: m.message || 'Brokeret error', ts: Date.now() });
    } catch {}
  });
  ws.on('close', () => {
    upstream = null; upstreamState = 'disconnected';
    broadcast({ type: 'server', status: 'upstream_disconnected', source: feedName, ts: Date.now() });
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectBrokeret, backoff);
    backoff = Math.min(backoff * 2, 30000);
  });
  ws.on('error', err => console.error('Brokeret:', err.message));
}

setInterval(() => {
  if (upstream?.readyState === WebSocket.OPEN) upstream.send(JSON.stringify({ action: 'ping' }));
}, 30000);

wss.on('connection', ws => {
  const client = { ws, tf: '5m' }; clients.add(client);
  send(client, { type: 'server', status: upstreamState, source: feedName, ts: Date.now() });
  if (lastTick) send(client, { type: 'tick', symbol: SYMBOL, price: lastTick.price, ts: lastTick.ts, source: lastTick.source, serverTs: Date.now() });
  ws.on('message', raw => {
    try {
      const m = JSON.parse(raw);
      if (m.type === 'config' && VALID_TF.has(m.tf)) client.tf = m.tf;
      if (m.type === 'ping') send(client, { type: 'pong', ts: Date.now() });
    } catch {}
  });
  ws.on('close', () => clients.delete(client));
  ws.on('error', () => clients.delete(client));
});

connectBrokeret();
server.listen(PORT, () => console.log(`XAUUSD Mobile Signal listening on ${PORT}`));
