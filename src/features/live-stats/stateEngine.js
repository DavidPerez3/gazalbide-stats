import {
  LIVE_EVENT,
  LIVE_STATS_CONFIG,
  eventStopsClock,
  getPlayerStatDelta,
  getScoreDelta,
  getTeamFoulDelta,
} from "./domain.js";
import {
  PLAYER_STATUS,
  deriveDisciplinaryStatus,
  getRuleProfileForDate,
  isPlayerEligible,
  validateLineup,
  validateRoster,
} from "./rules.js";
import { getFoulStatDelta } from "./foulStats.js";

const EMPTY_STATS = Object.freeze({
  pts: 0,
  ftm: 0,
  fta: 0,
  two_pm: 0,
  two_pa: 0,
  three_pm: 0,
  three_pa: 0,
  fgm: 0,
  fga: 0,
  oreb: 0,
  dreb: 0,
  reb: 0,
  ast: 0,
  tov: 0,
  stl: 0,
  blk: 0,
  pf: 0,
  pfd: 0,
  plus_minus: 0,
  pf_defensive: 0,
  pf_offensive: 0,
  pf_technical: 0,
  pf_unsportsmanlike: 0,
  pf_disqualifying: 0,
  pf_technical_cat_1: 0,
  pf_technical_cat_2: 0,
  pf_disruptive: 0,
  pf_flagrant: 0,
});

const STAFF_FOUL_KINDS = new Set([
  "technical",
  "technical_cat_1",
  "technical_cat_2",
  "disqualifying",
]);

function addDelta(base, delta) {
  if (!delta) return base;
  const next = { ...base };
  for (const [key, value] of Object.entries(delta)) {
    next[key] = (next[key] || 0) + value;
  }
  return next;
}

function normaliseRosterPlayer(player) {
  return {
    id: player.id,
    number: String(player.number ?? player.jersey_number ?? ""),
    name: player.name ?? player.player_name ?? "",
  };
}

function periodDurationMs(period) {
  return Number(period || 1) <= 4
    ? LIVE_STATS_CONFIG.regulationPeriodMs
    : LIVE_STATS_CONFIG.overtimePeriodMs;
}

function clampPeriodClock(period, clockMs) {
  return Math.min(
    periodDurationMs(period),
    Math.max(0, Math.round(Number(clockMs || 0)))
  );
}

function lineupKey(lineupIds) {
  return [...(lineupIds || [])].map(String).sort().join("|");
}

function makeLineupStint(sequence, period, lineupIds, startClockMs) {
  return {
    sequence,
    period: Number(period || 1),
    lineupIds: [...lineupIds],
    lineupKey: lineupKey(lineupIds),
    startClockMs: clampPeriodClock(period, startClockMs),
    endClockMs: null,
    durationMs: null,
    gazalbidePts: 0,
    opponentPts: 0,
    plusMinus: 0,
    endReason: null,
  };
}

function findOpenStintIndex(stints) {
  for (let index = (stints || []).length - 1; index >= 0; index -= 1) {
    if (stints[index]?.endClockMs == null) return index;
  }
  return -1;
}

function closeOpenLineupStint(state, endClockMs, reason) {
  const stints = [...(state.lineupStints || [])];
  const index = findOpenStintIndex(stints);
  if (index < 0) return state;

  const current = stints[index];
  const safeEndClock = clampPeriodClock(current.period, endClockMs);
  const safeStartClock = clampPeriodClock(current.period, current.startClockMs);
  stints[index] = {
    ...current,
    endClockMs: safeEndClock,
    durationMs: Math.max(0, safeStartClock - safeEndClock),
    endReason: reason || "lineup_change",
  };

  return { ...state, lineupStints: stints };
}

