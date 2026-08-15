import { supabase } from "./supabaseClient.js";
import { resolvePlayerPhotoSrc } from "./playerPhotos.js";

function resolveStaffPhotoSrc(photoPath) {
  const raw = String(photoPath || "").trim();
  if (!raw) return null;
  if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
  if (/^\/?images\//i.test(raw)) {
    return `${import.meta.env.BASE_URL}${raw.replace(/^\/+/, "")}`;
  }
  return null;
}

export async function getFantasySeasonStatus(seasonId) {
  const [settingsResult, rosterResult, marketResult] = await Promise.all([
    supabase
      .from("fantasy_season_settings")
      .select("season_id, base_budget, market_ready")
      .eq("season_id", seasonId)
      .maybeSingle(),
    supabase
      .from("season_players")
      .select("player_id")
      .eq("season_id", seasonId)
      .eq("active", true),
    supabase
      .from("fantasy_player_market")
      .select("player_id")
      .eq("season_id", seasonId)
      .eq("enabled", true),
  ]);

  if (settingsResult.error) throw settingsResult.error;
  if (rosterResult.error) throw rosterResult.error;
  if (marketResult.error) throw marketResult.error;

  const settings = settingsResult.data;
  return {
    seasonId,
    baseBudget: Number(settings?.base_budget ?? 80),
    marketReady: Boolean(settings?.market_ready),
    activePlayers: rosterResult.data?.length ?? 0,
    pricedPlayers: marketResult.data?.length ?? 0,
  };
}

async function loadSeasonPerformance(seasonId, playerIds) {
  const result = new Map();
  if (!playerIds.length) return result;

  const { data: matches, error: matchError } = await supabase
    .from("matches")
    .select("id, date")
    .eq("season", seasonId)
    .order("date", { ascending: true });

  if (matchError) throw matchError;
  if (!matches?.length) return result;

  const matchDate = new Map(matches.map((m) => [m.id, m.date || ""]));
  const matchIds = matches.map((m) => m.id);

  const { data: stats, error: statsError } = await supabase
    .from("player_match_stats")
    .select("player_id, match_id, pir")
    .in("match_id", matchIds)
    .in("player_id", playerIds);

  if (statsError) throw statsError;

  const grouped = new Map();
  for (const row of stats || []) {
    const list = grouped.get(row.player_id) || [];
    list.push({
      pir: Number(row.pir || 0),
      date: matchDate.get(row.match_id) || "",
    });
    grouped.set(row.player_id, list);
  }

  for (const playerId of playerIds) {
    const rows = (grouped.get(playerId) || []).sort((a, b) =>
      String(a.date).localeCompare(String(b.date))
    );
    const total = rows.reduce((sum, row) => sum + row.pir, 0);
    result.set(playerId, {
      gamesPlayed: rows.length,
      pir_avg: rows.length ? total / rows.length : 0,
      last3_pir: rows.slice(-3).map((row) => row.pir),
    });
  }

  return result;
}

export async function loadFantasyMarket({ seasonId, gameweekId = null }) {
  const { data: roster, error: rosterError } = await supabase
    .from("season_players")
    .select("player_id, jersey_number, sort_order")
    .eq("season_id", seasonId)
    .eq("active", true)
    .order("sort_order", { ascending: true });

  if (rosterError) throw rosterError;
  if (!roster?.length) return [];

  const playerIds = roster.map((row) => row.player_id);

  const [playersResult, pricesResult, performance] = await Promise.all([
    supabase
      .from("players")
      .select("id, name, photo_path")
      .in("id", playerIds),
    gameweekId
      ? supabase
          .from("fantasy_gameweek_prices")
          .select("player_id, price")
          .eq("gameweek_id", gameweekId)
      : supabase
          .from("fantasy_player_market")
          .select("player_id, price")
          .eq("season_id", seasonId)
          .eq("enabled", true),
    loadSeasonPerformance(seasonId, playerIds),
  ]);

  if (playersResult.error) throw playersResult.error;
  if (pricesResult.error) throw pricesResult.error;

  const playerMap = new Map((playersResult.data || []).map((p) => [p.id, p]));
  const priceMap = new Map(
    (pricesResult.data || []).map((row) => [row.player_id, Number(row.price)])
  );

  return roster
    .map((row) => {
      const player = playerMap.get(row.player_id);
      if (!player) return null;
      const perf = performance.get(row.player_id) || {
        gamesPlayed: 0,
        pir_avg: 0,
        last3_pir: [],
      };

      return {
        player_id: row.player_id,
        number: row.jersey_number,
        dorsal: row.jersey_number,
        name: player.name,
        price: priceMap.get(row.player_id) ?? null,
        image: resolvePlayerPhotoSrc(player),
        photo_path: player.photo_path,
        gamesPlayed: perf.gamesPlayed,
        pir_avg: perf.pir_avg,
        last3_pir: perf.last3_pir,
      };
    })
    .filter(Boolean);
}

export async function loadFantasyCoaches(seasonId) {
  const { data: membership, error: membershipError } = await supabase
    .from("season_staff")
    .select("staff_id, role, sort_order")
    .eq("season_id", seasonId)
    .eq("active", true)
    .eq("fantasy_enabled", true)
    .order("sort_order", { ascending: true });

  if (membershipError) throw membershipError;
  if (!membership?.length) return [];

  const staffIds = membership.map((row) => row.staff_id);
  const { data: staff, error: staffError } = await supabase
    .from("staff_members")
    .select("id, code, name, photo_path")
    .in("id", staffIds);

  if (staffError) throw staffError;

  const staffMap = new Map((staff || []).map((row) => [row.id, row]));
  return membership
    .map((membershipRow) => {
      const member = staffMap.get(membershipRow.staff_id);
      if (!member) return null;
      return {
        ...member,
        role: membershipRow.role,
        image: resolveStaffPhotoSrc(member.photo_path),
      };
    })
    .filter(Boolean);
}
