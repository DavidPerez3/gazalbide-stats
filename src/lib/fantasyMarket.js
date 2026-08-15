import { supabase } from "./supabaseClient.js";
import { resolvePlayerPhotoSrc } from "./playerPhotos.js";
import { resolveStaffPhotoSrc } from "./staffPhotos.js";

// Compatibilidad temporal con FantasyHome: esa pantalla todavía referencia
// TRAIT_LABELS como identificador global. Mantenerlo definido evita que el
// primer render rompa mientras se cargan los rasgos; después se rellena con
// las etiquetas reales de Supabase en loadFantasyTraitConfig().
globalThis.TRAIT_LABELS ||= {};

export function fantasyNumberKey(value) {
  const n = Number(value);
  return Number.isNaN(n) ? String(value ?? "") : String(n);
}

export async function getFantasySeasonStatus(seasonId) {
  const [settingsResult, rosterResult, marketResult, staffResult, traitsResult] =
    await Promise.all([
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
      supabase
        .from("season_staff")
        .select("staff_id")
        .eq("season_id", seasonId)
        .eq("active", true)
        .eq("fantasy_enabled", true),
      supabase
        .from("fantasy_traits")
        .select("code")
        .eq("season_id", seasonId)
        .eq("enabled", true),
    ]);

  if (settingsResult.error) throw settingsResult.error;
  if (rosterResult.error) throw rosterResult.error;
  if (marketResult.error) throw marketResult.error;
  if (staffResult.error) throw staffResult.error;
  if (traitsResult.error) throw traitsResult.error;

  const settings = settingsResult.data;
  const activePlayerIds = new Set((rosterResult.data || []).map((row) => row.player_id));
  const activePlayers = activePlayerIds.size;
  const pricedPlayers = (marketResult.data || []).filter((row) =>
    activePlayerIds.has(row.player_id)
  ).length;
  const fantasyStaff = staffResult.data?.length ?? 0;
  const enabledTraits = traitsResult.data?.length ?? 0;

  const checks = {
    roster: activePlayers > 0,
    prices: activePlayers > 0 && pricedPlayers === activePlayers,
    staff: fantasyStaff > 0,
    traits: enabledTraits > 0,
  };

  return {
    seasonId,
    baseBudget: Number(settings?.base_budget ?? 80),
    marketReady: Boolean(settings?.market_ready),
    activePlayers,
    pricedPlayers,
    fantasyStaff,
    enabledTraits,
    checks,
    canActivate: Object.values(checks).every(Boolean),
  };
}

export async function setFantasySeasonReady({ seasonId, ready }) {
  const { data, error } = await supabase.rpc("set_fantasy_market_ready", {
    p_season_id: seasonId,
    p_ready: Boolean(ready),
  });
  if (error) throw error;
  return data;
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
        image: resolveStaffPhotoSrc(member),
      };
    })
    .filter(Boolean);
}

export async function loadFantasyTraitConfig(seasonId) {
  const [traitsResult, rosterResult, playerAssignmentsResult, coaches, staffAssignmentsResult] =
    await Promise.all([
      supabase
        .from("fantasy_traits")
        .select("code, label, activation_type, multiplier, required_count, sort_order")
        .eq("season_id", seasonId)
        .eq("enabled", true)
        .order("sort_order", { ascending: true }),
      supabase
        .from("season_players")
        .select("player_id, jersey_number")
        .eq("season_id", seasonId),
      supabase
        .from("fantasy_player_traits")
        .select("player_id, trait_code")
        .eq("season_id", seasonId),
      loadFantasyCoaches(seasonId),
      supabase
        .from("fantasy_staff_traits")
        .select("staff_id, trait_code")
        .eq("season_id", seasonId),
    ]);

  if (traitsResult.error) throw traitsResult.error;
  if (rosterResult.error) throw rosterResult.error;
  if (playerAssignmentsResult.error) throw playerAssignmentsResult.error;
  if (staffAssignmentsResult.error) throw staffAssignmentsResult.error;

  const traitList = (traitsResult.data || []).map((row) => ({
    ...row,
    multiplier: Number(row.multiplier),
    required_count: Number(row.required_count),
  }));
  const traits = Object.fromEntries(traitList.map((row) => [row.code, row]));

  // FantasyHome todavía renderiza una leyenda legacy mediante TRAIT_LABELS.
  // Mantener este alias sincronizado con Supabase evita hardcodear etiquetas y
  // permite que cualquier cambio en Admin se refleje tras recargar la app.
  globalThis.TRAIT_LABELS = Object.fromEntries(
    traitList.map((row) => [row.code, row.label])
  );

  const numberByPlayerId = new Map(
    (rosterResult.data || []).map((row) => [row.player_id, fantasyNumberKey(row.jersey_number)])
  );
  const playerTraitsByNumber = {};
  const playerTraitsByPlayerId = {};
  for (const row of playerAssignmentsResult.data || []) {
    const numberKey = numberByPlayerId.get(row.player_id);
    if (numberKey != null) {
      (playerTraitsByNumber[numberKey] ||= []).push(row.trait_code);
    }
    (playerTraitsByPlayerId[row.player_id] ||= []).push(row.trait_code);
  }

  const codeByStaffId = new Map(coaches.map((coach) => [coach.id, coach.code]));
  const coachTraitsByCode = {};
  const staffTraitsById = {};
  for (const row of staffAssignmentsResult.data || []) {
    const code = codeByStaffId.get(row.staff_id);
    if (code) (coachTraitsByCode[code] ||= []).push(row.trait_code);
    (staffTraitsById[row.staff_id] ||= []).push(row.trait_code);
  }

  return {
    seasonId,
    traits,
    traitList,
    playerTraitsByNumber,
    playerTraitsByPlayerId,
    coachTraitsByCode,
    staffTraitsById,
  };
}

export async function replaceFantasyTraitAssignments({
  seasonId,
  playerTraitsByPlayerId,
  staffTraitsById,
}) {
  const playerAssignments = [];
  for (const [playerId, codes] of Object.entries(playerTraitsByPlayerId || {})) {
    for (const traitCode of codes || []) {
      playerAssignments.push({ player_id: Number(playerId), trait_code: traitCode });
    }
  }

  const staffAssignments = [];
  for (const [staffId, codes] of Object.entries(staffTraitsById || {})) {
    for (const traitCode of codes || []) {
      staffAssignments.push({ staff_id: staffId, trait_code: traitCode });
    }
  }

  const { error } = await supabase.rpc("replace_fantasy_trait_assignments", {
    p_season_id: seasonId,
    p_player_assignments: playerAssignments,
    p_staff_assignments: staffAssignments,
  });
  if (error) throw error;
}
