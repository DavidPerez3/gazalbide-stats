import { useEffect, useMemo, useState } from "react";
import { useSeason } from "../context/SeasonContext.jsx";
import StatLegend from "../components/StatLegend";
import { SEASONS } from "../lib/seasons.js";
import {
  loadHistoricalPlayerRows,
  loadLineupHistory,
  loadPlayerDisciplineAdjustments,
  loadStaffDisciplineHistory,
} from "../lib/historyRepository.js";
import {
  aggregatePlayerRows,
  formatSeconds,
  per40,
  percentage,
} from "../lib/historyStats.js";
import "../history-advanced.css";

const PLAYER_METRICS = [
  { key: "min_seconds", label: "MIN", type: "time", per40: false },
  { key: "pts", label: "PTS", type: "count" },
  { key: "reb", label: "REB", type: "count" },
  { key: "oreb", label: "OREB", type: "count" },
  { key: "dreb", label: "DREB", type: "count" },
  { key: "ast", label: "AST", type: "count" },
  { key: "stl", label: "ROB", type: "count" },
  { key: "blk", label: "BLK", type: "count" },
  { key: "tov", label: "TOV", type: "count" },
  { key: "pf", label: "PF", type: "count" },
  { key: "pfd", label: "PFD", type: "count" },
  { key: "plus_minus", label: "+/-", type: "count" },
  { key: "pir", label: "PIR", type: "count" },
  { key: "eff", label: "EFF", type: "count" },
  { key: "technical", label: "TÉCNICAS", type: "count", per40: false },
  { key: "unsportsmanlike", label: "ANTIDEPORTIVAS", type: "count", per40: false },
  { key: "disruptive", label: "DISRUPTIVAS", type: "count", per40: false },
  { key: "flagrant", label: "FLAGRANTES", type: "count", per40: false },
  { key: "disqualifying", label: "DESCALIFICANTES", type: "count", per40: false },
  { key: "fg_pct", label: "FG%", type: "pct", made: "fgm", att: "fga", per40: false },
  { key: "two_pct", label: "2P%", type: "pct", made: "two_pm", att: "two_pa", per40: false },
  { key: "three_pct", label: "3P%", type: "pct", made: "three_pm", att: "three_pa", per40: false },
  { key: "ft_pct", label: "FT%", type: "pct", made: "ftm", att: "fta", per40: false },
];

function scopeLabel(scope) {
  if (scope === "all") return "Histórico completo";
  return `Temporada ${scope}`;
}

function aggregateLineups(rows, playerMap) {
  const map = new Map();
  for (const row of rows || []) {
    const key = row.lineup_key || [...row.player_ids].sort((a, b) => a - b).join("-");
    const current = map.get(key) || {
      key,
      playerIds: row.player_ids,
      stintCount: 0,
      durationMs: 0,
      gazalPts: 0,
      oppPts: 0,
      plusMinus: 0,
      matches: new Set(),
    };
    current.stintCount += Number(row.stint_count || 0);
    current.durationMs += Number(row.duration_ms || 0);
    current.gazalPts += Number(row.gazal_pts || 0);
    current.oppPts += Number(row.opp_pts || 0);
    current.plusMinus += Number(row.plus_minus || 0);
    current.matches.add(row.match_id);
    map.set(key, current);
  }

  return Array.from(map.values()).map((row) => ({
    ...row,
    games: row.matches.size,
    names: row.playerIds.map((id) => playerMap.get(Number(id))?.name || `#${id}`),
    plusMinusPer40: row.durationMs > 0 ? (row.plusMinus / row.durationMs) * 2400000 : 0,
  }));
}

function aggregateStaff(payload) {
  const map = new Map();
  const ensure = (id, name, code) => {
    const key = String(id || code || name);
    if (!map.has(key)) {
      map.set(key, {
        id: key,
        name: name || "Staff",
        code: code || "",
        technical: 0,
        disqualifying: 0,
        disruptive: 0,
        flagrant: 0,
        seasons: new Set(),
      });
    }
    return map.get(key);
  };

  for (const event of payload?.events || []) {
    const row = ensure(event.staff_id, event.staffName, event.staffCode);
    if (event.season) row.seasons.add(event.season);
    const kind = String(event.foul_kind || "");
    if (["technical", "technical_cat_1", "technical_cat_2"].includes(kind)) row.technical += 1;
    if (kind === "disqualifying") row.disqualifying += 1;
    if (kind === "disruptive") row.disruptive += 1;
    if (kind === "flagrant") row.flagrant += 1;
  }

  for (const adjustment of payload?.adjustments || []) {
    const row = ensure(adjustment.staff_id, adjustment.staffName, adjustment.staffCode);
    if (adjustment.season) row.seasons.add(adjustment.season);
    row.technical += Number(adjustment.technical || 0);
    row.disqualifying += Number(adjustment.disqualifying || 0);
  }

  return Array.from(map.values())
    .map((row) => ({
      ...row,
      seasons: Array.from(row.seasons).sort(),
      total: row.technical + row.disqualifying + row.disruptive + row.flagrant,
    }))
    .sort((a, b) => b.total - a.total || b.technical - a.technical || a.name.localeCompare(b.name));
}

