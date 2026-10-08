import { playerSeasonSummary } from './historyStats.js';
export function teamGames(rows) {
  const games = new Map();
  for (const row of rows) {
    const id = row.match_id;
    if (!games.has(id)) games.set(id, { id, date: row.date, season: row.season, opponent: row.opponent, gazal: Number(row.gazalPts ?? row.match?.gazal_pts ?? 0), rival: Number(row.opponentPts ?? row.match?.opp_pts ?? 0), pts: 0, reb: 0, ast: 0, fgm: 0, fga: 0, three_pm: 0, three_pa: 0, ftm: 0, fta: 0 });
    const game = games.get(id);
    for (const key of ['pts','reb','ast','fgm','fga','three_pm','three_pa','ftm','fta']) game[key] += Number(row[key] || 0);
  }
  return [...games.values()].sort((a,b)=>String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id))).map((game)=>({...game,margin:game.gazal-game.rival}));
}
export function teamSummary(games) {
  const count = games.length;
  const sum = (key) => games.reduce((n,g)=>n+Number(g[key] || 0),0);
  const pct = (made, attempted) => sum(attempted) ? 100*sum(made)/sum(attempted) : 0;
  return { games: count, wins: games.filter((g)=>g.margin>0).length, losses: games.filter((g)=>g.margin<0).length, draws: games.filter((g)=>g.margin===0).length, scored: count ? sum('gazal')/count : 0, conceded: count ? sum('rival')/count : 0, reb: count ? sum('reb')/count : 0, ast: count ? sum('ast')/count : 0, fg: pct('fgm','fga'), three: pct('three_pm','three_pa'), ft: pct('ftm','fta') };
}
export function comparePlayers(rows, firstId, secondId) {
  const first = rows.filter((r)=>String(r.playerId)===String(firstId));
  const second = rows.filter((r)=>String(r.playerId)===String(secondId));
  const ids = new Set(second.map((r)=>r.match_id));
  const shared = new Set(first.filter((r)=>ids.has(r.match_id)).map((r)=>r.match_id));
  return { games: shared.size, first: playerSeasonSummary(first.filter((r)=>shared.has(r.match_id))), second: playerSeasonSummary(second.filter((r)=>shared.has(r.match_id))) };
}
const SCORE = { FT_MADE:[1,0], TWO_MADE:[2,0], THREE_MADE:[3,0], OPP_SCORE_1:[0,1], OPP_SCORE_2:[0,2], OPP_SCORE_3:[0,3] };
export function leadHistory(events) {
  let gazal=0, rival=0;
  const points=[{value:0,label:'Inicio',gazal:0,rival:0}];
  for (const event of [...events].filter((e)=>!e.is_void).sort((a,b)=>(a.server_sequence || a.client_sequence || 0)-(b.server_sequence || b.client_sequence || 0))) {
    const delta=SCORE[event.event_type]; if(!delta) continue;
    gazal+=delta[0]; rival+=delta[1];
    points.push({value:gazal-rival,gazal,rival,period:event.period,clockMs:event.clock_ms,label:`Periodo ${event.period} · ${gazal}–${rival}`});
  }
  return points;
}
export function matchesTimelineFilter(event, period, kind) {
  if(event.is_void || event.subject==='system') return false;
  if(period !== 'all' && Number(event.period)!==Number(period)) return false;
  if(kind==='score') return Boolean(SCORE[event.event_type]);
  if(kind==='foul') return ['PF','PFD','OPP_TEAM_FOUL','STAFF_FOUL'].includes(event.event_type);
  if(kind==='sub') return ['SUBSTITUTION','SUB_IN','SUB_OUT'].includes(event.event_type);
  return true;
}
