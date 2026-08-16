import { useMemo, useState } from "react";
import { LIVE_EVENT, LIVE_STATS_CONFIG } from "./domain.js";
import {
  adjustPlayedTimeForCurrentLineup,
  createInitialGameState,
  deriveGameState,
} from "./stateEngine.js";
import {
  loadLiveEvents,
  loadLiveRuntime,
  loadLiveSetup,
  saveLiveEvents,
  saveLiveRuntime,
} from "./localSession.js";
import "./liveClockPeriod.css";

function periodDurationMs(period) {
  return Number(period || 1) <= 4
    ? LIVE_STATS_CONFIG.regulationPeriodMs
    : LIVE_STATS_CONFIG.overtimePeriodMs;
}

function periodLabel(period) {
  const safePeriod = Math.max(1, Number(period || 1));
  return safePeriod <= 4 ? `Q${safePeriod}` : `OT${safePeriod - 4}`;
}

function formatClock(ms) {
  const safe = Math.max(0, Math.round(Number(ms || 0)));
  const totalSeconds = Math.ceil(safe / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function makeSystemEvent(eventType, period, clockMs, metadata = {}) {
  return {
    id: crypto.randomUUID(),
    client_created_at: new Date().toISOString(),
    period,
    clock_ms: clockMs,
    subject: "system",
    event_type: eventType,
    player_id: null,
    related_player_id: null,
    staff_id: null,
    foul_kind: null,
    metadata,
    is_void: false,
  };
}

function activeEvents(events) {
  return (events || []).filter((event) => !event?.is_void);
}

function isPeriodClosed(events, period) {
  return activeEvents(events).some(
    (event) =>
      event.event_type === LIVE_EVENT.PERIOD_END &&
      Number(event.period) === Number(period)
  );
}

function rebuildCurrentState(setup, events, runtime) {
  const initial = createInitialGameState({
    roster: setup.roster,
    starterIds: setup.starterIds,
    matchDate: setup.matchDate,
  });
  let state = deriveGameState(initial, events);

  if (!runtime) return { ...state, clockRunning: false };

  const players = Object.fromEntries(
    Object.entries(state.players).map(([id, player]) => [
      id,
      {
        ...player,
        playedMs: Math.max(
          0,
          Number(runtime.playedMs?.[id] ?? player.playedMs ?? 0)
        ),
      },
    ])
  );

  return {
    ...state,
    players,
    period: Number(runtime.period || state.period),
    clockMs: Number.isFinite(runtime.clockMs) ? runtime.clockMs : state.clockMs,
    clockRunning: Boolean(runtime.clockRunning),
  };
}

function readSnapshot(setup) {
  if (!setup) return null;
  const events = loadLiveEvents();
  const runtime = loadLiveRuntime();
  const state = rebuildCurrentState(setup, events, runtime);
  return {
    events,
    runtime,
    state,
    periodClosed: isPeriodClosed(events, state.period),
  };
}

export default function LiveClockPeriodPanel() {
  const setup = useMemo(() => loadLiveSetup(), []);
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState(() => readSnapshot(setup));
  const [minutes, setMinutes] = useState("10");
  const [seconds, setSeconds] = useState("00");
  const [error, setError] = useState("");

  if (!setup || !snapshot) return null;

  const { state, events, periodClosed } = snapshot;
  const maxClockMs = periodDurationMs(state.period);
  const maxMinutes = Math.floor(maxClockMs / 60000);
  const tied = Number(state.score?.gazalbide || 0) === Number(state.score?.opponent || 0);
  const regulationFinished = state.period >= 4;
  const canOpenNextPeriod = !regulationFinished || tied;
  const canClosePeriod =
    !state.clockRunning &&
    state.clockMs <= 0 &&
    !periodClosed;

  function refreshSnapshot() {
    const next = readSnapshot(setup);
    if (!next) return;
    setSnapshot(next);
    const totalSeconds = Math.floor(Math.max(0, next.state.clockMs) / 1000);
    setMinutes(String(Math.floor(totalSeconds / 60)));
    setSeconds(String(totalSeconds % 60).padStart(2, "0"));
  }

  function openPanel() {
    setError("");
    refreshSnapshot();
    setOpen(true);
  }

  function ensureEditableClock() {
    const latest = readSnapshot(setup);
    if (!latest) {
      setError("No se pudo leer el estado actual del partido.");
      return null;
    }
    setSnapshot(latest);

    if (latest.state.clockRunning) {
      setError("Pausa el reloj antes de corregirlo.");
      return null;
    }
    if (latest.periodClosed) {
      setError("Ese periodo ya está cerrado y su reloj no puede modificarse.");
      return null;
    }
    return latest;
  }

  function persistClockTarget(targetClockMs, reason) {
    const latest = ensureEditableClock();
    if (!latest) return;

    const currentState = latest.state;
    const maxMs = periodDurationMs(currentState.period);
    const target = Math.min(maxMs, Math.max(0, Math.round(Number(targetClockMs || 0))));
    const actualDelta = target - currentState.clockMs;
    if (!actualDelta) {
      setError("");
      return;
    }

    // Countdown correction semantics:
    // - moving the clock backwards (less time remaining) means extra elapsed
    //   time and therefore adds that time to the five currently on court;
    // - moving it forwards removes that amount from the same five, clamped at 0.
    const playedTimeCorrection = -actualDelta;
    let nextState = adjustPlayedTimeForCurrentLineup(
      currentState,
      playedTimeCorrection
    );
    nextState = {
      ...nextState,
      clockMs: target,
      clockRunning: false,
    };

    const event = makeSystemEvent(
      LIVE_EVENT.CLOCK_SET,
      currentState.period,
      target,
      {
        clockMs: target,
        previousClockMs: currentState.clockMs,
        playedTimeCorrectionMs: playedTimeCorrection,
        reason,
      }
    );
    const nextEvents = [...latest.events, event];

    saveLiveEvents(nextEvents);
    saveLiveRuntime(nextState);
    window.location.reload();
  }

  function quickAdjust(deltaMs) {
    const latest = ensureEditableClock();
    if (!latest) return;
    persistClockTarget(latest.state.clockMs + deltaMs, "quick_adjust");
  }

  function submitExactClock(event) {
    event.preventDefault();
    const rawMinutes = Number(minutes);
    const rawSeconds = Number(seconds);

    if (!Number.isInteger(rawMinutes) || !Number.isInteger(rawSeconds)) {
      setError("Introduce minutos y segundos enteros.");
      return;
    }
    if (rawMinutes < 0 || rawSeconds < 0 || rawSeconds > 59) {
      setError("El reloj debe usar segundos entre 00 y 59.");
      return;
    }

    const target = rawMinutes * 60000 + rawSeconds * 1000;
    if (target > maxClockMs) {
      setError(
        `${periodLabel(state.period)} no puede superar ${formatClock(maxClockMs)}.`
      );
      return;
    }

    persistClockTarget(target, "exact_clock_set");
  }

  function closePeriod() {
    const latest = readSnapshot(setup);
    if (!latest) {
      setError("No se pudo leer el estado actual del partido.");
      return;
    }
    setSnapshot(latest);

    if (latest.state.clockRunning) {
      setError("Pausa el reloj antes de cerrar el periodo.");
      return;
    }
    if (latest.state.clockMs > 0) {
      setError("El periodo solo puede cerrarse cuando el reloj está en 0:00.");
      return;
    }
    if (latest.periodClosed) {
      setError("Este periodo ya está cerrado.");
      return;
    }

    const currentPeriod = latest.state.period;
    const isRegulationOrOvertimeEnd = currentPeriod >= 4;
    const scoresTied =
      Number(latest.state.score?.gazalbide || 0) ===
      Number(latest.state.score?.opponent || 0);
    const shouldOpenNext = !isRegulationOrOvertimeEnd || scoresTied;
    const nextPeriod = currentPeriod + 1;
    const nextClockMs = periodDurationMs(nextPeriod);

    const endEvent = makeSystemEvent(
      LIVE_EVENT.PERIOD_END,
      currentPeriod,
      0,
      { period: currentPeriod }
    );
    const nextEvents = [...latest.events, endEvent];

    if (shouldOpenNext) {
      nextEvents.push(
        makeSystemEvent(
          LIVE_EVENT.PERIOD_START,
          nextPeriod,
          nextClockMs,
          {
            period: nextPeriod,
            previousPeriod: currentPeriod,
          }
        )
      );
    }

    const rebuilt = rebuildCurrentState(setup, nextEvents, latest.runtime);
    const players = Object.fromEntries(
      Object.entries(rebuilt.players).map(([id, player]) => [
        id,
        {
          ...player,
          playedMs: Math.max(
            0,
            Number(latest.runtime?.playedMs?.[id] ?? player.playedMs ?? 0)
          ),
        },
      ])
    );

    const nextState = {
      ...rebuilt,
      players,
      period: shouldOpenNext ? nextPeriod : currentPeriod,
      clockMs: shouldOpenNext ? nextClockMs : 0,
      clockRunning: false,
    };

    const actionText = shouldOpenNext
      ? `cerrar ${periodLabel(currentPeriod)} y abrir ${periodLabel(nextPeriod)}`
      : `cerrar ${periodLabel(currentPeriod)} y dejar el partido listo para finalizar`;
    if (!window.confirm(`¿Seguro que quieres ${actionText}?`)) return;

    saveLiveEvents(nextEvents);
    saveLiveRuntime(nextState);
    window.location.reload();
  }

  function closeButtonLabel() {
    if (periodClosed) return `${periodLabel(state.period)} cerrado`;
    if (state.clockMs > 0) return `Cerrar ${periodLabel(state.period)} al llegar a 0:00`;
    if (state.period < 4) {
      return `Cerrar ${periodLabel(state.period)} · abrir ${periodLabel(state.period + 1)}`;
    }
    if (tied) {
      return `Cerrar ${periodLabel(state.period)} · abrir ${periodLabel(state.period + 1)}`;
    }
    return `Cerrar ${periodLabel(state.period)} · fin de partido`;
  }

  return (
    <aside className="live-clock-admin">
      <button
        type="button"
        className="live-clock-admin__toggle"
        onClick={open ? () => setOpen(false) : openPanel}
      >
        RELOJ
      </button>

      {open ? (
        <div className="live-clock-admin__panel">
          <div className="live-clock-admin__header">
            <div>
              <strong>{periodLabel(state.period)} · {formatClock(state.clockMs)}</strong>
              <small>
                {state.clockRunning ? "Reloj en marcha" : periodClosed ? "Periodo cerrado" : "Reloj parado"}
              </small>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar">×</button>
          </div>

          {error ? <div className="live-clock-admin__error">{error}</div> : null}

          <div className="live-clock-admin__quick" aria-label="Ajuste rápido del reloj">
            <button type="button" disabled={state.clockRunning || periodClosed} onClick={() => quickAdjust(-10000)}>-10s</button>
            <button type="button" disabled={state.clockRunning || periodClosed} onClick={() => quickAdjust(-1000)}>-1s</button>
            <button type="button" disabled={state.clockRunning || periodClosed} onClick={() => quickAdjust(1000)}>+1s</button>
            <button type="button" disabled={state.clockRunning || periodClosed} onClick={() => quickAdjust(10000)}>+10s</button>
          </div>

          <form className="live-clock-admin__exact" onSubmit={submitExactClock}>
            <span>Ajuste exacto</span>
            <label>
              Min
              <input
                type="number"
                inputMode="numeric"
                min="0"
                max={maxMinutes}
                value={minutes}
                onChange={(event) => setMinutes(event.target.value)}
                disabled={state.clockRunning || periodClosed}
              />
            </label>
            <span className="live-clock-admin__colon">:</span>
            <label>
              Seg
              <input
                type="number"
                inputMode="numeric"
                min="0"
                max="59"
                value={seconds}
                onChange={(event) => setSeconds(event.target.value)}
                disabled={state.clockRunning || periodClosed}
              />
            </label>
            <button type="submit" disabled={state.clockRunning || periodClosed}>Aplicar</button>
          </form>

          <p className="live-clock-admin__help">
            Corregir el reloj ajusta también los minutos del quinteto que está en pista por esa diferencia. Deshacer o corregir una jugada no toca ni el reloj ni los minutos.
          </p>

          <div className="live-clock-admin__period">
            <div>
              <span>Marcador</span>
              <strong>{state.score.gazalbide}–{state.score.opponent}</strong>
            </div>
            <button
              type="button"
              disabled={!canClosePeriod}
              onClick={closePeriod}
            >
              {closeButtonLabel()}
            </button>
          </div>

          {state.period >= 4 && state.clockMs <= 0 && !periodClosed && !tied ? (
            <small className="live-clock-admin__finish-note">
              No se abrirá prórroga porque el marcador no está empatado.
            </small>
          ) : null}
          {state.period >= 4 && state.clockMs <= 0 && !periodClosed && tied ? (
            <small className="live-clock-admin__finish-note">
              Marcador empatado: el siguiente periodo será una prórroga de 5:00.
            </small>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
