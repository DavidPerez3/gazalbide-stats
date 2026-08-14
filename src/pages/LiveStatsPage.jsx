import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LIVE_EVENT,
  LIVE_STATS_CONFIG,
  getEventSubject,
} from "../features/live-stats/domain.js";
import {
  FOUL_LABEL,
  PLAYER_STATUS,
  getFoulKindsForProfile,
  isPlayerEligible,
} from "../features/live-stats/rules.js";
import {
  applyLiveEvent,
  createInitialGameState,
  deriveGameState,
  startClock,
  stopClock,
} from "../features/live-stats/stateEngine.js";
import {
  clearLiveSession,
  loadLiveEvents,
  loadLiveSetup,
  saveLiveEvents,
} from "../features/live-stats/localSession.js";
import "../live-stats.css";

const ACTIONS = [
  [LIVE_EVENT.FT_MADE, "1 ✓"],
  [LIVE_EVENT.FT_MISSED, "1 ✕"],
  [LIVE_EVENT.TWO_MADE, "2 ✓"],
  [LIVE_EVENT.TWO_MISSED, "2 ✕"],
  [LIVE_EVENT.THREE_MADE, "3 ✓"],
  [LIVE_EVENT.THREE_MISSED, "3 ✕"],
  [LIVE_EVENT.OREB, "REB O"],
  [LIVE_EVENT.DREB, "REB D"],
  [LIVE_EVENT.AST, "AST"],
  [LIVE_EVENT.TOV, "PÉR"],
  [LIVE_EVENT.STL, "ROB"],
  [LIVE_EVENT.BLK, "TAP"],
  [LIVE_EVENT.PFD, "F REC"],
];

