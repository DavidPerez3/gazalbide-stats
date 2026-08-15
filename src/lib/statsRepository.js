import { supabase } from "./supabaseClient.js";

export async function getMatchesFromSupabase(seasonId) {
  let query = supabase
    .from("matches")
    .select(
      "id,season,date,opponent,source_file,source_sheet,gazal_pts,opp_pts,q_pf,q_pa,result,status"
    )
    .order("date", { ascending: true });

  if (seasonId) query = query.eq("season", seasonId);

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map((match) => ({
    id: match.id,
    season: match.season,
    date: match.date,
    opponent: match.opponent,
    file: match.source_file,
    sheet: match.source_sheet,
    gazal_pts: match.gazal_pts,
    opp_pts: match.opp_pts,
    q_pf: match.q_pf || [],
    q_pa: match.q_pa || [],
    result: match.result,
  }));
}

export async function getPlayersFromSupabase(seasonId) {
  if (!seasonId) return [];

  const { data, error } = await supabase
    .from("season_players")
    .select("jersey_number,sort_order,active,player:players!season_players_player_id_fkey(id,name,photo_path)")
    .eq("season_id", seasonId)
    .eq("active", true)
    .order("sort_order", { ascending: true });

  if (error) throw error;

  return (data || []).map((row) => ({
    id: row.player?.id,
    number: row.jersey_number,
    name: row.player?.name ?? "",
    photo_path: row.player?.photo_path || null,
  }));
}

export async function getMatchStatsFromSupabase(matchId) {
  const { data, error } = await supabase
    .from("player_match_stats")
    .select(
      "sort_order,min_seconds,min_str,pts,two_pm,two_pa,three_pm,three_pa,fgm,fga,ftm,fta,oreb,dreb,reb,ast,tov,stl,blk,pf,pfd,pir,eff,plus_minus,player:players(number,name)"
    )
    .eq("match_id", matchId)
    .order("sort_order", { ascending: true });

  if (error) throw error;

  return (data || []).map((row) => ({
    number: row.player?.number ?? "",
    name: row.player?.name ?? "",
    min: row.min_seconds,
    min_str: row.min_str,
    pts: row.pts,
    two_pm: row.two_pm,
    two_pa: row.two_pa,
    three_pm: row.three_pm,
    three_pa: row.three_pa,
    fgm: row.fgm,
    fga: row.fga,
    ftm: row.ftm,
    fta: row.fta,
    oreb: row.oreb,
    dreb: row.dreb,
    reb: row.reb,
    ast: row.ast,
    tov: row.tov,
    stl: row.stl,
    blk: row.blk,
    pf: row.pf,
    pfd: row.pfd,
    pir: row.pir,
    eff: row.eff,
    plus_minus: row.plus_minus,
  }));
}
