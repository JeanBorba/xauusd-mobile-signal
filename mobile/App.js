/* XAUUSD MOBILE SIGNAL — V29 | VWAP + PRESSURE + ESTRUTURA OB / BOS / CHoCH */
/* ARQUIVO App.js — conteúdo pronto para colar diretamente no Snack/Expo. */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView, View, Text, StyleSheet, Pressable, ScrollView, StatusBar } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/*
 XAUUSD MOBILE SIGNAL — V29 DASHBOARD
 Base: V16/V17
 Objetivo desta versão:
 - preservar o motor de histórico persistente;
 - usar somente candles fechados nos indicadores;
 - calcular DXY a partir da cesta ICE quando houver FX intraday;
 - manter fallback do servidor para DXY;
 - apresentar o dashboard no formato do exemplo fornecido;
 - verde = COMPRA/ALTA, vermelho = VENDA/BAIXA, branco = NEUTRO;
 - usar OTC online como alimentação temporária do motor somente no fechamento semanal;
 - restaurar automaticamente o feed oficial e remover candles OTC na reabertura;
 - calcular VWAP por volume quando disponível e TICK/EQUAL quando não houver volume;
 - calcular pressão por delta de ticks quando disponível, com fallback causal por candles.
*/

const WS_URL = 'wss://xauusd-mobile-signal.onrender.com/stream';
const HEALTH_URL = 'https://xauusd-mobile-signal.onrender.com/health';
const YAHOO = 'https://query1.finance.yahoo.com';

const HISTORY_KEY = '@xauusd_monitor/candles_5m_v29';
const MAX_CANDLES = 500;
const CANDLE_MS = 5 * 60 * 1000;

const DXY_REFRESH_MS = 60000;
const DXY_STALE_SEC = 120;
const DXY_MAX_AGE_SEC = 600;
const DXY_REQUEST_TIMEOUT_MS = 6500;
const DXY_CALC_COOLDOWN_MS = 60000;

/* Horários oficiais solicitados pelo projeto, em BRT, sem ajuste manual de DST.
   Sydney: 19:00–04:00 (virada do dia)
   Tóquio: 21:00–06:00 (virada do dia)
   Londres: 04:00–12:00
   N. York: 09:00–16:00
*/
const SESSIONS = [
  { id: 'SYD', name: 'Sydney', openLocal: '19:00', closeLocal: '04:00' },
  { id: 'TKO', name: 'Tóquio', openLocal: '21:00', closeLocal: '06:00' },
  { id: 'LON', name: 'Londres', openLocal: '04:00', closeLocal: '12:00' },
  { id: 'NYC', name: 'N. York', openLocal: '09:00', closeLocal: '16:00' }
];
const BR_TZ = 'America/Sao_Paulo';
const XAUS_SPOT_URL = 'https://xaus.com/api/v1/spot';
const XAUS_INTRADAY_URL = 'https://xaus.com/api/v1/intraday';
const WEEKEND_OTC_URL = XAUS_SPOT_URL;
const OTC_REFRESH_MS = 30000;
const OTC_HISTORY_REFRESH_MS = 120000;
const OTC_STALE_SEC = 90;
const OFFICIAL_STALE_SEC = 45;
const SPOT_FALLBACK_STALE_SEC = 90;
const OTC_HISTORY_HOURS = 48;
const OTC_MAX_CANDLE_AGE_HOURS = 48;

/* ICE DXY:
   50.14348112 * EURUSD^-0.576 * USDJPY^0.136 * GBPUSD^-0.119
                  * USDCAD^0.091 * USDSEK^0.042 * USDCHF^0.036
*/
const DXY_BASKET = [
  ['EURUSD', 'EURUSD=X', -0.576],
  ['USDJPY', 'USDJPY=X',  0.136],
  ['GBPUSD', 'GBPUSD=X', -0.119],
  ['USDCAD', 'USDCAD=X',  0.091],
  ['USDSEK', 'USDSEK=X',  0.042],
  ['USDCHF', 'USDCHF=X',  0.036]
];
const DXY_BASE = 50.14348112;

