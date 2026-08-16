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
import { getLocalRosterDraft } from "./localRosterDraft.js";

const BASE = import.meta.env.BASE_URL;
// Supabase is now the canonical stats source. VITE_STATS_SOURCE=json remains available
// as an explicit emergency/legacy override while the static files are still kept.
const STATS_SOURCE = String(import.meta.env.VITE_STATS_SOURCE || "supabase").toLowerCase();
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

async function getLegacyPhotoMap() {
  try {
    const fantasyPlayers = await getJson("data/fantasy_players.json");
    const map = new Map();
    for (const player of fantasyPlayers || []) {
      const key = `${String(player.number)}::${String(player.name || "").trim().toLowerCase()}`;
      if (player.image) map.set(key, player.image);
    }
    return map;
  } catch {
    return new Map();
  }
}

async function derivePlayersFromSeasonMatches(seasonId) {
  const matches = await getMatchesFromJson(seasonId);
  const unique = new Map();
  const legacyPhotos = seasonId === LEGACY_SEASON_ID ? await getLegacyPhotoMap() : new Map();

  for (const match of matches) {
    const stats = await getJson(`data/player_stats/${match.id}.json`);
    for (const row of stats || []) {
      const key = `${row.number}::${row.name}`;
      if (!unique.has(key)) {
        const photoKey = `${String(row.number)}::${String(row.name || "").trim().toLowerCase()}`;
        unique.set(key, {
          number: row.number,
          name: row.name,
          photo_path: legacyPhotos.get(photoKey) || null,
        });
      }
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

  // Supabase is canonical as soon as the current-season roster exists there.
  // A stale mobile draft must never override real player ids, because Live Stats
  // persists player_id as bigint. Keep the local draft only as an offline/first
  // setup fallback while the canonical season roster is genuinely absent.
  if (resolved === CURRENT_SEASON_ID && STATS_SOURCE === "supabase") {
    try {
      const canonical = await getPlayersFromSupabase(resolved);
      if (Array.isArray(canonical) && canonical.length > 0) return canonical;
    } catch (error) {
      console.warn("[stats] No se pudo cargar la plantilla canónica; comprobando borrador local.", error);
    }

    const localDraft = getLocalRosterDraft({ includeInactive: false });
    if (localDraft.length) return localDraft;
  }

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
