import { LIVE_EVENT, LIVE_STATS_CONFIG } from "./domain.js";
import {
  createInitialGameState,
  deriveGameState,
  getLineupPlusMinusSummary,
  stopClock,
} from "./stateEngine.js";
import {
  loadLiveEvents,
  loadLiveRuntime,
  loadLiveSetup,
  saveLiveEvents,
  saveLiveRuntime,
} from "./localSession.js";

const MINUTES_BLOCK_TOLERANCE_MS = 30_000;
const MINUTES_WARNING_TOLERANCE_MS = 5_000;
const LINEUP_TOLERANCE_MS = 2_000;

function asNumber(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function eventSequence(event) {
  return asNumber(event?.server_sequence || event?.client_sequence || 0);
}

function activeEvents(events) {
  return (Array.isArray(events) ? events : [])
    .filter((event) => !event?.is_void)
    .sort((a, b) => eventSequence(a) - eventSequence(b));
}

function restoreRuntime(state, runtime) {
  if (!runtime) return stopClock(state);

  const players = Object.fromEntries(
    Object.entries(state.players || {}).map(([id, player]) => [
      id,
      {
        ...player,
        playedMs: Math.max(
          0,
          asNumber(runtime.playedMs?.[id] ?? player.playedMs)
        ),
      },
    ])
  );

  return stopClock({
    ...state,
    players,
    period: Math.max(1, asNumber(runtime.period || state.period)),
    clockMs: Math.max(0, asNumber(runtime.clockMs ?? state.clockMs)),
  });
}

function expectedGameDurationMs(period) {
  const safePeriod = Math.max(1, asNumber(period));
  const regulation = 4 * LIVE_STATS_CONFIG.regulationPeriodMs;
  const overtimes = Math.max(0, safePeriod - 4);
  return regulation + overtimes * LIVE_STATS_CONFIG.overtimePeriodMs;
}

function playerRows(state) {
  return Object.values(state?.players || {})
    .map((player) => ({
      id: player.id,
      number: String(player.number ?? ""),
      name: player.name || "Jugador",
      status: player.status,
      playedMs: Math.max(0, asNumber(player.playedMs)),
      stats: { ...(player.stats || {}) },
      foulKinds: [...(player.foulKinds || [])],
    }))
    .sort((a, b) =>
      String(a.number).localeCompare(String(b.number), "es", {
        numeric: true,
        sensitivity: "base",
      })
    );
}

function staffDiscipline(events) {
  const grouped = new Map();
  for (const event of activeEvents(events)) {
    if (event.event_type !== LIVE_EVENT.PF || !event.staff_id) continue;
    const key = String(event.staff_id);
    const current = grouped.get(key) || {
      staffId: key,
      total: 0,
      technical: 0,
      disqualifying: 0,
      foulKinds: {},
    };
    const foulKind = event.foul_kind || "technical";
    current.total += 1;
    current.foulKinds[foulKind] = (current.foulKinds[foulKind] || 0) + 1;
    if (foulKind === "disqualifying") current.disqualifying += 1;
    else current.technical += 1;
    grouped.set(key, current);
  }
  return [...grouped.values()];
}

function fingerprintPayload(snapshot) {
  const eventBits = (snapshot.events || []).map((event) => [
    event.id,
    event.client_id,
    event.client_sequence,
    event.event_type,
    event.player_id,
    event.related_player_id,
    event.staff_id,
    event.foul_kind,
    Boolean(event.is_void),
    event.updated_at || event.client_created_at || "",
    JSON.stringify(event.metadata || {}),
  ]);
  return JSON.stringify({
    matchId: snapshot.setup?.matchId,
    period: snapshot.state?.period,
    clockMs: snapshot.state?.clockMs,
    playedMs: Object.fromEntries(
      Object.entries(snapshot.state?.players || {}).map(([id, player]) => [
        id,
        Math.max(0, Math.round(asNumber(player.playedMs))),
      ])
    ),
    events: eventBits,
  });
}

function simpleHash(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function makeIssue(level, code, title, detail) {
  return { level, code, title, detail };
}

function validatePlayerMath(player, issues) {
  const stats = player.stats || {};
  const ftm = asNumber(stats.ftm);
  const fta = asNumber(stats.fta);
  const twoPm = asNumber(stats.two_pm);
  const twoPa = asNumber(stats.two_pa);
  const threePm = asNumber(stats.three_pm);
  const threePa = asNumber(stats.three_pa);
  const fgm = asNumber(stats.fgm);
  const fga = asNumber(stats.fga);
  const pts = asNumber(stats.pts);

  if (ftm > fta || twoPm > twoPa || threePm > threePa || fgm > fga) {
    issues.push(makeIssue(
      "error",
      `shots-made-attempted-${player.id}`,
      `Tiros incoherentes de ${player.name}`,
      "Hay más tiros anotados que intentados. Corrige las acciones antes de publicar."
    ));
  }

  if (fgm !== twoPm + threePm || fga !== twoPa + threePa) {
    issues.push(makeIssue(
      "error",
      `fg-split-${player.id}`,
      `Totales de tiro incoherentes de ${player.name}`,
      "FGM/FGA no coincide con la suma de tiros de 2 y de 3."
    ));
  }

  const expectedPts = ftm + 2 * twoPm + 3 * threePm;
  if (pts !== expectedPts) {
    issues.push(makeIssue(
      "error",
      `points-formula-${player.id}`,
      `Puntos incoherentes de ${player.name}`,
      `El box score suma ${pts} puntos pero sus tiros producen ${expectedPts}.`
    ));
  }
}

export function validateLiveReview(snapshot) {
  const issues = [];
  if (!snapshot?.setup || !snapshot?.state) {
    return [makeIssue(
      "error",
      "missing-session",
      "No hay una sesión Live válida",
      "No se puede revisar ni publicar un partido sin sesión Live."
    )];
  }

  const { setup, state, events, players, lineupSummary } = snapshot;
  const active = activeEvents(events);
  const currentPeriod = Math.max(1, asNumber(state.period));
  const currentPeriodEnd = [...active]
    .reverse()
    .find((event) =>
      event.event_type === LIVE_EVENT.PERIOD_END &&
      asNumber(event.period) === currentPeriod
    );
  const finalEndSequence = currentPeriodEnd ? eventSequence(currentPeriodEnd) : null;

  if (!setup.matchId) {
    issues.push(makeIssue(
      "error",
      "missing-match-id",
      "Falta la identidad persistente del partido",
      "Vuelve a Live Stats para que la sesión quede sincronizada correctamente."
    ));
  }

  if (state.clockRunning) {
    issues.push(makeIssue(
      "error",
      "clock-running",
      "El reloj sigue en marcha",
      "Pausa el cronómetro antes de revisar el resultado final."
    ));
  }

  if (currentPeriod < 4) {
    issues.push(makeIssue(
      "error",
      "regulation-not-finished",
      "El partido aún no ha llegado al final del cuarto periodo",
      `El estado actual está en Q${currentPeriod}.`
    ));
  }

  if (state.clockMs > 0) {
    issues.push(makeIssue(
      "error",
      "clock-not-zero",
      "El periodo final no está en 0:00",
      "Cierra el periodo correctamente desde el panel RELOJ antes de continuar."
    ));
  }

  if (!currentPeriodEnd) {
    issues.push(makeIssue(
      "error",
      "period-not-closed",
      "El último periodo no está cerrado",
      "Registra el fin del periodo desde el panel RELOJ antes de revisar."
    ));
  }

  if (asNumber(state.score?.gazalbide) === asNumber(state.score?.opponent)) {
    issues.push(makeIssue(
      "error",
      "final-score-tied",
      "El partido termina empatado",
      "Debe jugarse otra prórroga antes de poder publicar el partido."
    ));
  }

  if ((state.pendingSubstitutionFor || []).length > 0) {
    issues.push(makeIssue(
      "error",
      "pending-substitution",
      "Queda un cambio obligatorio pendiente",
      "Hay un jugador eliminado/descalificado que todavía ocupa una plaza de pista."
    ));
  }

  if ((state.onCourtIds || []).length !== LIVE_STATS_CONFIG.maxOnCourt) {
    issues.push(makeIssue(
      "error",
      "invalid-final-lineup",
      "El quinteto final no contiene cinco jugadores",
      "Revisa las sustituciones antes de publicar."
    ));
  }

  if (finalEndSequence != null) {
    const eventsAfterEnd = active.filter((event) =>
      event.subject !== "system" && eventSequence(event) > finalEndSequence
    );
    if (eventsAfterEnd.length > 0) {
      issues.push(makeIssue(
        "error",
        "events-after-final-end",
        "Hay acciones registradas después del fin del partido",
        `Se han encontrado ${eventsAfterEnd.length} acciones posteriores a PERIOD_END.`
      ));
    }
  }

  const playerPoints = players.reduce((sum, player) => sum + asNumber(player.stats?.pts), 0);
  if (playerPoints !== asNumber(state.score?.gazalbide)) {
    issues.push(makeIssue(
      "error",
      "score-player-points",
      "El marcador de Gazalbide no coincide con el box score",
      `Marcador: ${asNumber(state.score?.gazalbide)} · suma de jugadores: ${playerPoints}.`
    ));
  }

  players.forEach((player) => validatePlayerMath(player, issues));

  const expectedDuration = expectedGameDurationMs(currentPeriod);
  const expectedPlayerMinutes = expectedDuration * LIVE_STATS_CONFIG.maxOnCourt;
  const actualPlayerMinutes = players.reduce((sum, player) => sum + asNumber(player.playedMs), 0);
  const minutesDifference = Math.abs(expectedPlayerMinutes - actualPlayerMinutes);

  if (minutesDifference > MINUTES_BLOCK_TOLERANCE_MS) {
    issues.push(makeIssue(
      "error",
      "player-minutes-total",
      "Los minutos totales no cuadran",
      `La diferencia acumulada es de ${(minutesDifference / 1000).toFixed(1)} s respecto a los cinco jugadores en pista durante todo el partido.`
    ));
  } else if (minutesDifference > MINUTES_WARNING_TOLERANCE_MS) {
    issues.push(makeIssue(
      "warning",
      "player-minutes-small-difference",
      "Hay una pequeña diferencia en los minutos",
      `La diferencia acumulada es de ${(minutesDifference / 1000).toFixed(1)} s. Revísala antes de publicar si no es intencionada.`
    ));
  }

  const lineupDuration = (lineupSummary || []).reduce(
    (sum, lineup) => sum + asNumber(lineup.durationMs),
    0
  );
  const lineupDifference = Math.abs(expectedDuration - lineupDuration);
  if (lineupDifference > LINEUP_TOLERANCE_MS) {
    issues.push(makeIssue(
      "error",
      "lineup-stint-duration",
      "Los stints de quinteto no cubren todo el partido",
      `Hay una diferencia de ${(lineupDifference / 1000).toFixed(1)} s entre el tiempo de partido y los stints.`
    ));
  }

  const playerPlusMinus = players.reduce(
    (sum, player) => sum + asNumber(player.stats?.plus_minus),
    0
  );
  const expectedPlusMinus =
    (asNumber(state.score?.gazalbide) - asNumber(state.score?.opponent)) *
    LIVE_STATS_CONFIG.maxOnCourt;
  if (playerPlusMinus !== expectedPlusMinus) {
    issues.push(makeIssue(
      "error",
      "plus-minus-total",
      "El +/- acumulado no cuadra con el marcador",
      `Suma de jugadores: ${playerPlusMinus} · esperado: ${expectedPlusMinus}.`
    ));
  }

  const voidCount = (events || []).filter((event) => event?.is_void).length;
  if (voidCount > 0) {
    issues.push(makeIssue(
      "info",
      "void-events",
      "El partido contiene acciones anuladas",
      `${voidCount} evento${voidCount === 1 ? "" : "s"} queda${voidCount === 1 ? "" : "n"} conservado${voidCount === 1 ? "" : "s"} en auditoría y no se contabiliza${voidCount === 1 ? "" : "n"}.`
    ));
  }

  return issues;
}

export function buildLiveReviewSnapshot() {
  const setup = loadLiveSetup();
  if (!setup) return null;

  const events = loadLiveEvents();
  const runtime = loadLiveRuntime();
  const initial = createInitialGameState({
    roster: setup.roster,
    starterIds: setup.starterIds,
    matchDate: setup.matchDate,
  });
  const derived = deriveGameState(initial, events);
  const state = restoreRuntime(derived, runtime);
  const players = playerRows(state);
  const lineupSummary = getLineupPlusMinusSummary(state);
  const staff = staffDiscipline(events);
  const active = activeEvents(events);

  const snapshot = {
    setup,
    events,
    runtime,
    state,
    players,
    lineupSummary,
    staffDiscipline: staff,
    activeEventCount: active.length,
    voidEventCount: (events || []).filter((event) => event?.is_void).length,
    expectedGameDurationMs: expectedGameDurationMs(state.period),
  };

  snapshot.sourceFingerprint = simpleHash(fingerprintPayload(snapshot));
  snapshot.issues = validateLiveReview(snapshot);
  snapshot.blockingIssues = snapshot.issues.filter((issue) => issue.level === "error");
  snapshot.warningIssues = snapshot.issues.filter((issue) => issue.level === "warning");
  snapshot.readyToPublish = snapshot.blockingIssues.length === 0;

  snapshot.publicationDraft = {
    sourceFingerprint: snapshot.sourceFingerprint,
    matchId: setup.matchId,
    season: setup.seasonId,
    date: setup.matchDate,
    opponent: setup.opponent,
    gazalSide: setup.gazalSide || "home",
    period: state.period,
    overtimeCount: Math.max(0, asNumber(state.period) - 4),
    score: {
      gazalbide: asNumber(state.score?.gazalbide),
      opponent: asNumber(state.score?.opponent),
    },
    playerRows: players.map((player) => ({
      playerId: player.id,
      number: player.number,
      name: player.name,
      playedMs: player.playedMs,
      stats: { ...player.stats },
      foulKinds: [...player.foulKinds],
    })),
    lineupRows: lineupSummary.map((lineup) => ({ ...lineup })),
    staffDiscipline: staff.map((item) => ({ ...item })),
    activeEventCount: snapshot.activeEventCount,
    voidEventCount: snapshot.voidEventCount,
  };

  return snapshot;
}

export function reopenFinalPeriodForCorrection() {
  const snapshot = buildLiveReviewSnapshot();
  if (!snapshot) throw new Error("No hay un partido Live que reabrir.");
  if (snapshot.state.clockRunning) {
    throw new Error("Pausa el reloj antes de reabrir el periodo final.");
  }

  const currentPeriod = asNumber(snapshot.state.period);
  const ordered = activeEvents(snapshot.events);
  const finalEnd = [...ordered].reverse().find((event) =>
    event.event_type === LIVE_EVENT.PERIOD_END &&
    asNumber(event.period) === currentPeriod
  );
  if (!finalEnd) {
    throw new Error("El periodo final ya está abierto para correcciones.");
  }

  const finalEndSequence = eventSequence(finalEnd);
  const laterPeriodStart = ordered.some((event) =>
    event.event_type === LIVE_EVENT.PERIOD_START &&
    eventSequence(event) > finalEndSequence
  );
  if (laterPeriodStart) {
    throw new Error("No se puede reabrir este periodo porque ya existe uno posterior.");
  }

  const now = new Date().toISOString();
  const nextEvents = snapshot.events.map((event) =>
    event.id === finalEnd.id
      ? {
          ...event,
          is_void: true,
          voided_at: now,
          void_reason: "review_reopen_period",
          metadata: {
            ...(event.metadata || {}),
            reopenedFromReviewAt: now,
          },
        }
      : event
  );

  saveLiveEvents(nextEvents);
  saveLiveRuntime({
    ...snapshot.state,
    clockRunning: false,
  });

  return { period: currentPeriod };
}
