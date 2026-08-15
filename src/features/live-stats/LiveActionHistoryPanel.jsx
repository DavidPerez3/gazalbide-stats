import { useMemo, useState } from "react";
import { LIVE_EVENT, getEventSubject } from "./domain.js";
import {
  FOUL_KIND,
  FOUL_LABEL,
  RULE_PROFILE,
  getFoulKindsForProfile,
} from "./rules.js";
import {
  createInitialGameState,
  deriveGameState,
  stopClock,
} from "./stateEngine.js";
import {
  loadLiveEvents,
  loadLiveRuntime,
  loadLiveSetup,
  saveLiveEvents,
  saveLiveRuntime,
} from "./localSession.js";
import "./liveActionHistory.css";

const PLAYER_ACTIONS = [
  [LIVE_EVENT.FT_MADE, "TL anotado"],
  [LIVE_EVENT.FT_MISSED, "TL fallado"],
  [LIVE_EVENT.TWO_MADE, "2PT anotado"],
  [LIVE_EVENT.TWO_MISSED, "2PT fallado"],
  [LIVE_EVENT.THREE_MADE, "3PT anotado"],
  [LIVE_EVENT.THREE_MISSED, "3PT fallado"],
  [LIVE_EVENT.OREB, "Rebote ofensivo"],
  [LIVE_EVENT.DREB, "Rebote defensivo"],
  [LIVE_EVENT.AST, "Asistencia"],
  [LIVE_EVENT.TOV, "Pérdida"],
  [LIVE_EVENT.STL, "Robo"],
  [LIVE_EVENT.BLK, "Tapón"],
  [LIVE_EVENT.PFD, "Falta recibida"],
  [LIVE_EVENT.PF, "Falta cometida"],
];

const OPPONENT_ACTIONS = [
  [LIVE_EVENT.OPP_SCORE_1, "+1 rival"],
  [LIVE_EVENT.OPP_SCORE_2, "+2 rival"],
  [LIVE_EVENT.OPP_SCORE_3, "+3 rival"],
  [LIVE_EVENT.OPP_TEAM_FOUL, "Falta de equipo rival"],
];

const SYSTEM_LABELS = {
  [LIVE_EVENT.CLOCK_SET]: "Corrección de reloj",
  [LIVE_EVENT.PERIOD_START]: "Inicio de periodo",
  [LIVE_EVENT.PERIOD_END]: "Fin de periodo",
};

