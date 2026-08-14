import {
  getMatchesFromSupabase,
  getMatchStatsFromSupabase,
  getPlayersFromSupabase,
} from "./statsRepository.js";

const BASE = import.meta.env.BASE_URL; // "/" en dev, "/gazalbide-stats/" en GH Pages
const STATS_SOURCE = String(import.meta.env.VITE_STATS_SOURCE || "json").toLowerCase();

async function getJson(relativePath) {
  const response = await fetch(`${BASE}${relativePath}`);
  if (!response.ok) {
    throw new Error(`No se pudo cargar ${relativePath} (${response.status})`);
  }
  return response.json();
}

async function fromConfiguredSource(loadFromSupabase, loadFromJson, label) {
  if (STATS_SOURCE !== "supabase") {
    return loadFromJson();
  }

  try {
    const data = await loadFromSupabase();
    if (Array.isArray(data) && data.length === 0) {
      console.warn(`[stats] ${label}: Supabase vacío; usando JSON como respaldo.`);
      return loadFromJson();
    }
    return data;
  } catch (error) {
    console.error(`[stats] ${label}: error consultando Supabase; usando JSON.`, error);
    return loadFromJson();
  }
}

export async function getMatches() {
  return fromConfiguredSource(
    getMatchesFromSupabase,
    () => getJson("data/matches.json"),
    "matches"
  );
}

export async function getPlayers() {
  return fromConfiguredSource(
    getPlayersFromSupabase,
    () => getJson("data/players.json"),
    "players"
  );
}

export async function getMatchStats(matchId) {
  return fromConfiguredSource(
    () => getMatchStatsFromSupabase(matchId),
    () => getJson(`data/player_stats/${matchId}.json`),
    `player_match_stats:${matchId}`
  );
}
