import { useEffect, useMemo, useState } from "react";
import {
  loadHistoricalPlayerRows,
  loadPlayerDisciplineAdjustments,
} from "../lib/historyRepository.js";
import {
  aggregatePlayerRows,
  bestGame,
  formatSeconds,
  percentage,
  playerSeasonSummary,
} from "../lib/historyStats.js";
import "../history-advanced.css";

const RECORDS = [
  { key: "pts", label: "PTS" },
  { key: "pir", label: "PIR" },
  { key: "reb", label: "REB" },
  { key: "ast", label: "AST" },
  { key: "three_pm", label: "3PM" },
  { key: "plus_minus", label: "+/-" },
];

function deltaBadge(value) {
  if (!Number.isFinite(value) || Math.abs(value) < 0.005) return null;
  const up = value > 0;
  return (
    <span className={`player-season-delta player-season-delta--${up ? "up" : "down"}`}>
      {up ? "↑" : "↓"} {Math.abs(value).toFixed(1)}
    </span>
  );
}

export default function PlayerCareerPanel({ playerId, playerName }) {
  const [rows, setRows] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      loadHistoricalPlayerRows(),
      loadPlayerDisciplineAdjustments(),
    ])
      .then(([allRows, allAdjustments]) => {
        if (cancelled) return;
        const normalizedName = String(playerName || "").trim().toLowerCase();
        const filteredRows = (allRows || []).filter((row) =>
          playerId != null
            ? Number(row.playerId) === Number(playerId)
            : String(row.playerName || "").trim().toLowerCase() === normalizedName
        );
        const resolvedPlayerId = playerId ?? filteredRows[0]?.playerId ?? null;
        const filteredAdjustments = (allAdjustments || []).filter((row) =>
          resolvedPlayerId != null && Number(row.player_id) === Number(resolvedPlayerId)
        );
        setRows(filteredRows);
        setAdjustments(filteredAdjustments);
        setError("");
      })
      .catch((loadError) => {
        console.error("Error cargando carrera del jugador:", loadError);
        if (!cancelled) setError("No se pudo cargar el histórico de carrera.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [playerId, playerName]);

  const career = useMemo(() => playerSeasonSummary(rows), [rows]);
  const aggregate = useMemo(
    () => aggregatePlayerRows(rows, adjustments)[0] || null,
    [rows, adjustments]
  );

  const seasons = useMemo(() => {
    const grouped = new Map();
    for (const row of rows) {
      if (!row.season) continue;
      if (!grouped.has(row.season)) grouped.set(row.season, []);
      grouped.get(row.season).push(row);
    }
    return Array.from(grouped.entries())
      .map(([season, seasonRows]) => ({ season, ...playerSeasonSummary(seasonRows) }))
      .sort((a, b) => a.season.localeCompare(b.season));
  }, [rows]);

  const records = useMemo(
    () => RECORDS.map((record) => ({ ...record, row: bestGame(rows, record.key) })),
    [rows]
  );

  if (loading) return <section className="card card--p player-career-panel">Cargando carrera…</section>;
  if (error) return <section className="card card--p player-career-panel history-error">{error}</section>;
  if (rows.length === 0) return null;

  return (
    <section className="card card--p player-career-panel">
      <div className="player-career-panel__header">
        <div>
          <h2>Carrera Gazalbide</h2>
          <p>{career.games} partidos oficiales · {seasons.length} temporada{seasons.length === 1 ? "" : "s"}</p>
        </div>
      </div>

      <div className="player-career-kpis">
        <div className="player-career-kpi"><span>PTS / partido</span><strong>{career.pts_avg.toFixed(1)}</strong></div>
        <div className="player-career-kpi"><span>PIR / partido</span><strong>{career.pir_avg.toFixed(1)}</strong></div>
        <div className="player-career-kpi"><span>MIN / partido</span><strong>{formatSeconds(career.min_avg)}</strong></div>
        <div className="player-career-kpi"><span>+/- carrera</span><strong>{career.plus_minus > 0 ? "+" : ""}{career.plus_minus}</strong></div>
        <div className="player-career-kpi"><span>3P% carrera</span><strong>{percentage(career.three_pm, career.three_pa).toFixed(1)}%</strong></div>
        <div className="player-career-kpi"><span>Técnicas</span><strong>{aggregate?.technical || 0}</strong></div>
      </div>

      <h3 className="player-career-section-title">Récords personales</h3>
      <div className="player-record-grid">
        {records.map(({ key, label, row }) => (
          <div className="player-record-card" key={key}>
            <span>{label}</span>
            <strong>{Number(row?.[key] || 0) > 0 && key === "plus_minus" ? "+" : ""}{Number(row?.[key] || 0)}</strong>
            <small>{row ? `${row.date || "—"} · vs ${row.opponent} · ${row.season}` : "Sin datos"}</small>
          </div>
        ))}
      </div>

      <h3 className="player-career-section-title">Comparación por temporada</h3>
      <div className="player-season-table-wrap">
        <table className="table ranking-table">
          <thead>
            <tr><th>Temporada</th><th>PJ</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>PIR</th><th>+/-</th><th>FG%</th><th>3P%</th><th>TL%</th></tr>
          </thead>
          <tbody>
            {seasons.map((season, index) => {
              const previous = index > 0 ? seasons[index - 1] : null;
              return (
                <tr key={season.season}>
                  <td><strong>{season.season}</strong></td>
                  <td>{season.games}</td>
                  <td>{formatSeconds(season.min_avg)}</td>
                  <td>{season.pts_avg.toFixed(1)}{previous ? deltaBadge(season.pts_avg - previous.pts_avg) : null}</td>
                  <td>{season.reb_avg.toFixed(1)}</td>
                  <td>{season.ast_avg.toFixed(1)}</td>
                  <td>{season.pir_avg.toFixed(1)}{previous ? deltaBadge(season.pir_avg - previous.pir_avg) : null}</td>
                  <td>{season.plus_minus > 0 ? "+" : ""}{season.plus_minus}</td>
                  <td>{season.fg_pct.toFixed(1)}%</td>
                  <td>{season.three_pct.toFixed(1)}%</td>
                  <td>{season.ft_pct.toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