function finite(v) {
  return Number.isFinite(Number(v));
}
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function fmt(v) {
  return finite(v) ? Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '--';
}
function pct(v) {
  return finite(v) ? `${v >= 0 ? '+' : ''}${Number(v).toFixed(2)}%` : '--';
}
function normalizeTime(v) {
  if (v == null) return NaN;
  if (typeof v === 'number') return v < 100000000000 ? v * 1000 : v;
  const s = String(v).trim();
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    return n < 100000000000 ? n * 1000 : n;
  }
  const p = Date.parse(s);
  return Number.isFinite(p) ? p : NaN;
}
function normalizeCandle(c) {
  const t = normalizeTime(c?.t ?? c?.ts ?? c?.time ?? c?.timestamp ?? c?.datetime);
  const o = num(c?.o ?? c?.open);
  const h = num(c?.h ?? c?.high);
  const l = num(c?.l ?? c?.low);
  const close = num(c?.c ?? c?.close);
  if (!finite(t) || ![o, h, l, close].every(finite)) return null;
  return {
    t: Math.floor(t / CANDLE_MS) * CANDLE_MS,
    o, h, l, c: close,
    volume: num(c?.volume ?? c?.v ?? c?.tickVolume ?? c?.tick_volume),
    delta: num(c?.delta),
    marketSource: c?.marketSource || c?.source || 'OFFICIAL',
    closed: c?.closed !== false
  };
}
function mergeCandles(...lists) {
  const map = new Map();
  lists.flat().forEach(raw => {
    const c = normalizeCandle(raw);
    if (!c) return;
    const old = map.get(c.t);
    if (!old) {
      map.set(c.t, c);
      return;
    }
    /* Mantém o melhor registro disponível. Nunca apaga delta/volume
       coletados pelo feed apenas porque o histórico público também
       contém OHLC para o mesmo candle. */
    map.set(c.t, {
      ...old,
      ...c,
      volume: finite(c.volume) && c.volume > 0 ? c.volume : old.volume,
      delta: finite(c.delta) ? c.delta : old.delta,
      closed: old.closed !== false || c.closed !== false
    });
  });
  return Array.from(map.values()).sort((a, b) => a.t - b.t).slice(-MAX_CANDLES);
}
async function loadStoredCandles() {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? mergeCandles(parsed) : [];
  } catch (_) { return []; }
}
async function saveStoredCandles(candles) {
  try {
    const closed = candles.filter(c => c.closed !== false).slice(-MAX_CANDLES);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(closed));
  } catch (_) {}
}
async function fetchPublicXauHistory() {
  /* O antigo XAUUSD=X do Yahoo não é uma fonte confiável/estável.
     Para aquecer o motor sem API paga usamos a série intraday gratuita
     da XAUS e filtramos somente os pontos de mercado normal. */
  return await fetchXausIntraday('NORMAL');
}
function calcRSI(closes, p = 14) {
  if (!Array.isArray(closes) || closes.length < p + 1) return null;
  const d = [];
  for (let i = 1; i < closes.length; i++) d.push(closes[i] - closes[i - 1]);
  let gain = 0, loss = 0;
  for (let i = 0; i < p; i++) {
    if (d[i] >= 0) gain += d[i]; else loss += Math.abs(d[i]);
  }
  let ag = gain / p, al = loss / p;
  for (let i = p; i < d.length; i++) {
    ag = (ag * (p - 1) + Math.max(d[i], 0)) / p;
    al = (al * (p - 1) + Math.max(-d[i], 0)) / p;
  }
  if (al === 0) return 100;
  if (ag === 0) return 0;
  return +(100 - 100 / (1 + ag / al)).toFixed(2);
}
function calcEMA(closes, p = 20) {
  if (!Array.isArray(closes) || closes.length < p) return null;
  let e = closes.slice(0, p).reduce((a, b) => a + b, 0) / p;
  const k = 2 / (p + 1);
  for (let i = p; i < closes.length; i++) e = closes[i] * k + e * (1 - k);
  return +e.toFixed(2);
}
function calcADX(highs, lows, closes, p = 14) {
  if (!highs || highs.length !== lows.length || highs.length !== closes.length || highs.length < p * 2 + 1) return null;
  const tr = [], plusDM = [], minusDM = [];
  for (let i = 1; i < highs.length; i++) {
    const up = highs[i] - highs[i - 1];
    const down = lows[i - 1] - lows[i];
    tr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
  }
  let atr = 0, pdm = 0, mdm = 0;
  for (let i = 0; i < p; i++) { atr += tr[i]; pdm += plusDM[i]; mdm += minusDM[i]; }
  atr /= p; pdm /= p; mdm /= p;
  const dx = [], plus = [], minus = [];
  const push = () => {
    const pi = atr > 0 ? 100 * pdm / atr : 0;
    const mi = atr > 0 ? 100 * mdm / atr : 0;
    plus.push(pi); minus.push(mi);
    dx.push(pi + mi === 0 ? 0 : 100 * Math.abs(pi - mi) / (pi + mi));
  };
  push();
  for (let i = p; i < tr.length; i++) {
    atr = (atr * (p - 1) + tr[i]) / p;
    pdm = (pdm * (p - 1) + plusDM[i]) / p;
    mdm = (mdm * (p - 1) + minusDM[i]) / p;
    push();
  }
  if (dx.length < p) return null;
  let adx = dx.slice(0, p).reduce((a, b) => a + b, 0) / p;
  for (let i = p; i < dx.length; i++) adx = (adx * (p - 1) + dx[i]) / p;
  const last = plus.length - 1;
  return { adx: +adx.toFixed(1), plusDI: +plus[last].toFixed(1), minusDI: +minus[last].toFixed(1), atr: +atr.toFixed(3) };
}
function detectFVG(highs, lows, times, atr) {
  if (!highs || highs.length < 5) return [];
  const minGap = atr > 0 ? Math.max(0.12, atr * 0.10) : 0.20;
  const zones = [];
  for (let i = 0; i < highs.length - 2; i++) {
    if (lows[i + 2] > highs[i]) {
      const gap = lows[i + 2] - highs[i];
      if (gap >= minGap) zones.push({ tipo: 'ALTA', inf: highs[i], sup: lows[i + 2], tam: gap, created: times[i + 2] });
    }
    if (highs[i + 2] < lows[i]) {
      const gap = lows[i] - highs[i + 2];
      if (gap >= minGap) zones.push({ tipo: 'BAIXA', inf: highs[i + 2], sup: lows[i], tam: gap, created: times[i + 2] });
    }
  }
  return zones.filter(z => {
    const idx = times.indexOf(z.created);
    if (idx < 0) return true;
    for (let j = idx + 1; j < lows.length; j++) {
      if (z.tipo === 'ALTA' && lows[j] <= z.inf) return false;
      if (z.tipo === 'BAIXA' && highs[j] >= z.sup) return false;
    }
    return true;
  }).slice(-10);
}
function detectSwingPoints(candles, left = 2, right = 2) {
  const highs = [], lows = [];
  if (!Array.isArray(candles) || candles.length < left + right + 3) return { highs, lows };
  for (let i = left; i < candles.length - right; i++) {
    let isHigh = true, isLow = true;
    for (let j = 1; j <= left; j++) {
      if (candles[i].h <= candles[i - j].h) isHigh = false;
      if (candles[i].l >= candles[i - j].l) isLow = false;
    }
    for (let j = 1; j <= right; j++) {
      if (candles[i].h < candles[i + j].h) isHigh = false;
      if (candles[i].l > candles[i + j].l) isLow = false;
    }
    if (isHigh) highs.push({ index: i, price: candles[i].h, time: candles[i].t });
    if (isLow) lows.push({ index: i, price: candles[i].l, time: candles[i].t });
  }
  return { highs, lows };
}
function detectStructure(candles) {
  if (!Array.isArray(candles) || candles.length < 12) {
    return { bos: null, choch: null, event: null, events: [], ob: null, obs: [], trend: null, swings: { highs: [], lows: [] } };
  }

  const left = 2, right = 2;
  const confirmedHighs = [];
  const confirmedLows = [];
  const brokenHighs = new Set();
  const brokenLows = new Set();
  const obCandidates = [];
  const usedObSources = new Set();
  const events = [];
  let trend = null;
  let lastEvent = null;

  function isSwingHigh(idx) {
    if (idx < left || idx + right >= candles.length) return false;
    for (let j = 1; j <= left; j++) if (candles[idx].h <= candles[idx - j].h) return false;
    for (let j = 1; j <= right; j++) if (candles[idx].h < candles[idx + j].h) return false;
    return true;
  }
  function isSwingLow(idx) {
    if (idx < left || idx + right >= candles.length) return false;
    for (let j = 1; j <= left; j++) if (candles[idx].l >= candles[idx - j].l) return false;
    for (let j = 1; j <= right; j++) if (candles[idx].l > candles[idx + j].l) return false;
    return true;
  }

  /* Causalidade: o swing de índice s só entra no conjunto de níveis
     disponíveis depois de duas velas posteriores terem fechado.
     Assim nenhum rompimento usa informação futura. */
  for (let i = 0; i < candles.length; i++) {
    const s = i - right - 1;
    if (s >= left) {
      if (isSwingHigh(s)) confirmedHighs.push({ index: s, price: candles[s].h, time: candles[s].t });
      if (isSwingLow(s)) confirmedLows.push({ index: s, price: candles[s].l, time: candles[s].t });
    }

    const sh = confirmedHighs.filter(x => !brokenHighs.has(x.index)).slice(-1)[0] || null;
    const sl = confirmedLows.filter(x => !brokenLows.has(x.index)).slice(-1)[0] || null;
    const c = candles[i];
    const bullBreak = !!sh && c.c > sh.price;
    const bearBreak = !!sl && c.c < sl.price;
    let side = null, swing = null;

    if (bullBreak && bearBreak) {
      const up = c.c - sh.price;
      const down = sl.price - c.c;
      if (up >= down) { side = 'ALTA'; swing = sh; }
      else { side = 'BAIXA'; swing = sl; }
    } else if (bullBreak) {
      side = 'ALTA'; swing = sh;
    } else if (bearBreak) {
      side = 'BAIXA'; swing = sl;
    }
    if (!side || !swing) continue;

    if (side === 'ALTA') brokenHighs.add(swing.index);
    else brokenLows.add(swing.index);

    const type = trend && trend !== side ? 'CHoCH' : 'BOS';
    const event = { type, side, price: c.c, time: c.t, level: swing.price, index: i };
    events.push(event);
    lastEvent = event;
    trend = side;

    const from = Math.max(0, i - 12);
    for (let j = i - 1; j >= from; j--) {
      const opposite = side === 'ALTA' ? candles[j].c < candles[j].o : candles[j].c > candles[j].o;
      if (opposite && !usedObSources.has(j)) {
        obCandidates.push({
          tipo: side,
          inf: candles[j].l,
          sup: candles[j].h,
          price: candles[j].c,
          created: c.t,
          sourceIndex: j,
          breakIndex: i
        });
        usedObSources.add(j);
        break;
      }
    }
  }

  const activeObs = obCandidates.filter(z => {
    for (let j = z.breakIndex + 1; j < candles.length; j++) {
      if (z.tipo === 'ALTA' && candles[j].l <= z.inf) return false;
      if (z.tipo === 'BAIXA' && candles[j].h >= z.sup) return false;
    }
    return true;
  });

  const obs = activeObs.slice(-10);
  const latestOb = obs.length ? obs[obs.length - 1] : null;
  return {
    bos: lastEvent?.type === 'BOS' ? lastEvent.side : null,
    choch: lastEvent?.type === 'CHoCH' ? lastEvent.side : null,
    event: lastEvent,
    events: events.slice(-20),
    ob: latestOb,
    obs,
    trend,
    swings: { highs: confirmedHighs.slice(-10), lows: confirmedLows.slice(-10) }
  };
}
function calcVWAP(candles) {
  if (!Array.isArray(candles) || !candles.length) return null;
  const now = new Date();
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const day = candles.filter(c => c.t >= dayStart && c.closed !== false);
  if (!day.length) return null;
  let pv = 0, vol = 0, hasRealVolume = false;
  day.forEach(c => {
    const typical = (c.h + c.l + c.c) / 3;
    const v = finite(c.volume) && c.volume > 0 ? c.volume : 1;
    if (finite(c.volume) && c.volume > 0) hasRealVolume = true;
    pv += typical * v;
    vol += v;
  });
  if (!vol) return null;
  return { value: pv / vol, source: hasRealVolume ? 'VOLUME' : 'TICK/EQUAL' };
}

