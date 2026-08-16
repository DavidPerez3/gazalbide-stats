import { useEffect, useMemo, useState } from "react";
import ExcelExportButton from "../components/ExcelExportButton.jsx";
import { useSeason } from "../context/SeasonContext.jsx";
import {
  loadHistoricalPlayerRows,
  loadLineupHistory,
  loadPlayerDisciplineAdjustments,
  loadStaffDisciplineHistory,
} from "../lib/historyRepository.js";
import {
  exportLineupsExcel,
  exportMatchExcel,
  exportSeasonExcel,
} from "../lib/excelExports.js";
import { SEASONS } from "../lib/seasons.js";
import { supabase } from "../lib/supabaseClient.js";
import "../exports.css";

function scopeLabel(scope) {
  return scope === "all" ? "Histórico completo" : `Temporada ${scope}`;
}

export default function ExportCenterPage() {
  const { activeSeason } = useSeason();
  const [scope, setScope] = useState(activeSeason.id);
  const [playerRows, setPlayerRows] = useState([]);
  const [disciplineAdjustments, setDisciplineAdjustments] = useState([]);
  const [lineupRows, setLineupRows] = useState([]);
  const [staffPayload, setStaffPayload] = useState({ events: [], adjustments: [] });
  const [matches, setMatches] = useState([]);
  const [matchId, setMatchId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const seasonId = scope === "all" ? null : scope;
    setLoading(true);
    setError("");

    const matchQuery = (() => {
      let query = supabase
        .from("matches")
        .select("id,season,date,opponent,gazal_pts,opp_pts,result")
        .eq("status", "published")
        .order("date", { ascending: false });
      if (seasonId) query = query.eq("season", seasonId);
      return query;
    })();

    Promise.all([
      loadHistoricalPlayerRows({ seasonId }),
      loadPlayerDisciplineAdjustments({ seasonId }),
      loadLineupHistory({ seasonId }),
      loadStaffDisciplineHistory({ seasonId }),
      matchQuery,
    ])
      .then(([stats, adjustments, lineups, staff, matchesResult]) => {
        if (cancelled) return;
        if (matchesResult.error) throw matchesResult.error;
        const nextMatches = matchesResult.data || [];
        setPlayerRows(stats || []);
        setDisciplineAdjustments(adjustments || []);
        setLineupRows(lineups || []);
        setStaffPayload(staff || { events: [], adjustments: [] });
        setMatches(nextMatches);
        setMatchId((current) => nextMatches.some((match) => match.id === current) ? current : (nextMatches[0]?.id || ""));
      })
      .catch((loadError) => {
        console.error("Error preparando exportaciones:", loadError);
        if (!cancelled) setError("No se pudieron cargar los datos oficiales para exportar.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [scope]);

  const selectedMatch = useMemo(
    () => matches.find((match) => match.id === matchId) || null,
    [matches, matchId]
  );

  const matchOption = (match) => {
    const score = Number.isFinite(Number(match.gazal_pts)) && Number.isFinite(Number(match.opp_pts))
      ? ` · ${match.gazal_pts}-${match.opp_pts}`
      : "";
    return `${match.date} · vs ${match.opponent}${score}`;
  };

  const exportPayload = {
    scope,
    playerRows,
    disciplineAdjustments,
    lineupRows,
    staffPayload,
  };

  return (
    <section className="exports-page">
      <header className="exports-page__header">
        <div>
          <p className="exports-page__eyebrow">Administración · Datos oficiales</p>
          <h1>Exportaciones Excel</h1>
          <p className="text-dim">
            Descarga copias de trabajo de las estadísticas publicadas. Los Excel son una salida; Supabase sigue siendo la fuente oficial.
          </p>
        </div>
        <label className="stats-field exports-page__scope">
          <span>Periodo</span>
          <select className="input" value={scope} onChange={(event) => setScope(event.target.value)}>
            {SEASONS.map((season) => (
              <option key={season.id} value={season.id}>{season.label}</option>
            ))}
            <option value="all">Histórico completo</option>
          </select>
        </label>
      </header>

      {loading ? <div className="card card--p">Preparando datos oficiales…</div> : null}
      {error ? <div className="card card--p exports-page__error">{error}</div> : null}

      {!loading && !error ? (
        <div className="exports-page__grid">
          <article className="card card--p exports-card">
            <div className="exports-card__icon" aria-hidden="true">📚</div>
            <div>
              <span className="exports-card__kicker">{scopeLabel(scope)}</span>
              <h2>Temporada / histórico</h2>
              <p>
                Partidos, totales por jugador, medias por partido, estadísticas por 40, detalle jugador-partido, quintetos y disciplina de staff.
              </p>
            </div>
            <div className="exports-card__meta">
              <span>{matches.length} partidos publicados</span>
              <span>{new Set(playerRows.map((row) => row.player_id)).size} jugadores</span>
            </div>
            <ExcelExportButton
              className="btn--primary"
              onExport={() => exportSeasonExcel(exportPayload)}
            >
              Descargar temporada Excel
            </ExcelExportButton>
          </article>

          <article className="card card--p exports-card">
            <div className="exports-card__icon" aria-hidden="true">🖐️</div>
            <div>
              <span className="exports-card__kicker">Quintetos y +/-</span>
              <h2>Combinaciones en pista</h2>
              <p>
                Resumen agregado y detalle por partido con minutos juntos, número de tramos, puntos a favor/en contra, +/- y +/- por 40.
              </p>
            </div>
            <div className="exports-card__meta">
              <span>{lineupRows.length} registros de quinteto</span>
              {lineupRows.length === 0 ? <span>El histórico 2025-2026 no dispone de tramos de quinteto registrados.</span> : null}
            </div>
            <ExcelExportButton
              onExport={() => exportLineupsExcel({ scope, lineupRows, playerRows, disciplineAdjustments })}
            >
              Descargar quintetos Excel
            </ExcelExportButton>
          </article>

          <article className="card card--p exports-card exports-card--match">
            <div className="exports-card__icon" aria-hidden="true">🏀</div>
            <div>
              <span className="exports-card__kicker">Partido oficial</span>
              <h2>Box score de un partido</h2>
              <p>
                Resumen, parciales, box score completo y quintetos del partido cuando se hayan registrado con Live Stats.
              </p>
            </div>
            {matches.length ? (
              <label className="stats-field exports-card__match-select">
                <span>Partido</span>
                <select className="input" value={matchId} onChange={(event) => setMatchId(event.target.value)}>
                  {matches.map((match) => <option key={match.id} value={match.id}>{matchOption(match)}</option>)}
                </select>
              </label>
            ) : (
              <p className="text-dim">No hay partidos publicados en este periodo.</p>
            )}
            <ExcelExportButton
              onExport={() => exportMatchExcel(matchId)}
              className="btn--primary"
            >
              {selectedMatch ? `Descargar vs ${selectedMatch.opponent}` : "Descargar partido"}
            </ExcelExportButton>
          </article>
        </div>
      ) : null}
    </section>
  );
}
