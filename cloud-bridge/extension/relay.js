'use strict';

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const m = event.data;
  if (!m || m.source !== 'XAUUSD_DOTO_CLOUD_V31' || m.kind !== 'POST') return;

  Promise.resolve(chrome.runtime.sendMessage({
    type: 'DOTO_BRIDGE_POST',
    path: m.path,
    payload: m.payload
  })).then((response) => {
    window.postMessage({
      source: 'XAUUSD_DOTO_CLOUD_V31_RELAY',
      kind: 'ACK',
      id: m.id,
      response: response || { ok: false, status: 0 }
    }, '*');
  }).catch((e) => {
    window.postMessage({
      source: 'XAUUSD_DOTO_CLOUD_V31_RELAY',
      kind: 'ACK',
      id: m.id,
      response: { ok: false, status: 0, error: String(e?.message || e) }
    }, '*');
  });
});
