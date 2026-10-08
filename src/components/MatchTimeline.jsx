import { useMemo, useState } from 'react';
import { describeLiveCenterEvent } from '../lib/liveCenter.js';
import { leadHistory, matchesTimelineFilter } from '../lib/advancedStats.js';
import TrendChart from './TrendChart.jsx';
import '../advanced-stats.css';
export default function MatchTimeline({ snapshot }) {
  const [period,setPeriod]=useState('all'),[kind,setKind]=useState('all');
  const events=snapshot.events || [];
  const points=useMemo(()=>leadHistory(events),[events]);
  const roster=new Map((snapshot.roster || []).map((p)=>[String(p.id),p]));
  const periods=[...new Set(events.map((e)=>Number(e.period)).filter(Boolean))].sort((a,b)=>a-b);
  const actions=[...events].filter((e)=>matchesTimelineFilter(e,period,kind)).sort((a,b)=>(b.server_sequence||b.client_sequence||0)-(a.server_sequence||a.client_sequence||0));
  return <section className="card card--p advanced-stats"><h2>Ventaja y cronología</h2><p>Ventaja positiva: Gazalbide. La curva usa las acciones registradas; las acciones anuladas no cuentan.</p>{points.length>1?<TrendChart title="Ventaja durante el partido" points={points}/>:<p>No hay acciones de anotación registradas.</p>}
    <div className="stats-controls"><label>Periodo<select value={period} onChange={(e)=>setPeriod(e.target.value)}><option value="all">Todos</option>{periods.map((p)=><option key={p} value={p}>{p<=4?`Q${p}`:`OT${p-4}`}</option>)}</select></label><label>Acciones<select value={kind} onChange={(e)=>setKind(e.target.value)}><option value="all">Todas</option><option value="score">Anotación</option><option value="foul">Faltas</option><option value="sub">Cambios</option></select></label></div>
    <details><summary>Ver acciones ({actions.length})</summary><ol className="stats-timeline">{actions.map((e,i)=>{const seconds=Math.max(0,Math.ceil(Number(e.clock_ms||0)/1000));return <li key={e.id||i}><span>Q{e.period} · {Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</span><strong>{describeLiveCenterEvent(e,roster)}</strong></li>;})}</ol>{!actions.length&&<p>No hay acciones con estos filtros.</p>}</details>
  </section>;
}
