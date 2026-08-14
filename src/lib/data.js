import {
  getMatchesFromSupabase,
  getMatchStatsFromSupabase,
  getPlayersFromSupabase,
} from "./statsRepository.js";
import {
  CURRENT_SEASON_ID,
  LEGACY_SEASON_ID,
  getSeasonIdForDate,
  normaliseSeasonId,
} from "./seasons.js";

const BASE = import.meta.env.BASE_URL;
const STATS_SOURCE = String(import.meta.env.VITE_STATS_SOURCE || "json").toLowerCase();
const SEASON_STORAGE_KEY = "gazalbide.activeSeason";

function resolveSeasonId(seasonId) {
  if (seasonId) return seasonId;
  try {
    const stored = window.localStorage.getItem(SEASON_STORAGE_KEY);
    return normaliseSeasonId(stored) || CURRENT_SEASON_ID;
  } catch {
    return CURRENT_SEASON_ID;
  }
}

async function getJson(relativePath) {
  const response = await fetch(`${BASE}${relativePath}`);
  if (!response.ok) throw new Error(`No se pudo cargar ${relativePath} (${response.status})`);
  return response.json();
}

async function fromConfiguredSource(loadFromSupabase, loadFromJson, label) {
  if (STATS_SOURCE !== "supabase") return loadFromJson();
  try {
    const data = await loadFromSupabase();
    if (Array.isArray(data) && data.length === 0) return loadFromJson();
    return data;
  } catch (error) {
    console.error(`[stats] ${label}: error consultando Supabase; usando JSON.`, error);
    return loadFromJson();
  }
}

function withSeason(match) {
  const explicit = normaliseSeasonId(match.season);
  return { ...match, season: explicit || getSeasonIdForDate(match.date) };
}

async function getMatchesFromJson(seasonId) {
  const matches = (await getJson("data/matches.json")).map(withSeason);
  return matches.filter((match) => match.season === seasonId);
}

async function derivePlayersFromSeasonMatches(seasonId) {
  const matches = await getMatchesFromJson(seasonId);
  const unique = new Map();
  for (const match of matches) {
    const stats = await getJson(`data/player_stats/${match.id}.json`);
    for (const row of stats || []) {
      const key = `${row.number}::${row.name}`;
      if (!unique.has(key)) unique.set(key, { number: row.number, name: row.name });
    }
  }
  return Array.from(unique.values()).sort((a, b) => Number(a.number) - Number(b.number));
}

export async function getMatches(seasonId) {
  const resolved = resolveSeasonId(seasonId);
  return fromConfiguredSource(
    () => getMatchesFromSupabase(resolved),
    () => getMatchesFromJson(resolved),
    `matches:${resolved}`
  );
}

export async function getPlayers(seasonId) {
  const resolved = resolveSeasonId(seasonId);
  return fromConfiguredSource(
    () => getPlayersFromSupabase(resolved),
    () => derivePlayersFromSeasonMatches(resolved),
    `players:${resolved}`
  );
}

export async function getTechs(seasonId) {
  const resolved = resolveSeasonId(seasonId);
  if (resolved !== LEGACY_SEASON_ID) return {};
  try {
    return await getJson("data/techs.json");
  } catch {
    return {};
  }
}

export async function getMatchStats(matchId) {
  return fromConfiguredSource(
    () => getMatchStatsFromSupabase(matchId),
    () => getJson(`data/player_stats/${matchId}.json`),
    `player_match_stats:${matchId}`
  );
}
