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
import { usePointerDrag } from "../features/live-stats/usePointerDrag.js";
import "../live-stats.css";

const ACTIONS = [
  { type: LIVE_EVENT.FT_MADE, label: "1 ✓", tone: "made" },
  { type: LIVE_EVENT.FT_MISSED, label: "1 ✕", tone: "miss" },
  { type: LIVE_EVENT.TWO_MADE, label: "2 ✓", tone: "made" },
  { type: LIVE_EVENT.TWO_MISSED, label: "2 ✕", tone: "miss" },
  { type: LIVE_EVENT.THREE_MADE, label: "3 ✓", tone: "made" },
  { type: LIVE_EVENT.THREE_MISSED, label: "3 ✕", tone: "miss" },
  { type: LIVE_EVENT.OREB, label: "REB O" },
  { type: LIVE_EVENT.DREB, label: "REB D" },
  { type: LIVE_EVENT.AST, label: "AST" },
  { type: LIVE_EVENT.TOV, label: "PÉR" },
  { type: LIVE_EVENT.STL, label: "ROB" },
  { type: LIVE_EVENT.BLK, label: "TAP" },
  { type: LIVE_EVENT.PFD, label: "F REC" },
  { type: LIVE_EVENT.PF, label: "FALTA", tone: "foul" },
];

const ACTION_LABEL = Object.fromEntries(ACTIONS.map((action) => [action.type, action.label]));

