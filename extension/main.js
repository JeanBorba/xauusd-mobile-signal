(() => {
  'use strict';
  if (window.__XAUUSD_DOTO_CLOUD_V31__) return;
  Object.defineProperty(window, '__XAUUSD_DOTO_CLOUD_V31__', { value: true });

  const FLUSH_MS = 250;
  const MAX_BATCH = 400;
  const HISTORY_COOLDOWN_MS = 30000;
  const CHANNEL = 'XAUUSD_DOTO_CLOUD_V31';
  const ACK_CHANNEL = 'XAUUSD_DOTO_CLOUD_V31_RELAY';

  let queue = [];
  let badge = null;
  let sentTicks = 0;
  let lastOkAt = 0;
  let lastError = '';
  let seq = 1;
  const pending = new Map();
  const historyLastSent = new Map();

  function finite(v) {
    return v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
  }
  function n(v) { return finite(v) ? Number(v) : null; }
  function normalizeTs(v) {
    if (!finite(v)) return Date.now();
    let x = Number(v);
    if (x < 1e11) x *= 1000;
    return x;
  }
  function brtParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(date);
    const o = {};
    for (const p of parts) if (p.type !== 'literal') o[p.type] = p.value;
    const day = {Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6}[o.weekday];
    return { day, minutes: Number(o.hour) * 60 + Number(o.minute) };
  }
  function isWeekendBRT(date = new Date()) {
    const { day, minutes } = brtParts(date);
    return day === 6 || (day === 5 && minutes >= 16 * 60) || (day === 0 && minutes < 19 * 60);
  }
  function expectedSymbol(date = new Date()) { return isWeekendBRT(date) ? 'XAUUSD_OTC' : 'XAUUSD'; }
  function symbolOf(obj, fallback = '') {
    const s = obj && (obj.s ?? obj.symbol ?? obj.symbolName ?? obj.instrument ?? obj.code);
    const out = String(s || fallback || '').toUpperCase();
    if (out.includes('XAUUSD_OTC')) return 'XAUUSD_OTC';
    if (out.includes('XAUUSD')) return 'XAUUSD';
    return '';
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const m = event.data;
    if (!m || m.source !== ACK_CHANNEL || m.kind !== 'ACK') return;
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    clearTimeout(p.timer);
    p.resolve(m.response || { ok: false, status: 0 });
  });

  function post(path, payload) {
    return new Promise((resolve) => {
      const id = seq++;
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve({ ok: false, status: 0, error: 'relay-timeout' });
      }, 10000);
      pending.set(id, { resolve, timer });
      window.postMessage({ source: CHANNEL, kind: 'POST', id, path, payload }, '*');
    });
  }

  function updateBadge() {
    if (!badge) return;
    const expected = expectedSymbol();
    const ok = Date.now() - lastOkAt < 5000;
    badge.textContent = `DOTO→CLOUD→APP ${ok ? '●' : '○'} ${expected} · ticks ${sentTicks}${lastError ? ' · ' + lastError : ''}`;
    badge.style.background = ok ? 'rgba(3,105,55,.94)' : 'rgba(120,53,15,.94)';
  }
  function installBadge() {
    const make = () => {
      if (badge || !document.body) return;
      badge = document.createElement('div');
      badge.id = 'xauusd-doto-cloud-bridge-v31';
      badge.style.cssText = ['position:fixed','right:8px','bottom:8px','z-index:2147483647','padding:6px 9px','border-radius:7px','font:600 11px Arial,sans-serif','color:#fff','background:rgba(120,53,15,.94)','box-shadow:0 1px 6px #0008','pointer-events:none','max-width:75vw'].join(';');
      document.body.appendChild(badge);
      updateBadge();
    };
    if (document.body) make();
    else document.addEventListener('DOMContentLoaded', make, { once: true });
  }

  function enqueueTick(obj, fallbackSymbol = '') {
    if (!obj || typeof obj !== 'object') return false;
    const symbol = symbolOf(obj, fallbackSymbol);
    if (!symbol || symbol !== expectedSymbol()) return false;
    const bid = n(obj.b ?? obj.bid ?? obj.Bid);
    const ask = n(obj.a ?? obj.ask ?? obj.Ask);
    const last = n(obj.last ?? obj.l ?? obj.Last ?? obj.price ?? obj.p);
    if (![bid, ask, last].some(v => finite(v) && v > 0)) return false;
    const time_msc = normalizeTs(obj.time_msc ?? obj.timeMs ?? obj.timestamp ?? obj.ts ?? obj.time);
    queue.push({ symbol, tick: { bid: finite(bid) ? bid : null, ask: finite(ask) ? ask : null, last: finite(last) ? last : null, time_msc }});
    if (queue.length > 3000) queue = queue.slice(-1500);
    return true;
  }

  function scanTicks(node, fallbackSymbol = '', depth = 0) {
    if (node == null || depth > 8) return;
    if (Array.isArray(node)) { for (const x of node) scanTicks(x, fallbackSymbol, depth + 1); return; }
    if (typeof node !== 'object') return;
    const ownSymbol = symbolOf(node, fallbackSymbol);
    enqueueTick(node, ownSymbol || fallbackSymbol);
    for (const [k, v] of Object.entries(node)) {
      if (k === 'commands') continue;
      if (v && typeof v === 'object') scanTicks(v, ownSymbol || fallbackSymbol, depth + 1);
    }
  }

  function candleFromObject(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
    const t = normalizeTs(obj.t ?? obj.ts ?? obj.time ?? obj.timestamp ?? obj.openTime ?? obj.open_time ?? obj.datetime);
    const o = n(obj.o ?? obj.open), h = n(obj.h ?? obj.high), l = n(obj.l ?? obj.low), c = n(obj.c ?? obj.close);
    if (![t,o,h,l,c].every(finite) || Math.min(o,h,l,c) <= 0) return null;
    return { t,o,h,l,c,volume:n(obj.volume ?? obj.v ?? obj.tickVolume ?? obj.tick_volume) };
  }
  function candleFromArray(a) {
    if (!Array.isArray(a) || a.length < 5) return null;
    const t = normalizeTs(a[0]), o=n(a[1]), h=n(a[2]), l=n(a[3]), c=n(a[4]);
    if (![t,o,h,l,c].every(finite) || Math.min(o,h,l,c) <= 0) return null;
    return { t,o,h,l,c,volume:n(a[5]) };
  }
  function extractCandles(node, out = [], depth = 0) {
    if (node == null || depth > 10) return out;
    if (Array.isArray(node)) {
      const row = candleFromArray(node);
      if (row) out.push(row); else for (const x of node) extractCandles(x, out, depth + 1);
      return out;
    }
    if (typeof node !== 'object') return out;
    const row = candleFromObject(node);
    if (row) out.push(row);
    for (const v of Object.values(node)) if (v && typeof v === 'object') extractCandles(v, out, depth + 1);
    return out;
  }
  async function sendHistory(symbol, root) {
    symbol = symbolOf({s:symbol}, symbol) || expectedSymbol();
    if (symbol !== expectedSymbol()) return;
    const last = historyLastSent.get(symbol) || 0;
    if (Date.now() - last < HISTORY_COOLDOWN_MS) return;
    let candles = extractCandles(root);
    if (candles.length < 2) return;
    const map = new Map();
    for (const c of candles) {
      const bt = Math.floor(c.t / 300000) * 300000;
      if (!map.has(bt)) map.set(bt, {...c,t:bt});
      else {
        const old = map.get(bt); old.h = Math.max(old.h, c.h); old.l = Math.min(old.l, c.l); old.c = c.c;
        if (finite(c.volume)) old.volume = (old.volume || 0) + c.volume;
      }
    }
    candles = [...map.values()].sort((a,b)=>a.t-b.t).slice(-500);
    if (candles.length < 2) return;
    historyLastSent.set(symbol, Date.now());
    const r = await post('/ingest/doto/history', { symbol, candles });
    if (!r.ok) lastError = `hist HTTP ${r.status || 0}`;
  }

  function inspectMessage(data) {
    if (data instanceof Blob) { data.text().then(inspectMessage).catch(()=>{}); return; }
    if (data instanceof ArrayBuffer) { try { inspectMessage(new TextDecoder().decode(data)); } catch(_) {} return; }
    let msg = data;
    if (typeof msg === 'string') { try { msg = JSON.parse(msg); } catch(_) { return; } }
    if (!msg || typeof msg !== 'object') return;
    const type = String(msg.t ?? msg.type ?? ''), tl = type.toLowerCase();
    if (type === 'V01_T_Tick' || type === 'V01_T_MarketWatch' || tl.includes('tick') || tl.includes('marketwatch')) scanTicks(msg.d ?? msg.data ?? msg);
    if (type === 'V01_T_HistoryPrices' || tl.includes('historyprice')) {
      const sym = symbolOf(msg.d ?? msg, expectedSymbol()); sendHistory(sym || expectedSymbol(), msg.d ?? msg);
    }
  }

  async function flushTicks() {
    if (!queue.length) return;
    const chunk = queue.splice(0, MAX_BATCH), groups = new Map();
    for (const row of chunk) {
      if (row.symbol !== expectedSymbol()) continue;
      if (!groups.has(row.symbol)) groups.set(row.symbol, []);
      groups.get(row.symbol).push(row.tick);
    }
    for (const [symbol, ticks] of groups) {
      if (!ticks.length) continue;
      const r = await post('/ingest/doto/ticks', { symbol, ticks });
      if (r.ok) { sentTicks += Number(r.body?.accepted ?? ticks.length); lastOkAt = Date.now(); lastError = ''; }
      else { lastError = r.error || `HTTP ${r.status || 0}`; for (const tick of ticks.slice(-100)) queue.push({symbol,tick}); }
    }
    updateBadge();
  }

  function augmentDotoSubscription(data) {
    if (typeof data !== 'string') return data;
    let msg; try { msg = JSON.parse(data); } catch(_) { return data; }
    let changed = false;
    function patchCommand(cmd) {
      if (!cmd || typeof cmd !== 'object') return;
      const type = String(cmd.type ?? cmd.t ?? '');
      if (type === 'V01_T_TickSubscribe' || type === 'V01_T_MarketWatchSubscribe' || type === 'V01_T_SymbolsSubscribe') {
        const current = Array.isArray(cmd.symbols) ? cmd.symbols.map(x => String(x).toUpperCase()) : [];
        const merged = [...new Set([...current, 'XAUUSD', 'XAUUSD_OTC'])];
        if (merged.length !== current.length) { cmd.symbols = merged; changed = true; }
      }
    }
    patchCommand(msg); if (Array.isArray(msg.commands)) for (const cmd of msg.commands) patchCommand(cmd);
    return changed ? JSON.stringify(msg) : data;
  }

  try {
    const NativeWS = window.WebSocket;
    if (NativeWS && !NativeWS.__xauCloudBridgeV31) {
      function BridgeWS(url, protocols) {
        const ws = protocols === undefined ? new NativeWS(url) : new NativeWS(url, protocols);
        try { ws.addEventListener('message', ev => inspectMessage(ev.data)); } catch(_) {}
        try { const nativeSend = ws.send.bind(ws); ws.send = data => nativeSend(augmentDotoSubscription(data)); } catch(_) {}
        return ws;
      }
      BridgeWS.prototype = NativeWS.prototype; try { Object.setPrototypeOf(BridgeWS, NativeWS); } catch(_) {}
      for (const k of ['CONNECTING','OPEN','CLOSING','CLOSED']) { try { Object.defineProperty(BridgeWS, k, { value: NativeWS[k] }); } catch(_) {} }
      Object.defineProperty(BridgeWS, '__xauCloudBridgeV31', { value: true }); window.WebSocket = BridgeWS;
    }
  } catch(_) { lastError = 'WS hook'; }

  try {
    const nativeFetch = window.fetch;
    if (nativeFetch && !nativeFetch.__xauCloudBridgeV31) {
      const wrappedFetch = async function(...args) {
        const res = await nativeFetch.apply(this, args);
        try {
          const url = String(args[0]?.url ?? args[0] ?? '');
          if (/\/symbols\/charts\/candles\//i.test(url)) res.clone().json().then(j => {
            const m = url.match(/\/candles\/([^/?]+)\//i); sendHistory(m ? decodeURIComponent(m[1]) : expectedSymbol(), j);
          }).catch(()=>{});
        } catch(_) {}
        return res;
      };
      Object.defineProperty(wrappedFetch, '__xauCloudBridgeV31', {value:true}); window.fetch = wrappedFetch;
    }
  } catch(_) {}

  try {
    const XHR = window.XMLHttpRequest;
    if (XHR && XHR.prototype && !XHR.prototype.__xauCloudBridgeV31) {
      const nativeOpen = XHR.prototype.open, nativeSend = XHR.prototype.send;
      XHR.prototype.open = function(method, url, ...rest) { this.__xauCloudBridgeUrl = String(url || ''); return nativeOpen.call(this, method, url, ...rest); };
      XHR.prototype.send = function(...args) {
        if (/\/symbols\/charts\/candles\//i.test(this.__xauCloudBridgeUrl || '')) this.addEventListener('load', () => {
          try { const j = JSON.parse(this.responseText), m = this.__xauCloudBridgeUrl.match(/\/candles\/([^/?]+)\//i); sendHistory(m ? decodeURIComponent(m[1]) : expectedSymbol(), j); } catch(_) {}
        });
        return nativeSend.apply(this, args);
      };
      Object.defineProperty(XHR.prototype, '__xauCloudBridgeV31', {value:true});
    }
  } catch(_) {}

  installBadge(); setInterval(flushTicks, FLUSH_MS); setInterval(updateBadge, 1000);
  console.info('[XAUUSD V31] Doto Cloud Bridge ativo; credenciais Doto não são enviadas.');
})();
