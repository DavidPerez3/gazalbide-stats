import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadHistoricalPlayerRows } from '../lib/historyRepository.js';
import { teamGames, teamSummary, comparePlayers } from '../lib/advancedStats.js';
import TrendChart from '../components/TrendChart.jsx';
import '../advanced-stats.css';
const METRICS=[['pts_avg','PTS'],['reb_avg','REB'],['ast_avg','AST'],['pir_avg','PIR'],['fg_pct','FG%'],['three_pct','3P%'],['ft_pct','TL%']];
export default function StatisticsPage() {
  const [rows,setRows]=useState([]), [loading,setLoading]=useState(true), [error,setError]=useState('');
  const [season,setSeason]=useState('all'),[opponent,setOpponent]=useState('all'),[tab,setTab]=useState('team'),[first,setFirst]=useState(''),[second,setSecond]=useState('');
  useEffect(()=>{let active=true; loadHistoricalPlayerRows().then((data)=>{if(active)setRows(data);}).catch(()=>{if(active)setError('No se pudo cargar el histórico oficial. Recarga para intentarlo de nuevo.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
  const seasons=[...new Set(rows.map((r)=>r.season))].filter(Boolean).sort();
  const opponents=[...new Set(rows.map((r)=>r.opponent))].sort();
  const filtered=useMemo(()=>rows.filter((r)=>(season==='all'||r.season===season)&&(opponent==='all'||r.opponent===opponent)),[rows,season,opponent]);
  const games=useMemo(()=>teamGames(filtered),[filtered]); const summary=teamSummary(games);
  const players=[...new Map(rows.map((r)=>[String(r.playerId),{id:String(r.playerId),name:r.playerName}])).values()].sort((a,b)=>a.name.localeCompare(b.name));
  const comparison=comparePlayers(filtered,first,second);
  if(loading)return <p role="status">Cargando estadísticas oficiales…</p>;
  return <section className="advanced-stats"><h1>Estadísticas de Gazalbide</h1><p>Solo partidos publicados. Los porcentajes se calculan con tiros totales; las comparaciones entre jugadores usan partidos compartidos.</p>{error&&<p role="alert">{error}</p>}
    <div className="stats-controls"><label>Temporada<select value={season} onChange={(e)=>setSeason(e.target.value)}><option value="all">Todas</option>{seasons.map((id)=><option key={id}>{id}</option>)}</select></label><label>Rival<select value={opponent} onChange={(e)=>setOpponent(e.target.value)}><option value="all">Todos</option>{opponents.map((name)=><option key={name}>{name}</option>)}</select></label></div>
    <nav className="stats-controls" aria-label="Análisis"><button aria-pressed={tab==='team'} onClick={()=>setTab('team')}>Equipo y evolución</button><button aria-pressed={tab==='players'} onClick={()=>setTab('players')}>Cara a cara</button></nav>
    {!error&&!games.length&&<p>No hay partidos publicados con estos filtros.</p>}
    {tab==='team'&&<><div className="stats-kpis">{[['Partidos',summary.games],['Victorias',summary.wins],['Derrotas',summary.losses],['Empates',summary.draws],['PTS a favor',summary.scored.toFixed(1)],['PTS en contra',summary.conceded.toFixed(1)],['REB / partido',summary.reb.toFixed(1)],['AST / partido',summary.ast.toFixed(1)],['FG%',summary.fg.toFixed(1)],['3P%',summary.three.toFixed(1)],['TL%',summary.ft.toFixed(1)]].map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <TrendChart title="Margen de Gazalbide por partido" points={games.map((g)=>({value:g.margin,label:`${g.date} · ${g.opponent}`}))}/>
    <h2>Comparación de temporadas</h2><div className="stats-table"><table><thead><tr><th>Temporada</th><th>PJ</th><th>Victorias</th><th>PTS favor</th><th>PTS contra</th><th>FG%</th></tr></thead><tbody>{seasons.filter((s)=>season==='all'||s===season).map((id)=>{const result=teamSummary(games.filter((g)=>g.season===id));return <tr key={id}><td>{id}</td><td>{result.games}</td><td>{result.wins}</td><td>{result.scored.toFixed(1)}</td><td>{result.conceded.toFixed(1)}</td><td>{result.fg.toFixed(1)}%</td></tr>;})}</tbody></table></div>
    <h2>Partido a partido</h2><div className="stats-table"><table><thead><tr><th>Fecha</th><th>Rival</th><th>Marcador</th><th>Margen</th><th>REB</th><th>AST</th></tr></thead><tbody>{games.map((g)=><tr key={g.id}><td><Link to={`/partido/${encodeURIComponent(g.id)}`}>{g.date}</Link></td><td>{g.opponent}</td><td>{g.gazal}–{g.rival}</td><td>{g.margin>0?'+':''}{g.margin}</td><td>{g.reb}</td><td>{g.ast}</td></tr>)}</tbody></table></div></>}
    {tab==='players'&&<><div className="stats-controls">{[[first,setFirst,'Jugador A'],[second,setSecond,'Jugador B']].map(([value,set,label])=><label key={label}>{label}<select value={value} onChange={(e)=>set(e.target.value)}><option value="">Selecciona jugador</option>{players.map((p)=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>)}</div>{first&&second&&first!==second?<><p>{comparison.games} partidos compartidos con estos filtros.</p>{comparison.games>0&&<div className="stats-table"><table><thead><tr><th>Promedio</th><th>{players.find((p)=>p.id===first)?.name}</th><th>{players.find((p)=>p.id===second)?.name}</th></tr></thead><tbody>{METRICS.map(([key,label])=><tr key={key}><td>{label}</td><td>{comparison.first[key].toFixed(1)}</td><td>{comparison.second[key].toFixed(1)}</td></tr>)}</tbody></table></div>}</>:<p>Elige dos jugadores distintos.</p>}<p>Los récords personales y la comparación individual de temporadas están en la <Link to="/jugadores">ficha de cada jugador</Link>.</p></>}
  </section>;
}
