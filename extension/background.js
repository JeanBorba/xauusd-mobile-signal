'use strict';

const SERVER = 'https://xauusd-mobile-signal.onrender.com';
const BRIDGE_TOKEN = '__BRIDGE_TOKEN__';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'DOTO_BRIDGE_POST') return;
  const pageUrl = String(sender?.tab?.url || sender?.url || '');
  if (!pageUrl.startsWith('https://client.doto.com/')) {
    sendResponse({ ok: false, status: 403, error: 'origin' });
    return;
  }
  if (!BRIDGE_TOKEN || BRIDGE_TOKEN === '__BRIDGE_TOKEN__') {
    sendResponse({ ok: false, status: 503, error: 'bridge-token-not-configured' });
    return;
  }
  const path = String(msg.path || '');
  if (!['/ingest/doto/ticks', '/ingest/doto/history'].includes(path)) {
    sendResponse({ ok: false, status: 400, error: 'path' });
    return;
  }

  (async () => {
    try {
      const r = await fetch(SERVER + path, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-doto-token': BRIDGE_TOKEN
        },
        body: JSON.stringify(msg.payload || {})
      });
      let body = null;
      try { body = await r.json(); } catch (_) {}
      sendResponse({ ok: r.ok, status: r.status, body });
    } catch (e) {
      sendResponse({ ok: false, status: 0, error: String(e?.message || e) });
    }
  })();
  return true;
});