function formatClock(ms) {
  const totalSeconds = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function eventKind(event) {
  if (event?.subject === "system") return "system";
  if (event?.staff_id) return "staff";
  if (
    event?.event_type === LIVE_EVENT.SUBSTITUTION ||
    event?.event_type === LIVE_EVENT.SUB_IN ||
    event?.event_type === LIVE_EVENT.SUB_OUT
  ) return "substitution";
  if (event?.subject === "opponent") return "opponent";
  return "player";
}

function playerLabel(players, playerId) {
  const player = players.find((item) => String(item.id) === String(playerId));
  return player ? `#${player.number} ${player.name}` : "Jugador";
}

function actionLabel(event, setup) {
  const players = setup?.roster || [];
  const kind = eventKind(event);

  if (kind === "system") return SYSTEM_LABELS[event.event_type] || event.event_type;
  if (kind === "staff") {
    const staffName = event.metadata?.staffName || "Staff";
    return `${staffName} · ${FOUL_LABEL[event.foul_kind] || "Falta"}`;
  }
  if (kind === "substitution") {
    if (event.event_type === LIVE_EVENT.SUBSTITUTION) {
      return `Entra ${playerLabel(players, event.player_id)} · sale ${playerLabel(players, event.related_player_id)}`;
    }
    return `${playerLabel(players, event.player_id)} · ${event.event_type === LIVE_EVENT.SUB_IN ? "entra" : "sale"}`;
  }
  if (kind === "opponent") {
    return OPPONENT_ACTIONS.find(([type]) => type === event.event_type)?.[1] || event.event_type;
  }

  const base = PLAYER_ACTIONS.find(([type]) => type === event.event_type)?.[1] || event.event_type;
  const foul = event.event_type === LIVE_EVENT.PF
    ? ` · ${FOUL_LABEL[event.foul_kind] || "Falta"}`
    : "";
  return `${playerLabel(players, event.player_id)} · ${base}${foul}`;
}

function correctionSnapshot(event) {
  return {
    event_type: event.event_type,
    subject: event.subject,
    player_id: event.player_id ?? null,
    related_player_id: event.related_player_id ?? null,
    staff_id: event.staff_id ?? null,
    foul_kind: event.foul_kind ?? null,
  };
}

function rebuildStatePreservingRuntime(setup, nextEvents, runtime) {
  const initial = createInitialGameState({
    roster: setup.roster,
    starterIds: setup.starterIds,
    matchDate: setup.matchDate,
  });
  let rebuilt = deriveGameState(initial, nextEvents);

  const players = Object.fromEntries(
    Object.entries(rebuilt.players).map(([id, player]) => [
      id,
      {
        ...player,
        playedMs: Math.max(0, Number(runtime?.playedMs?.[id] ?? player.playedMs ?? 0)),
      },
    ])
  );

  rebuilt = {
    ...rebuilt,
    players,
    period: Number(runtime?.period || rebuilt.period),
    clockMs: Number.isFinite(runtime?.clockMs) ? runtime.clockMs : rebuilt.clockMs,
    clockRunning: false,
  };

  return stopClock(rebuilt);
}

function makeDraft(event) {
  return {
    eventType: event.event_type,
    playerId: event.player_id == null ? "" : String(event.player_id),
    relatedPlayerId: event.related_player_id == null ? "" : String(event.related_player_id),
    foulKind: event.foul_kind || "",
  };
}

export default function LiveActionHistoryPanel() {
  const setup = useMemo(() => loadLiveSetup(), []);
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState(() => loadLiveEvents());
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState("");

  if (!setup) return null;

  const runtime = loadLiveRuntime();
  const clockRunning = Boolean(runtime?.clockRunning);
  const orderedEvents = [...events].sort((a, b) => {
    const aSeq = Number(a.server_sequence || a.client_sequence || 0);
    const bSeq = Number(b.server_sequence || b.client_sequence || 0);
    return bSeq - aSeq;
  });

  function refreshAndOpen() {
    setEvents(loadLiveEvents());
    setEditingId(null);
    setDraft(null);
    setError("");
    setOpen(true);
  }

  function ensureClockStopped() {
    const currentRuntime = loadLiveRuntime();
    if (currentRuntime?.clockRunning) {
      setError("Pausa el reloj antes de corregir el historial. El tiempo no se modificará.");
      return null;
    }
    return currentRuntime || {};
  }

  function persistHistoryChange(nextEvents, runtimeBeforeChange) {
    try {
      const rebuilt = rebuildStatePreservingRuntime(setup, nextEvents, runtimeBeforeChange);
      saveLiveEvents(nextEvents);
      saveLiveRuntime(rebuilt);
      setEvents(nextEvents);
      setEditingId(null);
      setDraft(null);
      setError("");

      // LiveStatsPage owns the live React state. Reload only while the clock is
      // stopped; setup/events/runtime restore the exact same clock position and
      // accumulated minutes, while all basketball-derived values are rebuilt.
      window.location.reload();
    } catch (changeError) {
      setError(changeError.message || "No se pudo reconstruir el partido con esa corrección.");
    }
  }

  function toggleVoid(event) {
    if (event.subject === "system") return;
    const runtimeBeforeChange = ensureClockStopped();
    if (!runtimeBeforeChange) return;

    const now = new Date().toISOString();
    const nextEvents = events.map((item) => item.id === event.id
      ? {
          ...item,
          is_void: !item.is_void,
          voided_at: item.is_void ? null : now,
          void_reason: item.is_void ? null : "history_void",
        }
      : item);

    persistHistoryChange(nextEvents, runtimeBeforeChange);
  }

  function beginCorrection(event) {
    if (event.is_void || event.subject === "system") return;
    if (!ensureClockStopped()) return;
    setEditingId(event.id);
    setDraft(makeDraft(event));
    setError("");
  }

  function saveCorrection(event) {
    const runtimeBeforeChange = ensureClockStopped();
    if (!runtimeBeforeChange || !draft) return;

    const kind = eventKind(event);
    const nextType = kind === "staff" ? LIVE_EVENT.PF : draft.eventType;
    const nextSubject = kind === "staff" ? "gazalbide" : getEventSubject(nextType);
    const nextPlayerId = kind === "player" || kind === "substitution"
      ? (draft.playerId || null)
      : null;
    const nextRelatedPlayerId = kind === "substitution"
      ? (draft.relatedPlayerId || null)
      : null;
    const nextFoulKind = nextType === LIVE_EVENT.PF
      ? (draft.foulKind || null)
      : null;

    if ((kind === "player" || kind === "substitution") && !nextPlayerId) {
      setError("Selecciona el jugador de la acción.");
      return;
    }
    if (kind === "substitution" && !nextRelatedPlayerId) {
      setError("Selecciona también el jugador que sale.");
      return;
    }
    if (nextType === LIVE_EVENT.PF && !nextFoulKind) {
      setError("Selecciona el tipo de falta.");
      return;
    }

    const correctedAt = new Date().toISOString();
    const nextEvents = events.map((item) => {
      if (item.id !== event.id) return item;
      const history = Array.isArray(item.metadata?.correctionHistory)
        ? item.metadata.correctionHistory
        : [];
      return {
        ...item,
        event_type: nextType,
        subject: nextSubject,
        player_id: nextPlayerId,
        related_player_id: nextRelatedPlayerId,
        foul_kind: nextFoulKind,
        // Identity, sequence, period and clock are intentionally preserved so
        // the corrected action remains at the exact original game instant.
        metadata: {
          ...(item.metadata || {}),
          correctionHistory: [
            ...history,
            { correctedAt, previous: correctionSnapshot(item) },
          ],
          correctedAt,
        },
      };
    });

    persistHistoryChange(nextEvents, runtimeBeforeChange);
  }

  function correctionFields(event) {
    if (!draft) return null;
    const kind = eventKind(event);
    const roster = setup.roster || [];
    const initial = createInitialGameState({
      roster: setup.roster,
      starterIds: setup.starterIds,
      matchDate: setup.matchDate,
    });
    const profile = initial.ruleProfile;
    const playerFouls = getFoulKindsForProfile(profile);
    const staffFouls = profile === RULE_PROFILE.FIBA_2026
      ? [FOUL_KIND.TECHNICAL_CAT_1, FOUL_KIND.DISQUALIFYING]
      : [FOUL_KIND.TECHNICAL, FOUL_KIND.DISQUALIFYING];

    return (
      <div className="live-history__editor">
        {kind === "player" ? (
          <>
            <label>
              Acción
              <select
                value={draft.eventType}
                onChange={(e) => setDraft((value) => ({
                  ...value,
                  eventType: e.target.value,
                  foulKind: e.target.value === LIVE_EVENT.PF
                    ? (value.foulKind || playerFouls[0])
                    : "",
                }))}
              >
                {PLAYER_ACTIONS.map(([type, label]) => <option key={type} value={type}>{label}</option>)}
              </select>
            </label>
            <label>
              Jugador
              <select value={draft.playerId} onChange={(e) => setDraft((value) => ({ ...value, playerId: e.target.value }))}>
                {roster.map((player) => (
                  <option key={player.id} value={player.id}>#{player.number} {player.name}</option>
                ))}
              </select>
            </label>
          </>
        ) : null}

        {kind === "opponent" ? (
          <label>
            Acción rival
            <select value={draft.eventType} onChange={(e) => setDraft((value) => ({ ...value, eventType: e.target.value }))}>
              {OPPONENT_ACTIONS.map(([type, label]) => <option key={type} value={type}>{label}</option>)}
            </select>
          </label>
        ) : null}

        {kind === "substitution" ? (
          <>
            <label>
              Entra
              <select value={draft.playerId} onChange={(e) => setDraft((value) => ({ ...value, playerId: e.target.value }))}>
                {roster.map((player) => <option key={player.id} value={player.id}>#{player.number} {player.name}</option>)}
              </select>
            </label>
            <label>
              Sale
              <select value={draft.relatedPlayerId} onChange={(e) => setDraft((value) => ({ ...value, relatedPlayerId: e.target.value }))}>
                {roster.map((player) => <option key={player.id} value={player.id}>#{player.number} {player.name}</option>)}
              </select>
            </label>
          </>
        ) : null}

        {(draft.eventType === LIVE_EVENT.PF || kind === "staff") ? (
          <label>
            Tipo de falta
            <select value={draft.foulKind} onChange={(e) => setDraft((value) => ({ ...value, foulKind: e.target.value }))}>
              {(kind === "staff" ? staffFouls : playerFouls).map((foulKind) => (
                <option key={foulKind} value={foulKind}>{FOUL_LABEL[foulKind]}</option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="live-history__editor-actions">
          <button type="button" onClick={() => saveCorrection(event)}>Guardar corrección</button>
          <button type="button" onClick={() => { setEditingId(null); setDraft(null); setError(""); }}>Cancelar</button>
        </div>
      </div>
    );
  }

  return (
    <aside className="live-history">
      <button type="button" className="live-history__toggle" onClick={open ? () => setOpen(false) : refreshAndOpen}>
        HISTORIAL
      </button>

      {open ? (
        <div className="live-history__panel">
          <div className="live-history__header">
            <div>
              <strong>Historial de acciones</strong>
              <small>Corregir nunca cambia el reloj actual ni los minutos.</small>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar">×</button>
          </div>

          {clockRunning ? (
            <div className="live-history__notice">Pausa el reloj para anular o corregir acciones.</div>
          ) : null}
          {error ? <div className="live-history__error">{error}</div> : null}

          <div className="live-history__list">
            {orderedEvents.length === 0 ? <p className="live-history__empty">Todavía no hay acciones.</p> : null}
            {orderedEvents.map((event) => {
              const corrected = Array.isArray(event.metadata?.correctionHistory) && event.metadata.correctionHistory.length > 0;
              const system = event.subject === "system";
              return (
                <article key={event.id} className={`live-history__item${event.is_void ? " live-history__item--void" : ""}`}>
                  <div className="live-history__item-main">
                    <span>Q{event.period} · {formatClock(event.clock_ms)}</span>
                    <strong>{actionLabel(event, setup)}</strong>
                    <small>
                      {system ? "Sistema · no editable" : event.is_void ? "ANULADA" : corrected ? `Corregida ${event.metadata.correctionHistory.length} vez/veces` : "Registrada"}
                    </small>
                  </div>

                  {!system ? (
                    <div className="live-history__item-actions">
                      <button type="button" disabled={clockRunning} onClick={() => toggleVoid(event)}>
                        {event.is_void ? "Restaurar" : "Anular"}
                      </button>
                      <button type="button" disabled={clockRunning || event.is_void} onClick={() => beginCorrection(event)}>
                        Corregir
                      </button>
                    </div>
                  ) : null}

                  {editingId === event.id ? correctionFields(event) : null}
                </article>
              );
            })}
          </div>
        </div>
      ) : null}
    </aside>
  );
}
