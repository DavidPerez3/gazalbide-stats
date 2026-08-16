import { supabase } from "./supabaseClient.js";
import { computeLineupBreakdown } from "./fantasyScoring.js";
import { loadFantasyTraitConfig } from "./fantasyMarket.js";
import { matchIdentityMatchesGameweek } from "./liveCenter.js";
import { CURRENT_SEASON_ID } from "./seasons.js";

const BASE = import.meta.env.BASE_URL || "/";
const statsMapCache = new Map();
const traitConfigCache = new Map();

function key(teamId, gameweekId) {
  return `${teamId}:${gameweekId}`;
}

function validPlayers(lineup) {
  const raw = Array.isArray(lineup?.players) ? lineup.players : [];
  if (raw.length !== 5 || raw.some((value) => String(value) === "-1")) return null;
  const nums = raw.map(Number);
  return nums.every(Number.isFinite) ? nums : null;
}

function getTraitConfig(seasonId) {
  if (!traitConfigCache.has(seasonId)) {
    traitConfigCache.set(
      seasonId,
      loadFantasyTraitConfig(seasonId).catch((error) => {
        traitConfigCache.delete(seasonId);
        throw error;
      })
    );
  }
  return traitConfigCache.get(seasonId);
}

async function loadStatsMap(gameweek) {
  if (!gameweek?.stats_file) return null;
  const cleaned = String(gameweek.stats_file).trim().replace(/\s+/g, "");
  if (!cleaned) return null;
  const cacheKey = `${gameweek.id}:${cleaned}`;
  if (!statsMapCache.has(cacheKey)) {
    statsMapCache.set(
      cacheKey,
      (async () => {
        const response = await fetch(`${BASE}data/player_stats/${cleaned}`);
        if (!response.ok) return null;
        const rows = await response.json();
        return new Map(
          (rows || [])
            .map((row) => [Number(row.number), row])
            .filter(([number, row]) => Number.isFinite(number) && row)
        );
      })().catch((error) => {
        statsMapCache.delete(cacheKey);
        throw error;
      })
    );
  }
  return statsMapCache.get(cacheKey);
}

function liveStatsMap(snapshot) {
  return new Map(
    (snapshot?.players || [])
      .map((player) => [
        Number(player.number),
        {
          ...player.stats,
          number: Number(player.number),
          name: player.name,
          pir: Number(player.stats?.pir || 0),
        },
      ])
      .filter(([number]) => Number.isFinite(number))
  );
}

function phaseLabel(phase) {
  if (phase === "official") return "OFICIAL";
  if (phase === "review") return "PENDIENTE DE REVISIÓN";
  return "PROVISIONAL";
}

