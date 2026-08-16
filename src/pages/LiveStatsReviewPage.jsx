import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  buildLiveReviewSnapshot,
  reopenFinalPeriodForCorrection,
} from "../features/live-stats/liveReview.js";
import { publishLiveReview } from "../features/live-stats/livePublication.js";
import { clearLiveSession } from "../features/live-stats/localSession.js";
import "../live-review.css";

function formatMinutes(ms) {
  const totalSeconds = Math.max(0, Math.round(Number(ms || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatShot(made, attempted) {
  return `${Number(made || 0)}/${Number(attempted || 0)}`;
}

function issueLabel(level) {
  if (level === "error") return "BLOQUEANTE";
  if (level === "warning") return "REVISAR";
  return "INFO";
}

function playerNameMap(players) {
  return new Map((players || []).map((player) => [String(player.id), player]));
}

function LineupTable({ snapshot }) {
  const names = playerNameMap(snapshot.players);
  if (!snapshot.lineupSummary.length) {
    return <p className="live-review__empty">No hay stints de quinteto disponibles.</p>;
  }

  return (
    <div className="live-review__table-wrap">
      <table className="live-review__table live-review__table--lineups">
        <thead>
          <tr>
            <th>Quinteto</th><th>Tiempo</th><th>Stints</th><th>PF</th><th>PC</th><th>+/-</th>
          </tr>
        </thead>
        <tbody>
          {snapshot.lineupSummary.map((lineup) => (
            <tr key={lineup.lineupKey}>
              <td className="live-review__lineup-names">
                {lineup.lineupIds.map((id) => {
                  const player = names.get(String(id));
                  return player ? `#${player.number} ${player.name}` : String(id);
                }).join(" · ")}
              </td>
              <td>{formatMinutes(lineup.durationMs)}</td>
              <td>{lineup.stints}</td>
              <td>{lineup.gazalbidePts}</td>
              <td>{lineup.opponentPts}</td>
              <td className={lineup.plusMinus > 0 ? "is-positive" : lineup.plusMinus < 0 ? "is-negative" : ""}>
                {lineup.plusMinus > 0 ? "+" : ""}{lineup.plusMinus}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function LiveStatsReviewPage() {
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);
  const [actionError, setActionError] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publicationResult, setPublicationResult] = useState(null);
  const snapshot = useMemo(() => buildLiveReviewSnapshot(), [refreshKey]);

  if (!snapshot && !publicationResult) {
    return (
      <section className="live-review card card--p">
        <h1>Revisión del partido</h1>
        <p className="text-dim">No hay una sesión Live preparada para revisar.</p>
        <button type="button" onClick={() => navigate("/admin/live/setup")}>Preparar partido</button>
      </section>
    );
  }

  if (publicationResult) {
    const priceWarning = publicationResult.price_warning || null;
    const economyWarning = publicationResult.fantasy_economy?.warning || null;
    return (
      <div className="live-review">
        <section className="live-review__publish-gate card card--p is-ready">
          <div>
            <span>PARTIDO PUBLICADO</span>
            <h1>Publicación v{publicationResult.publication_version} completada</h1>
            <p>
              Las estadísticas oficiales ya están materializadas en Supabase y el partido ha pasado a estado publicado.
            </p>
            <p>
              Fantasy: {publicationResult.gameweek_id
                ? `jornada ${publicationResult.gameweek_id} enlazada`
                : "sin jornada enlazada (no se ha creado ninguna automáticamente)"}.
              {publicationResult.price_proposals >= 0
                ? ` · ${publicationResult.price_proposals} propuestas de precio generadas.`
                : " · La propuesta de precios requiere revisión manual."}
            </p>
            {economyWarning ? <div className="live-review__action-error">Fantasy: {economyWarning}</div> : null}
            {priceWarning ? <div className="live-review__action-error">Precios: {priceWarning}</div> : null}
          </div>
          <div className="live-review__action-buttons">
            <button type="button" onClick={() => navigate(`/partido/${publicationResult.match_id}`)}>
              Ver partido publicado
            </button>
            <button type="button" onClick={() => navigate("/admin/live/setup")}>
              Volver a Live Stats
            </button>
          </div>
        </section>
      </div>
    );
  }

  const { setup, state, players, issues } = snapshot;
  const errorCount = snapshot.blockingIssues.length;
  const warningCount = snapshot.warningIssues.length;
  const totalPlayedMs = players.reduce((sum, player) => sum + Number(player.playedMs || 0), 0);
  const teamTotals = players.reduce((totals, player) => {
    const stats = player.stats || {};
    for (const key of ["pts", "ftm", "fta", "two_pm", "two_pa", "three_pm", "three_pa", "reb", "oreb", "dreb", "ast", "tov", "stl", "blk", "pf", "pfd", "plus_minus"]) {
      totals[key] = Number(totals[key] || 0) + Number(stats[key] || 0);
    }
    return totals;
  }, {});

  function openHistory() {
    navigate("/admin/live?panel=history");
  }

  function reopenPeriod() {
    setActionError("");
    if (!window.confirm(
      "Se reabrirá únicamente el último periodo para poder corregir reloj/minutos. El marcador y las acciones no se borrarán. ¿Continuar?"
    )) return;

    try {
      reopenFinalPeriodForCorrection();
      navigate("/admin/live?panel=clock");
    } catch (error) {
      setActionError(error.message || "No se pudo reabrir el periodo final.");
      setRefreshKey((value) => value + 1);
    }
  }

  async function publishMatch() {
    setActionError("");
    if (!snapshot.readyToPublish || publishing) return;
    if (!window.confirm(
      `¿Publicar Gazalbide ${state.score.gazalbide}–${state.score.opponent} ${setup.opponent}? Esta versión pasará a ser la estadística oficial.`
    )) return;

    setPublishing(true);
    try {
      // Rebuild immediately before the network handoff. A local correction made
      // after this page was rendered invalidates the reviewed fingerprint.
      const latest = buildLiveReviewSnapshot();
      if (!latest?.readyToPublish) {
        throw new Error("La versión actual ya no supera las validaciones. Actualiza la revisión.");
      }
      if (latest.sourceFingerprint !== snapshot.sourceFingerprint) {
        setRefreshKey((value) => value + 1);
        throw new Error("El Live ha cambiado desde esta revisión. Revisa de nuevo antes de publicar.");
      }

      const result = await publishLiveReview(latest.publicationDraft);
      setPublicationResult(result);
      clearLiveSession();
    } catch (error) {
      console.error("Error publicando partido Live:", error);
      setActionError(
        error?.message || "No se pudo publicar. No se ha materializado una publicación parcial."
      );
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="live-review">
      <header className="live-review__hero card card--p">
        <div>
          <span className="live-review__eyebrow">REVISIÓN PREVIA A PUBLICAR</span>
          <h1>Gazalbide vs {setup.opponent}</h1>
          <p>{setup.matchDate} · {state.period <= 4 ? `Q${state.period}` : `OT${state.period - 4}`} finalizado</p>
        </div>
        <div className="live-review__score" aria-label="Marcador final">
          <strong>{state.score.gazalbide}</strong><span>–</span><strong>{state.score.opponent}</strong>
        </div>
        <div className={`live-review__status ${snapshot.readyToPublish ? "is-ready" : "is-blocked"}`}>
          <strong>{snapshot.readyToPublish ? "LISTO PARA PUBLICAR" : `${errorCount} BLOQUEO${errorCount === 1 ? "" : "S"}`}</strong>
          <span>
            {snapshot.readyToPublish
              ? warningCount > 0
                ? `${warningCount} aviso${warningCount === 1 ? "" : "s"} no bloqueante${warningCount === 1 ? "" : "s"}`
                : "Validaciones superadas"
              : "Corrige los errores antes de publicar"}
          </span>
        </div>
      </header>

      {actionError ? <div className="live-review__action-error">{actionError}</div> : null}

      <section className="live-review__actions card card--p">
        <div>
          <strong>Correcciones antes de publicar</strong>
          <span>Las estadísticas se derivan de las acciones Live; se corrige la fuente, no una copia del box score.</span>
        </div>
        <div className="live-review__action-buttons">
          <button type="button" onClick={openHistory}>Corregir acciones</button>
          <button type="button" onClick={reopenPeriod}>Reabrir periodo / reloj</button>
          <button type="button" onClick={() => navigate("/admin/live")}>Volver al Live</button>
        </div>
      </section>

      <section className="live-review__validation card card--p">
        <div className="live-review__section-title">
          <div><span>VALIDACIONES</span><h2>Integridad del partido</h2></div>
          <div className="live-review__validation-counts">
            <b className={errorCount ? "is-negative" : "is-positive"}>{errorCount} bloqueantes</b>
            <b>{warningCount} avisos</b>
          </div>
        </div>

        {issues.length === 0 ? (
          <div className="live-review__all-good">✓ Marcador, minutos, tiros, faltas, +/- y quintetos son coherentes.</div>
        ) : (
          <div className="live-review__issues">
            {issues.map((issue) => (
              <article key={issue.code} className={`live-review__issue live-review__issue--${issue.level}`}>
                <span>{issueLabel(issue.level)}</span>
                <div><strong>{issue.title}</strong><p>{issue.detail}</p></div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="live-review__summary-grid">
        <article className="card card--p live-review__metric"><span>MINUTOS JUGADOR</span><strong>{formatMinutes(totalPlayedMs)}</strong><small>Esperado: {formatMinutes(snapshot.expectedGameDurationMs * 5)}</small></article>
        <article className="card card--p live-review__metric"><span>EVENTOS ACTIVOS</span><strong>{snapshot.activeEventCount}</strong><small>{snapshot.voidEventCount} anulados conservados</small></article>
        <article className="card card--p live-review__metric"><span>QUINTETOS</span><strong>{snapshot.lineupSummary.length}</strong><small>Combinaciones utilizadas</small></article>
        <article className="card card--p live-review__metric"><span>REVISIÓN</span><strong>{snapshot.sourceFingerprint}</strong><small>Huella de esta versión del Live</small></article>
      </section>

      <section className="card card--p live-review__players">
        <div className="live-review__section-title">
          <div><span>BOX SCORE</span><h2>Jugadores</h2></div>
          <div className="live-review__team-total"><b>{teamTotals.pts || 0} PTS</b><b>{teamTotals.reb || 0} REB</b><b>{teamTotals.ast || 0} AST</b></div>
        </div>
        <div className="live-review__table-wrap">
          <table className="live-review__table">
            <thead><tr><th>Jugador</th><th>MIN</th><th>PTS</th><th>TL</th><th>T2</th><th>T3</th><th>REB</th><th>AST</th><th>PÉR</th><th>ROB</th><th>TAP</th><th>F</th><th>+/-</th></tr></thead>
            <tbody>
              {players.map((player) => {
                const stats = player.stats || {};
                return (
                  <tr key={player.id}>
                    <td className="live-review__player-name"><b>#{player.number}</b> {player.name}</td>
                    <td>{formatMinutes(player.playedMs)}</td><td><b>{stats.pts || 0}</b></td>
                    <td>{formatShot(stats.ftm, stats.fta)}</td><td>{formatShot(stats.two_pm, stats.two_pa)}</td><td>{formatShot(stats.three_pm, stats.three_pa)}</td>
                    <td>{stats.reb || 0}</td><td>{stats.ast || 0}</td><td>{stats.tov || 0}</td><td>{stats.stl || 0}</td><td>{stats.blk || 0}</td><td>{stats.pf || 0}</td>
                    <td className={stats.plus_minus > 0 ? "is-positive" : stats.plus_minus < 0 ? "is-negative" : ""}>{stats.plus_minus > 0 ? "+" : ""}{stats.plus_minus || 0}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr><th>Equipo</th><th>{formatMinutes(totalPlayedMs)}</th><th>{teamTotals.pts || 0}</th><th>{formatShot(teamTotals.ftm, teamTotals.fta)}</th><th>{formatShot(teamTotals.two_pm, teamTotals.two_pa)}</th><th>{formatShot(teamTotals.three_pm, teamTotals.three_pa)}</th><th>{teamTotals.reb || 0}</th><th>{teamTotals.ast || 0}</th><th>{teamTotals.tov || 0}</th><th>{teamTotals.stl || 0}</th><th>{teamTotals.blk || 0}</th><th>{teamTotals.pf || 0}</th><th>{teamTotals.plus_minus || 0}</th></tr></tfoot>
          </table>
        </div>
      </section>

      <section className="card card--p live-review__lineups">
        <div className="live-review__section-title"><div><span>+/- DE QUINTETOS</span><h2>Stints consolidados</h2></div></div>
        <LineupTable snapshot={snapshot} />
      </section>

      {snapshot.staffDiscipline.length > 0 ? (
        <section className="card card--p live-review__staff">
          <div className="live-review__section-title"><div><span>DISCIPLINA</span><h2>Staff</h2></div></div>
          <div className="live-review__staff-list">
            {snapshot.staffDiscipline.map((item) => (
              <div key={item.staffId}><b>Staff {item.staffId}</b><span>{item.total} incidencia{item.total === 1 ? "" : "s"} · {item.technical} técnicas · {item.disqualifying} descalificantes</span></div>
            ))}
          </div>
        </section>
      ) : null}

      <section className={`live-review__publish-gate card card--p ${snapshot.readyToPublish ? "is-ready" : "is-blocked"}`}>
        <div>
          <span>PUBLICACIÓN OFICIAL</span>
          <h2>{snapshot.readyToPublish ? "La versión actual está preparada" : "Publicación bloqueada"}</h2>
          <p>
            {snapshot.readyToPublish
              ? "Al publicar, Supabase volverá a contrastar marcador, eventos, box score y minutos antes de materializar la versión oficial. Si algo ha cambiado, la operación completa se cancela."
              : "Resuelve todos los errores bloqueantes y vuelve a esta pantalla. Los avisos no bloqueantes pueden revisarse manualmente."}
          </p>
        </div>
        <button type="button" disabled={!snapshot.readyToPublish || publishing} onClick={publishMatch}>
          {publishing ? "PUBLICANDO…" : snapshot.readyToPublish ? "PUBLICAR PARTIDO" : "PUBLICAR BLOQUEADO"}
        </button>
      </section>
    </div>
  );
}