/* Pressão é um proxy causal quando não existe fluxo bid/ask real.
   Se houver delta de ticks coletado pelo próprio app, ele tem prioridade.
   Caso contrário usamos o corpo/range dos candles fechados. */
function calcPressure(candles) {
  const r = candles.slice(-20);
  if (!r.length) return null;
  const tickDelta = r.reduce((sum, c) => sum + (finite(c.delta) ? c.delta : 0), 0);
  const tickCount = r.reduce((sum, c) => sum + (finite(c.delta) ? Math.abs(c.delta) : 0), 0);
  if (tickCount > 3) {
    if (tickDelta > 3) return { label: 'COMPRADORA', side: 'C', score: tickDelta, source: 'TICKS' };
    if (tickDelta < -3) return { label: 'VENDEDORA', side: 'V', score: tickDelta, source: 'TICKS' };
  }
  let score = 0;
  r.forEach(c => {
    const range = Math.max(c.h - c.l, 1e-9);
    const weight = finite(c.volume) && c.volume > 0 ? Math.log10(c.volume + 1) : 1;
    score += ((c.c - c.o) / range) * weight;
  });
  if (score > 1.5) return { label: 'COMPRADORA', side: 'C', score, source: 'CANDLES' };
  if (score < -1.5) return { label: 'VENDEDORA', side: 'V', score, source: 'CANDLES' };
  return { label: 'NEUTRA', side: 'N', score, source: 'CANDLES' };
}
function tzParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' }).formatToParts(date);
  const out = {}; parts.forEach(x => { if (x.type !== 'literal') out[x.type] = x.value; });
  return { minutes: Number(out.hour) * 60 + Number(out.minute), weekday: out.weekday };
}
function brtParts(now) {
  return tzParts(now, BR_TZ);
}
function brtMinutes(now) { return brtParts(now).minutes; }
function brtWeekday(now) {
  const p = brtParts(now);
  return { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 }[p.weekday];
}
function isStandardFxWeekend(now) {
  /* Fechamento semanal após NY 16:00 BRT na sexta.
     Reabertura oficial no domingo às 19:00 BRT com Sydney. */
  const d = brtWeekday(now), m = brtMinutes(now);
  return d === 6 || (d === 5 && m >= 16 * 60) || (d === 0 && m < 19 * 60);
}

function otcWindowStartMs(now = new Date()) {
  const d = brtWeekday(now);
  const m = brtMinutes(now);
  if (d === 5 && m >= 16 * 60) return now.getTime() - (m - 16 * 60) * 60000;
  if (d === 6) return now.getTime() - (24 * 60 - (16 * 60 - m)) * 60000;
  if (d === 0 && m < 19 * 60) return now.getTime() - (48 * 60 - (16 * 60 - m)) * 60000;
  return now.getTime() - 36 * 3600000;
}
function sessionActive(now, session) {
  const m = brtMinutes(now);
  const [oh,om]=session.openLocal.split(':').map(Number), [ch,cm]=session.closeLocal.split(':').map(Number);
  const a=oh*60+om,b=ch*60+cm;
  if (a>b) return m>=a || m<b;
  return m>=a && m<b;
}
function localClock(date,tz){ return new Intl.DateTimeFormat('pt-BR',{timeZone:tz,hour:'2-digit',minute:'2-digit',hour12:false}).format(date); }
function sessionDisplayTimes(now,s){
  return {openLocal:s.openLocal,closeLocal:s.closeLocal,openUtc:'',closeUtc:'',offset:'BRT'};
}
function activeSessions(now) { return isStandardFxWeekend(now) ? [] : SESSIONS.filter(s => sessionActive(now,s)).map(s => s.name); }
function sessionState(now, session, connectionStatus, fallbackAvailable=false) {
  if (isStandardFxWeekend(now)) return 'FECHADA';
  if (!sessionActive(now, session)) return 'FECHADA';
  if (connectionStatus === 'ONLINE') return 'ONLINE';
  if (fallbackAvailable) return 'ONLINE · FALLBACK';
  return 'SEM FEED';
}
async function timeoutFetch(url, ms = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r;
  } finally { clearTimeout(timer); }
}
async function fetchJson(url, ms = DXY_REQUEST_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(timer); }
}

function parseYahooChart(j) {
  const result = j?.chart?.result?.[0];
  const meta = result?.meta;
  const ts = result?.timestamp || [];
  const q = result?.indicators?.quote?.[0];
  let i = Math.min(ts.length, q?.close?.length || 0) - 1;
  while (i >= 0 && !finite(q.close[i])) i--;
  if (i < 0) return null;
  const value = Number(q.close[i]);
  const asOf = Number(ts[i]) * 1000;
  return finite(value) && value > 0 ? { value, asOf } : null;
}

async function yahooRate(ticker) {
  const j = await fetchJson(`${YAHOO}/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=5m&includePrePost=true&_=${Date.now()}`);
  const q = parseYahooChart(j);
  if (!q) throw new Error('sem preço');
  return q;
}

async function calculateDxyBasket() {
  const rows = [];
  for (const [key, ticker, weight] of DXY_BASKET) {
    try {
      const q = await yahooRate(ticker);
      rows.push({ key, value: q.value, asOf: q.asOf, weight });
    } catch (_) {
      return null;
    }
  }
  let value = DXY_BASE;
  rows.forEach(x => { value *= Math.pow(x.value, x.weight); });
  const asOf = Math.min(...rows.map(x => x.asOf));
  if (!finite(value) || value <= 0) return null;
  return {
    value,
    asOf,
    ageSec: Math.max(0, (Date.now() - asOf) / 1000),
    source: 'DXY CALCULADO · CESTA ICE',
    complete: true
  };
}

async function fetchDirectDxy() {
  const sources = [
    ['DX-Y.NYB', 'DXY · Yahoo 5M'],
    ['DX=F', 'DXY Futures · Yahoo 5M']
  ];
  for (const [ticker, source] of sources) {
    try {
      const q = await yahooRate(ticker);
      return { ...q, ageSec: Math.max(0, (Date.now() - q.asOf) / 1000), source, complete: false };
    } catch (_) {}
  }
  return null;
}