export async function loadFantasyLive(snapshot, userId) {
  if (!snapshot?.match) return { available: false, reason: "missing_match" };
  if (!userId) return { available: false, reason: "login_required" };

  const seasonId = snapshot.match.season;
  const [gameweeksResult, teamsResult, traitConfig] = await Promise.all([
    supabase
      .from("gameweeks")
      .select("id,name,date,opponent,deadline,match_id,status,stats_file,season_id")
      .eq("season_id", seasonId)
      .order("date", { ascending: true }),
    supabase
      .from("fantasy_teams")
      .select("id,user_id,name,season_id")
      .eq("season_id", seasonId),
    getTraitConfig(seasonId),
  ]);

  if (gameweeksResult.error) throw gameweeksResult.error;
  if (teamsResult.error) throw teamsResult.error;

  const gameweeks = gameweeksResult.data || [];
  const candidates = gameweeks.filter((gw) => matchIdentityMatchesGameweek(snapshot.match, gw));
  if (candidates.length !== 1) {
    return {
      available: false,
      reason: candidates.length > 1 ? "ambiguous_gameweek" : "no_gameweek",
    };
  }

  const currentGameweek = candidates[0];
  if (currentGameweek.deadline && new Date(currentGameweek.deadline).getTime() > Date.now()) {
    return { available: false, reason: "deadline_not_passed", gameweek: currentGameweek };
  }

  const teams = teamsResult.data || [];
  if (!teams.length) {
    return { available: true, gameweek: currentGameweek, rows: [], myTeam: null, label: phaseLabel(snapshot.phase) };
  }

  const teamIds = teams.map((team) => team.id);
  const [profilesResult, lineupsResult, eligibilityResult] = await Promise.all([
    supabase.from("profiles").select("id,username,email").in("id", teams.map((team) => team.user_id)),
    supabase
      .from("fantasy_lineups")
      .select("id,fantasy_team_id,gameweek_id,players,captain_number,coach_code,created_at")
      .in("fantasy_team_id", teamIds),
    seasonId === CURRENT_SEASON_ID
      ? supabase.rpc("get_fantasy_scoring_eligibility", { p_season_id: seasonId })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (profilesResult.error) throw profilesResult.error;
  if (lineupsResult.error) throw lineupsResult.error;
  if (eligibilityResult.error) throw eligibilityResult.error;

  const profiles = new Map((profilesResult.data || []).map((profile) => [profile.id, profile]));
  const eligibility = new Map(
    (eligibilityResult.data || []).map((row) => [
      key(row.fantasy_team_id, row.gameweek_id),
      row.valid_lineup === true,
    ])
  );

  const lineupByTeamGameweek = new Map();
  for (const lineup of (lineupsResult.data || []).sort((a, b) =>
    String(a.created_at || "").localeCompare(String(b.created_at || ""))
  )) {
    lineupByTeamGameweek.set(key(lineup.fantasy_team_id, lineup.gameweek_id), lineup);
  }

  const statsByGameweek = new Map();
  for (const gameweek of gameweeks) {
    if (String(gameweek.id) === String(currentGameweek.id)) continue;
    if (!gameweek.stats_file) continue;
    try {
      const stats = await loadStatsMap(gameweek);
      if (stats) statsByGameweek.set(String(gameweek.id), stats);
    } catch (error) {
      console.warn("Fantasy Live no pudo cargar una jornada histórica:", error);
    }
  }
  statsByGameweek.set(String(currentGameweek.id), liveStatsMap(snapshot));

  const rows = teams.map((team) => {
    const profile = profiles.get(team.user_id);
    const row = {
      teamId: team.id,
      teamName: team.name || "Equipo sin nombre",
      userId: team.user_id,
      ownerName: profile?.username || profile?.email?.split("@")[0] || "Anónimo",
      totalPoints: 0,
      gameweekPoints: 0,
      breakdown: null,
      validLineup: false,
    };

    for (const gameweek of gameweeks) {
      const statsMap = statsByGameweek.get(String(gameweek.id));
      if (!statsMap) continue;

      const lineup = lineupByTeamGameweek.get(key(team.id, gameweek.id));
      const playersNums = validPlayers(lineup);
      if (!lineup || !playersNums) continue;

      const authoritative = seasonId !== CURRENT_SEASON_ID || eligibility.get(key(team.id, gameweek.id)) === true;
      if (!authoritative) continue;

      const breakdown = computeLineupBreakdown({
        playersNums,
        statsMap,
        captainNumber: lineup.captain_number == null ? null : Number(lineup.captain_number),
        coachCode: lineup.coach_code || null,
        traitConfig,
      });

      row.totalPoints += Number(breakdown.totalPoints || 0);
      if (String(gameweek.id) === String(currentGameweek.id)) {
        row.gameweekPoints = Number(breakdown.totalPoints || 0);
        row.breakdown = breakdown;
        row.validLineup = true;
      }
    }

    return row;
  });

  rows.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (b.gameweekPoints !== a.gameweekPoints) return b.gameweekPoints - a.gameweekPoints;
    return a.teamName.localeCompare(b.teamName, "es");
  });

  rows.forEach((row, index) => {
    row.position = index + 1;
  });

  const myTeam = rows.find((row) => row.userId === userId) || null;
  const actionPlayer = snapshot.lastAction?.player_id == null
    ? null
    : snapshot.players.find((player) => String(player.id) === String(snapshot.lastAction.player_id)) || null;

  return {
    available: true,
    label: phaseLabel(snapshot.phase),
    phase: snapshot.phase,
    gameweek: currentGameweek,
    rows,
    myTeam,
    actionPlayer,
    updatedAt: new Date().toISOString(),
  };
}
