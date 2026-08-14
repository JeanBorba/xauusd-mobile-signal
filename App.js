import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView, View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';

const WS_URL = 'wss://xauusd-mobile-signal.onrender.com/stream';
const HEALTH_URL = 'https://xauusd-mobile-signal.onrender.com/health';

export default function App() {
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);
  const pingRef = useRef(null);
  const pingSentRef = useRef(0);
  const [status, setStatus] = useState('connecting');
  const [price, setPrice] = useState(null);
  const [bid, setBid] = useState(null);
  const [ask, setAsk] = useState(null);
  const [tickTime, setTickTime] = useState(null);
  const [latency, setLatency] = useState(null);
  const [lastError, setLastError] = useState('');
  const [candles, setCandles] = useState([]);
  const [clock, setClock] = useState(new Date());
  const [market, setMarket] = useState({ RSI:null, ADX:null, EMA20:null, FVG:[], historyReady:false, historyRequired:40, historySource:null, historyState:'waiting', historyAsOf:null, dxy:null, upstream:'disconnected' });

  const connect = useCallback(() => {
    if (wsRef.current) { try { wsRef.current.close(); } catch (_) {} }
    setStatus('connecting'); setLastError('');
    const ws = new WebSocket(WS_URL); wsRef.current = ws;
    ws.onopen = () => {
      setStatus('connecting');
      ws.send(JSON.stringify({ type:'config', tf:'5m' }));
      ws.send(JSON.stringify({ type:'refresh_history' }));
      clearInterval(pingRef.current);
      pingRef.current = setInterval(() => {
        if (ws.readyState === 1) { pingSentRef.current = Date.now(); ws.send(JSON.stringify({ type:'ping' })); }
      }, 10000);
    };
    ws.onmessage = e => {
      try {
        const m = JSON.parse(e.data);
        if (m.type === 'server') {
          if (m.status === 'connected') setStatus('online');
        } else if (m.type === 'market_state') {
          const p=Number(m.price), b=Number(m.bid), a=Number(m.ask);
          if(Number.isFinite(p))setPrice(p); if(Number.isFinite(b))setBid(b); if(Number.isFinite(a))setAsk(a);
          if(m.ts)setTickTime(new Date(Number(m.ts)).toLocaleTimeString());
          setMarket({RSI:Number.isFinite(Number(m.RSI))?Number(m.RSI):null,ADX:Number.isFinite(Number(m.ADX))?Number(m.ADX):null,EMA20:Number.isFinite(Number(m.EMA20))?Number(m.EMA20):null,FVG:Array.isArray(m.FVG)?m.FVG:[],historyReady:!!m.historyReady,historyRequired:Number(m.historyRequired)||40,historySource:m.historySource||null,historyState:m.historyState||'waiting',historyAsOf:m.historyAsOf||null,dxy:m.dxy||null,upstream:m.upstream||'disconnected'});
          setStatus(m.upstream==='connected'?'online':'connecting');
        } else if (m.type === 'tick') {
          const p=Number(m.price),b=Number(m.source?.bid),a=Number(m.source?.ask);if(Number.isFinite(p))setPrice(p);if(Number.isFinite(b))setBid(b);if(Number.isFinite(a))setAsk(a);if(m.ts)setTickTime(new Date(Number(m.ts)).toLocaleTimeString());
        } else if (m.type === 'history') {
          setCandles(Array.isArray(m.candles)?m.candles:[]);
          setMarket(prev=>({...prev,historyReady:!!m.ready,historyRequired:Number(m.required)||prev.historyRequired,historySource:m.source||prev.historySource,historyState:m.state||prev.historyState,historyAsOf:m.asOf||prev.historyAsOf}));
        } else if (m.type === 'pong' && pingSentRef.current) setLatency(Math.max(0,Date.now()-pingSentRef.current));
        else if (m.type === 'error') setLastError(m.message||'Erro no feed.');
      } catch (_) {}
    };
    ws.onerror=()=>{setStatus('error');setLastError('Falha na conexão WSS.');};
    ws.onclose=()=>{clearInterval(pingRef.current);if(wsRef.current===ws)wsRef.current=null;setStatus('offline');clearTimeout(reconnectRef.current);reconnectRef.current=setTimeout(connect,3000);};
  },[]);

  useEffect(()=>{connect();const t=setInterval(()=>setClock(new Date()),1000);return()=>{clearTimeout(reconnectRef.current);clearInterval(pingRef.current);clearInterval(t);if(wsRef.current)try{wsRef.current.close();}catch(_){} };},[connect]);

  const ind=useMemo(()=>({candles:candles.filter(c=>c.closed!==false).length,rsi:market.RSI,adx:market.ADX,ema20:market.EMA20,fvg:market.FVG,ready:market.historyReady,required:market.historyRequired}),[candles,market]);
  const dxy=market.dxy;
  const dxyAge=dxy?.asOf?Math.max(0,(Date.now()-Number(dxy.asOf))/1000):Infinity;
  const dxyUnavailable=!dxy||dxy.value==null||dxyAge>600;
  const dxyStatus=dxyUnavailable?'SEM FEED':dxyAge>120?'DADO ATRASADO':'LIVE';
  const dxyText=dxyUnavailable?'--':`${Number(dxy.value).toFixed(2)} · ${Math.floor(dxyAge)}s`;
  const dxyColor=dxyUnavailable?'#ff5252':dxyAge>120?'#f0b429':'#21d39a';
  const statusLabel=status==='online'?'ONLINE':status==='connecting'?'CONECTANDO...':'OFFLINE';
  const statusColor=status==='online'?'#21d39a':status==='error'?'#ff5252':'#f0b429';
  const utc=clock.toISOString().slice(11,16);

  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.container}>
    <View style={styles.header}><View style={[styles.dot,{backgroundColor:statusColor}]}/><Text style={styles.title}>XAUUSD MONITOR</Text></View>
    <Text style={styles.connection}>{statusLabel} · WSS · UTC {utc}{latency!=null?` · ${latency} ms`:''}</Text>

    <View style={styles.card}><Text style={styles.cardTitle}>HORÁRIOS (UTC)</Text><View style={styles.sessionGrid}>
      <Session name="Sydney" open="21:00" close="07:00" now={clock}/><Session name="Tokyo" open="00:00" close="09:00" now={clock}/><Session name="Londres" open="07:00" close="17:00" now={clock}/><Session name="N. York" open="13:00" close="22:00" now={clock}/>
    </View></View>

    <View style={styles.signalCard}><Text style={styles.symbol}>XAUUSD SPOT · TF 5M</Text><Text style={styles.price}>{price==null?'----.--':price.toFixed(2)}</Text><Text style={styles.live}>● LIVE</Text><Text style={styles.sub}>Último tick: {tickTime||'--:--:--'}</Text><Text style={styles.sub}>Bid: {bid==null?'--':bid.toFixed(2)}   Ask: {ask==null?'--':ask.toFixed(2)}</Text></View>

    <View style={styles.card}><Text style={styles.cardTitle}>INDICADORES · TF 5M</Text><Indicator name="RSI (14)" value={ind.rsi==null?'AGUARDANDO HISTÓRICO':ind.rsi.toFixed(2)}/><Indicator name="ADX (14)" value={ind.adx==null?'AGUARDANDO HISTÓRICO':ind.adx.toFixed(1)}/><Indicator name="EMA 20" value={ind.ema20==null?'AGUARDANDO HISTÓRICO':ind.ema20.toFixed(2)}/></View>

    <View style={styles.card}><Text style={styles.cardTitle}>MACRO · DADOS RECENTES</Text><Indicator name="DXY" value={`${dxyStatus} · ${dxyText}`} valueColor={dxyColor}/><Indicator name="VWAP" value="N/D · SEM VOLUME"/><Indicator name="Delta / Pressure" value="N/D · SEM VOLUME"/></View>

    <View style={styles.card}><Text style={styles.cardTitle}>ESTRUTURA · SMART MONEY</Text><Indicator name="FVG" value={ind.fvg.length?`${ind.fvg.length} ZONA(S) VÁLIDA(S)`:(ind.ready?'SEM ZONAS VÁLIDAS':'AGUARDANDO HISTÓRICO')}/><Indicator name="OB" value="SEM DADOS"/><Indicator name="BOS / CHoCH" value="SEM DADOS"/></View>

    <View style={styles.card}><Text style={styles.cardTitle}>MOTOR DE SINAIS</Text><Text style={styles.wait}>{ind.ready?'AGUARDANDO CONFIRMAÇÃO':'AGUARDANDO HISTÓRICO'}</Text><Text style={styles.sub}>{ind.candles} candles fechados disponíveis. {ind.ready?'Histórico suficiente; aguardando confirmação causal.':`Carregando histórico (${ind.candles}/${ind.required}).`}</Text></View>

    <View style={styles.card}><Text style={styles.cardTitle}>RISCO · SESSÃO</Text><Indicator name="Risco" value="AGUARDANDO CONFIGURAÇÃO"/><Indicator name="Sessão" value="XAUUSD · 5M"/></View>
    {!!lastError&&<Text style={styles.error}>{lastError}</Text>}
    <Pressable style={styles.button} onPress={connect}><Text style={styles.buttonText}>RECONECTAR</Text></Pressable>
    <Text style={styles.footer}>Servidor: {HEALTH_URL}</Text>
  </ScrollView></SafeAreaView>;
}

