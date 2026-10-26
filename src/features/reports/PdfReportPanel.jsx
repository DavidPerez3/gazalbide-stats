import { useEffect, useId, useState } from 'react';
import { getMatches, getMatchStats } from '../../lib/data.js';
import { useSeason } from '../../context/SeasonContext.jsx';
import { SEASONS } from '../../lib/seasons.js';
import { loadHistoricalPlayerRows, loadLineupHistory } from '../../lib/historyRepository.js';
import { buildReportHTML, buildReportModel, openReportWindow, showReport } from './pdfReport.js';
import './pdfReports.css';

const OPTIONS = [['results','Resultados y parciales'],['basic','Puntos, rebotes y asistencias'],['shooting','Tiros metidos / intentados'],['defense','Defensa, pérdidas y faltas'],['charts','Gráficos de puntos'],['lineups','Quintetos y +/−']];
async function loadRows(matches) {
  const rows=[];
  // Bound concurrent requests for season / full-history reports.
  for(let i=0;i<matches.length;i+=5){
    const batch=await Promise.all(matches.slice(i,i+5).map(async match=>(await getMatchStats(match.id)).map(row=>({...row,matchId:match.id}))));
    rows.push(...batch.flat());
  }
  return rows;
}
export default function PdfReportPanel({matchId=null, playerName='', initialScope=null}) {
  const {activeSeasonId}=useSeason();
  const panelId=useId();
  const [open,setOpen]=useState(false),[scope,setScope]=useState(initialScope||activeSeasonId),[competition,setCompetition]=useState('league');
  const [matches,setMatches]=useState([]),[chosen,setChosen]=useState([]),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [sections,setSections]=useState({results:true,basic:true,shooting:true,defense:true,charts:true,lineups:false});
  useEffect(()=>{
    if(initialScope)setScope(initialScope);
  },[initialScope]);
  useEffect(()=>{
    if(!open)return;
    let cancelled=false;setLoading(true);setError('');setMatches([]);setChosen([]);
    getMatches(matchId?'all':scope,{matchType:matchId?'all':competition}).then(data=>{
      if(cancelled)return;
      const next=(matchId?data.filter(m=>String(m.id)===String(matchId)):data).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
      setMatches(next);setChosen(next.map(m=>m.id));
    }).catch(()=>{if(!cancelled)setError('No se pudieron cargar los partidos. Cierra y abre el panel para reintentar.');}).finally(()=>{if(!cancelled)setLoading(false);});
    return()=>{cancelled=true;};
  },[open,scope,competition,matchId]);
  async function generate(){
    let tab;
    try{
      setError('');tab=openReportWindow();setBusy(true);
      const selected=matches.filter(m=>chosen.includes(m.id));
      const rows=await loadRows(selected);
      let lineups=[];
      if(sections.lineups){
        const opts={seasonId:matchId?null:scope,matchType:matchId?'all':competition};
        const [history,combos]=await Promise.all([loadHistoricalPlayerRows(opts),loadLineupHistory(opts)]);
        const names=new Map(history.map(r=>[String(r.playerId),r.playerName]));
        const ids=new Set(history.filter(r=>r.playerName===playerName).map(r=>String(r.playerId)));
        lineups=combos.filter(l=>!playerName||l.player_ids.some(id=>ids.has(String(id)))).map(l=>({...l,player_names:l.player_ids.map(id=>names.get(String(id))||`Jugador ${id}`)}));
      }
      const model=buildReportModel({matches:selected,rows,playerName,lineups});
      if(!model.rows.length)throw Error('No hay estadísticas publicadas para esta selección.');
      showReport(tab,buildReportHTML({model,playerName,sections,title:playerName?'Informe de jugador':matchId?'Informe de partido':'Informe de temporada',subtitle:matchId?`${selected[0]?.date} · Gazalbide vs ${selected[0]?.opponent}`:`${scope==='all'?'Histórico completo':scope} · ${competition==='league'?'Liga':competition==='friendly'?'Amistosos':'Liga y amistosos'}`}));
    }catch(err){if(tab&&!tab.closed)tab.close();setError(err.message||'No se pudo preparar el informe.');}finally{setBusy(false);}
  }
  return <section className="pdf-report card card--p">
    <button type="button" className="pdf-report__toggle" aria-expanded={open} aria-controls={panelId} onClick={()=>setOpen(v=>!v)} disabled={busy}>Exportar PDF <span aria-hidden="true">{open?'−':'＋'}</span></button>
    {open&&<div id={panelId} className="pdf-report__body">
      <div><h3>Un informe para compartir</h3><p className="text-dim">Elige el contenido. El informe se abre en otra pestaña con el botón «Guardar como PDF / Imprimir».</p></div>
      {!matchId&&<div className="pdf-report__filters"><label>Periodo<select className="input" value={scope} disabled={busy} onChange={e=>setScope(e.target.value)}>{SEASONS.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}<option value="all">Histórico completo</option></select></label><label>Competición<select className="input" value={competition} disabled={busy} onChange={e=>setCompetition(e.target.value)}><option value="league">Liga</option><option value="friendly">Amistosos</option><option value="all">Liga y amistosos</option></select></label></div>}
      {playerName&&<p>Jugador: <strong>{playerName}</strong></p>}
      {loading?<p role="status">Cargando partidos…</p>:<fieldset disabled={busy}><legend>Partidos ({chosen.length} de {matches.length})</legend>{!matchId&&matches.length>0&&<div className="pdf-report__selection"><button type="button" onClick={()=>setChosen(matches.map(m=>m.id))}>Todos</button><button type="button" onClick={()=>setChosen([])}>Ninguno</button></div>}<div className="pdf-report__matches">{matches.map(m=><label className="pdf-report__check" key={m.id}><input type="checkbox" checked={chosen.includes(m.id)} onChange={e=>setChosen(ids=>e.target.checked?[...ids,m.id]:ids.filter(id=>id!==m.id))}/><span>{m.date} · {m.opponent}</span></label>)}{!matches.length&&<p>No hay partidos publicados en esta selección.</p>}</div></fieldset>}
      <fieldset disabled={busy}><legend>Contenido del PDF</legend><div className="pdf-report__options">{OPTIONS.map(([key,label])=><label className="pdf-report__check" key={key}><input type="checkbox" checked={sections[key]} onChange={e=>setSections(s=>({...s,[key]:e.target.checked}))}/><span>{label}</span></label>)}</div></fieldset>
      <button type="button" className="pdf-report__generate" disabled={busy||loading||!chosen.length||!Object.values(sections).some(Boolean)} onClick={generate}>{busy?'Preparando informe…':'Abrir informe PDF'}</button>
      {error&&<p role="alert" className="pdf-report__error">{error}</p>}
    </div>}
  </section>;
}