async function fetchServerDxy() {
  try {
    const j = await fetchJson(HEALTH_URL, 7000);
    const d = j?.dxy;
    const asOf = normalizeTime(d?.asOf ?? d?.timestamp ?? d?.time);
    if (finite(d?.value) && Number(d.value) > 0 && finite(asOf)) {
      return {
        value: Number(d.value),
        asOf,
        ageSec: Math.max(0, (Date.now() - asOf) / 1000),
        source: d?.source || 'SERVIDOR · DXY',
        complete: d?.complete === true
      };
    }
  } catch (_) {}
  return null;
}

async function calculateDxy() {
  /*
   * Hierarquia de dados para respeitar a limitação de APIs gratuitas:
   * 1) DXY fornecido pelo próprio servidor/health;
   * 2) cálculo ICE local a partir das 6 moedas, somente como fallback;
   * 3) DXY público direto, último recurso.
   *
   * Nunca transformamos XAUUSD em "DXY": sem as seis cotações FX isso
   * seria um valor inventado e contaminaria o sinal.
   */
  const server = await fetchServerDxy();
  if (server) return server;

  const basket = await calculateDxyBasket();
  if (basket) return basket;

  return await fetchDirectDxy();
}

async function fetchWeekendOtcGold() {
  try {
    /* Cache-bust somente para a leitura crítica do preço. A XAUS informa
       atualização contínua com cache de 30s e expõe data_state/price_as_of. */
    const j = await fetchJson(`${WEEKEND_OTC_URL}?compact=1&fresh=${Date.now()}`, 6500);
    const value = num(j?.spot_usd_oz ?? j?.xau?.price);
    const asOf = normalizeTime(j?.data_state?.as_of ?? j?.price_as_of ?? j?.timestamp ?? j?.updated_at);
    const updatedAt = normalizeTime(j?.updated_at);
    if (!finite(value) || value <= 0 || !finite(asOf)) return null;
    const ageSec = Math.max(0, (Date.now() - asOf) / 1000);
    const state = j?.data_state?.status || (j?.stale ? 'stale' : 'fresh');
    return {
      value, asOf, updatedAt, ageSec,
      source: 'XAUS · XAU/USD SPOT INDICATIVO',
      state,
      stale: j?.stale === true || state === 'stale'
    };
  } catch(_) { return null; }
}

async function fetchXausIntraday(mode = 'NORMAL') {
  try {
    const j = await fetchJson(`${XAUS_INTRADAY_URL}?symbol=xau&hours=${OTC_HISTORY_HOURS}&fresh=${Date.now()}`, 8000);
    const points = Array.isArray(j?.points) ? j.points : [];
    if (!points.length) return [];

    const wantWeekend = mode === 'OTC';
    const currentBucket = Math.floor(Date.now() / CANDLE_MS) * CANDLE_MS;
    const weekendStart = otcWindowStartMs(new Date());
    const map = new Map();

    points.forEach(pt => {
      const t = normalizeTime(pt?.t ?? pt?.time ?? pt?.timestamp);
      const p = num(pt?.p ?? pt?.price ?? pt?.c);
      if (!finite(t) || !finite(p) || p <= 0 || t >= currentBucket) return;
      if (Date.now() - t > OTC_MAX_CANDLE_AGE_HOURS * 3600000) return;

      const pointIsWeekend = isStandardFxWeekend(new Date(t));
      if (pointIsWeekend !== wantWeekend) return;
      if (wantWeekend && t < weekendStart) return;

      const bucket = Math.floor(t / CANDLE_MS) * CANDLE_MS;
      const marketSource = wantWeekend ? 'OTC' : 'SPOT_FALLBACK';
      const old = map.get(bucket);
      if (!old) {
        map.set(bucket, { t: bucket, o: p, h: p, l: p, c: p, volume: 1, delta: 0, closed: true, marketSource });
      } else {
        const dir = p > old.c ? 1 : p < old.c ? -1 : 0;
        old.h = Math.max(old.h, p);
        old.l = Math.min(old.l, p);
        old.c = p;
        old.volume += 1;
        old.delta += dir;
      }
    });

    return Array.from(map.values()).sort((a,b)=>a.t-b.t).slice(-MAX_CANDLES);
  } catch(_) { return []; }
}

async function fetchWeekendOtcIntraday() {
  return await fetchXausIntraday('OTC');
}

async function fetchNormalSpotIntraday() {
  return await fetchXausIntraday('NORMAL');
}

function serverMarketSource(m) {
  const name = String(m?.source?.name ?? m?.feed ?? m?.primary ?? '').toLowerCase();
  const mode = String(m?.marketMode ?? '').toUpperCase();
  if (mode === 'OTC' || name.includes('xaus-otc')) return 'OTC';
  if (name.includes('fallback') || name.includes('xaus')) return 'SPOT_FALLBACK';
  return 'OFFICIAL';
}

function colorFor(side) {
  return side === 'C' ? '#22c55e' : side === 'V' ? '#ef4444' : '#ffffff';
}
function labelSide(side) {
  return side === 'C' ? 'ALTA' : side === 'V' ? 'BAIXA' : 'NEUTRO';
}
function buildSignal({ price, ema, rsi, adx, fvg, structure, pressure, dxy, vwap, sessions }) {
  const checks = [];
  const add = (label, side, available = true) => {
    checks.push({ label, side: available ? side : 'N', available });
  };

  /* São exatamente 9 confirmações direcionais. Dados ausentes ficam NEUTROS
     e não são contados como confirmação. Assim o painel nunca fabrica força. */
  add('Preço acima/abaixo da EMA20', finite(price) && finite(ema) ? (price > ema ? 'C' : price < ema ? 'V' : 'N') : 'N', finite(price) && finite(ema));
  add('RSI favorece direção', finite(rsi) ? (rsi > 55 && rsi < 70 ? 'C' : rsi < 45 && rsi > 30 ? 'V' : 'N') : 'N', finite(rsi));
  add('ADX +DI / -DI · força', adx && adx.adx >= 20 ? (adx.plusDI > adx.minusDI ? 'C' : adx.minusDI > adx.plusDI ? 'V' : 'N') : 'N', !!adx && adx.adx >= 20);

  const near = adx && fvg?.length ? fvg.slice(-5).find(z => price >= z.inf - adx.atr * .35 && price <= z.sup + adx.atr * .35) : null;
  add('FVG próxima', near ? (near.tipo === 'ALTA' ? 'C' : 'V') : 'N', !!near);
  add('OB ativo', structure?.ob ? (structure.ob.tipo === 'ALTA' ? 'C' : 'V') : 'N', !!structure?.ob);
  add('BOS / CHoCH confirmado', structure?.event ? (structure.event.side === 'ALTA' ? 'C' : 'V') : 'N', !!structure?.event);
  add('Delta / Pressure', pressure?.side || 'N', !!pressure && pressure.side !== 'N');
  add('Preço vs VWAP', vwap && finite(price) ? (price > vwap.value ? 'C' : price < vwap.value ? 'V' : 'N') : 'N', !!vwap && finite(price));

  const dxyFresh = dxy && finite(dxy.value) && finite(dxy.asOf) && (Date.now() - dxy.asOf) / 1000 <= DXY_STALE_SEC;
  add('DXY enfraquecendo/fortalecendo', dxyFresh && finite(dxy.changePct) ? (dxy.changePct < -0.05 ? 'C' : dxy.changePct > 0.05 ? 'V' : 'N') : 'N', dxyFresh && finite(dxy.changePct));

  const buyConfirmations = checks.filter(x => x.side === 'C').length;
  const sellConfirmations = checks.filter(x => x.side === 'V').length;
  const leader = Math.max(buyConfirmations, sellConfirmations);
  const leaderSide = buyConfirmations > sellConfirmations ? 'C' : sellConfirmations > buyConfirmations ? 'V' : 'N';
  const diff = Math.abs(buyConfirmations - sellConfirmations);
  const available = checks.filter(x => x.available).length;
  const score = available ? Math.round((leader / 9) * 100) : 0;

  /* Exige vantagem real e pelo menos 4 confirmações direcionais antes de
     emitir COMPRA/VENDA. Caso contrário permanece NEUTRO. */
  const finalSide = leader >= 4 && diff >= 2 ? leaderSide : 'N';
  return {
    side: finalSide,
    text: finalSide === 'C' ? 'COMPRA' : finalSide === 'V' ? 'VENDA' : 'AGUARDANDO CONFIRMAÇÃO',
    score,
    checks,
    buyConfirmations,
    sellConfirmations,
    confirmations: leader,
    available
  };
}

