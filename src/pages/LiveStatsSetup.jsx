import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MAX_ROSTER_SIZE, MAX_ON_COURT } from "../features/live-stats/rules.js";
import {
  restoreLiveSessionFromRemote,
  saveLiveSetup,
} from "../features/live-stats/localSession.js";
import {
  listRecoverableLiveSessions,
  loadRemoteLiveSession,
} from "../features/live-stats/supabaseSync.js";
import PublishedLiveMatchesPanel from "../features/live-stats/PublishedLiveMatchesPanel.jsx";
import { getPlayers } from "../lib/data.js";
import { CURRENT_SEASON_ID } from "../lib/seasons.js";
import "../live-stats.css";

const playerKey = (player) => String(player.id ?? `num:${player.number}:${player.name}`);

export default function LiveStatsSetup() {
  const navigate = useNavigate();
  const [players, setPlayers] = useState([]);
  const [selected, setSelected] = useState([]);
  const [starters, setStarters] = useState([]);
  const [opponent, setOpponent] = useState("");
  const [matchDate, setMatchDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [gazalSide, setGazalSide] = useState("home");
  const [error, setError] = useState("");
  const [recoverableSessions, setRecoverableSessions] = useState([]);
  const [recoveringId, setRecoveringId] = useState(null);
  const [recoveryError, setRecoveryError] = useState("");

  useEffect(() => {
    getPlayers(CURRENT_SEASON_ID)
      .then((data) => setPlayers(data || []))
      .catch(() => setError("No se pudo cargar la plantilla de la temporada actual."));
  }, []);

  useEffect(() => {
    let cancelled = false;

    listRecoverableLiveSessions(CURRENT_SEASON_ID)
      .then((matches) => {
        if (!cancelled) setRecoverableSessions(matches || []);
      })
      .catch((loadError) => {
        console.warn("No se pudieron listar Lives recuperables:", loadError);
        if (!cancelled) {
          setRecoveryError("No se pudieron consultar los partidos Live guardados en Supabase.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const starterSet = useMemo(() => new Set(starters), [starters]);

  function toggleRoster(id) {
    setError("");
    if (selectedSet.has(id)) {
      setSelected((prev) => prev.filter((value) => value !== id));
      setStarters((prev) => prev.filter((value) => value !== id));
      return;
    }
    if (selected.length >= MAX_ROSTER_SIZE) {
      setError(`Solo se pueden convocar ${MAX_ROSTER_SIZE} jugadores.`);
      return;
    }
    setSelected((prev) => [...prev, id]);
  }

  function toggleStarter(id) {
    setError("");
    if (!selectedSet.has(id)) return;
    if (starterSet.has(id)) {
      setStarters((prev) => prev.filter((value) => value !== id));
      return;
    }
    if (starters.length >= MAX_ON_COURT) {
      setError(`El quinteto inicial debe tener exactamente ${MAX_ON_COURT} jugadores.`);
      return;
    }
    setStarters((prev) => [...prev, id]);
  }

  async function recoverGame(matchId) {
    if (recoveringId) return;
    setRecoveryError("");
    setRecoveringId(matchId);

    try {
      const snapshot = await loadRemoteLiveSession(matchId);
      restoreLiveSessionFromRemote(snapshot);
      navigate("/admin/live");
    } catch (recoverError) {
      console.error("No se pudo recuperar el Live:", recoverError);
      setRecoveryError(
        recoverError?.message || "No se pudo recuperar el partido Live desde Supabase."
      );
      setRecoveringId(null);
    }
  }

  function startGame() {
    setError("");
    if (selected.length < MAX_ON_COURT) return setError("Debes convocar al menos 5 jugadores.");
    if (selected.length > MAX_ROSTER_SIZE) return setError(`No puedes convocar más de ${MAX_ROSTER_SIZE} jugadores.`);
    if (starters.length !== MAX_ON_COURT) return setError("Debes seleccionar exactamente 5 titulares.");

    const roster = players
      .filter((player) => selectedSet.has(playerKey(player)))
      .map((player) => ({
        id: playerKey(player),
        databaseId: player.id ?? null,
        number: String(player.number),
        name: player.name,
      }));

    saveLiveSetup({
      seasonId: CURRENT_SEASON_ID,
      opponent: opponent.trim() || "Rival",
      matchDate,
      gazalSide,
      roster,
      starterIds: starters,
      createdAt: new Date().toISOString(),
    });

    navigate("/admin/live");
  }

  return (
    <div className="live-setup">
      <header className="live-setup__header">
        <div>
          <p className="live-kicker">Live Stats · {CURRENT_SEASON_ID}</p>
          <h1>Convocatoria y quinteto inicial</h1>
          <p className="text-dim">Máximo 12 convocados · exactamente 5 titulares · solo plantilla actual.</p>
        </div>
        <div className="live-setup__counters">
          <strong>{selected.length}/12</strong><span>convocados</span>
          <strong>{starters.length}/5</strong><span>titulares</span>
        </div>
      </header>

      {recoverableSessions.length > 0 ? (
        <section className="card card--p">
          <p className="live-kicker">Recuperación Supabase</p>
          <h2>Partido Live guardado</h2>
          <p className="text-dim">
            Puedes continuar un Live aunque se haya perdido la sesión local o estés usando otro dispositivo.
          </p>
          <div className="live-setup__footer">
            {recoverableSessions.map((match) => (
              <button
                key={match.id}
                type="button"
                className="live-primary-action"
                onClick={() => recoverGame(match.id)}
                disabled={Boolean(recoveringId)}
              >
                {recoveringId === match.id
                  ? "Recuperando…"
                  : `Continuar ${match.opponent} · ${match.date}`}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {recoveryError ? <div className="live-alert live-alert--error">{recoveryError}</div> : null}

      <PublishedLiveMatchesPanel />

      <section className="live-setup__meta card card--p">
        <label>Rival<input className="input" value={opponent} onChange={(e) => setOpponent(e.target.value)} placeholder="Nombre del rival" /></label>
        <label>Fecha<input className="input" type="date" value={matchDate} onChange={(e) => setMatchDate(e.target.value)} /></label>
        <label>Gazalbide<select className="input" value={gazalSide} onChange={(e) => setGazalSide(e.target.value)}><option value="home">Local</option><option value="away">Visitante</option></select></label>
      </section>

      {error && <div className="live-alert live-alert--error">{error}</div>}

      {players.length === 0 ? (
        <div className="card season-empty">
          <strong>Plantilla {CURRENT_SEASON_ID} pendiente</strong>
          <span>Antes de preparar un Live habrá que dar de alta la plantilla actual desde Admin. No se usarán jugadores de 2025-2026 como fallback.</span>
        </div>
      ) : (
        <>
          <section className="live-roster-picker">
            {players.map((player) => {
              const id = playerKey(player);
              const number = String(player.number);
              const isSelected = selectedSet.has(id);
              const isStarter = starterSet.has(id);
              return (
                <article key={id} className={`live-roster-card${isSelected ? " live-roster-card--selected" : ""}${isStarter ? " live-roster-card--starter" : ""}`}>
                  <button type="button" className="live-roster-card__main" onClick={() => toggleRoster(id)}>
                    <span className="live-roster-card__number">#{number}</span>
                    <span className="live-roster-card__name">{player.name}</span>
                    <span className="live-roster-card__state">{isSelected ? "Convocado" : "Fuera"}</span>
                  </button>
                  <button type="button" className="live-roster-card__starter" disabled={!isSelected} onClick={() => toggleStarter(id)}>
                    {isStarter ? "★ Titular" : "☆ Titular"}
                  </button>
                </article>
              );
            })}
          </section>
          <div className="live-setup__footer">
            <button type="button" className="live-primary-action" onClick={startGame}>Entrar a Live Stats →</button>
          </div>
        </>
      )}
    </div>
  );
}
