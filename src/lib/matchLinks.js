export function makeMatchId(date, opponent) {
  const slug = String(opponent).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${date}-vs-${slug}`;
}
export function matchLinks(matchId) {
  const id = encodeURIComponent(matchId);
  return { live: `/live/${id}`, stats: `/partido/${id}`, bets: `/porra?match=${id}&view=live` };
}
