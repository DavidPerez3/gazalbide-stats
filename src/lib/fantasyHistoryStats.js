export function summarizeFantasyHistory(entries) {
  const scored = entries.filter((entry)=>entry.scoreAvailable && Number.isFinite(entry.totalPoints));
  const points=scored.map((entry)=>entry.totalPoints);
  const total=points.reduce((sum,n)=>sum+n,0);
  return { games: scored.length, pending: entries.length-scored.length, total, average: scored.length?total/scored.length:0, best: scored.length?Math.max(...points):null, worst:scored.length?Math.min(...points):null, evolution:[...scored].sort((a,b)=>String(a.gameweekDate).localeCompare(String(b.gameweekDate))).map((entry)=>({value:entry.totalPoints,label:entry.gameweekName})) };
}
export function fantasyRankingPositions(sortedRows) {
  return sortedRows.map((row,index)=> index>0 && row.totalPoints===sortedRows[index-1].totalPoints ? null : index+1).map((rank,index,ranks)=>rank ?? ranks.slice(0,index).reverse().find((value)=>value!=null));
}
