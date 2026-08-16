import { supabase } from "./supabaseClient.js";

const LIVE_STATS_FILE_PREFIX = "live:";
const FETCH_MARKER = "/data/player_stats/live:";
const ADAPTER_KEY = "__gazalbideFantasyStatsFetchAdapter";

function toFantasyRow(stat, roster) {
  return {
    number: String(roster?.jersey_number ?? ""),
    name: roster?.player_name || "Jugador",
    min: stat.min_seconds,
    min_str: stat.min_str,
    pts: stat.pts,
    two_pm: stat.two_pm,
    two_pa: stat.two_pa,
    three_pm: stat.three_pm,
    three_pa: stat.three_pa,
    fgm: stat.fgm,
    fga: stat.fga,
    ftm: stat.ftm,
    fta: stat.fta,
    oreb: stat.oreb,
    dreb: stat.dreb,
    reb: stat.reb,
    ast: stat.ast,
    tov: stat.tov,
    stl: stat.stl,
    blk: stat.blk,
    pf: stat.pf,
    pfd: stat.pfd,
    pir: stat.pir,
    eff: stat.eff,
    plus_minus: stat.plus_minus,
  };
}

function rowsToMap(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const number = Number(row.number);
    if (!Number.isNaN(number)) map.set(number, row);
  }
  return map;
}

async function loadFromSupabase(matchId) {
  const [statsResult, rosterResult] = await Promise.all([
    supabase
      .from("player_match_stats")
      .select("player_id,min_seconds,min_str,pts,two_pm,two_pa,three_pm,three_pa,fgm,fga,ftm,fta,oreb,dreb,reb,ast,tov,stl,blk,pf,pfd,pir,eff,plus_minus")
      .eq("match_id", matchId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("game_roster")
      .select("player_id,jersey_number,player_name,sort_order,is_active")
      .eq("match_id", matchId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
  ]);

  if (statsResult.error) throw statsResult.error;
  if (rosterResult.error) throw rosterResult.error;

  const rosterByPlayer = new Map(
    (rosterResult.data || []).map((row) => [String(row.player_id), row])
  );
  const rows = (statsResult.data || []).map((stat) =>
    toFantasyRow(stat, rosterByPlayer.get(String(stat.player_id)))
  );

  if (rows.length === 0) return null;
  return { rows, map: rowsToMap(rows), source: "supabase" };
}

async function loadLegacyJson(statsFile, baseUrl) {
  const cleaned = String(statsFile || "").trim().replace(/\s+/g, "");
  if (!cleaned) return null;

  const response = await fetch(`${baseUrl}data/player_stats/${cleaned}`);
  if (!response.ok) throw new Error(`No se pudieron cargar las estadísticas (${response.status}).`);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error("El archivo de estadísticas no contiene una lista válida.");
  return { rows, map: rowsToMap(rows), source: "legacy-json" };
}

export function liveStatsFileForMatch(matchId) {
  return `${LIVE_STATS_FILE_PREFIX}${matchId}`;
}

export async function loadFantasyGameweekStats(gameweek, baseUrl = "/") {
  if (!gameweek) return null;

  if (gameweek.match_id) {
    const official = await loadFromSupabase(gameweek.match_id);
    if (official) return official;
  }

  if (gameweek.stats_file) {
    return loadLegacyJson(gameweek.stats_file, baseUrl);
  }

  return null;
}

// Transitional compatibility layer: existing Fantasy screens already consume
// gameweeks.stats_file. A Live publication stores `live:<matchId>` there. Only
// that virtual path is intercepted; every historical/static request continues
// through the browser's original fetch unchanged.
export function installFantasyStatsFetchAdapter() {
  if (typeof window === "undefined" || typeof window.fetch !== "function") return;
  if (window[ADAPTER_KEY]) return;

  const nativeFetch = window.fetch.bind(window);
  window[ADAPTER_KEY] = true;

  window.fetch = async (input, init) => {
    const rawUrl = typeof input === "string" ? input : input?.url;
    const markerIndex = typeof rawUrl === "string" ? rawUrl.indexOf(FETCH_MARKER) : -1;
    if (markerIndex < 0) return nativeFetch(input, init);

    const suffix = rawUrl.slice(markerIndex + FETCH_MARKER.length);
    const matchId = decodeURIComponent(suffix.split(/[?#]/, 1)[0] || "");
    if (!matchId) {
      return new Response(JSON.stringify([]), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    try {
      const official = await loadFromSupabase(matchId);
      if (!official) {
        return new Response(JSON.stringify([]), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify(official.rows), {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "x-gazalbide-stats-source": "supabase",
        },
      });
    } catch (error) {
      console.error("Error resolviendo estadísticas Fantasy desde Supabase:", error);
      return new Response(JSON.stringify({ error: "supabase_stats_unavailable" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      });
    }
  };
}
