import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SafeAreaView, View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';

const WS_URL = 'wss://xauusd-mobile-signal.onrender.com/stream';
const HEALTH_URL = 'https://xauusd-mobile-signal.onrender.com/health';
const TF = '5M';

export default function App() {
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);
  const pingRef = useRef(null);
  const [status, setStatus] = useState('connecting');
  const [price, setPrice] = useState(null);
  const [bid, setBid] = useState(null);
  const [ask, setAsk] = useState(null);
  const [tickTime, setTickTime] = useState(null);
  const [latency, setLatency] = useState(null);
  const [lastError, setLastError] = useState('');

  const connect = useCallback(() => {
    if (wsRef.current) {
      try { wsRef.current.close(); } catch (_) {}
      wsRef.current = null;
    }

    setStatus('connecting');
    setLastError('');
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('online');
      ws.send(JSON.stringify({ type: 'config', tf: '5m' }));
      clearInterval(pingRef.current);
      pingRef.current = setInterval(() => {
        if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'ping' }));
      }, 10000);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'tick') {
          const p = Number(msg.price);
          if (Number.isFinite(p)) setPrice(p);
          const b = Number(msg.source?.bid);
          const a = Number(msg.source?.ask);
          if (Number.isFinite(b)) setBid(b);
          if (Number.isFinite(a)) setAsk(a);
          if (msg.ts) setTickTime(new Date(Number(msg.ts)).toLocaleTimeString());
          if (msg.serverTs) setLatency(Math.max(0, Date.now() - Number(msg.serverTs)));
        }
        if (msg.type === 'server' && msg.status === 'upstream_disconnected') {
          setLastError('Feed XAUUSD desconectado; servidor tentando reconectar.');
        }
        if (msg.type === 'error') setLastError(msg.message || 'Erro no feed.');
        if (msg.type === 'pong' && msg.ts) setLatency(Math.max(0, Date.now() - Number(msg.ts)));
      } catch (_) {}
    };

    ws.onerror = () => {
      setStatus('error');
      setLastError('Falha na conexão WSS.');
    };

    ws.onclose = () => {
      clearInterval(pingRef.current);
      if (wsRef.current === ws) wsRef.current = null;
      setStatus('offline');
      clearTimeout(reconnectRef.current);
      reconnectRef.current = setTimeout(connect, 3000);
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectRef.current);
      clearInterval(pingRef.current);
      if (wsRef.current) {
        try { wsRef.current.close(); } catch (_) {}
      }
    };
  }, [connect]);

  const statusLabel = status === 'online' ? 'ONLINE' : status === 'connecting' ? 'CONECTANDO...' : 'OFFLINE';
  const statusColor = status === 'online' ? '#21d39a' : status === 'error' ? '#ff5252' : '#f0b429';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View style={[styles.dot, { backgroundColor: statusColor }]} />
          <Text style={styles.title}>XAUUSD MONITOR</Text>
        </View>
        <Text style={styles.connection}>{statusLabel} · WSS</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>CONEXÃO EM TEMPO REAL</Text>
          <Text style={styles.url}>{WS_URL}</Text>
          <View style={styles.row}>
            <Text style={styles.metric}>FEED{`\n`}BROKERET DEMO</Text>
            <Text style={styles.metric}>TF{`\n`}{TF}</Text>
            <Text style={styles.metric}>LATÊNCIA{`\n`}{latency == null ? '--' : `${latency} ms`}</Text>
          </View>
        </View>

        <View style={styles.signalCard}>
          <Text style={styles.symbol}>XAUUSD SPOT · TF {TF}</Text>
          <Text style={styles.price}>{price == null ? '----.--' : price.toFixed(2)}</Text>
          <Text style={styles.live}>● LIVE</Text>
          <Text style={styles.sub}>Último tick: {tickTime || '--:--:--'}</Text>
          <Text style={styles.sub}>Bid: {bid == null ? '--' : bid.toFixed(2)}   Ask: {ask == null ? '--' : ask.toFixed(2)}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>INDICADORES · TF {TF}</Text>
          <Indicator name="RSI (14)" value="AGUARDANDO HISTÓRICO" />
          <Indicator name="ADX (14)" value="AGUARDANDO HISTÓRICO" />
          <Indicator name="EMA 20" value="AGUARDANDO HISTÓRICO" />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>MOTOR DE SINAIS</Text>
          <Text style={styles.wait}>AGUARDANDO CONFIRMAÇÃO</Text>
          <Text style={styles.sub}>Nenhum sinal é gerado sem histórico de candles e validação causal.</Text>
        </View>

        {!!lastError && <Text style={styles.error}>{lastError}</Text>}

        <Pressable style={styles.button} onPress={connect}>
          <Text style={styles.buttonText}>RECONECTAR</Text>
        </Pressable>

        <Text style={styles.footer}>Servidor: {HEALTH_URL}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Indicator({ name, value }) {
  return (
    <View style={styles.indicator}>
      <Text style={styles.indicatorName}>{name}</Text>
      <Text style={styles.indicatorValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#07101f' },
  container: { padding: 18, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  dot: { width: 12, height: 12, borderRadius: 6, marginRight: 8 },
  title: { color: '#f4b72a', fontSize: 22, fontWeight: '800' },
  connection: { color: '#8793aa', textAlign: 'center', marginTop: 8, marginBottom: 22 },
  card: { backgroundColor: '#101b2e', borderRadius: 18, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: '#20304b' },
  cardTitle: { color: '#aab6ca', fontSize: 15, fontWeight: '800', marginBottom: 14 },
  url: { color: '#66758e', fontSize: 10, marginBottom: 14 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  metric: { color: '#c8d1df', fontSize: 12, lineHeight: 20 },
  signalCard: { backgroundColor: '#211c59', borderRadius: 20, padding: 24, marginBottom: 16, borderWidth: 1, borderColor: '#3d3187', alignItems: 'center' },
  symbol: { color: '#f1c33b', fontSize: 15, fontWeight: '800' },
  price: { color: '#fff', fontSize: 48, fontWeight: '900', marginTop: 20 },
  live: { color: '#21d39a', fontSize: 14, fontWeight: '800', marginTop: 4 },
  sub: { color: '#6f7d96', fontSize: 12, marginTop: 8 },
  indicator: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#20304b', paddingVertical: 15 },
  indicatorName: { color: '#b7c1d1', fontSize: 14, fontWeight: '700' },
  indicatorValue: { color: '#6f7d96', fontSize: 11 },
  wait: { color: '#f0b429', fontWeight: '800', fontSize: 17 },
  error: { color: '#ff7373', textAlign: 'center', marginBottom: 12 },
  button: { backgroundColor: '#1c2b45', borderRadius: 12, padding: 15, alignItems: 'center', marginBottom: 14 },
  buttonText: { color: '#dce5f4', fontWeight: '800' },
  footer: { color: '#4f5d73', fontSize: 9, textAlign: 'center' },
});