function openLineupStint(state, period, lineupIds, startClockMs) {
  if (!Array.isArray(lineupIds) || lineupIds.length !== LIVE_STATS_CONFIG.maxOnCourt) {
    return state;
  }
  if (!lineupIds.every((playerId) => state.players[playerId])) return state;

  const sequence = Math.max(1, Number(state.nextLineupStintSequence || 1));
  return {
    ...state,
    lineupStints: [
      ...(state.lineupStints || []),
      makeLineupStint(sequence, period, lineupIds, startClockMs),
    ],
    nextLineupStintSequence: sequence + 1,
  };
}

function applyScoreImpactToLineup(state, scoreDelta) {
  const gazalbidePts = Number(scoreDelta?.gazalbide || 0);
  const opponentPts = Number(scoreDelta?.opponent || 0);
  if (!gazalbidePts && !opponentPts) return state;

  const differential = gazalbidePts - opponentPts;
  const players = { ...state.players };

  for (const playerId of state.onCourtIds) {
    const player = players[playerId];
    if (!player) continue;
    players[playerId] = {
      ...player,
      stats: {
        ...player.stats,
        plus_minus: Number(player.stats?.plus_minus || 0) + differential,
      },
    };
  }

  const stints = [...(state.lineupStints || [])];
  const openIndex = findOpenStintIndex(stints);
  if (openIndex >= 0) {
    const stint = stints[openIndex];
    stints[openIndex] = {
      ...stint,
      gazalbidePts: Number(stint.gazalbidePts || 0) + gazalbidePts,
      opponentPts: Number(stint.opponentPts || 0) + opponentPts,
      plusMinus: Number(stint.plusMinus || 0) + differential,
    };
  }

  return { ...state, players, lineupStints: stints };
}

function sameLineup(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((playerId, index) => String(playerId) === String(b[index]));
}

function updateStintsAfterEvent(previousState, nextState, event, eventClockMs) {
  if (event.event_type === LIVE_EVENT.PERIOD_START) {
    let state = closeOpenLineupStint(nextState, 0, "period_end");
    state = openLineupStint(state, nextState.period, nextState.onCourtIds, nextState.clockMs);
    return state;
  }

  if (event.event_type === LIVE_EVENT.PERIOD_END) {
    return closeOpenLineupStint(nextState, eventClockMs, "period_end");
  }

  if (!sameLineup(previousState.onCourtIds, nextState.onCourtIds)) {
    let state = closeOpenLineupStint(nextState, eventClockMs, "substitution");
    state = openLineupStint(state, nextState.period, nextState.onCourtIds, eventClockMs);
    return state;
  }

  return nextState;
}

function isStaffFoul(event) {
  return (
    event?.event_type === LIVE_EVENT.PF &&
    Boolean(event?.staff_id ?? event?.metadata?.staffId)
  );
}

function validateStaffFoul(event) {
  const staffId = event?.staff_id ?? event?.metadata?.staffId;
  const foulKind = event?.foul_kind ?? event?.metadata?.foulKind;

  if (!staffId) {
    throw new Error("La falta de staff requiere un miembro del staff.");
  }
  if (event?.player_id) {
    throw new Error("Una falta no puede pertenecer a un jugador y al staff a la vez.");
  }
  if (!STAFF_FOUL_KINDS.has(foulKind)) {
    throw new Error("El staff solo admite técnica o descalificante.");
  }
}

