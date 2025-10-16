const BASE = import.meta.env.BASE_URL; // "/" en dev, "/gazalbide-stats/" en GH Pages

export async function getMatches() {
  const r = await fetch(`${BASE}data/matches.json`);
  return r.json();
}
export async function getPlayers() {
  const r = await fetch(`${BASE}data/players.json`);
  return r.json();
}
export async function getMatchStats(matchId) {
  const r = await fetch(`${BASE}data/player_stats/${matchId}.json`);
  return r.json();
}