function formatClock(ms) {
  const safe = Math.max(0, Math.round(ms));
  const totalSeconds = Math.ceil(safe / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function describeEvent(event, players, opponent) {
  if (!event) return "Sin acciones todavía";
  const player = event.player_id ? players[event.player_id] : null;
  const who = player ? `#${player.number} ${player.name}` : opponent;
  const labels = {
    [LIVE_EVENT.FT_MADE]: "TL anotado",
    [LIVE_EVENT.FT_MISSED]: "TL fallado",
    [LIVE_EVENT.TWO_MADE]: "2PT anotado",
    [LIVE_EVENT.TWO_MISSED]: "2PT fallado",
    [LIVE_EVENT.THREE_MADE]: "3PT anotado",
    [LIVE_EVENT.THREE_MISSED]: "3PT fallado",
    [LIVE_EVENT.OREB]: "rebote ofensivo",
    [LIVE_EVENT.DREB]: "rebote defensivo",
    [LIVE_EVENT.AST]: "asistencia",
    [LIVE_EVENT.TOV]: "pérdida",
    [LIVE_EVENT.STL]: "robo",
    [LIVE_EVENT.BLK]: "tapón",
    [LIVE_EVENT.PFD]: "falta recibida",
    [LIVE_EVENT.OPP_SCORE_1]: "+1",
    [LIVE_EVENT.OPP_SCORE_2]: "+2",
    [LIVE_EVENT.OPP_SCORE_3]: "+3",
    [LIVE_EVENT.OPP_TEAM_FOUL]: "falta de equipo",
    [LIVE_EVENT.SUB_IN]: "entra",
    [LIVE_EVENT.SUB_OUT]: "sale",
  };
  if (event.event_type === LIVE_EVENT.PF) {
    return `${who} · ${FOUL_LABEL[event.foul_kind] || "falta"}`;
  }
  return `${who} · ${labels[event.event_type] || event.event_type}`;
}

export default function LiveStatsPage() {
  const navigate = useNavigate();
  const setup = useMemo(() => loadLiveSetup(), []);
  const initialStateRef = useRef(null);
  const [events, setEvents] = useState(() => loadLiveEvents());
  const [gameState, setGameState] = useState(null);
  const [activePlayerId, setActivePlayerId] = useState(null);
  const [foulPlayerId, setFoulPlayerId] = useState(null);
  const [subOutId, setSubOutId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!setup) return;
    const initial = createInitialGameState({
      roster: setup.roster,
      starterIds: setup.starterIds,
      matchDate: setup.matchDate,
    });
    initialStateRef.current = initial;
    const restored = deriveGameState(initial, events);
    setGameState(restored);
    setActivePlayerId(restored.onCourtIds[0] || null);
    // Only restore the event log. A reopened scorer always starts with the clock stopped.
    setGameState((current) => (current ? stopClock(current) : current));
  }, []); // setup is immutable during a live session

  useEffect(() => {
    if (!gameState?.clockRunning) return undefined;
    const id = window.setInterval(() => {
      setGameState((current) => {
        if (!current?.clockRunning) return current;
        const nextClock = Math.max(0, current.clockMs - 100);
        return {
          ...current,
          clockMs: nextClock,
          clockRunning: nextClock > 0,
        };
      });
    }, 100);
    return () => window.clearInterval(id);
  }, [gameState?.clockRunning]);

  if (!setup) {
    return (
      <div className="live-empty card card--p">
        <h1>No hay un partido Live preparado</h1>
        <p className="text-dim">Primero selecciona convocatoria y quinteto inicial.</p>
        <button className="live-primary-action" onClick={() => navigate("/admin/live/setup")}>Preparar partido</button>
      </div>
    );
  }

  if (!gameState) return <p>Cargando Live Stats...</p>;

  const currentFouls = gameState.teamFouls[gameState.period] || { gazalbide: 0, opponent: 0 };
  const onCourt = gameState.onCourtIds.map((id) => gameState.players[id]).filter(Boolean);
  const bench = Object.values(gameState.players).filter(
    (player) => !gameState.onCourtIds.includes(player.id) && isPlayerEligible(player.status)
  );
  const activePlayer = activePlayerId ? gameState.players[activePlayerId] : null;
  const foulKinds = getFoulKindsForProfile(gameState.ruleProfile);

  function appendEvent(eventType, { playerId = null, foulKind = null, metadata = {} } = {}) {
    setError("");
    const event = {
      id: crypto.randomUUID(),
      client_sequence: events.length + 1,
      client_created_at: new Date().toISOString(),
      period: gameState.period,
      clock_ms: gameState.clockMs,
      subject: getEventSubject(eventType),
      event_type: eventType,
      player_id: playerId,
      foul_kind: foulKind,
      metadata,
      is_void: false,
    };

    try {
      const nextState = applyLiveEvent(gameState, event);
      const nextEvents = [...events, event];
      setEvents(nextEvents);
      saveLiveEvents(nextEvents);
      setGameState(nextState);
      return nextState;
    } catch (err) {
      setError(err.message || "No se pudo registrar la acción.");
      return null;
    }
  }

  function addPlayerAction(type) {
    if (!activePlayerId) {
      setError("Selecciona primero un jugador de pista.");
      return;
    }
    appendEvent(type, { playerId: activePlayerId });
  }

  function addFoul(kind) {
    if (!foulPlayerId) return;
    const next = appendEvent(LIVE_EVENT.PF, { playerId: foulPlayerId, foulKind: kind });
    setFoulPlayerId(null);
    if (next?.players[foulPlayerId]?.status === PLAYER_STATUS.FOULED_OUT || next?.players[foulPlayerId]?.status === PLAYER_STATUS.DISQUALIFIED) {
      setActivePlayerId(next.onCourtIds[0] || null);
    }
  }

  function substitute(inId) {
    setError("");
    let state = stopClock(gameState);
    let nextEvents = [...events];
    const push = (eventType, playerId) => {
      const event = {
        id: crypto.randomUUID(),
        client_sequence: nextEvents.length + 1,
        client_created_at: new Date().toISOString(),
        period: state.period,
        clock_ms: state.clockMs,
        subject: "gazalbide",
        event_type: eventType,
        player_id: playerId,
        foul_kind: null,
        metadata: {},
        is_void: false,
      };
      state = applyLiveEvent(state, event);
      nextEvents.push(event);
    };

    try {
      if (subOutId && state.onCourtIds.includes(subOutId)) push(LIVE_EVENT.SUB_OUT, subOutId);
      push(LIVE_EVENT.SUB_IN, inId);
      setGameState(state);
      setEvents(nextEvents);
      saveLiveEvents(nextEvents);
      setSubOutId(null);
      setActivePlayerId(inId);
    } catch (err) {
      setError(err.message || "No se pudo completar el cambio.");
    }
  }

  function undoLast() {
    if (!events.length) return;
    const nextEvents = events.slice(0, -1);
    const reconstructed = deriveGameState(initialStateRef.current, nextEvents);
    setEvents(nextEvents);
    saveLiveEvents(nextEvents);
    setGameState(stopClock(reconstructed));
    if (!reconstructed.onCourtIds.includes(activePlayerId)) {
      setActivePlayerId(reconstructed.onCourtIds[0] || null);
    }
    setSubOutId(null);
    setFoulPlayerId(null);
  }

  function toggleClock() {
    setError("");
    try {
      setGameState((current) => (current.clockRunning ? stopClock(current) : startClock(current)));
    } catch (err) {
      setError(err.message);
    }
  }

  function nextPeriod() {
    const nextPeriodNumber = gameState.period + 1;
    const periodMs = nextPeriodNumber <= 4
      ? LIVE_STATS_CONFIG.regulationPeriodMs
      : LIVE_STATS_CONFIG.overtimePeriodMs;
    setGameState((current) => ({
      ...stopClock(current),
      period: nextPeriodNumber,
      clockMs: periodMs,
    }));
    setSubOutId(null);
  }

  function restartSetup() {
    if (!window.confirm("¿Descartar este Live local y preparar otro partido?")) return;
    clearLiveSession();
    navigate("/admin/live/setup");
  }

  return (
    <div className="live-page">
      <div className="live-portrait-warning">
        <strong>Gira el móvil</strong><span>Live Stats está diseñado para usarse en horizontal.</span>
      </div>

      <header className="live-scoreboard">
        <div className="live-team"><span>GAZALBIDE</span><strong>{gameState.score.gazalbide}</strong><small>Faltas Q{gameState.period}: {currentFouls.gazalbide}</small></div>
        <div className="live-clock">
          <button type="button" onClick={toggleClock} className={gameState.clockRunning ? "live-clock__button live-clock__button--running" : "live-clock__button"}>
            <strong>{formatClock(gameState.clockMs)}</strong><span>{gameState.clockRunning ? "PAUSAR" : "INICIAR"}</span>
          </button>
          <div className="live-period">Q{gameState.period}<button type="button" onClick={nextPeriod}>Siguiente →</button></div>
        </div>
        <div className="live-team live-team--opponent"><span>{setup.opponent.toUpperCase()}</span><strong>{gameState.score.opponent}</strong><small>Faltas Q{gameState.period}: {currentFouls.opponent}</small></div>
      </header>

      {error && <div className="live-alert live-alert--error">{error}</div>}
      {gameState.pendingSubstitutionFor.length > 0 && <div className="live-alert live-alert--warning">Cambio obligatorio: hay menos de 5 jugadores elegibles en pista.</div>}

      <div className="live-console">
        <section className="live-court-panel">
          <div className="live-panel-title"><span>EN PISTA</span><small>Toca un jugador para anotar</small></div>
          <div className="live-on-court">
            {onCourt.map((player) => (
              <article key={player.id} className={`live-player-card${activePlayerId === player.id ? " live-player-card--active" : ""}`}>
                <button className="live-player-card__select" type="button" onClick={() => setActivePlayerId(player.id)}>
                  <strong>#{player.number}</strong><span>{player.name}</span>
                  <small>{player.stats.pts} PTS · {player.stats.reb} REB · {player.stats.ast} AST</small>
                  <small className={player.stats.pf >= 4 ? "live-fouls live-fouls--danger" : "live-fouls"}>F {player.stats.pf}/5</small>
                </button>
                <button className="live-player-card__sub" type="button" onClick={() => setSubOutId(player.id)}>{subOutId === player.id ? "Seleccionado para salir" : "Cambio"}</button>
              </article>
            ))}
          </div>

          <div className="live-bench-title">BANQUILLO · {bench.length}</div>
          <div className="live-bench">
            {bench.map((player) => (
              <button key={player.id} type="button" className="live-bench-player" onClick={() => substitute(player.id)} disabled={!subOutId && gameState.onCourtIds.length >= 5 && gameState.pendingSubstitutionFor.length === 0}>
                <strong>#{player.number}</strong><span>{player.name}</span><small>Entra</small>
              </button>
            ))}
          </div>
        </section>

        <section className="live-actions-panel">
          <div className="live-active-player">
            <span>JUGADOR ACTIVO</span>
            <strong>{activePlayer ? `#${activePlayer.number} ${activePlayer.name}` : "Selecciona jugador"}</strong>
            {activePlayer && <small>{activePlayer.stats.pts} PTS · {activePlayer.stats.reb} REB · {activePlayer.stats.ast} AST · {activePlayer.stats.pf} PF</small>}
          </div>
          <div className="live-actions-grid">
            {ACTIONS.map(([type, label]) => <button type="button" key={type} onClick={() => addPlayerAction(type)}>{label}</button>)}
            <button type="button" className="live-action-foul" onClick={() => activePlayerId && setFoulPlayerId(activePlayerId)}>FALTA</button>
          </div>
        </section>

        <aside className="live-opponent-panel">
          <div className="live-panel-title"><span>RIVAL</span><small>Solo marcador y faltas</small></div>
          <div className="live-opponent-actions">
            <button type="button" onClick={() => appendEvent(LIVE_EVENT.OPP_SCORE_1)}>+1</button>
            <button type="button" onClick={() => appendEvent(LIVE_EVENT.OPP_SCORE_2)}>+2</button>
            <button type="button" onClick={() => appendEvent(LIVE_EVENT.OPP_SCORE_3)}>+3</button>
            <button type="button" className="live-opponent-foul" onClick={() => appendEvent(LIVE_EVENT.OPP_TEAM_FOUL)}>+ FALTA</button>
          </div>
          <div className="live-last-action"><span>ÚLTIMA ACCIÓN</span><strong>{describeEvent(gameState.lastEvent, gameState.players, setup.opponent)}</strong><small>Q{gameState.period} · {formatClock(gameState.lastEvent?.clock_ms ?? gameState.clockMs)}</small></div>
          <button type="button" className="live-undo" onClick={undoLast} disabled={!events.length}>↶ DESHACER</button>
          <button type="button" className="live-reset" onClick={restartSetup}>Nuevo partido local</button>
        </aside>
      </div>

      {foulPlayerId && (
        <div className="live-modal-backdrop" role="presentation" onClick={() => setFoulPlayerId(null)}>
          <div className="live-foul-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <span>TIPO DE FALTA</span>
            <h2>#{gameState.players[foulPlayerId]?.number} {gameState.players[foulPlayerId]?.name}</h2>
            <p>Cualquier opción suma también +1 PF total y +1 falta de equipo.</p>
            <div className="live-foul-options">
              {foulKinds.map((kind) => <button key={kind} type="button" onClick={() => addFoul(kind)}>{FOUL_LABEL[kind]}</button>)}
            </div>
            <button className="live-modal-cancel" type="button" onClick={() => setFoulPlayerId(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