export function createInitialGameState({ roster, starterIds, matchDate, period = 1 }) {
  const cleanRoster = (roster || []).map(normaliseRosterPlayer);
  const rosterValidation = validateRoster(cleanRoster);
  if (!rosterValidation.ok) throw new Error(rosterValidation.reason);

  const rosterIds = cleanRoster.map((player) => player.id);
  if (!Array.isArray(starterIds) || starterIds.length !== LIVE_STATS_CONFIG.maxOnCourt) {
    throw new Error(`El quinteto inicial debe tener exactamente ${LIVE_STATS_CONFIG.maxOnCourt} jugadores.`);
  }

  const lineupValidation = validateLineup(starterIds, rosterIds);
  if (!lineupValidation.ok) throw new Error(lineupValidation.reason);

  const players = Object.fromEntries(
    cleanRoster.map((player) => [
      player.id,
      {
        ...player,
        status: starterIds.includes(player.id) ? PLAYER_STATUS.ON_COURT : PLAYER_STATUS.BENCH,
        stats: { ...EMPTY_STATS },
        foulKinds: [],
        playedMs: 0,
      },
    ])
  );

  return {
    ruleProfile: getRuleProfileForDate(matchDate),
    period,
    clockMs: periodDurationMs(period),
    clockRunning: false,
    score: { gazalbide: 0, opponent: 0 },
    teamFouls: {},
    players,
    // Order is meaningful: these five ids are the five visual court slots.
    onCourtIds: [...starterIds],
    lineupStints: [makeLineupStint(1, period, starterIds, periodDurationMs(period))],
    nextLineupStintSequence: 2,
    pendingSubstitutionFor: [],
    lastEvent: null,
  };
}

function ensureKnownPlayer(state, playerId) {
  if (!playerId || !state.players[playerId]) {
    throw new Error("El evento requiere un jugador convocado de Gazalbide.");
  }
}

// Legacy support for local sessions created before atomic substitutions.
function applySubOut(state, playerId) {
  ensureKnownPlayer(state, playerId);
  if (!state.onCourtIds.includes(playerId)) return state;

  const onCourtIds = state.onCourtIds.filter((id) => id !== playerId);
  return {
    ...state,
    onCourtIds,
    players: {
      ...state.players,
      [playerId]: {
        ...state.players[playerId],
        status: isPlayerEligible(state.players[playerId].status)
          ? PLAYER_STATUS.BENCH
          : state.players[playerId].status,
      },
    },
  };
}

function applySubIn(state, playerId) {
  ensureKnownPlayer(state, playerId);
  const player = state.players[playerId];
  if (!isPlayerEligible(player.status)) {
    throw new Error("El jugador está eliminado o descalificado y no puede volver a pista.");
  }
  if (state.onCourtIds.includes(playerId)) return state;
  if (state.onCourtIds.length >= LIVE_STATS_CONFIG.maxOnCourt) {
    throw new Error("Ya hay 5 jugadores en pista. Debe salir uno antes de que entre otro.");
  }

  return {
    ...state,
    onCourtIds: [...state.onCourtIds, playerId],
    pendingSubstitutionFor:
      state.pendingSubstitutionFor.length > 0
        ? state.pendingSubstitutionFor.slice(1)
        : state.pendingSubstitutionFor,
    players: {
      ...state.players,
      [playerId]: { ...player, status: PLAYER_STATUS.ON_COURT },
    },
  };
}

function applySubstitution(state, event) {
  const incomingId = event.player_id;
  const outgoingId = event.related_player_id ?? event.metadata?.outgoingPlayerId;
  ensureKnownPlayer(state, incomingId);
  ensureKnownPlayer(state, outgoingId);

  if (incomingId === outgoingId) return state;

  const incoming = state.players[incomingId];
  const outgoing = state.players[outgoingId];
  const slotIndex = state.onCourtIds.indexOf(outgoingId);

  if (slotIndex < 0) {
    throw new Error("El jugador que sale no está actualmente en pista.");
  }
  if (state.onCourtIds.includes(incomingId)) {
    throw new Error("El jugador que entra ya está en pista.");
  }
  if (!isPlayerEligible(incoming.status)) {
    throw new Error("El jugador que entra está eliminado o descalificado.");
  }

  const onCourtIds = [...state.onCourtIds];
  onCourtIds[slotIndex] = incomingId;

  return {
    ...state,
    onCourtIds,
    pendingSubstitutionFor: state.pendingSubstitutionFor.filter((id) => id !== outgoingId),
    players: {
      ...state.players,
      [incomingId]: { ...incoming, status: PLAYER_STATUS.ON_COURT },
      [outgoingId]: {
        ...outgoing,
        status: isPlayerEligible(outgoing.status) ? PLAYER_STATUS.BENCH : outgoing.status,
      },
    },
  };
}