function formatClock(ms) {
  const safe = Math.max(0, Math.round(ms));
  const totalSeconds = Math.ceil(safe / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function sortBench(a, b) {
  return String(a.number).localeCompare(String(b.number), "es", {
    numeric: true,
    sensitivity: "base",
  });
}

function describeEvent(event, players, opponent) {
  if (!event) return "Sin acciones todavía";

  if (event.event_type === LIVE_EVENT.SUBSTITUTION) {
    const incoming = players[event.player_id];
    const outgoing = players[event.related_player_id];
    if (incoming && outgoing) {
      return `Entra #${incoming.number} ${incoming.name} por #${outgoing.number} ${outgoing.name}`;
    }
  }

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
  const [foulPlayerId, setFoulPlayerId] = useState(null);
  const [error, setError] = useState("");

  const { drag, startDrag } = usePointerDrag(handleDrop);

  useEffect(() => {
    if (!setup) return;
    const initial = createInitialGameState({
      roster: setup.roster,
      starterIds: setup.starterIds,
      matchDate: setup.matchDate,
    });
    initialStateRef.current = initial;
    setGameState(stopClock(deriveGameState(initial, events)));
  }, []);

  useEffect(() => {
    if (!gameState?.clockRunning) return undefined;
    const id = window.setInterval(() => {
      setGameState((current) => {
        if (!current?.clockRunning) return current;
        const nextClock = Math.max(0, current.clockMs - 100);
        return { ...current, clockMs: nextClock, clockRunning: nextClock > 0 };
      });
    }, 100);
    return () => window.clearInterval(id);
  }, [gameState?.clockRunning]);

  if (!setup) {
    return (
      <div className="live-empty card card--p">
        <h1>No hay un partido Live preparado</h1>
        <p className="text-dim">Primero selecciona convocatoria y quinteto inicial.</p>
        <button className="live-primary-action" onClick={() => navigate("/admin/live/setup")}>
          Preparar partido
        </button>
      </div>
    );
  }

  if (!gameState) return <p className="live-loading">Cargando Live Stats...</p>;

  const currentFouls = gameState.teamFouls[gameState.period] || { gazalbide: 0, opponent: 0 };
  const onCourt = gameState.onCourtIds.map((id) => gameState.players[id]).filter(Boolean);
  const bench = Object.values(gameState.players)
    .filter((player) => !gameState.onCourtIds.includes(player.id) && isPlayerEligible(player.status))
    .sort(sortBench);
  const foulKinds = getFoulKindsForProfile(gameState.ruleProfile);

  function appendEvent(
    eventType,
    { playerId = null, relatedPlayerId = null, foulKind = null, metadata = {} } = {}
  ) {
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
      related_player_id: relatedPlayerId,
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

  function handleDrop(item, target) {
    if (!gameState || !target?.playerId) return;

    if (item.kind === "action") {
      if (target.kind !== "player" || target.zone !== "court") return;
      const player = gameState.players[target.playerId];
      if (!player || !isPlayerEligible(player.status)) {
        setError("Ese jugador debe ser sustituido y ya no puede recibir acciones.");
        return;
      }
      if (item.eventType === LIVE_EVENT.PF) {
        setFoulPlayerId(target.playerId);
      } else {
        appendEvent(item.eventType, { playerId: target.playerId });
      }
      return;
    }

    if (item.kind === "player" && target.kind === "player" && item.zone !== target.zone) {
      const incomingId = item.zone === "bench" ? item.playerId : target.playerId;
      const outgoingId = item.zone === "court" ? item.playerId : target.playerId;
      appendEvent(LIVE_EVENT.SUBSTITUTION, {
        playerId: incomingId,
        relatedPlayerId: outgoingId,
      });
    }
  }

  function addFoul(kind) {
    if (!foulPlayerId) return;
    appendEvent(LIVE_EVENT.PF, { playerId: foulPlayerId, foulKind: kind });
    setFoulPlayerId(null);
  }

  function undoLast() {
    if (!events.length) return;
    const nextEvents = events.slice(0, -1);
    const reconstructed = deriveGameState(initialStateRef.current, nextEvents);
    setEvents(nextEvents);
    saveLiveEvents(nextEvents);
    setGameState(stopClock(reconstructed));
    setFoulPlayerId(null);
    setError("");
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
  }

  function restartSetup() {
    if (!window.confirm("¿Descartar este Live local y preparar otro partido?")) return;
    clearLiveSession();
    navigate("/admin/live/setup");
  }

  const actionDragging = drag?.item?.kind === "action";
  const playerDragging = drag?.item?.kind === "player";

  return (
    <div className="live-page live-page--drag">
      <div className="live-portrait-warning">
        <strong>Gira el móvil</strong>
        <span>Live Stats está diseñado para usarse en horizontal.</span>
      </div>

      <header className="live-scoreboard live-scoreboard--compact">
        <div className="live-team">
          <span>GAZALBIDE</span>
          <strong>{gameState.score.gazalbide}</strong>
          <small>Faltas Q{gameState.period}: {currentFouls.gazalbide}</small>
        </div>
        <div className="live-clock">
          <button
            type="button"
            onClick={toggleClock}
            className={gameState.clockRunning ? "live-clock__button live-clock__button--running" : "live-clock__button"}
          >
            <strong>{formatClock(gameState.clockMs)}</strong>
            <span>{gameState.clockRunning ? "PAUSAR" : "INICIAR"}</span>
          </button>
          <div className="live-period">
            Q{gameState.period}
            <button type="button" onClick={nextPeriod}>Siguiente →</button>
          </div>
        </div>
        <div className="live-team live-team--opponent">
          <span>{setup.opponent.toUpperCase()}</span>
          <strong>{gameState.score.opponent}</strong>
          <small>Faltas Q{gameState.period}: {currentFouls.opponent}</small>
        </div>
      </header>

      {(error || gameState.pendingSubstitutionFor.length > 0) && (
        <div className={`live-inline-alert${error ? " live-inline-alert--error" : ""}`}>
          {error || "Cambio obligatorio: arrastra un jugador del banquillo sobre el jugador eliminado."}
        </div>
      )}

      <div className="live-console live-console--drag">
        <section className="live-court-panel live-court-panel--drag">
          <div className="live-panel-title">
            <span>PISTA</span>
            <small>{actionDragging ? "Suelta la acción sobre el jugador" : "Arrastra jugador ↔ banquillo para cambiar"}</small>
          </div>

          <div className="live-on-court live-on-court--slots">
            {onCourt.map((player, index) => {
              const unavailable = !isPlayerEligible(player.status);
              const canReceivePlayer = playerDragging && drag.item.zone === "bench";
              return (
                <article
                  key={`${index}-${player.id}`}
                  className={`live-player-card live-player-card--draggable${actionDragging && !unavailable ? " live-player-card--drop-ready" : ""}${canReceivePlayer ? " live-player-card--swap-ready" : ""}${unavailable ? " live-player-card--unavailable" : ""}`}
                  data-live-drop="player"
                  data-zone="court"
                  data-player-id={player.id}
                  onPointerDown={(event) => startDrag(event, {
                    kind: "player",
                    zone: "court",
                    playerId: player.id,
                    label: `#${player.number} ${player.name}`,
                  })}
                >
                  <div className="live-player-card__slot">{index + 1}</div>
                  <strong>#{player.number}</strong>
                  <span>{player.name}</span>
                  <div className="live-player-card__stats">
                    <b>{player.stats.pts}</b><small>PTS</small>
                    <b>{player.stats.reb}</b><small>REB</small>
                    <b>{player.stats.ast}</b><small>AST</small>
                  </div>
                  <div className={player.stats.pf >= 4 ? "live-fouls live-fouls--danger" : "live-fouls"}>
                    F {player.stats.pf}/5
                  </div>
                  {unavailable && (
                    <div className="live-player-card__status">
                      {player.status === PLAYER_STATUS.DISQUALIFIED ? "DESCALIFICADO" : "ELIMINADO"}
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          <div className="live-bench-title">
            <span>BANQUILLO · {bench.length}</span>
            <small>{playerDragging && drag.item.zone === "court" ? "Suelta sobre el jugador que entra" : "Ordenado por dorsal"}</small>
          </div>
          <div className="live-bench live-bench--drag">
            {bench.map((player) => {
              const canReceivePlayer = playerDragging && drag.item.zone === "court";
              return (
                <article
                  key={player.id}
                  className={`live-bench-player live-bench-player--draggable${canReceivePlayer ? " live-bench-player--swap-ready" : ""}`}
                  data-live-drop="player"
                  data-zone="bench"
                  data-player-id={player.id}
                  onPointerDown={(event) => startDrag(event, {
                    kind: "player",
                    zone: "bench",
                    playerId: player.id,
                    label: `#${player.number} ${player.name}`,
                  })}
                >
                  <strong>#{player.number}</strong>
                  <span>{player.name}</span>
                </article>
              );
            })}
          </div>
        </section>

        <section className="live-actions-panel live-actions-panel--drag">
          <div className="live-panel-title live-panel-title--actions">
            <span>ACCIONES</span>
            <small>Arrastra una acción hasta el jugador</small>
          </div>
          <div className="live-actions-grid live-actions-grid--drag">
            {ACTIONS.map((action) => (
              <button
                type="button"
                key={action.type}
                className={`live-drag-action${action.tone ? ` live-drag-action--${action.tone}` : ""}`}
                onPointerDown={(event) => startDrag(event, {
                  kind: "action",
                  eventType: action.type,
                  label: action.label,
                })}
              >
                {action.label}
              </button>
            ))}
          </div>
          <div className="live-drag-help">Acción → jugador · Jugador ↔ jugador para cambios</div>
        </section>

        <aside className="live-opponent-panel live-opponent-panel--drag">
          <div className="live-panel-title"><span>RIVAL</span><small>Agregado</small></div>
          <div className="live-opponent-actions">
            <button type="button" onClick={() => appendEvent(LIVE_EVENT.OPP_SCORE_1)}>+1</button>
            <button type="button" onClick={() => appendEvent(LIVE_EVENT.OPP_SCORE_2)}>+2</button>
            <button type="button" onClick={() => appendEvent(LIVE_EVENT.OPP_SCORE_3)}>+3</button>
            <button type="button" className="live-opponent-foul" onClick={() => appendEvent(LIVE_EVENT.OPP_TEAM_FOUL)}>+ FALTA</button>
          </div>
          <div className="live-last-action">
            <span>ÚLTIMA ACCIÓN</span>
            <strong>{describeEvent(gameState.lastEvent, gameState.players, setup.opponent)}</strong>
            <small>Q{gameState.period} · {formatClock(gameState.lastEvent?.clock_ms ?? gameState.clockMs)}</small>
          </div>
          <div className="live-side-actions">
            <button type="button" className="live-undo" onClick={undoLast} disabled={!events.length}>↶ DESHACER</button>
            <button type="button" className="live-reset" onClick={restartSetup}>Nuevo partido</button>
          </div>
        </aside>
      </div>

      {drag && (
        <div
          className={`live-drag-ghost live-drag-ghost--${drag.item.kind}`}
          style={{ left: drag.x, top: drag.y }}
          aria-hidden="true"
        >
          {drag.item.kind === "action" ? drag.item.label : drag.item.label}
        </div>
      )}

      {foulPlayerId && (
        <div className="live-modal-backdrop" role="presentation" onClick={() => setFoulPlayerId(null)}>
          <div className="live-foul-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <span>TIPO DE FALTA</span>
            <h2>#{gameState.players[foulPlayerId]?.number} {gameState.players[foulPlayerId]?.name}</h2>
            <p>Cualquier opción suma también +1 PF total y +1 falta de equipo.</p>
            <div className="live-foul-options">
              {foulKinds.map((kind) => (
                <button key={kind} type="button" onClick={() => addFoul(kind)}>{FOUL_LABEL[kind]}</button>
              ))}
            </div>
            <button className="live-modal-cancel" type="button" onClick={() => setFoulPlayerId(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
