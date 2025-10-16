import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { getMatches, getMatchStats } from "../lib/data";
import StatLegend from "../components/StatLegend";

const COUNT_METRICS = [
  { key: "pts",        label: "PTS" },
  { key: "reb",        label: "REB" },
  { key: "oreb",       label: "OREB" },
  { key: "dreb",       label: "DREB" },
  { key: "ast",        label: "AST" },
  { key: "stl",        label: "ROB" },
  { key: "blk",        label: "BLK" },
  { key: "tov",        label: "TOV" },
  { key: "pf",         label: "PF" },
  { key: "pfd",        label: "PFD" },
  { key: "pir",        label: "PIR" },
  { key: "eff",        label: "EFF" },
  { key: "plus_minus", label: "+/-" },
];

// helpers
const pct = (m, a) => (a > 0 ? ((m / a) * 100).toFixed(1) : "0.0");
const fmt = (secs) => {
  const s = Math.round(Number(secs) || 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2,"0")}:${String(r).padStart(2,"0")}`;
};

export default function Player() {
  const { name } = useParams();
  const dn = decodeURIComponent(name);

  const [rows, setRows] = useState([]);
  const [mode, setMode] = useState("media"); // "media" | "total"

  // Cargar todos los partidos del jugador
  useEffect(() => {
    (async () => {
      const matches = await getMatches();
      const all = [];
      for (const m of matches) {
        const s = await getMatchStats(m.id);
        for (const r of s) {
          if (r.name === dn) {
            all.push({
              matchId: m.id,
              date: m.date,
              opponent: m.opponent, // <- aquí guardamos el rival ya “bonito”
              ...r
            });
          }
        }
      }
      setRows(all);
    })();
  }, [dn]);

  // Agregados totales de la temporada
  const aggregates = useMemo(() => {
    const agg = {
      games: rows.length,
      min_secs: 0,
      two_pm: 0, two_pa: 0,
      three_pm: 0, three_pa: 0,
      fgm: 0, fga: 0,
      ftm: 0, fta: 0,
    };
    for (const { key } of COUNT_METRICS) agg[key] = 0;

    for (const r of rows) {
      agg.min_secs += Number(r.min || 0);
      for (const { key } of COUNT_METRICS) agg[key] += Number(r[key] ?? 0);
      agg.two_pm   += Number(r.two_pm   ?? 0);
      agg.two_pa   += Number(r.two_pa   ?? 0);
      agg.three_pm += Number(r.three_pm ?? 0);
      agg.three_pa += Number(r.three_pa ?? 0);
      agg.fgm      += Number(r.fgm      ?? 0);
      agg.fga      += Number(r.fga      ?? 0);
      agg.ftm      += Number(r.ftm      ?? 0);
      agg.fta      += Number(r.fta      ?? 0);
    }
    return agg;
  }, [rows]);

  // Valores mostrados según modo (solo métricas de conteo)
  const displayedCounts = useMemo(() => {
    const out = {};
    for (const { key } of COUNT_METRICS) {
      const total = aggregates[key] || 0;
      out[key] = mode === "media"
        ? (aggregates.games ? total / aggregates.games : 0)
        : total;
    }
    return out;
  }, [aggregates, mode]);

  // Minutos (Total/Media) como mm:ss
  const minutesDisplay = mode === "media"
    ? fmt(aggregates.games ? aggregates.min_secs / aggregates.games : 0)
    : fmt(aggregates.min_secs);

  // Porcentajes totales de tiro (siempre totales de temporada)
  const totals_fg_pct = pct(aggregates.fgm, aggregates.fga);
  const totals_2p_pct = pct(aggregates.two_pm, aggregates.two_pa);
  const totals_3p_pct = pct(aggregates.three_pm, aggregates.three_pa);
  const totals_ft_pct = pct(aggregates.ftm, aggregates.fta);

  return (
    <section>
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h2 style={{ fontSize: "22px", fontWeight: 700 }}>
          <span style={{ color: "var(--color-gold)" }}>Jugador:</span> {dn}
        </h2>
        <div className="flex items-center gap-3">
          <label className="text-dim" htmlFor="mode">Modo:</label>
          <select
            id="mode"
            className="input"
            style={{ width: "auto" }}
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="media">Media</option>
            <option value="total">Total</option>
          </select>
        </div>
      </div>

      {/* Tarjetas métricas + % totales */}
      <div
        className="mb-4"
        style={{
          display: "grid",
          gap: "16px",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        }}
      >
        {/* MIN */}
        <div className="card card--p">
          <div className="text-dim" style={{ fontSize: "12px", marginBottom: 6 }}>
            MIN — {mode === "media" ? "Media" : "Total"}
          </div>
          <div style={{ fontSize: "20px", fontWeight: 700 }}>{minutesDisplay}</div>
        </div>

        {/* Conteos (afectados por Media/Total) */}
        {COUNT_METRICS.map(({ key, label }) => (
          <div key={key} className="card card--p">
            <div className="text-dim" style={{ fontSize: "12px", marginBottom: 6 }}>
              {label} — {mode === "media" ? "Media" : "Total"}
            </div>
            <div style={{ fontSize: "20px", fontWeight: 700 }}>
              {mode === "media" ? displayedCounts[key].toFixed(2) : displayedCounts[key]}
            </div>
          </div>
        ))}

        {/* Partidos */}
        <div className="card card--p">
          <div className="text-dim" style={{ fontSize: "12px", marginBottom: 6 }}>Partidos</div>
          <div style={{ fontSize: "20px", fontWeight: 700 }}>{aggregates.games}</div>
        </div>

        {/* % TOTALES tiro */}
        <div className="card card--p">
          <div className="text-dim" style={{ fontSize: "12px", marginBottom: 6 }}>FG% — Total</div>
          <div style={{ fontSize: "20px", fontWeight: 700 }}>{totals_fg_pct}%</div>
          <div className="text-dim" style={{ fontSize: "12px" }}>{aggregates.fgm}/{aggregates.fga}</div>
        </div>
        <div className="card card--p">
          <div className="text-dim" style={{ fontSize: "12px", marginBottom: 6 }}>2P% — Total</div>
          <div style={{ fontSize: "20px", fontWeight: 700 }}>{totals_2p_pct}%</div>
          <div className="text-dim" style={{ fontSize: "12px" }}>{aggregates.two_pm}/{aggregates.two_pa}</div>
        </div>
        <div className="card card--p">
          <div className="text-dim" style={{ fontSize: "12px", marginBottom: 6 }}>3P% — Total</div>
          <div style={{ fontSize: "20px", fontWeight: 700 }}>{totals_3p_pct}%</div>
          <div className="text-dim" style={{ fontSize: "12px" }}>{aggregates.three_pm}/{aggregates.three_pa}</div>
        </div>
        <div className="card card--p">
          <div className="text-dim" style={{ fontSize: "12px", marginBottom: 6 }}>FT% — Total</div>
          <div style={{ fontSize: "20px", fontWeight: 700 }}>{totals_ft_pct}%</div>
          <div className="text-dim" style={{ fontSize: "12px" }}>{aggregates.ftm}/{aggregates.fta}</div>
        </div>
      </div>

      {/* Tabla por partido (misma que tenías) */}
      <div className="card" style={{ padding: "8px", overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Partido</th>
              <th>MIN</th>
              <th>PTS</th>
              <th>REB</th>
              <th>AST</th>
              <th>FG%</th>
              <th>2P%</th>
              <th>3P%</th>
              <th>FT%</th>
              <th>+/-</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{r.date || "—"}</td>
                <td>{r.opponent}</td>
                <td>{r.min_str ?? ""}</td>
                <td>{r.pts}</td>
                <td>{r.reb}</td>
                <td>{r.ast}</td>
                <td>{pct(r.fgm, r.fga)}%</td>
                <td>{pct(r.two_pm, r.two_pa)}%</td>
                <td>{pct(r.three_pm, r.three_pa)}%</td>
                <td>{pct(r.ftm, r.fta)}%</td>
                <td>{r.plus_minus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Leyenda (aquí la dejo abierta por defecto) */}
    <StatLegend defaultOpen={false} />
    </section>
  );
}
