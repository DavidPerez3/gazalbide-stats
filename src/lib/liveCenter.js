import { supabase } from "./supabaseClient.js";
import { LIVE_EVENT, LIVE_STATS_CONFIG } from "../features/live-stats/domain.js";
import {
  createInitialGameState,
  deriveGameState,
  getLineupPlusMinusSummary,
} from "../features/live-stats/stateEngine.js";

const BEST_LINEUP_MIN_MS = 3 * 60 * 1000;

function num(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normaliseOpponent(value) {
  return String(value || "").trim().toLocaleLowerCase("es");
}

function eventOrder(event) {
  return num(event?.server_sequence || event?.client_sequence || 0);
}

function activeEvents(events) {
  return (events || [])
    .filter((event) => !event?.is_void)
    .sort((a, b) => eventOrder(a) - eventOrder(b));
}

export function withEfficiency(stats = {}) {
  const enriched = { ...stats };
  const eff =
    num(enriched.pts) +
    num(enriched.reb) +
    num(enriched.ast) +
    num(enriched.stl) +
    num(enriched.blk) -
    (num(enriched.fga) - num(enriched.fgm)) -
    (num(enriched.fta) - num(enriched.ftm)) -
    num(enriched.tov);
  const pir = eff + num(enriched.pfd) - num(enriched.pf);
  return { ...enriched, eff, pir };
}

function scoreDelta(eventType) {
  switch (eventType) {
    case LIVE_EVENT.FT_MADE: return { gazalbide: 1, opponent: 0 };
    case LIVE_EVENT.TWO_MADE: return { gazalbide: 2, opponent: 0 };
    case LIVE_EVENT.THREE_MADE: return { gazalbide: 3, opponent: 0 };
    case LIVE_EVENT.OPP_SCORE_1: return { gazalbide: 0, opponent: 1 };
    case LIVE_EVENT.OPP_SCORE_2: return { gazalbide: 0, opponent: 2 };
    case LIVE_EVENT.OPP_SCORE_3: return { gazalbide: 0, opponent: 3 };
    default: return { gazalbide: 0, opponent: 0 };
  }
}

function buildPeriodScores(events, maxPeriod) {
  const rows = Array.from({ length: Math.max(1, num(maxPeriod || 1)) }, (_, index) => ({
    period: index + 1,
    gazalbide: 0,
    opponent: 0,
  }));

  for (const event of activeEvents(events)) {
    const period = Math.max(1, num(event.period || 1));
    while (rows.length < period) {
      rows.push({ period: rows.length + 1, gazalbide: 0, opponent: 0 });
    }
    const delta = scoreDelta(event.event_type);
    rows[period - 1].gazalbide += delta.gazalbide;
    rows[period - 1].opponent += delta.opponent;
  }
  return rows;
}

function foulLabel(kind) {
  const labels = {
    defensive: "falta defensiva",
    offensive: "falta ofensiva",
    technical: "técnica",
    technical_cat_1: "técnica cat. 1",
    technical_cat_2: "técnica cat. 2",
    unsportsmanlike: "antideportiva",
    disruptive: "disruptiva",
    flagrant: "flagrante",
    disqualifying: "descalificante",
  };
  return labels[kind] || "falta";
}

export function describeLiveCenterEvent(event, rosterById = new Map()) {
  const player = event?.player_id != null ? rosterById.get(String(event.player_id)) : null;
  const related = event?.related_player_id != null
    ? rosterById.get(String(event.related_player_id))
    : null;
  const name = player ? `#${player.number} ${player.name}` : "Gazalbide";

  switch (event?.event_type) {
    case LIVE_EVENT.FT_MADE: return `${name} +1`;
    case LIVE_EVENT.FT_MISSED: return `${name} falla TL`;
    case LIVE_EVENT.TWO_MADE: return `${name} +2`;
    case LIVE_EVENT.TWO_MISSED: return `${name} falla de 2`;
    case LIVE_EVENT.THREE_MADE: return `${name} +3`;
    case LIVE_EVENT.THREE_MISSED: return `${name} falla triple`;
    case LIVE_EVENT.OREB: return `${name} rebote ofensivo`;
    case LIVE_EVENT.DREB: return `${name} rebote defensivo`;
    case LIVE_EVENT.AST: return `${name} asistencia`;
    case LIVE_EVENT.TOV: return `${name} pérdida`;
    case LIVE_EVENT.STL: return `${name} robo`;
    case LIVE_EVENT.BLK: return `${name} tapón`;
    case LIVE_EVENT.PFD: return `${name} recibe falta`;
    case LIVE_EVENT.PF:
      return event?.staff_id ? `Falta de staff · ${foulLabel(event.foul_kind)}` : `${name} · ${foulLabel(event.foul_kind)}`;
    case LIVE_EVENT.SUBSTITUTION:
      return `Cambio · entra ${name}${related ? ` por #${related.number} ${related.name}` : ""}`;
    case LIVE_EVENT.OPP_SCORE_1: return "Rival +1";
    case LIVE_EVENT.OPP_SCORE_2: return "Rival +2";
    case LIVE_EVENT.OPP_SCORE_3: return "Rival +3";
    case LIVE_EVENT.OPP_TEAM_FOUL: return "Falta de equipo rival";
    default: return event?.event_type || "Acción";
  }
}

function mapPublishedLineup(row) {
  return {
    lineupKey: row.lineup_key,
    lineupIds: (row.player_ids || []).map(String),
    stints: num(row.stint_count),
    durationMs: num(row.duration_ms),
    gazalbidePts: num(row.gazal_pts),
    opponentPts: num(row.opp_pts),
    plusMinus: num(row.plus_minus),
  };
}

export function selectBestLineup(lineups, minimumMs = BEST_LINEUP_MIN_MS) {
  const all = (lineups || []).filter((row) => Array.isArray(row.lineupIds) && row.lineupIds.length === 5);
  if (!all.length) return null;

  const qualified = all.filter((row) => num(row.durationMs) >= minimumMs);
  const pool = qualified.length ? qualified : all;
  const sorted = [...pool].sort((a, b) => {
    if (num(b.plusMinus) !== num(a.plusMinus)) return num(b.plusMinus) - num(a.plusMinus);
    const aPer40 = num(a.durationMs) > 0 ? num(a.plusMinus) * 2_400_000 / num(a.durationMs) : -Infinity;
    const bPer40 = num(b.durationMs) > 0 ? num(b.plusMinus) * 2_400_000 / num(b.durationMs) : -Infinity;
    if (bPer40 !== aPer40) return bPer40 - aPer40;
    return num(b.durationMs) - num(a.durationMs);
  });

  const winner = sorted[0];
  return {
    ...winner,
    plusMinusPer40: num(winner.durationMs) > 0
      ? num(winner.plusMinus) * 2_400_000 / num(winner.durationMs)
      : 0,
    sampleQualified: num(winner.durationMs) >= minimumMs,
    minimumMs,
  };
}

function derivePhase(match, state, events) {
  if (match?.status === "published") return "official";
  const active = activeEvents(events);
  if (!active.length) return "pregame";

  const currentPeriod = Math.max(1, num(state?.period || 1));
  const hasPeriodEnd = active.some((event) =>
    event.event_type === LIVE_EVENT.PERIOD_END && num(event.period) === currentPeriod
  );
  const finalClosed =
    currentPeriod >= 4 &&
    num(state?.clockMs) === 0 &&
    hasPeriodEnd &&
    num(state?.score?.gazalbide) !== num(state?.score?.opponent);

  if (finalClosed) return "review";
  return state?.clockRunning ? "live" : "paused";
}

function normaliseRemoteEvent(event) {
  return {
    ...event,
    player_id: event.player_id == null ? null : String(event.player_id),
    related_player_id: event.related_player_id == null ? null : String(event.related_player_id),
  };
}

export async function listPublicLiveMatches(seasonId = null) {
  let query = supabase
    .from("matches")
    .select("id,season,date,opponent,gazal_side,status,created_at,updated_at")
    .eq("status", "live")
    .order("updated_at", { ascending: false });
  if (seasonId) query = query.eq("season", seasonId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function loadLiveCenterSnapshot(matchId) {
  if (!matchId) throw new Error("Falta el partido del Live Center.");

  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select("id,season,date,opponent,gazal_side,status,gazal_pts,opp_pts,q_pf,q_pa,result,publication_version,published_at,created_at,updated_at")
    .eq("id", matchId)
    .maybeSingle();
  if (matchError) throw matchError;
  if (!match) return null;

  const [rosterResult, stateResult, eventsResult] = await Promise.all([
    supabase
      .from("game_roster")
      .select("match_id,player_id,jersey_number,player_name,sort_order,is_starter,is_active,played_ms")
      .eq("match_id", matchId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("live_game_state")
      .select("match_id,period,clock_ms,clock_running,period_duration_ms,overtime_duration_ms,updated_at")
      .eq("match_id", matchId)
      .maybeSingle(),
    supabase
      .from("game_events")
      .select("id,match_id,server_sequence,client_id,client_sequence,client_created_at,period,clock_ms,subject,event_type,player_id,related_player_id,staff_id,foul_kind,is_void,voided_at,void_reason,metadata,created_at,updated_at")
      .eq("match_id", matchId)
      .order("server_sequence", { ascending: true }),
  ]);

  if (rosterResult.error) throw rosterResult.error;
  if (stateResult.error) throw stateResult.error;
  if (eventsResult.error) throw eventsResult.error;

  const rosterRows = rosterResult.data || [];
  const roster = rosterRows.map((row) => ({
    id: String(row.player_id),
    playerId: row.player_id,
    number: String(row.jersey_number),
    name: row.player_name,
    sortOrder: num(row.sort_order),
    isStarter: Boolean(row.is_starter),
    playedMs: Math.max(0, num(row.played_ms)),
  }));
  const rosterById = new Map(roster.map((player) => [player.id, player]));
  const starterIds = roster.filter((player) => player.isStarter).map((player) => player.id);
  const events = (eventsResult.data || []).map(normaliseRemoteEvent);
  const remoteState = stateResult.data;

  let state = null;
  if (roster.length >= 5 && starterIds.length === LIVE_STATS_CONFIG.maxOnCourt) {
    const initial = createInitialGameState({
      roster,
      starterIds,
      matchDate: match.date,
    });
    state = deriveGameState(initial, events);
    const players = Object.fromEntries(
      Object.entries(state.players || {}).map(([id, player]) => [
        id,
        {
          ...player,
          playedMs: rosterById.get(String(id))?.playedMs ?? num(player.playedMs),
        },
      ])
    );
    state = {
      ...state,
      players,
      period: num(remoteState?.period || state.period || 1),
      clockMs: Math.max(0, num(remoteState?.clock_ms ?? state.clockMs)),
      clockRunning: Boolean(remoteState?.clock_running),
    };
  }

  let officialRows = [];
  let publishedLineups = [];
  if (match.status === "published") {
    const [statsResult, lineupResult] = await Promise.all([
      supabase
        .from("player_match_stats")
        .select("*")
        .eq("match_id", matchId),
      supabase
        .from("match_lineup_stats")
        .select("match_id,lineup_key,player_ids,stint_count,duration_ms,gazal_pts,opp_pts,plus_minus")
        .eq("match_id", matchId),
    ]);
    if (statsResult.error) throw statsResult.error;
    if (lineupResult.error) throw lineupResult.error;
    officialRows = statsResult.data || [];
    publishedLineups = (lineupResult.data || []).map(mapPublishedLineup);
  }

  const officialByPlayer = new Map(officialRows.map((row) => [String(row.player_id), row]));
  const players = roster.map((player) => {
    const livePlayer = state?.players?.[player.id];
    const official = officialByPlayer.get(player.id);
    const stats = official
      ? {
          ...official,
          min: num(official.min_seconds),
        }
      : withEfficiency(livePlayer?.stats || {});
    return {
      ...player,
      playedMs: official ? num(official.min_seconds) * 1000 : player.playedMs,
      status: livePlayer?.status || null,
      onCourt: Boolean(state?.onCourtIds?.includes(player.id)),
      stats,
    };
  });

  const liveScore = state?.score || { gazalbide: 0, opponent: 0 };
  const score = match.status === "published"
    ? { gazalbide: num(match.gazal_pts), opponent: num(match.opp_pts) }
    : { gazalbide: num(liveScore.gazalbide), opponent: num(liveScore.opponent) };
  if (state) state = { ...state, score };

  const lineupSummary = match.status === "published"
    ? publishedLineups
    : state
      ? getLineupPlusMinusSummary(state)
      : [];
  const bestLineup = selectBestLineup(lineupSummary);
  const periodScores = match.status === "published" && Array.isArray(match.q_pf)
    ? match.q_pf.map((value, index) => ({
        period: index + 1,
        gazalbide: num(value),
        opponent: num(match.q_pa?.[index]),
      }))
    : buildPeriodScores(events, state?.period || 1);

  const recent = activeEvents(events)
    .filter((event) => event.subject !== "system")
    .slice(-10)
    .reverse()
    .map((event) => ({
      ...event,
      description: describeLiveCenterEvent(event, rosterById),
    }));

  const phase = derivePhase(match, state, events);
  const lastAction = recent[0] || null;

  return {
    match,
    roster,
    players,
    events,
    state,
    score,
    phase,
    periodScores,
    lineupSummary,
    bestLineup,
    recentActions: recent,
    lastAction,
    clock: {
      period: num(state?.period || remoteState?.period || 1),
      clockMs: Math.max(0, num(state?.clockMs ?? remoteState?.clock_ms)),
      running: Boolean(state?.clockRunning ?? remoteState?.clock_running),
      updatedAt: remoteState?.updated_at || match.updated_at || new Date().toISOString(),
    },
  };
}

export function subscribeLiveCenter(matchId, onChange) {
  const channel = supabase
    .channel(`gazalbide-live-center:${matchId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `id=eq.${matchId}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "live_game_state", filter: `match_id=eq.${matchId}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "game_events", filter: `match_id=eq.${matchId}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "game_roster", filter: `match_id=eq.${matchId}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "player_match_stats", filter: `match_id=eq.${matchId}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "match_lineup_stats", filter: `match_id=eq.${matchId}` }, onChange)
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export function matchIdentityMatchesGameweek(match, gameweek) {
  if (!match || !gameweek) return false;
  if (gameweek.match_id && gameweek.match_id === match.id) return true;
  return (
    !gameweek.match_id &&
    gameweek.date === match.date &&
    normaliseOpponent(gameweek.opponent) === normaliseOpponent(match.opponent)
  );
}
