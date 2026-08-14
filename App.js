import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView, View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';

const WS_URL = 'wss://xauusd-mobile-signal.onrender.com/stream';
const HEALTH_URL = 'https://xauusd-mobile-signal.onrender.com/health';
const TF = '5M';

function sma(values, n) {
  if (values.length < n) return null;
  let s = 0;
  for (let i = values.length - n; i < values.length; i++) s += values[i];
  return s / n;
}
function ema(values, n) {
  if (values.length < n) return null;
  let e = sma(values.slice(0, n), n);
  const k = 2 / (n + 1);
  for (let i = n; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}
function rsi(closes, n = 14) {
  if (closes.length < n + 1) return null;
  let gain = 0, loss = 0;
  for (let i = closes.length - n; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  if (loss === 0) return 100;
  return 100 - 100 / (1 + (gain / n) / (loss / n));
}
function adx(candles, n = 14) {
  if (candles.length < n + 1) return null;
  const start = candles.length - n;
  let tr = 0, plus = 0, minus = 0;
  for (let i = start; i < candles.length; i++) {
    const c = candles[i], p = candles[i - 1];
    const trueRange = Math.max(c.h - c.l, Math.abs(c.h - p.c), Math.abs(c.l - p.c));
    tr += trueRange;
    plus += c.h > p.h && c.h - p.h > p.l - c.l ? c.h - p.h : 0;
    minus += p.l > c.l && p.l - c.l > c.h - p.h ? p.l - c.l : 0;
  }
  if (tr <= 0) return 0;
  const pdi = 100 * plus / tr;
  const mdi = 100 * minus / tr;
  if (pdi + mdi === 0) return 0;
  return 100 * Math.abs(pdi - mdi) / (pdi + mdi);
}
function macd(closes) {
  if (closes.length < 26) return null;
  const fast = ema(closes, 12), slow = ema(closes, 26);
  return fast == null || slow == null ? null : fast - slow;
}
function structure(c) {
  if (c.length < 4) return 'SEM DADOS';
  const a = c[c.length - 4], b = c[c.length - 3], d = c[c.length - 2], x = c[c.length - 1];
  if (x.h > d.h && d.h > b.h && x.l > d.l) return 'BOS ALTA';
  if (x.l < d.l && d.l < b.l && x.h < d.h) return 'BOS BAIXA';
  if (x.h > d.h && x.l < d.l) return 'CHoCH';
  return 'NEUTRO';
}
function fvg(c) {
  if (c.length < 3) return 'SEM DADOS';
  const a = c[c.length - 3], x = c[c.length - 1];
  if (x.l > a.h) return 'ALTA';
  if (x.h < a.l) return 'BAIXA';
  return 'NENHUMA';
}
function orderBlock(c) {
  if (c.length < 3) return 'SEM DADOS';
  const p = c[c.length - 2], x = c[c.length - 1];
  if (x.c > x.o && p.c < p.o && x.c > p.h) return 'OB COMPRA';
  if (x.c < x.o && p.c > p.o && x.c < p.l) return 'OB VENDA';
  return 'NENHUM';
}
function signal(ind) {
  if (ind.rsi == null || ind.adx == null || ind.ema == null || ind.price == null || ind.candles < 27) return 'AGUARDANDO CONFIRMAÇÃO';
  const buy = ind.price > ind.ema && ind.rsi >= 52 && ind.adx >= 20 && (ind.structure === 'BOS ALTA' || ind.fvg === 'ALTA' || ind.ob === 'OB COMPRA');
  const sell = ind.price < ind.ema && ind.rsi <= 48 && ind.adx >= 20 && (ind.structure === 'BOS BAIXA' || ind.fvg === 'BAIXA' || ind.ob === 'OB VENDA');
  if (buy) return 'BUY';
  if (sell) return 'SELL';
  return 'AGUARDANDO CONFIRMAÇÃO';
}

export default function App() {
  const wsRef = useRef(null), reconnectRef = useRef(null), pingRef = useRef(null), pingSentRef = useRef(0);
  const [status, setStatus] = useState('connecting');
  const [price, setPrice] = useState(null), [bid, setBid] = useState(null), [ask, setAsk] = useState(null);
  const [tickTime, setTickTime] = useState(null), [latency, setLatency] = useState(null), [lastError, setLastError] = useState('');
  const [candles, setCandles] = useState([]), [clock, setClock] = useState(new Date());

  const connect = useCallback(() => {
    if (wsRef.current) { try { wsRef.current.close(); } catch (_) {} }
    setStatus('connecting'); setLastError('');
    const ws = new WebSocket(WS_URL); wsRef.current = ws;
    ws.onopen = () => {
      setStatus('online');
      ws.send(JSON.stringify({ type: 'config', tf: '5m' }));
      clearInterval(pingRef.current);
      pingRef.current = setInterval(() => {
        if (ws.readyState === 1) { pingSentRef.current = Date.now(); ws.send(JSON.stringify({ type: 'ping' })); }
      }, 10000);
    };
    ws.onmessage = e => {
      try {
        const m = JSON.parse(e.data);
        if (m.type === 'tick') {
          const p = Number(m.price), b = Number(m.source?.bid), a = Number(m.source?.ask);
          if (Number.isFinite(p)) setPrice(p);
          if (Number.isFinite(b)) setBid(b);
          if (Number.isFinite(a)) setAsk(a);
          if (m.ts) setTickTime(new Date(Number(m.ts)).toLocaleTimeString());
        } else if (m.type === 'history') {
          setCandles(Array.isArray(m.candles) ? m.candles : []);
        } else if (m.type === 'pong') {
          if (pingSentRef.current) setLatency(Math.max(0, Date.now() - pingSentRef.current));
        } else if (m.type === 'error') setLastError(m.message || 'Erro no feed.');
      } catch (_) {}
    };
    ws.onerror = () => { setStatus('error'); setLastError('Falha na conexão WSS.'); };
    ws.onclose = () => {
      clearInterval(pingRef.current); if (wsRef.current === ws) wsRef.current = null;
      setStatus('offline'); clearTimeout(reconnectRef.current); reconnectRef.current = setTimeout(connect, 3000);
    };
  }, []);
  useEffect(() => { connect(); const t = setInterval(() => setClock(new Date()), 1000); return () => { clearInterval(t); clearTimeout(reconnectRef.current); clearInterval(pingRef.current); if (wsRef.current) try { wsRef.current.close(); } catch (_) {} }; }, [connect]);

  const ind = useMemo(() => {
    const closed = candles.filter(c => c.closed !== false);
    const closes = closed.map(c => Number(c.c));
    const r = rsi(closes), e = ema(closes, 20), a = adx(closed), m = macd(closes);
    const s = structure(closed), g = fvg(closed), o = orderBlock(closed);
    return { candles: closed.length, rsi: r, ema: e, adx: a, macd: m, structure: s, fvg: g, ob: o, price, signal: signal({ candles: closed.length, rsi: r, ema: e, adx: a, price, structure: s, fvg: g, ob: o }) };
  }, [candles, price]);

  const statusLabel = status === 'online' ? 'ONLINE' : status === 'connecting' ? 'CONECTANDO...' : 'OFFLINE';
  const statusColor = status === 'online' ? '#21d39a' : status === 'error' ? '#ff5252' : '#f0b429';
  const utc = clock.toISOString().slice(11, 16);
  const fmt = v => v == null ? '--' : Number(v).toFixed(2);

  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.container}>
    <View style={styles.header}><View style={[styles.dot, { backgroundColor: statusColor }]} /><Text style={styles.title}>XAUUSD MONITOR</Text></View>
    <Text style={styles.connection}>{statusLabel} · WSS · UTC {utc}</Text>

    <View style={styles.card}><Text style={styles.cardTitle}>HORÁRIOS (UTC)</Text><View style={styles.sessionGrid}>
      <Session name="Sydney" active={true} /><Session name="Tokyo" /><Session name="Londres" /><Session name="N. York" />
    </View></View>

    <View style={styles.signalCard}><Text style={styles.symbol}>XAUUSD SPOT · TF 5M</Text><Text style={styles.price}>{price == null ? '----.--' : price.toFixed(2)}</Text><Text style={styles.live}>● LIVE</Text><Text style={styles.sub}>Último tick: {tickTime || '--:--:--'}</Text><Text style={styles.sub}>Bid: {fmt(bid)}   Ask: {fmt(ask)}</Text></View>

    <View style={styles.card}><Text style={styles.cardTitle}>INDICADORES · TF 5M</Text>
      <Indicator name="RSI (14)" value={ind.rsi == null ? 'AGUARDANDO HISTÓRICO' : fmt(ind.rsi)} />
      <Indicator name="ADX (14)" value={ind.adx == null ? 'AGUARDANDO HISTÓRICO' : fmt(ind.adx)} />
      <Indicator name="EMA 20" value={ind.ema == null ? 'AGUARDANDO HISTÓRICO' : fmt(ind.ema)} />
    </View>

    <View style={styles.card}><Text style={styles.cardTitle}>MACRO · DADOS RECENTES</Text><Indicator name="DXY" value="AGUARDANDO FEED" /><Indicator name="VWAP" value="N/D · SEM VOLUME" /><Indicator name="Delta / Pressure" value="N/D · SEM VOLUME" /></View>

    <View style={styles.card}><Text style={styles.cardTitle}>ESTRUTURA · SMART MONEY</Text><Indicator name="FVG" value={ind.fvg} /><Indicator name="OB" value={ind.ob} /><Indicator name="BOS / CHoCH" value={ind.structure} /></View>

    <View style={styles.card}><Text style={styles.cardTitle}>MOTOR DE SINAIS</Text><Text style={[styles.wait, ind.signal === 'BUY' ? styles.buy : ind.signal === 'SELL' ? styles.sell : null]}>{ind.signal}</Text><Text style={styles.sub}>{ind.candles} candles fechados disponíveis. Sem sinal sem dados suficientes e sem confirmação causal.</Text></View>

    <View style={styles.card}><Text style={styles.cardTitle}>RISCO · SESSÃO</Text><Indicator name="Risco" value="AGUARDANDO CONFIGURAÇÃO" /><Indicator name="Sessão" value="XAUUSD · 5M" /></View>

    {!!lastError && <Text style={styles.error}>{lastError}</Text>}
    <Pressable style={styles.button} onPress={connect}><Text style={styles.buttonText}>RECONECTAR</Text></Pressable>
    <Text style={styles.footer}>Servidor: {HEALTH_URL}</Text>
  </ScrollView></SafeAreaView>;
}

function Session({ name, active }) { return <View style={[styles.session, active && styles.sessionActive]}><View style={[styles.sessionDot, active && styles.sessionDotActive]} /><Text style={styles.sessionName}>{name}</Text><Text style={styles.sessionText}>{active ? 'ATIVA' : 'AGUARDA'}</Text></View>; }
function Indicator({ name, value }) { return <View style={styles.indicator}><Text style={styles.indicatorName}>{name}</Text><Text style={styles.indicatorValue}>{value}</Text></View>; }

const styles = StyleSheet.create({
  safe:{flex:1,backgroundColor:'#07101f'},container:{padding:18,paddingBottom:40},header:{flexDirection:'row',alignItems:'center',justifyContent:'center',marginTop:8},dot:{width:12,height:12,borderRadius:6,marginRight:8},title:{color:'#f4b72a',fontSize:22,fontWeight:'800'},connection:{color:'#8793aa',textAlign:'center',marginTop:8,marginBottom:22},
  card:{backgroundColor:'#101b2e',borderRadius:18,padding:18,marginBottom:16,borderWidth:1,borderColor:'#20304b'},cardTitle:{color:'#aab6ca',fontSize:15,fontWeight:'800',marginBottom:14},row:{flexDirection:'row',justifyContent:'space-between'},
  sessionGrid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between'},session:{width:'48%',backgroundColor:'#1c2940',borderRadius:11,padding:13,marginBottom:12},sessionActive:{borderLeftWidth:4,borderLeftColor:'#3d87ff'},sessionDot:{width:9,height:9,borderRadius:5,backgroundColor:'#536176',marginBottom:8},sessionDotActive:{backgroundColor:'#3d87ff'},sessionName:{color:'#cbd4e2',fontWeight:'800'},sessionText:{color:'#8995a9',fontSize:11,marginTop:5},
  signalCard:{backgroundColor:'#211c59',borderRadius:20,padding:24,marginBottom:16,borderWidth:1,borderColor:'#3d3187',alignItems:'center'},symbol:{color:'#f1c33b',fontSize:15,fontWeight:'800'},price:{color:'#fff',fontSize:48,fontWeight:'900',marginTop:20},live:{color:'#21d39a',fontSize:14,fontWeight:'800',marginTop:4},sub:{color:'#6f7d96',fontSize:12,marginTop:8},
  indicator:{flexDirection:'row',justifyContent:'space-between',borderTopWidth:1,borderTopColor:'#20304b',paddingVertical:15},indicatorName:{color:'#b7c1d1',fontSize:14,fontWeight:'700'},indicatorValue:{color:'#8793aa',fontSize:11,maxWidth:'58%',textAlign:'right'},wait:{color:'#f0b429',fontWeight:'800',fontSize:17},buy:{color:'#21d39a'},sell:{color:'#ff5d6c'},error:{color:'#ff7373',textAlign:'center',marginBottom:12},button:{backgroundColor:'#1c2b45',borderRadius:12,padding:15,alignItems:'center',marginBottom:14},buttonText:{color:'#dce5f4',fontWeight:'800'},footer:{color:'#4f5d73',fontSize:9,textAlign:'center'}
});