function IndicatorRow({ label, value, side = 'N', sub = null }) {
  const c = colorFor(side);
  return (
    <View style={styles.irow}>
      <Text style={styles.ilabel}>{label}</Text>
      <View style={styles.ivalWrap}>
        <Text style={[styles.ivalue, { color: c }]}>{value}</Text>
        {sub ? <Text style={[styles.isub, { color: c }]}>{sub}</Text> : null}
      </View>
    </View>
  );
}
function SessionCard({ s, now, connectionStatus, fallbackAvailable }) {
  const active = sessionActive(now, s);
  const state = sessionState(now, s, connectionStatus, fallbackAvailable);
  const times = sessionDisplayTimes(now,s);
  const weekend = isStandardFxWeekend(now);
  const stateColor = state.startsWith('ONLINE') ? (state.includes('FALLBACK') ? '#f59e0b' : '#22c55e') : state === 'SEM FEED' ? '#ef4444' : '#ffffff';
  return (
    <View style={[styles.session, active && styles.sessionOn]}>
      <View style={[styles.sessionDot, { backgroundColor: stateColor }]} />
      <Text style={[styles.sessionName, active && { color: '#ffffff' }]}>{s.name}</Text>
      <Text style={styles.sessionHours}>{times.openLocal}–{times.closeLocal} BRT</Text>
      <Text style={styles.sessionSub}>{weekend ? 'MERCADO OFICIAL FECHADO' : `${times.offset}`}</Text>
      <Text style={[styles.sessionState, { color: stateColor }]}>{state}</Text>
    </View>
  );
}

