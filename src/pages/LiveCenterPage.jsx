import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import BestLineupCard from "../components/BestLineupCard.jsx";
import {
  loadLiveCenterSnapshot,
  subscribeLiveCenter,
} from "../lib/liveCenter.js";
import { loadFantasyLive } from "../lib/fantasyLive.js";
import "../live-center.css";

function periodLabel(period) {
  const value = Math.max(1, Number(period || 1));
  return value <= 4 ? `Q${value}` : `OT${value - 4}`;
}

function formatClock(ms) {
  const total = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function formatMinutes(ms) {
  const total = Math.max(0, Math.round(Number(ms || 0) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function phaseCopy(phase) {
  switch (phase) {
    case "live": return { label: "EN DIRECTO", tone: "live", detail: "Datos provisionales actualizados desde Live Stats" };
    case "paused": return { label: "PAUSA", tone: "paused", detail: "El reloj está detenido" };
    case "review": return { label: "PENDIENTE DE REVISIÓN", tone: "review", detail: "Finalizado en pista · todavía no es oficial" };
    case "official": return { label: "OFICIAL", tone: "official", detail: "Partido revisado y publicado" };
    default: return { label: "PREVIO", tone: "pregame", detail: "Esperando el inicio del partido" };
  }
}

function decorateFantasy(previous, next) {
  if (!next?.available) return next;
  const previousRows = new Map((previous?.rows || []).map((row) => [row.teamId, row]));
  const rows = (next.rows || []).map((row) => {
    const before = previousRows.get(row.teamId);
    const previousPlayers = new Map(
      (before?.breakdown?.players || []).map((player) => [Number(player.number), player])
    );
    const breakdown = row.breakdown
      ? {
          ...row.breakdown,
          players: row.breakdown.players.map((player) => ({
            ...player,
            liveDelta: before
              ? Number(player.finalScore || 0) - Number(previousPlayers.get(Number(player.number))?.finalScore || 0)
              : 0,
          })),
        }
      : null;
    return {
      ...row,
      breakdown,
      positionDelta: before ? Number(before.position || 0) - Number(row.position || 0) : 0,
      pointsDelta: before ? Number(row.gameweekPoints || 0) - Number(before.gameweekPoints || 0) : 0,
    };
  });
  return {
    ...next,
    rows,
    myTeam: rows.find((row) => row.userId === next.myTeam?.userId) || null,
  };
}

function FantasyPanel({ fantasy, user, view, setView }) {
  if (!user) {
    return (
      <section className="live-center__fantasy card card--p">
        <div className="live-center__section-heading">
          <div><span>FANTASY LIVE</span><h2>Puntuación en directo</h2></div>
          <b>LOGIN</b>
        </div>
        <p className="text-dim">El partido es público. Para ver equipos, capitán, sinergias y ranking Fantasy inicia sesión.</p>
        <Link className="live-center__button" to="/login">Iniciar sesión</Link>
      </section>
    );
  }

  if (!fantasy) {
    return <section className="live-center__fantasy card card--p"><p className="text-dim">Calculando Fantasy Live…</p></section>;
  }

  if (!fantasy.available) {
    const copy = {
      no_gameweek: "Este partido no está vinculado a una jornada Fantasy.",
      ambiguous_gameweek: "Hay más de una jornada compatible y no se mostrará un ranking provisional hasta resolverlo.",
      deadline_not_passed: "Fantasy Live se desbloqueará cuando haya pasado el deadline de la jornada.",
      login_required: "Inicia sesión para ver Fantasy Live.",
    }[fantasy.reason] || "Fantasy Live no está disponible para este partido.";
    return (
      <section className="live-center__fantasy card card--p">
        <div className="live-center__section-heading"><div><span>FANTASY LIVE</span><h2>No disponible</h2></div></div>
        <p className="text-dim">{copy}</p>
      </section>
    );
  }

  const myTeam = fantasy.myTeam;
  const rows = fantasy.rows || [];

  return (
    <section className="live-center__fantasy card card--p">
      <div className="live-center__section-heading">
        <div>
          <span>FANTASY LIVE · {fantasy.label}</span>
          <h2>{fantasy.gameweek?.name || "Jornada Fantasy"}</h2>
        </div>
        <div className="live-center__segmented">
          <button type="button" className={view === "mine" ? "is-active" : ""} onClick={() => setView("mine")}>Mi equipo</button>
          <button type="button" className={view === "ranking" ? "is-active" : ""} onClick={() => setView("ranking")}>Ranking</button>
        </div>
      </div>

      {fantasy.phase !== "official" ? (
        <div className="live-center__provisional-note">
          {fantasy.phase === "review"
            ? "El partido ha terminado, pero estas puntuaciones siguen siendo provisionales hasta la publicación oficial."
            : "Puntuaciones provisionales: un Undo o una corrección en Live Stats puede cambiarlas al instante."}
        </div>
      ) : null}

      {view === "mine" ? (
        !myTeam ? (
          <p className="text-dim">No tienes equipo Fantasy en esta temporada.</p>
        ) : (
          <div className="fantasy-live-team">
            <div className="fantasy-live-team__hero">
              <div>
                <span>#{myTeam.position} · {myTeam.teamName}</span>
                <strong>{Number(myTeam.gameweekPoints || 0).toFixed(1)} pts</strong>
                <small>{Number(myTeam.totalPoints || 0).toFixed(1)} pts acumulados</small>
              </div>
              {myTeam.positionDelta ? (
                <b className={myTeam.positionDelta > 0 ? "is-positive" : "is-negative"}>
                  {myTeam.positionDelta > 0 ? "↑" : "↓"} {Math.abs(myTeam.positionDelta)} puesto{Math.abs(myTeam.positionDelta) === 1 ? "" : "s"}
                </b>
              ) : null}
            </div>
            {myTeam.validLineup && myTeam.breakdown ? (
              <div className="fantasy-live-players">
                {myTeam.breakdown.players.map((player) => (
                  <div key={player.number} className={`fantasy-live-player ${player.liveDelta ? "is-changing" : ""}`}>
                    <div>
                      <strong>#{player.number} {player.name}</strong>
                      <span>PIR {Number(player.pirBase || 0).toFixed(0)}{player.synergies?.length ? ` · ${player.synergies.join(" · ")}` : ""}</span>
                    </div>
                    <div>
                      <b>{Number(player.finalScore || 0).toFixed(1)}</b>
                      {Math.abs(Number(player.liveDelta || 0)) > 0.001 ? (
                        <small className={player.liveDelta > 0 ? "is-positive" : "is-negative"}>
                          {player.liveDelta > 0 ? "+" : ""}{player.liveDelta.toFixed(1)}
                        </small>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-dim">Esta alineación no es válida para puntuar en la jornada.</p>
            )}
          </div>
        )
      ) : (
        <div className="fantasy-live-ranking">
          {rows.length === 0 ? <p className="text-dim">Todavía no hay equipos puntuando.</p> : rows.map((row) => (
            <div key={row.teamId} className={`fantasy-live-ranking__row ${row.userId === user.id ? "is-me" : ""}`}>
              <span className="fantasy-live-ranking__pos">#{row.position}</span>
              <div><strong>{row.teamName}</strong><small>{row.ownerName}</small></div>
              <div className="fantasy-live-ranking__points">
                <b>{Number(row.totalPoints || 0).toFixed(1)}</b>
                <span>+ {Number(row.gameweekPoints || 0).toFixed(1)} J</span>
              </div>
              <div className="fantasy-live-ranking__movement">
                {row.positionDelta ? (
                  <span className={row.positionDelta > 0 ? "is-positive" : "is-negative"}>
                    {row.positionDelta > 0 ? "↑" : "↓"}{Math.abs(row.positionDelta)}
                  </span>
                ) : "·"}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function LiveCenterPage() {
  const { matchId } = useParams();
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState(null);
  const [fantasy, setFantasy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [fantasyView, setFantasyView] = useState("mine");
  const previousFantasyRef = useRef(null);
  const refreshTimerRef = useRef(null);

  const refresh = useCallback(async ({ quiet = false } = {}) => {
    if (!matchId) return;
    if (!quiet) setLoading(true);
    try {
      const nextSnapshot = await loadLiveCenterSnapshot(matchId);
      if (!nextSnapshot) {
        setSnapshot(null);
        setError("Partido no encontrado o todavía no visible públicamente.");
        return;
      }
      setSnapshot(nextSnapshot);
      setError("");

      if (user) {
        const nextFantasy = decorateFantasy(
          previousFantasyRef.current,
          await loadFantasyLive(nextSnapshot, user.id)
        );
        previousFantasyRef.current = nextFantasy;
        setFantasy(nextFantasy);
      } else {
        previousFantasyRef.current = null;
        setFantasy(null);
      }
    } catch (err) {
      console.error("Error cargando Live Center:", err);
      setError(err?.message || "No se pudo cargar el Live Center.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [matchId, user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!matchId) return undefined;
    const unsubscribe = subscribeLiveCenter(matchId, () => {
      window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = window.setTimeout(() => void refresh({ quiet: true }), 120);
    });
    return () => {
      window.clearTimeout(refreshTimerRef.current);
      unsubscribe();
    };
  }, [matchId, refresh]);

  useEffect(() => {
    if (!snapshot?.clock?.running) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [snapshot?.clock?.running]);

  const displayClockMs = useMemo(() => {
    if (!snapshot?.clock) return 0;
    if (!snapshot.clock.running) return Number(snapshot.clock.clockMs || 0);
    const updatedAt = new Date(snapshot.clock.updatedAt).getTime();
    const elapsed = Number.isFinite(updatedAt) ? Math.max(0, now - updatedAt) : 0;
    return Math.max(0, Number(snapshot.clock.clockMs || 0) - elapsed);
  }, [snapshot?.clock, now]);

  async function shareLive() {
    const payload = {
      title: snapshot ? `Gazalbide vs ${snapshot.match.opponent}` : "Gazalbide Live",
      text: "Sigue el partido en Gazalbide Stats",
      url: window.location.href,
    };
    try {
      if (navigator.share) await navigator.share(payload);
      else {
        await navigator.clipboard.writeText(window.location.href);
        window.alert("Enlace del Live copiado.");
      }
    } catch (err) {
      if (err?.name !== "AbortError") console.warn("No se pudo compartir el Live:", err);
    }
  }

  if (loading && !snapshot) {
    return <section className="live-center"><div className="card card--p">Cargando Live Center…</div></section>;
  }

  if (!snapshot) {
    return (
      <section className="live-center">
        <div className="card card--p">
          <h1>Live Center</h1>
          <p className="text-dim">{error || "No hay datos para este partido."}</p>
          <Link to="/">Volver al inicio</Link>
        </div>
      </section>
    );
  }

  const phase = phaseCopy(snapshot.phase);
  const players = [...snapshot.players].sort((a, b) => {
    if (a.onCourt !== b.onCourt) return a.onCourt ? -1 : 1;
    return Number(a.number || 0) - Number(b.number || 0);
  });

  return (
    <section className="live-center">
      <header className="live-center__hero card card--p">
        <div className="live-center__hero-top">
          <div>
            <span className={`live-center__phase live-center__phase--${phase.tone}`}><i />{phase.label}</span>
            <h1>Gazalbide vs {snapshot.match.opponent}</h1>
            <p>{snapshot.match.date} · {phase.detail}</p>
          </div>
          <button type="button" className="live-center__share" onClick={shareLive}>Compartir</button>
        </div>

        <div className="live-center__scoreboard">
          <div><span>GAZALBIDE</span><strong>{snapshot.score.gazalbide}</strong></div>
          <div className="live-center__clock">
            <span>{periodLabel(snapshot.clock.period)}</span>
            <strong>{snapshot.phase === "official" ? "FINAL" : formatClock(displayClockMs)}</strong>
          </div>
          <div><span>{snapshot.match.opponent.toUpperCase()}</span><strong>{snapshot.score.opponent}</strong></div>
        </div>

        <div className="live-center__quarters">
          {snapshot.periodScores.map((row) => (
            <div key={row.period}><span>{periodLabel(row.period)}</span><b>{row.gazalbide}–{row.opponent}</b></div>
          ))}
        </div>
      </header>

      {error ? <div className="live-center__soft-error">Actualización: {error}</div> : null}

      <div className="live-center__grid">
        <section className="card card--p live-center__court-five">
          <div className="live-center__section-heading"><div><span>EN PISTA</span><h2>Quinteto actual</h2></div></div>
          <div className="live-center__five">
            {snapshot.players.filter((player) => player.onCourt).map((player) => (
              <div key={player.id}><b>#{player.number}</b><strong>{player.name}</strong><span>{player.stats.pts || 0} PTS · {player.stats.plus_minus > 0 ? "+" : ""}{player.stats.plus_minus || 0}</span></div>
            ))}
          </div>
        </section>

        <section className="card card--p live-center__last-actions">
          <div className="live-center__section-heading"><div><span>PLAY-BY-PLAY</span><h2>Últimas acciones</h2></div></div>
          <div className="live-center__actions-list">
            {snapshot.recentActions.length ? snapshot.recentActions.map((action, index) => (
              <div key={action.id} className={index === 0 ? "is-latest" : ""}>
                <span>{periodLabel(action.period)} · {formatClock(action.clock_ms)}</span>
                <strong>{action.description}</strong>
              </div>
            )) : <p className="text-dim">Esperando la primera acción.</p>}
          </div>
        </section>
      </div>

      <section className="card card--p live-center__boxscore">
        <div className="live-center__section-heading">
          <div><span>BOX SCORE {snapshot.phase === "official" ? "OFICIAL" : "PROVISIONAL"}</span><h2>Gazalbide</h2></div>
        </div>
        <div className="live-center__table-wrap">
          <table>
            <thead><tr><th>Jugador</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>ROB</th><th>PF</th><th>+/-</th><th>PIR</th></tr></thead>
            <tbody>
              {players.map((player) => (
                <tr key={player.id} className={player.onCourt ? "is-on-court" : ""}>
                  <td><b>#{player.number}</b> {player.name}{player.onCourt ? <span className="live-center__on-court-dot">●</span> : null}</td>
                  <td>{formatMinutes(player.playedMs)}</td>
                  <td>{player.stats.pts || 0}</td>
                  <td>{player.stats.reb || 0}</td>
                  <td>{player.stats.ast || 0}</td>
                  <td>{player.stats.stl || 0}</td>
                  <td>{player.stats.pf || 0}</td>
                  <td>{player.stats.plus_minus > 0 ? "+" : ""}{player.stats.plus_minus || 0}</td>
                  <td><strong>{player.stats.pir || 0}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {snapshot.bestLineup ? <BestLineupCard lineup={snapshot.bestLineup} players={snapshot.players} /> : null}

      <FantasyPanel fantasy={fantasy} user={user} view={fantasyView} setView={setFantasyView} />

      {snapshot.phase === "official" ? (
        <div className="live-center__official-link card card--p">
          <span>El partido ya es oficial.</span>
          <Link to={`/partido/${snapshot.match.id}`}>Abrir estadísticas definitivas →</Link>
        </div>
      ) : null}
    </section>
  );
}