function utcMinutes(date){return date.getUTCHours()*60+date.getUTCMinutes();}
function parseHHMM(v){const [h,m]=String(v).split(':').map(Number);return h*60+m;}
function isSessionActive(date,open,close){const x=utcMinutes(date),a=parseHHMM(open),b=parseHHMM(close);return a>b?x>=a||x<b:x>=a&&x<b;}
function Session({name,open,close,now}){const active=isSessionActive(now,open,close);return <View style={[styles.session,active&&styles.sessionActive]}><View style={[styles.sessionDot,active&&styles.sessionDotActive]}/><Text style={styles.sessionName}>{name}</Text><Text style={styles.sessionHours}>{open} – {close} UTC</Text><Text style={styles.sessionText}>{active?'ATIVA':'AGUARDA'}</Text></View>;}
function Indicator({name,value,valueColor}){return <View style={styles.indicator}><Text style={styles.indicatorName}>{name}</Text><Text style={[styles.indicatorValue,valueColor?{color:valueColor}:null]}>{value}</Text></View>;}

const styles=StyleSheet.create({safe:{flex:1,backgroundColor:'#07101f'},container:{padding:18,paddingBottom:40},header:{flexDirection:'row',alignItems:'center',justifyContent:'center',marginTop:8},dot:{width:12,height:12,borderRadius:6,marginRight:8},title:{color:'#f4b72a',fontSize:22,fontWeight:'800'},connection:{color:'#8793aa',textAlign:'center',marginTop:8,marginBottom:22},card:{backgroundColor:'#101b2e',borderRadius:18,padding:18,marginBottom:16,borderWidth:1,borderColor:'#20304b'},cardTitle:{color:'#aab6ca',fontSize:15,fontWeight:'800',marginBottom:14},sessionGrid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between'},session:{width:'48%',backgroundColor:'#1c2940',borderRadius:11,padding:13,marginBottom:12},sessionActive:{borderLeftWidth:4,borderLeftColor:'#3d87ff'},sessionDot:{width:9,height:9,borderRadius:5,backgroundColor:'#536176',marginBottom:8},sessionDotActive:{backgroundColor:'#3d87ff'},sessionName:{color:'#cbd4e2',fontWeight:'800'},sessionHours:{color:'#8793aa',fontSize:10,marginTop:4},sessionText:{color:'#8995a9',fontSize:11,marginTop:5},signalCard:{backgroundColor:'#211c59',borderRadius:20,padding:24,marginBottom:16,borderWidth:1,borderColor:'#3d3187',alignItems:'center'},symbol:{color:'#f1c33b',fontSize:15,fontWeight:'800'},price:{color:'#fff',fontSize:48,fontWeight:'900',marginTop:20},live:{color:'#21d39a',fontSize:14,fontWeight:'800',marginTop:4},sub:{color:'#6f7d96',fontSize:12,marginTop:8},indicator:{flexDirection:'row',justifyContent:'space-between',borderTopWidth:1,borderTopColor:'#20304b',paddingVertical:15},indicatorName:{color:'#b7c1d1',fontSize:14,fontWeight:'700'},indicatorValue:{color:'#8793aa',fontSize:11,maxWidth:'58%',textAlign:'right'},wait:{color:'#f0b429',fontWeight:'800',fontSize:17},error:{color:'#ff7373',textAlign:'center',marginBottom:12},button:{backgroundColor:'#1c2b45',borderRadius:12,padding:15,alignItems:'center',marginBottom:14},buttonText:{color:'#dce5f4',fontWeight:'800'},footer:{color:'#4f5d73',fontSize:9,textAlign:'center'}});