export default function App() {
  const [now, setNow] = useState(new Date());
  const [status, setStatus] = useState('CONECTANDO...');
  const [weekendOtc, setWeekendOtc] = useState(null);
  const [spotFallback, setSpotFallback] = useState(null);
  const otcRef = useRef(null);
  const lastOfficialTickRef = useRef(0);
  const currentSourceRef = useRef('OFFICIAL');
  const [price, setPrice] = useState(null);
  const [bid, setBid] = useState(null);
  const [ask, setAsk] = useState(null);
  const [tickTime, setTickTime] = useState(null);
  const [candles, setCandles] = useState([]);
  const [dxy, setDxy] = useState(null);
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);
  const currentRef = useRef(null);
  const persistTimer = useRef(null);
  const previousDxyRef = useRef(null);
  const dxyBusyRef = useRef(false);
  const lastDxyCalcRef = useRef(0);
  const otcHistoryBusyRef = useRef(false);

  const persist = useCallback(list => {
    clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => saveStoredCandles(list), 500);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const saved = await loadStoredCandles();
      const weekend = isStandardFxWeekend(new Date());
      const publicHistory = weekend ? await fetchWeekendOtcIntraday() : await fetchNormalSpotIntraday();
      const savedClean = weekend
        ? saved.filter(c => c.marketSource === 'OTC' && c.t >= otcWindowStartMs(new Date()))
        : saved.filter(c => c.marketSource !== 'OTC');
      const merged = mergeCandles(savedClean, publicHistory);
      if (mounted && merged.length) {
        setCandles(merged);
        await saveStoredCandles(merged);
      }
    })();
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => { mounted = false; clearInterval(timer); clearTimeout(persistTimer.current); };
  }, []);

  const addTick = useCallback((p, ts, b, a, marketSource='OFFICIAL') => {
    if (!finite(p) || !finite(ts)) return;
    const otc = marketSource === 'OTC';
    if (otc !== isStandardFxWeekend(new Date(ts))) return;

    setCandles(prev => {
      let next = prev.filter(c => c.closed !== false);

      /* Remove OTC apenas quando o mercado normal realmente retorna.
         Não resetamos o candle a cada tick — isso preserva OHLC/delta. */
      if (!otc) next = next.filter(c => c.marketSource !== 'OTC');

      const bucket = Math.floor(ts / CANDLE_MS) * CANDLE_MS;
      const existingCurrent = currentRef.current;

      if (existingCurrent && (existingCurrent.t !== bucket || existingCurrent.marketSource !== marketSource)) {
        next = mergeCandles(next, { ...existingCurrent, closed: true });
        currentRef.current = null;
      }

      let c = currentRef.current;
      if (!c) {
        c = { t: bucket, o: p, h: p, l: p, c: p, volume: 1, delta: 0, closed: false, marketSource };
      } else {
        const dir = p > c.c ? 1 : p < c.c ? -1 : 0;
        c = {
          ...c,
          c: p,
          h: Math.max(c.h, p),
          l: Math.min(c.l, p),
          volume: (c.volume || 0) + 1,
          delta: (c.delta || 0) + dir,
          marketSource
        };
      }

      currentRef.current = c;
      currentSourceRef.current = marketSource;
      const out = [...next, c].sort((x, y) => x.t - y.t).slice(-MAX_CANDLES);
      persist(out);
      return out;
    });

    setPrice(p);
    if (finite(b)) setBid(b); else if (marketSource !== 'OFFICIAL') setBid(null);
    if (finite(a)) setAsk(a); else if (marketSource !== 'OFFICIAL') setAsk(null);
    setTickTime(new Date(ts).toLocaleTimeString('pt-BR'));
  }, [persist]);

  const connect = useCallback(() => {
    if (wsRef.current) try { wsRef.current.close(); } catch (_) {}
    setStatus('CONECTANDO...');
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    ws.onopen = () => {
      setStatus('ONLINE');
      try { ws.send(JSON.stringify({ type: 'set_tf', tf: '5m' })); } catch (_) {}
    };
    ws.onmessage = e => {
      try {
        const m = JSON.parse(e.data);
        if (m.type === 'tick') {
          const tsRaw = Number(m.ts);
          const ts = finite(tsRaw) ? (tsRaw < 100000000000 ? tsRaw * 1000 : tsRaw) : Date.now();
          const src = serverMarketSource(m);
          if (src === 'OFFICIAL') lastOfficialTickRef.current = Date.now();
          addTick(Number(m.price), ts, Number(m.source?.bid), Number(m.source?.ask), src);
        }
        if (m.type === 'market_state') {
          const md = m.dxy || m.macro?.dxy || m.market?.dxy;
          if (md && finite(md.value)) {
            const asOf = normalizeTime(md.asOf ?? md.timestamp ?? md.time ?? m.serverTime);
            setDxy(prev => ({
              ...prev,
              value: Number(md.value),
              asOf: finite(asOf) ? asOf : Date.now(),
              source: md.source || 'SERVIDOR · DXY',
              complete: md.complete === true
            }));
          }
          if (Array.isArray(m.candles) && m.candles.length) {
            setCandles(prev => {
              const merged = mergeCandles(prev, m.candles);
              persist(merged);
              return merged;
            });
          }
          if (finite(m.price)) {
            const src = serverMarketSource(m);
            if (src === 'OFFICIAL') lastOfficialTickRef.current = Date.now();
            addTick(Number(m.price), finite(m.serverTime) ? Number(m.serverTime) : Date.now(), null, null, src);
          }
        }
        if (m.type === 'history' && Array.isArray(m.candles)) {
          setCandles(prev => {
            const merged = mergeCandles(prev, m.candles);
            persist(merged);
            return merged;
          });
        }
      } catch (_) {}
    };
    ws.onerror = () => setStatus('OFFLINE');
    ws.onclose = () => {
      if (wsRef.current === ws) wsRef.current = null;
      setStatus('OFFLINE');
      clearTimeout(reconnectRef.current);
      reconnectRef.current = setTimeout(connect, 3000);
    };
  }, [addTick, persist]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectRef.current);
      if (wsRef.current) try { wsRef.current.close(); } catch (_) {}
    };
  }, [connect]);

  const closed = useMemo(() => candles.filter(c => c.closed !== false), [candles]);
  const priceNow = price ?? (closed.length ? closed[closed.length - 1].c : null);
  const closes = closed.map(c => c.c), highs = closed.map(c => c.h), lows = closed.map(c => c.l), times = closed.map(c => c.t);
  const rsi = useMemo(() => calcRSI(closes), [candles]);
  const ema = useMemo(() => calcEMA(closes), [candles]);
  const adx = useMemo(() => calcADX(highs, lows, closes), [candles]);
  const fvg = useMemo(() => detectFVG(highs, lows, times, adx?.atr || 0), [candles, adx]);
  const structure = useMemo(() => detectStructure(closed), [candles]);
  const pressure = useMemo(() => calcPressure(closed), [candles]);
  const vwap = useMemo(() => calcVWAP(closed), [candles, now.toISOString().slice(0,10)]);
  const sessions = activeSessions(now);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      const weekend = isStandardFxWeekend(new Date());
      const officialFresh = status === 'ONLINE' &&
        lastOfficialTickRef.current > 0 &&
        (Date.now() - lastOfficialTickRef.current) / 1000 <= OFFICIAL_STALE_SEC;

      if (weekend) {
        setSpotFallback(null);
        const q = await fetchWeekendOtcGold();
        if (!alive) return;
        setWeekendOtc(q);
        if (q && q.ageSec <= OTC_STALE_SEC && !q.stale) {
          addTick(q.value, q.asOf, null, null, 'OTC');
        }

        if (!otcHistoryBusyRef.current) {
          otcHistoryBusyRef.current = true;
          try {
            const otcHistory = await fetchWeekendOtcIntraday();
            if (alive && otcHistory.length) {
              setCandles(prev => {
                const clean = prev.filter(c => c.marketSource === 'OTC');
                const merged = mergeCandles(clean, otcHistory);
                persist(merged);
                return merged;
              });
            }
          } finally {
            otcHistoryBusyRef.current = false;
          }
        }
        return;
      }

      /* Mercado normal: WSS/Brokeret tem prioridade. Se ficar sem tick
         recente, XAUS assume automaticamente como fallback gratuito. */
      setWeekendOtc(null);
      if (officialFresh) {
        setSpotFallback(null);
        return;
      }

      const q = await fetchWeekendOtcGold();
      if (!alive) return;
      setSpotFallback(q);
      if (q && q.ageSec <= SPOT_FALLBACK_STALE_SEC && !q.stale) {
        addTick(q.value, q.asOf, null, null, 'SPOT_FALLBACK');
      }

      if (!otcHistoryBusyRef.current) {
        otcHistoryBusyRef.current = true;
        try {
          const normalHistory = await fetchNormalSpotIntraday();
          if (alive && normalHistory.length) {
            setCandles(prev => {
              const normal = prev.filter(c => c.marketSource !== 'OTC');
              const merged = mergeCandles(normalHistory, normal);
              persist(merged);
              return merged;
            });
          }
        } finally {
          otcHistoryBusyRef.current = false;
        }
      }
    };

    load();
    const id = setInterval(load, OTC_REFRESH_MS);
    return () => { alive = false; clearInterval(id); };
  }, [addTick, persist, status]);

  const otcLive = !!weekendOtc && finite(weekendOtc.value) && weekendOtc.ageSec <= OTC_STALE_SEC && !weekendOtc.stale;
  const officialFeedFresh = status === 'ONLINE' &&
    lastOfficialTickRef.current > 0 &&
    (Date.now() - lastOfficialTickRef.current) / 1000 <= OFFICIAL_STALE_SEC;
  const spotFallbackLive = !!spotFallback && finite(spotFallback.value) &&
    spotFallback.ageSec <= SPOT_FALLBACK_STALE_SEC && !spotFallback.stale;
  const marketLive = isStandardFxWeekend(now) ? otcLive : (officialFeedFresh || spotFallbackLive);
  const marketFeedLabel = isStandardFxWeekend(now)
    ? (otcLive ? 'OTC · XAUS' : 'OTC · SEM FEED')
    : officialFeedFresh ? 'FEED OFICIAL' : spotFallbackLive ? 'FALLBACK GRATUITO · XAUS' : 'SEM FEED';

  /* Ao reabrir Sydney no domingo às 19:00 BRT, OTC deixa de alimentar o motor
     imediatamente. Os candles OTC são removidos e o motor passa a aguardar
     exclusivamente o primeiro dado oficial recebido pelo WSS. */
  useEffect(() => {
    if (isStandardFxWeekend(now)) return;
    setCandles(prev => {
      const clean = prev.filter(c => c.marketSource !== 'OTC');
      if (clean.length !== prev.length) {
        currentRef.current = null;
        currentSourceRef.current = 'OFFICIAL';
        persist(clean);
        return clean;
      }
      return prev;
    });
  }, [now.getTime(), persist]);

  const signal = useMemo(() => {
    if (!marketLive) {
      return {side:'N',text:isStandardFxWeekend(now) ? 'OTC SEM FEED' : 'XAUUSD SEM FEED',score:0,checks:[],buyConfirmations:0,sellConfirmations:0,confirmations:0,available:0};
    }
    return buildSignal({ price: priceNow, ema, rsi, adx, fvg, structure, pressure, dxy, vwap, sessions });
  }, [priceNow, ema, rsi, adx, fvg, structure, pressure, dxy, vwap, sessions, marketLive, now.getTime()]);

  const updateDxy = useCallback(async () => {
    if (dxyBusyRef.current) return;
    const nowMs = Date.now();
    if (nowMs - lastDxyCalcRef.current < DXY_CALC_COOLDOWN_MS) return;
    dxyBusyRef.current = true;
    lastDxyCalcRef.current = nowMs;
    try {
      const q = await calculateDxy();
      if (q) setDxy(q);
    } finally {
      dxyBusyRef.current = false;
    }
  }, []);
  useEffect(() => {
    updateDxy();
    const t = setInterval(updateDxy, DXY_REFRESH_MS);
    return () => clearInterval(t);
  }, [updateDxy]);

  const dxyAge = dxy?.asOf ? Math.max(0, (Date.now() - dxy.asOf) / 1000) : Infinity;
  const dxyState = !finite(dxy?.value) || !finite(dxy?.asOf) || dxyAge > DXY_MAX_AGE_SEC ? 'SEM FEED' : dxyAge > DXY_STALE_SEC ? 'DADO ATRASADO' : 'LIVE';
  const dxySide = dxy?.changePct == null ? 'N' : dxy.changePct < -0.05 ? 'C' : dxy.changePct > 0.05 ? 'V' : 'N';
  const dxyText = finite(dxy?.value) ? `${dxy.value.toFixed(2)} ${dxy.changePct != null ? (dxy.changePct >= 0 ? '↑' : '↓') + ' ' + pct(dxy.changePct) : ''}` : '--';

  /* A variação do DXY é calculada contra a leitura anterior recebida.
     Na primeira leitura não se inventa uma variação: fica 0. */
  useEffect(() => {
    if (!dxy?.value) return;
    const previous = previousDxyRef.current;
    const changePct = previous && previous > 0 ? ((dxy.value - previous) / previous) * 100 : 0;
    previousDxyRef.current = dxy.value;
    setDxy(prev => ({ ...prev, changePct }));
  }, [dxy?.value]);

  const risk = !adx ? 'AGUARDANDO' : adx.atr / Math.max(priceNow || 1, 1) < 0.002 ? 'BAIXO' : adx.atr / Math.max(priceNow || 1, 1) < 0.004 ? 'NORMAL' : 'ALTO';
  const riskSide = risk === 'AGUARDANDO' ? 'N' : 'N';

  const fvgSide = fvg.length ? (fvg[fvg.length - 1].tipo === 'ALTA' ? 'C' : 'V') : 'N';
  const obSide = structure.ob?.tipo === 'ALTA' ? 'C' : structure.ob?.tipo === 'BAIXA' ? 'V' : 'N';
  const bosSide = structure.event?.side === 'ALTA' ? 'C' : structure.event?.side === 'BAIXA' ? 'V' : 'N';
  const indSide = v => v == null ? 'N' : v > 50 ? 'C' : v < 50 ? 'V' : 'N';
  const adxSide = adx ? (adx.plusDI > adx.minusDI ? 'C' : adx.minusDI > adx.plusDI ? 'V' : 'N') : 'N';
  const emaSide = priceNow != null && ema != null ? (priceNow > ema ? 'C' : priceNow < ema ? 'V' : 'N') : 'N';

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#030712" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.container}>

        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={[styles.headerDot, { backgroundColor: marketLive ? (isStandardFxWeekend(now) || spotFallbackLive && !officialFeedFresh ? '#f59e0b' : '#22c55e') : '#ef4444' }]} />
            <Text style={styles.title}>XAUUSD MONITOR</Text>
          </View>
          <Text style={styles.connection}>{marketFeedLabel} · WSS {status} · UTC {now.toISOString().slice(11,16)}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>HORÁRIOS DAS SESSÕES · {isStandardFxWeekend(now) ? 'OTC ATIVO' : 'MERCADO NORMAL'}</Text>
          <View style={styles.sessionGrid}>
            {SESSIONS.map(s => <SessionCard key={s.id} s={s} now={now} connectionStatus={officialFeedFresh ? 'ONLINE' : 'OFFLINE'} fallbackAvailable={spotFallbackLive} />)}
          </View>
        </View>

        <View style={styles.priceCard}>
          <Text style={styles.symbol}>{isStandardFxWeekend(now) ? 'XAUUSD OTC · TF 5M' : 'XAUUSD SPOT · TF 5M'}</Text>
          <Text style={styles.price}>{priceNow == null ? '----.--' : fmt(priceNow)}</Text>
          <Text style={[styles.live, { color: marketLive ? (isStandardFxWeekend(now) || (spotFallbackLive && !officialFeedFresh) ? '#f59e0b' : '#22c55e') : '#ef4444' }]}>
            {isStandardFxWeekend(now)
              ? (otcLive ? '● ONLINE · OTC' : '● OTC · SEM FEED')
              : officialFeedFresh ? '● LIVE · XAUUSD' : spotFallbackLive ? '● LIVE · XAUUSD · FALLBACK XAUS' : '● XAUUSD · SEM FEED'}
          </Text>
          <Text style={styles.muted}>Último dado: {tickTime || '--:--:--'}</Text>
          <Text style={styles.muted}>Bid: {bid == null ? '--' : fmt(bid)}   Ask: {ask == null ? '--' : fmt(ask)}</Text>
        </View>

        {isStandardFxWeekend(now) ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>XAUUSD OTC · ONLINE · ALIMENTA O MOTOR</Text>
            <Text style={styles.price}>{weekendOtc ? fmt(weekendOtc.value) : '----.--'}</Text>
            <Text style={styles.muted}>{weekendOtc ? `Fonte: ${weekendOtc.source} · idade ${Math.floor(weekendOtc.ageSec)}s${weekendOtc.stale ? ' · ATRASADO' : ''}` : 'Aguardando cotação OTC/indicativa'}</Text>
            <Text style={styles.historyText}>{closed.filter(c => c.marketSource === 'OTC').length} candles OTC fechados disponíveis · somente dados observados</Text>
            <Text style={styles.historyText}>OTC/indicativo de fim de semana. O preço e os candles são provenientes da série observada da XAUS; nenhum candle é interpolado. Alimenta o motor somente enquanto o mercado oficial estiver fechado; no retorno do feed oficial, os candles OTC são descartados automaticamente.</Text>
          </View>
        ) : null}

        {!isStandardFxWeekend(now) && !officialFeedFresh && spotFallbackLive ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>XAUUSD SPOT · FALLBACK GRATUITO ATIVO</Text>
            <Text style={styles.price}>{spotFallback ? fmt(spotFallback.value) : '----.--'}</Text>
            <Text style={styles.muted}>{spotFallback ? `Fonte: ${spotFallback.source} · idade ${Math.floor(spotFallback.ageSec)}s` : 'Aguardando fallback'}</Text>
            <Text style={styles.historyText}>O feed oficial WSS tem prioridade. XAUS assume somente enquanto não houver tick oficial recente e é retirado automaticamente quando o feed oficial retorna.</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>INDICADORES · TF 5M</Text>
          <IndicatorRow label="RSI (14)" value={rsi == null ? 'AGUARDANDO HISTÓRICO' : rsi.toFixed(2)} side={indSide(rsi)} />
          <IndicatorRow label="ADX (14)" value={adx == null ? 'AGUARDANDO HISTÓRICO' : adx.adx.toFixed(1)} side={adxSide} />
          <IndicatorRow label="EMA 20" value={ema == null ? 'AGUARDANDO HISTÓRICO' : fmt(ema)} side={emaSide} />
          <IndicatorRow label="DXY (Calculado)" value={dxyText} side={dxySide} sub={dxy ? `${dxyState} · ${Math.floor(dxyAge)}s · ${dxy.source || 'SEM FONTE'}` : 'SEM FEED'} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>MACRO · DADOS RECENTES</Text>
          <IndicatorRow label="DXY (Calculado)" value={dxyText} side={dxySide} />
          <IndicatorRow
            label="VWAP"
            value={vwap ? fmt(vwap.value) : 'AGUARDANDO HISTÓRICO'}
            side={vwap && priceNow != null ? (priceNow > vwap.value ? 'C' : priceNow < vwap.value ? 'V' : 'N') : 'N'}
            sub={vwap ? (vwap.source === 'VOLUME' ? 'VOLUME · LIVE' : 'TICK/EQUAL · ESTIMADA') : 'SEM DADOS'}
          />
          <IndicatorRow
            label="Delta / Pressure"
            value={pressure?.label || 'AGUARDANDO HISTÓRICO'}
            side={pressure?.side || 'N'}
            sub={pressure ? (pressure.source === 'TICKS' ? 'TICKS · LIVE' : 'CANDLES · ESTIMADA') : 'SEM DADOS'}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>ESTRUTURA · SMART MONEY</Text>
          <IndicatorRow label="FVG" value={fvg.length ? `${fvg.length} zona(s) · ${labelSide(fvgSide)}` : 'SEM DADOS'} side={fvgSide} />
          <IndicatorRow label="OB" value={structure.obs?.length ? `${structure.obs.length} zona(s) · ${labelSide(obSide)}` : 'SEM DADOS'} side={obSide} />
          <IndicatorRow label="BOS / CHoCH" value={structure.event ? `${structure.event.type} ${labelSide(bosSide)}` : 'SEM DADOS'} side={bosSide} />
        </View>

        <View style={styles.signalArea}>
          <View style={[styles.signalCard, { borderColor: colorFor(signal.side) }]}>
            <Text style={[styles.signalTitle, { color: colorFor(signal.side) }]}>MOTOR DE SINAIS</Text>
            <Text style={[styles.signalMain, { color: colorFor(signal.side) }]}>{signal.text === 'COMPRA' ? '⇈  COMPRA  ⇈' : signal.text === 'VENDA' ? '⇊  VENDA  ⇊' : signal.text}</Text>
            <Text style={styles.signalMeta}>CONFIRMAÇÕES: {signal.confirmations || 0}/9 · COMPRA {signal.buyConfirmations || 0} · VENDA {signal.sellConfirmations || 0}</Text>
            {signal.checks.map((x, i) => (
              <Text key={i} style={[styles.check, { color: colorFor(x.side) }]}>
                {x.side === 'C' ? '●' : x.side === 'V' ? '●' : '○'} {x.label}
              </Text>
            ))}
            {closed.length < 40 ? <Text style={styles.historyText}>{closed.length} candles fechados disponíveis. Histórico carregando ({closed.length}/40).</Text> : null}
          </View>

          <View style={styles.riskCard}>
            <Text style={styles.cardTitle}>RISCO · SESSÃO</Text>
            <IndicatorRow label="Risco" value={risk} side={riskSide} />
            <IndicatorRow label="Sessões online" value={isStandardFxWeekend(now) ? (otcLive ? 'OTC ONLINE · motor ativo' : 'OTC SEM FEED') : (sessions.length ? `${sessions.length} · ${sessions.join(' / ')}` : 'NENHUMA')} side="N" />
            <IndicatorRow label="Volatilidade" value={adx ? (adx.atr / Math.max(priceNow || 1, 1) < .003 ? 'NORMAL' : 'ALTA') : '--'} side="N" />
          </View>
        </View>

        <View style={styles.confCard}>
          <Text style={styles.confText}>CONFIANÇA: <Text style={{ color: colorFor(signal.side) }}>{signal.score >= 70 ? 'ALTA' : signal.score >= 50 ? 'MÉDIA' : 'BAIXA'}</Text></Text>
          <View style={styles.confTrack}><View style={[styles.confFill, { width: `${Math.max(2, Math.min(100, signal.score))}%`, backgroundColor: colorFor(signal.side) }]} /></View>
          <Text style={styles.confPct}>{signal.score}%</Text>
        </View>

        <Pressable style={styles.button} onPress={connect}>
          <Text style={styles.buttonText}>RECONECTAR</Text>
        </Pressable>
        <Text style={styles.footer}>Servidor: {HEALTH_URL}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#030712' },
  container: { padding: 10, paddingBottom: 32 },
  header: { alignItems: 'center', marginVertical: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  headerDot: { width: 11, height: 11, borderRadius: 6, marginRight: 7 },
  title: { color: '#fbbf24', fontSize: 20, fontWeight: '900' },
  connection: { color: '#64748b', fontSize: 11, marginTop: 6 },
  card: { backgroundColor: '#0f172a', borderRadius: 15, padding: 13, marginBottom: 10, borderWidth: 1, borderColor: '#1e293b' },
  cardTitle: { color: '#a8b3c7', fontSize: 14, fontWeight: '900', marginBottom: 9 },
  sessionGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  session: { width: '48%', backgroundColor: '#1e293b', borderRadius: 11, padding: 11, marginBottom: 9 },
  sessionOn: { borderLeftWidth: 3, borderLeftColor: '#3b82f6' },
  sessionDot: { width: 9, height: 9, borderRadius: 5, marginBottom: 8 },
  sessionName: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  sessionSub: { color: '#64748b', fontSize: 8, marginTop: 2 },
  sessionHours: { color: '#94a3b8', fontSize: 10, marginTop: 4 },
  sessionState: { fontSize: 10, fontWeight: '700', marginTop: 6 },
  priceCard: { backgroundColor: '#211b63', borderRadius: 18, padding: 20, marginBottom: 11, alignItems: 'center', borderWidth: 1, borderColor: '#4338a3' },
  symbol: { color: '#fbbf24', fontSize: 14, fontWeight: '900' },
  price: { color: '#ffffff', fontSize: 46, fontWeight: '900', marginVertical: 9, letterSpacing: 1 },
  live: { color: '#22c55e', fontSize: 14, fontWeight: '900' },
  muted: { color: '#7c8aa3', fontSize: 11, marginTop: 7 },
  irow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#1e293b' },
  ilabel: { color: '#d1d8e5', fontSize: 12, fontWeight: '800', flex: 1 },
  ivalWrap: { flex: 1.35, alignItems: 'flex-end' },
  ivalue: { fontSize: 12, fontWeight: '900', textAlign: 'right' },
  isub: { fontSize: 8, marginTop: 2, textAlign: 'right' },
  signalArea: { flexDirection: 'row', alignItems: 'stretch', marginBottom: 10 },
  signalCard: { flex: 1.1, backgroundColor: '#07131a', borderRadius: 14, padding: 12, borderWidth: 1.5, marginRight: 5 },
  riskCard: { flex: .9, backgroundColor: '#0f172a', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#1e293b', marginLeft: 5 },
  signalTitle: { fontSize: 13, fontWeight: '900' },
  signalMain: { fontSize: 25, fontWeight: '900', marginVertical: 8 },
  signalMeta: { color: '#cbd5e1', fontSize: 10, fontWeight: '800', marginBottom: 6 },
  check: { fontSize: 9, fontWeight: '700', marginVertical: 3, lineHeight: 12 },
  historyText: { color: '#94a3b8', fontSize: 9, marginTop: 8, lineHeight: 13 },
  confCard: { backgroundColor: '#0f172a', borderRadius: 13, padding: 11, marginBottom: 10, borderWidth: 1, borderColor: '#1e293b' },
  confText: { color: '#ffffff', fontSize: 10, fontWeight: '900' },
  confTrack: { height: 9, backgroundColor: '#1e293b', borderRadius: 5, overflow: 'hidden', marginTop: 7 },
  confFill: { height: '100%', borderRadius: 5 },
  confPct: { position: 'absolute', right: 10, bottom: 9, color: '#ffffff', fontSize: 10, fontWeight: '900' },
  button: { backgroundColor: '#1e365b', borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 2 },
  buttonText: { color: '#ffffff', fontSize: 14, fontWeight: '900' },
  footer: { color: '#475569', fontSize: 8, textAlign: 'center', marginTop: 11 }
});