function applyPlayerFoul(state, event) {
  ensureKnownPlayer(state, event.player_id);
  const foulKind = event.foul_kind ?? event.metadata?.foulKind;
  if (!foulKind) throw new Error("Debes indicar el tipo de falta del jugador.");

  const player = state.players[event.player_id];
  const stats = addDelta(player.stats, getFoulStatDelta(foulKind));
  const foulKinds = [...player.foulKinds, foulKind];
  const disciplinaryStatus = deriveDisciplinaryStatus({
    totalFouls: stats.pf,
    foulKinds,
    profile: state.ruleProfile,
  });

  let pendingSubstitutionFor = state.pendingSubstitutionFor;
  let status = player.status;

  if (disciplinaryStatus) {
    status = disciplinaryStatus;
    // Keep the player occupying the visual court slot until a replacement is
    // dragged onto them. This preserves the five fixed slots and makes the
    // mandatory substitution explicit.
    if (state.onCourtIds.includes(event.player_id)) {
      pendingSubstitutionFor = [...new Set([...pendingSubstitutionFor, event.player_id])];
    }
  }

  return {
    ...state,
    pendingSubstitutionFor,
    players: {
      ...state.players,
      [event.player_id]: { ...player, stats, foulKinds, status },
    },
  };
}

function applyPlayerStat(state, event) {
  ensureKnownPlayer(state, event.player_id);
  const delta = getPlayerStatDelta(event.event_type);
  if (!delta) return state;
  const player = state.players[event.player_id];
  return {
    ...state,
    players: {
      ...state.players,
      [event.player_id]: { ...player, stats: addDelta(player.stats, delta) },
    },
  };
}

export function addPlayedTime(state, elapsedMs) {
  const safeElapsed = Math.max(0, Number(elapsedMs || 0));
  if (!safeElapsed) return state;

  const players = { ...state.players };
  for (const playerId of state.onCourtIds) {
    const player = players[playerId];
    if (!player || !isPlayerEligible(player.status)) continue;
    players[playerId] = {
      ...player,
      playedMs: Math.max(0, Number(player.playedMs || 0) + safeElapsed),
    };
  }
  return { ...state, players };
}

export function adjustPlayedTimeForCurrentLineup(state, deltaMs) {
  const correction = Number(deltaMs || 0);
  if (!correction) return state;

  const players = { ...state.players };
  for (const playerId of state.onCourtIds) {
    const player = players[playerId];
    if (!player) continue;
    players[playerId] = {
      ...player,
      playedMs: Math.max(0, Number(player.playedMs || 0) + correction),
    };
  }
  return { ...state, players };
}

