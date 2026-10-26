import { formatSeconds, percentage, PLAYER_SUM_KEYS } from '../../lib/historyStats.js';

const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const playerKey = row => String(row.name || '').trim().toLocaleLowerCase('es');
const minutes = row => {
  if (row.min_seconds != null || typeof row.min === 'number') return number(row.min_seconds ?? row.min);
  const text = String(row.min_str ?? row.min ?? '0');
  const [m,s] = text.split(':');
  return text.includes(':') ? number(m)*60+number(s) : number(text);
};
const accuracy = (made, attempted) => `${number(made)}/${number(attempted)} · ${percentage(made, attempted).toFixed(1)}%`;
const score = value => value == null || value === '' ? '—' : number(value);

export function buildReportModel({matches, rows, playerName = '', lineups = []}) {
  const matchIds = new Set(matches.map(match => String(match.id)));
  const selectedRows = rows.filter(row => matchIds.has(String(row.matchId)) && (!playerName || playerKey(row) === playerKey({name:playerName})));
  const players = new Map();
  for (const row of selectedRows) {
    const key = playerKey(row);
    const current = players.get(key) || {name:row.name, number:row.number, games:new Set(), ...Object.fromEntries(PLAYER_SUM_KEYS.map(k=>[k,0]))};
    current.games.add(String(row.matchId));
    for (const field of PLAYER_SUM_KEYS) current[field] += field === 'min_seconds' ? minutes(row) : number(row[field]);
    players.set(key,current);
  }
  return {matches, rows:selectedRows, players:[...players.values()].map(row=>({...row,games:row.games.size})).sort((a,b)=>b.pts-a.pts), lineups:lineups.filter(row=>matchIds.has(String(row.match_id)))};
}