export default function Ranking() {
  const { activeSeason } = useSeason();
  const [scope, setScope] = useState(activeSeason.id);
  const [view, setView] = useState("players");
  const [metric, setMetric] = useState("pts");
  const [mode, setMode] = useState("average");
  const [minLineupMinutes, setMinLineupMinutes] = useState(5);
  const [playerRows, setPlayerRows] = useState([]);
  const [disciplineAdjustments, setDisciplineAdjustments] = useState([]);
  const [lineupRows, setLineupRows] = useState([]);
  const [staffPayload, setStaffPayload] = useState({ events: [], adjustments: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setScope(activeSeason.id);
  }, [activeSeason.id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const seasonId = scope === "all" ? null : scope;

    Promise.all([
      loadHistoricalPlayerRows({ seasonId }),
      loadPlayerDisciplineAdjustments({ seasonId }),
      loadLineupHistory({ seasonId }),
      loadStaffDisciplineHistory({ seasonId }),
    ])
      .then(([stats, adjustments, lineups, staff]) => {
        if (cancelled) return;
        setPlayerRows(stats);
        setDisciplineAdjustments(adjustments);
        setLineupRows(lineups);
        setStaffPayload(staff);
      })
      .catch((loadError) => {
        console.error("Error cargando histórico avanzado:", loadError);
        if (!cancelled) setError("No se pudo cargar el histórico completo desde Supabase.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [scope]);

  const players = useMemo(
    () => aggregatePlayerRows(playerRows, disciplineAdjustments),
    [playerRows, disciplineAdjustments]
  );

  const playerMap = useMemo(
    () => new Map(players.map((player) => [Number(player.playerId), player])),
    [players]
  );

  const lineups = useMemo(
    () => aggregateLineups(lineupRows, playerMap)
      .filter((row) => row.durationMs >= Number(minLineupMinutes || 0) * 60000)
      .sort((a, b) => b.plusMinusPer40 - a.plusMinusPer40 || b.durationMs - a.durationMs),
    [lineupRows, playerMap, minLineupMinutes]
  );

  const staff = useMemo(() => aggregateStaff(staffPayload), [staffPayload]);
  const meta = PLAYER_METRICS.find((item) => item.key === metric) || PLAYER_METRICS[0];
  const allowsPer40 = meta.type === "count" && meta.per40 !== false;

  useEffect(() => {
    if (mode === "per40" && !allowsPer40) setMode("average");
  }, [allowsPer40, mode]);

  const ranking = useMemo(() => {
    return players
      .map((row) => {
        let valueNum = 0;
        let display = "";
        let sub = "";
        if (meta.type === "pct") {
          const made = Number(row[meta.made] || 0);
          const att = Number(row[meta.att] || 0);
          valueNum = percentage(made, att);
          display = `${valueNum.toFixed(1)}%`;
          sub = `${made}/${att}`;
        } else if (meta.type === "time") {
          valueNum = mode === "total"
            ? Number(row.min_seconds || 0)
            : row.games ? Number(row.min_seconds || 0) / row.games : 0;
          display = formatSeconds(valueNum);
        } else if (mode === "per40") {
          valueNum = per40(row[meta.key], row.min_seconds);
          display = valueNum.toFixed(2);
        } else {
          const total = Number(row[meta.key] || 0);
          valueNum = mode === "average" ? (row.games ? total / row.games : 0) : total;
          display = mode === "average" ? valueNum.toFixed(2) : String(valueNum);
        }
        return { ...row, valueNum, display, sub };
      })
      .sort((a, b) => b.valueNum - a.valueNum || b.games - a.games || a.name.localeCompare(b.name));
  }, [players, meta, mode]);

  const modeLabel = meta.type === "pct"
    ? meta.label
    : mode === "total"
      ? `Total ${meta.label}`
      : mode === "per40"
        ? `${meta.label} / 40 min`
        : `Media ${meta.label}`;

  return (
    <section className="stats-page ranking-page history-ranking">
      <header className="stats-page__header history-ranking__header">
        <div className="stats-page__heading">
          <h2>Rankings e histórico</h2>
          <div className="stats-page__season">{scopeLabel(scope)}</div>
        </div>

        <div className="history-ranking__top-controls">
          <label className="stats-field">
            <span>Periodo</span>
            <select className="input" value={scope} onChange={(event) => setScope(event.target.value)}>
              {SEASONS.map((season) => (
                <option key={season.id} value={season.id}>{season.label}</option>
              ))}
              <option value="all">Histórico completo</option>
            </select>
          </label>
        </div>
      </header>

      <div className="history-view-tabs" role="tablist" aria-label="Tipo de ranking">
        <button type="button" className={view === "players" ? "is-active" : ""} onClick={() => setView("players")}>Jugadores</button>
        <button type="button" className={view === "lineups" ? "is-active" : ""} onClick={() => setView("lineups")}>Quintetos</button>
        <button type="button" className={view === "staff" ? "is-active" : ""} onClick={() => setView("staff")}>Disciplina staff</button>
      </div>

      {loading ? <div className="card card--p">Cargando histórico…</div> : null}
      {error ? <div className="card card--p history-error">{error}</div> : null}

      {!loading && !error && view === "players" ? (
        <>
          <div className="history-ranking__filters card card--p">
            <label className="stats-field">
              <span>Métrica</span>
              <select className="input" value={metric} onChange={(event) => setMetric(event.target.value)}>
                {PLAYER_METRICS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>
            </label>
            <label className="stats-field">
              <span>Modo</span>
              <select
                className="input"
                value={meta.type === "pct" ? "percentage" : mode}
                disabled={meta.type === "pct"}
                onChange={(event) => setMode(event.target.value)}
              >
                {meta.type === "pct" ? <option value="percentage">Porcentaje total</option> : null}
                {meta.type !== "pct" ? <option value="average">Por partido</option> : null}
                {meta.type !== "pct" ? <option value="total">Total</option> : null}
                {allowsPer40 ? <option value="per40">Por 40 min</option> : null}
              </select>
            </label>
          </div>

          {ranking.length === 0 ? (
            <div className="card stats-empty-card"><strong>Sin estadísticas publicadas</strong></div>
          ) : (
            <div className="card stats-table-card">
              <table className="table ranking-table">
                <thead><tr><th>#</th><th>Jugador</th><th>{modeLabel}</th><th>PJ</th><th>MIN</th></tr></thead>
                <tbody>
                  {ranking.map((row, index) => (
                    <tr key={row.playerId}>
                      <td>{index + 1}</td>
                      <td><strong>{row.number !== "" ? `#${row.number} · ` : ""}{row.name}</strong></td>
                      <td>
                        <strong>{row.display}</strong>
                        {row.sub ? <span className="history-table-sub">{row.sub}</span> : null}
                      </td>
                      <td>{row.games}</td>
                      <td>{formatSeconds(row.min_seconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}

      {!loading && !error && view === "lineups" ? (
        <>
          <div className="history-ranking__filters card card--p">
            <label className="stats-field">
              <span>Mínimo en pista</span>
              <select className="input" value={minLineupMinutes} onChange={(event) => setMinLineupMinutes(Number(event.target.value))}>
                <option value={0}>Sin mínimo</option>
                <option value={5}>5 min</option>
                <option value={10}>10 min</option>
                <option value={20}>20 min</option>
              </select>
            </label>
            <p className="text-dim history-ranking__hint">
              Los quintetos solo existen para partidos publicados desde Live Stats; el histórico importado no tenía stints.
            </p>
          </div>

          {lineups.length === 0 ? (
            <div className="card stats-empty-card"><strong>Aún no hay quintetos con esa muestra.</strong></div>
          ) : (
            <div className="card stats-table-card">
              <table className="table ranking-table history-lineup-table">
                <thead><tr><th>#</th><th>Quinteto</th><th>MIN</th><th>Stints</th><th>PF-PC</th><th>+/-</th><th>+/- /40</th></tr></thead>
                <tbody>
                  {lineups.map((row, index) => (
                    <tr key={row.key}>
                      <td>{index + 1}</td>
                      <td>{row.names.join(" · ")}</td>
                      <td>{formatSeconds(row.durationMs / 1000)}</td>
                      <td>{row.stintCount}</td>
                      <td>{row.gazalPts}-{row.oppPts}</td>
                      <td>{row.plusMinus > 0 ? "+" : ""}{row.plusMinus}</td>
                      <td><strong>{row.plusMinusPer40 > 0 ? "+" : ""}{row.plusMinusPer40.toFixed(1)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}

      {!loading && !error && view === "staff" ? (
        <>
          <p className="text-dim history-ranking__staff-note">
            Incluye disciplina registrada en Live Stats y ajustes históricos sin atribuirlos a partidos concretos cuando no existe ese dato.
          </p>
          {staff.length === 0 ? (
            <div className="card stats-empty-card"><strong>Sin disciplina de staff registrada.</strong></div>
          ) : (
            <div className="card stats-table-card">
              <table className="table ranking-table">
                <thead><tr><th>#</th><th>Staff</th><th>Técnicas</th><th>Disruptivas</th><th>Flagrantes</th><th>DQ</th><th>Total</th></tr></thead>
                <tbody>
                  {staff.map((row, index) => (
                    <tr key={row.id}>
                      <td>{index + 1}</td>
                      <td><strong>{row.name}</strong>{row.code ? <span className="history-table-sub">{row.code}</span> : null}</td>
                      <td>{row.technical}</td>
                      <td>{row.disruptive}</td>
                      <td>{row.flagrant}</td>
                      <td>{row.disqualifying}</td>
                      <td><strong>{row.total}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}

      <StatLegend defaultOpen={false} />
    </section>
  );
}