export function applyLiveEvent(previousState, event) {
  if (!event || event.is_void) return previousState;
  let state = previousState;
  const staffFoul = isStaffFoul(event);

  if (event.event_type === LIVE_EVENT.SUBSTITUTION) {
    state = applySubstitution(state, event);
  } else if (event.event_type === LIVE_EVENT.SUB_OUT) {
    state = applySubOut(state, event.player_id);
  } else if (event.event_type === LIVE_EVENT.SUB_IN) {
    state = applySubIn(state, event.player_id);
  } else if (event.event_type === LIVE_EVENT.PF) {
    if (staffFoul) {
      // Staff discipline is an event-level fact only. It must never mutate a
      // player's box score, foul count, eligibility or substitution state.
      validateStaffFoul(event);
    } else {
      state = applyPlayerFoul(state, event);
    }
  } else if (event.subject === "gazalbide" || event.player_id) {
    state = applyPlayerStat(state, event);
  }

  const scoreDelta = getScoreDelta(event.event_type);
  // Staff technical/disqualifying events are deliberately not treated as a
  // player's team-foul increment. Team-foul/bonus rules are finalized in the
  // dedicated Live Stats rules block rather than inferred from staff events.
  const foulDelta = staffFoul
    ? { gazalbide: 0, opponent: 0 }
    : getTeamFoulDelta(event.event_type);
  const period = event.period ?? state.period;
  const currentPeriodFouls = state.teamFouls[period] || { gazalbide: 0, opponent: 0 };
  const eventClockMs = Number.isFinite(event.clock_ms) ? event.clock_ms : state.clockMs;
  const isSystemEvent = event.subject === "system";

  state = {
    ...state,
    period,
    clockMs:
      event.event_type === LIVE_EVENT.CLOCK_SET && Number.isFinite(event.metadata?.clockMs)
        ? event.metadata.clockMs
        : eventClockMs,
    clockRunning: eventStopsClock(event.event_type) ? false : state.clockRunning,
    score: addDelta(state.score, scoreDelta),
    teamFouls: {
      ...state.teamFouls,
      [period]: addDelta(currentPeriodFouls, foulDelta),
    },
    // Clock corrections and period markers are system events; they should not
    // replace the spectator-facing "última acción".
    lastEvent: isSystemEvent ? state.lastEvent : event,
  };

  // +/- belongs to the five players who are actually on court when the score
  // changes. Because substitutions are separate zero-score events, the lineup
  // in state here is the correct lineup for every scoring event.
  state = applyScoreImpactToLineup(state, scoreDelta);
  state = updateStintsAfterEvent(previousState, state, event, eventClockMs);

  return state;
}

export function deriveGameState(initialState, events = []) {
  return events
    .filter((event) => !event.is_void)
    .sort((a, b) => Number(a.client_sequence || 0) - Number(b.client_sequence || 0))
    .reduce(applyLiveEvent, initialState);
}

export function getLineupPlusMinusSummary(state) {
  if (!state) return [];

  const summaries = new Map();
  for (const stint of state.lineupStints || []) {
    const endClockMs = stint.endClockMs == null
      ? stint.period === state.period
        ? clampPeriodClock(stint.period, state.clockMs)
        : 0
      : clampPeriodClock(stint.period, stint.endClockMs);
    const startClockMs = clampPeriodClock(stint.period, stint.startClockMs);
    const durationMs = stint.durationMs == null
      ? Math.max(0, startClockMs - endClockMs)
      : Math.max(0, Number(stint.durationMs || 0));

    const key = stint.lineupKey || lineupKey(stint.lineupIds);
    const current = summaries.get(key) || {
      lineupKey: key,
      lineupIds: [...(stint.lineupIds || [])],
      stints: 0,
      durationMs: 0,
      gazalbidePts: 0,
      opponentPts: 0,
      plusMinus: 0,
    };

    current.stints += 1;
    current.durationMs += durationMs;
    current.gazalbidePts += Number(stint.gazalbidePts || 0);
    current.opponentPts += Number(stint.opponentPts || 0);
    current.plusMinus += Number(stint.plusMinus || 0);
    summaries.set(key, current);
  }

  return [...summaries.values()].sort((a, b) => {
    if (b.durationMs !== a.durationMs) return b.durationMs - a.durationMs;
    return b.plusMinus - a.plusMinus;
  });
}

export function canStartClock(state) {
  return (
    state.onCourtIds.length === LIVE_STATS_CONFIG.maxOnCourt &&
    state.pendingSubstitutionFor.length === 0 &&
    state.onCourtIds.every((id) => isPlayerEligible(state.players[id]?.status))
  );
}

export function startClock(state) {
  if (!canStartClock(state)) {
    throw new Error("Debe haber exactamente 5 jugadores elegibles en pista antes de arrancar el reloj.");
  }
  return { ...state, clockRunning: true };
}

export function stopClock(state) {
  return { ...state, clockRunning: false };
}