function table(headers, rows) {
  if (!rows.length) return '<p class="empty">Sin datos registrados para esta selección.</p>';
  return `<table><thead><tr>${headers.map(h=>`<th>${escape(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(cell=>`<td>${escape(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
function bars(rows) {
  const max = Math.max(1,...rows.map(row=>number(row.value)));
  return rows.map(row=>`<div class="bar"><span>${escape(row.label)}</span><div><i style="width:${Math.max(0,number(row.value))/max*100}%"></i></div><b>${number(row.value)}</b></div>`).join('');
}
export function buildReportHTML({model, title, subtitle, playerName='', sections}) {
  const {matches, rows, players, lineups} = model;
  const names = new Map(rows.filter(row=>row.player_id!=null).map(row=>[String(row.player_id),row.name]));
  const result = sections.results ? `<h2>Resultados</h2>${table(['Fecha','Rival','Gazalbide','Rival','Tipo'],matches.map(m=>[m.date,m.opponent,score(m.gazal_pts),score(m.opp_pts),m.is_friendly?'Amistoso':'Liga']))}${matches.length===1 ? table(['Periodo','Gazalbide','Rival'],Array.from({length:Math.max(matches[0].q_pf?.length||0,matches[0].q_pa?.length||0)},(_,i)=>[i<4?`Q${i+1}`:`Prórroga ${i-3}`,score(matches[0].q_pf?.[i]),score(matches[0].q_pa?.[i])])) : ''}` : '';
  const basic = sections.basic ? `<h2>Rendimiento acumulado</h2>${table(['Jugador','PJ*','MIN','PTS','REB','AST','VAL'],players.map(p=>[p.name,p.games,formatSeconds(p.min_seconds),p.pts,p.reb,p.ast,p.pir]))}<p class="note">* PJ: partidos con ficha estadística en la selección. Los totales no son medias.</p>` : '';
  const shooting = sections.shooting ? `<h2>Eficacia de tiro</h2>${table(['Jugador','Libres','2 puntos','3 puntos','Campo'],players.map(p=>[p.name,accuracy(p.ftm,p.fta),accuracy(p.two_pm,p.two_pa),accuracy(p.three_pm,p.three_pa),accuracy(p.fgm,p.fga)]))}<p class="note">Metidos / intentados · porcentaje sobre los intentos acumulados.</p>` : '';
  const defense = sections.defense ? `<h2>Defensa y control</h2>${table(['Jugador','ROB','TAP','PÉR','F','F REC','+/−'],players.map(p=>[p.name,p.stl,p.blk,p.tov,p.pf,p.pfd,p.plus_minus]))}` : '';
  const charts = sections.charts ? `<h2>${playerName?'Puntos del jugador':'Puntos del equipo'} por partido</h2>${bars([...matches].sort((a,b)=>String(a.date).localeCompare(String(b.date))).map(m=>({label:`${m.date} · ${m.opponent}`,value:playerName?rows.filter(r=>String(r.matchId)===String(m.id)).reduce((sum,r)=>sum+number(r.pts),0):m.gazal_pts})))}<h2>Distribución de puntos</h2>${bars(players.map(p=>({label:p.name,value:p.pts})))}` : '';
  const combos = sections.lineups ? `<h2>Quintetos por +/−</h2>${table(['Jugadores','Tiempo','Parcial','+/−'],[...lineups].sort((a,b)=>number(b.plus_minus)-number(a.plus_minus)).map(l=>[(l.player_names || (l.player_ids||[]).map(id=>names.get(String(id))||`Jugador ${id}`)).join(' · '),formatSeconds(number(l.duration_ms)/1000),`${number(l.gazal_pts)} – ${number(l.opp_pts)}`,number(l.plus_minus)]))}<p class="note">Detalle por partido. Valora el tiempo compartido: menos de tres minutos es una muestra reducida. El histórico puede no tener quintetos registrados.</p>` : '';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · Gazalbide Stats</title><style>
@page{size:A4;margin:16mm}*{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#202020;background:#fff;margin:0}main{max-width:1000px;margin:auto;padding:24px}header{border-bottom:4px solid #b28b25;padding-bottom:16px}header small{font-weight:bold;letter-spacing:2px;color:#806114}h1{font-size:28px;margin:10px 0}h2{font-size:18px;margin-top:27px;break-after:avoid}p{color:#596166;line-height:1.5}table{width:100%;border-collapse:collapse;font-size:10px;margin:12px 0;table-layout:auto}th{background:#f3ecd8;text-align:left}td,th{padding:8px;border-bottom:1px solid #ddd;overflow-wrap:anywhere}td:first-child{max-width:240px}thead{display:table-header-group}tr,.bar{break-inside:avoid}.bar{display:grid;grid-template-columns:minmax(100px,180px) 1fr 36px;gap:12px;align-items:center;margin:12px 0}.bar>div{background:#f0eee8;height:13px}.bar i{display:block;height:100%;background:#b28b25}.note,footer{font-size:10px;color:#626b70}footer{border-top:1px solid #ddd;margin-top:25px;padding-top:12px}.actions{display:flex;gap:12px;flex-wrap:wrap;padding:15px;background:#151515;color:white;position:sticky;top:0}.actions button{background:#d4af37;color:#111;border:0;border-radius:9px;padding:12px 16px;font:inherit;font-weight:bold;cursor:pointer}.actions span{align-self:center;font-size:13px}@media print{.actions{display:none}main{padding:0;max-width:none}}@media(max-width:600px){main{padding:16px}table{font-size:9px}td,th{padding:5px}.bar{grid-template-columns:100px 1fr 28px}}
</style></head><body><nav class="actions"><button id="print-report" type="button">Guardar como PDF / Imprimir</button><span>En el diálogo elige «Guardar como PDF» o la opción de compartir de tu dispositivo.</span></nav><main><header><small>GAZALBIDE CB · INFORME ESTADÍSTICO</small><h1>${escape(title)}</h1><p>${escape(subtitle)}${playerName?' · '+escape(playerName):''}</p></header><p>${matches.length} partido(s) · Datos publicados · Generado el ${escape(new Date().toLocaleDateString('es-ES'))}</p>${result}${basic}${shooting}${defense}${charts}${combos}<footer>Gazalbide Stats · PTS puntos · REB rebotes · AST asistencias · VAL valoración · ROB robos · TAP tapones · PÉR pérdidas · F faltas · F REC faltas recibidas · +/− diferencial en pista.</footer></main></body></html>`;
}

// Open synchronously in the click handler, before any asynchronous data loading.
export function openReportWindow() {
  const tab = window.open('', '_blank');
  if (!tab) throw new Error('Permite abrir ventanas para ver el informe y guardarlo como PDF.');
  tab.document.title = 'Preparando informe · Gazalbide';
  tab.document.body.textContent = 'Preparando informe de Gazalbide…';
  return tab;
}
export function showReport(tab, html) {
  if (tab.closed) return;
  tab.document.open();tab.document.write(html);tab.document.close();
  tab.document.getElementById('print-report').addEventListener('click',()=>tab.print());
  tab.opener = null;
  tab.focus();
}
