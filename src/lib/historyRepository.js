import { supabase } from "./supabaseClient.js";

const PLAYER_STAT_SELECT = [
  "match_id", "player_id", "min_seconds", "min_str", "pts",
  "two_pm", "two_pa", "three_pm", "three_pa", "fgm", "fga", "ftm", "fta",
  "oreb", "dreb", "reb", "ast", "tov", "stl", "blk", "pf", "pfd", "pir", "eff", "plus_minus",
  "pf_defensive", "pf_offensive", "pf_technical", "pf_unsportsmanlike", "pf_disqualifying",
  "pf_technical_cat_1", "pf_technical_cat_2", "pf_disruptive", "pf_flagrant",
].join(",");

export async function loadHistoricalPlayerRows({ seasonId = null } = {}) {
  let query = supabase
    .from("player_match_stats")
    .select(
      `${PLAYER_STAT_SELECT},` +
      "player:players!player_match_stats_player_id_fkey(id,name,number,photo_path)," +
      "match:matches!player_match_stats_match_id_fkey!inner(id,season,date,opponent,result,status)"
    )
    .eq("match.status", "published")
    .order("match_id", { ascending: true });

  if (seasonId && seasonId !== "all") query = query.eq("match.season", seasonId);

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map((row) => ({
    ...row,
    playerId: Number(row.player_id),
    playerName: row.player?.name || "Jugador",
    playerNumber: row.player?.number == null ? "" : String(row.player.number),
    photoPath: row.player?.photo_path || null,
    season: row.match?.season || null,
    date: row.match?.date || null,
    opponent: row.match?.opponent || "Rival",
    result: row.match?.result || null,
  }));
}

export async function loadPlayerDisciplineAdjustments({ seasonId = null } = {}) {
  let query = supabase
    .from("player_discipline_adjustments")
    .select(
      "season_id,player_id,source,technical,unsportsmanlike,disqualifying,disruptive,flagrant,note," +
      "player:players!player_discipline_adjustments_player_id_fkey(id,name,number)"
    );

  if (seasonId && seasonId !== "all") query = query.eq("season_id", seasonId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function loadLineupHistory({ seasonId = null } = {}) {
  let query = supabase
    .from("match_lineup_stats")
    .select(
      "match_id,lineup_key,player_ids,stint_count,duration_ms,gazal_pts,opp_pts,plus_minus," +
      "match:matches!match_lineup_stats_match_id_fkey!inner(id,season,date,opponent,status)"
    )
    .eq("match.status", "published");

  if (seasonId && seasonId !== "all") query = query.eq("match.season", seasonId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((row) => ({
    ...row,
    season: row.match?.season || null,
    date: row.match?.date || null,
    opponent: row.match?.opponent || "Rival",
    player_ids: (row.player_ids || []).map(Number),
  }));
}

export async function loadStaffDisciplineHistory({ seasonId = null } = {}) {
  let eventQuery = supabase
    .from("game_events")
    .select(
      "staff_id,foul_kind,is_void," +
      "staff:staff_members!game_events_staff_id_fkey(id,name,code)," +
      "match:matches!game_events_match_id_fkey!inner(id,season,status)"
    )
    .not("staff_id", "is", null)
    .eq("is_void", false)
    .eq("match.status", "published");

  let adjustmentQuery = supabase
    .from("staff_discipline_adjustments")
    .select(
      "season_id,staff_id,technical,disqualifying,source,note," +
      "staff:staff_members!staff_discipline_adjustments_staff_id_fkey(id,name,code)"
    );

  if (seasonId && seasonId !== "all") {
    eventQuery = eventQuery.eq("match.season", seasonId);
    adjustmentQuery = adjustmentQuery.eq("season_id", seasonId);
  }

  const [eventsResult, adjustmentsResult] = await Promise.all([eventQuery, adjustmentQuery]);
  if (eventsResult.error) throw eventsResult.error;
  if (adjustmentsResult.error) throw adjustmentsResult.error;

  return {
    events: (eventsResult.data || []).map((row) => ({
      ...row,
      season: row.match?.season || null,
      staffName: row.staff?.name || "Staff",
      staffCode: row.staff?.code || "",
    })),
    adjustments: (adjustmentsResult.data || []).map((row) => ({
      ...row,
      season: row.season_id,
      staffName: row.staff?.name || "Staff",
      staffCode: row.staff?.code || "",
    })),
  };
}
