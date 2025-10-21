import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { getMatches, getMatchStats } from "../lib/data";
import StatLegend from "../components/StatLegend";
import KpiSparkCard from "../components/KPISparkCard";

const COUNT_METRICS = [
  { key: "pts",        label: "PTS" },
  { key: "reb",        label: "REB" },
  { key: "oreb",       label: "OREB" },
  { key: "dreb",       label: "DREB" },
  { key: "ast",        label: "AST" },
  { key: "stl",        label: "ROB" },
  { key: "blk",        label: "BLK" },
  { key: "tov",        label: "TOV", positiveIsGood: false }, // subir TOV no es bueno
  { key: "pf",         label: "PF",  positiveIsGood: false },
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
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
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
              opponent: m.opponent,
              ...r,
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

  // Series por partido para tendencias y delta (orden actual de rows)
  const series = useMemo(() => {
    const out = {
      min: rows.map(r => Number(r.min ?? 0)),
      // métricas de conteo
      ...Object.fromEntries(
        COUNT_METRICS.map(({ key }) => [key, rows.map(r => Number(r[key] ?? 0))])
      ),
      // porcentajes por partido
      fg_pct: rows.map(r => {
        const a = Number(r.fga ?? 0), m = Number(r.fgm ?? 0);
        return a > 0 ? (m / a) * 100 : 0;
      }),
      two_pct: rows.map(r => {
        const a = Number(r.two_pa ?? 0), m = Number(r.two_pm ?? 0);
        return a > 0 ? (m / a) * 100 : 0;
      }),
      three_pct: rows.map(r => {
        const a = Number(r.three_pa ?? 0), m = Number(r.three_pm ?? 0);
        return a > 0 ? (m / a) * 100 : 0;
      }),
      ft_pct: rows.map(r => {
        const a = Number(r.fta ?? 0), m = Number(r.ftm ?? 0);
        return a > 0 ? (m / a) * 100 : 0;
      }),
    };
    return out;
  }, [rows]);

  // Utilidades de delta (último - anterior)
  const lastDelta = (arr) => {
    if (!arr || arr.length === 0) return 0;
    const last = arr[arr.length - 1] ?? 0;
    const prev = arr.length > 1 ? arr[arr.length - 2] ?? 0 : last;
    return last - prev;
  };

  // Valor principal para conteos (media vs total)
  const valueForCount = (key) => {
    const total = aggregates[key] || 0;
    if (mode === "media") {
      const v = aggregates.games ? total / aggregates.games : 0;
      return { text: v.toFixed(2), val: v };
    }
    return { text: String(total), val: total };
  };

  // Minutos principal
  const valueForMin = () => {
    const secs = mode === "media"
      ? (aggregates.games ? aggregates.min_secs / aggregates.games : 0)
      : aggregates.min_secs;
    return { text: fmt(secs), deltaText: (() => {
      const d = lastDelta(series.min);
      const sign = d > 0 ? "↑" : d < 0 ? "↓" : "•";
      const mm = fmt(Math.abs(d));
      return `${sign} ${mm}`;
    })()};
  };

  // Porcentajes totales
  const totals = {
    fg_pct: { pct: pct(aggregates.fgm, aggregates.fga), made: aggregates.fgm, att: aggregates.fga },
    two_pct:{ pct: pct(aggregates.two_pm, aggregates.two_pa), made: aggregates.two_pm, att: aggregates.two_pa },
    three_pct:{ pct: pct(aggregates.three_pm, aggregates.three_pa), made: aggregates.three_pm, att: aggregates.three_pa },
    ft_pct: { pct: pct(aggregates.ftm, aggregates.fta), made: aggregates.ftm, att: aggregates.fta },
  };

  return (
    <section>
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h2 style={{ fontSize: 22, fontWeight: 700 }}>
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

      {/* Tarjetas fusionadas */}
      <div
        className="mb-4"
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        }}
      >
        {/* MIN */}
        <KpiSparkCard
          title="MIN"
          mainValue={valueForMin().text}
          deltaVal={lastDelta(series.min)}
          deltaText={valueForMin().deltaText}
          series={series.min}
        />

        {/* Métricas de conteo (todas) */}
        {COUNT_METRICS.map(({ key, label, positiveIsGood = true }) => {
          const main = valueForCount(key);
          const d = lastDelta(series[key]);
          return (
            <KpiSparkCard
              key={key}
              title={label}
              mainValue={main.text}
              deltaVal={d}
              series={series[key]}
              positiveIsGood={positiveIsGood}
            />
          );
        })}

        {/* Partidos (simple) */}
        <div className="card card--p">
          <div className="text-dim" style={{ fontSize: 12, marginBottom: 6 }}>Partidos</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{aggregates.games}</div>
        </div>

        {/* % TOTALES tiro (con m/a y delta vs partido anterior en puntos porcentuales) */}
        <KpiSparkCard
          title="FG% — Total"
          mainValue={`${totals.fg_pct.pct}%`}
          subLabel={`${totals.fg_pct.made}/${totals.fg_pct.att}`}
          deltaVal={lastDelta(series.fg_pct)}
          deltaText={`${lastDelta(series.fg_pct) > 0 ? "↑" : lastDelta(series.fg_pct) < 0 ? "↓" : "•"} ${Math.abs(lastDelta(series.fg_pct)).toFixed(1)} pts`}
          series={series.fg_pct}
        />
        <KpiSparkCard
          title="2P% — Total"
          mainValue={`${totals.two_pct.pct}%`}
          subLabel={`${totals.two_pct.made}/${totals.two_pct.att}`}
          deltaVal={lastDelta(series.two_pct)}
          deltaText={`${lastDelta(series.two_pct) > 0 ? "↑" : lastDelta(series.two_pct) < 0 ? "↓" : "•"} ${Math.abs(lastDelta(series.two_pct)).toFixed(1)} pts`}
          series={series.two_pct}
        />
        <KpiSparkCard
          title="3P% — Total"
          mainValue={`${totals.three_pct.pct}%`}
          subLabel={`${totals.three_pct.made}/${totals.three_pct.att}`}
          deltaVal={lastDelta(series.three_pct)}
          deltaText={`${lastDelta(series.three_pct) > 0 ? "↑" : lastDelta(series.three_pct) < 0 ? "↓" : "•"} ${Math.abs(lastDelta(series.three_pct)).toFixed(1)} pts`}
          series={series.three_pct}
        />
        <KpiSparkCard
          title="FT% — Total"
          mainValue={`${totals.ft_pct.pct}%`}
          subLabel={`${totals.ft_pct.made}/${totals.ft_pct.att}`}
          deltaVal={lastDelta(series.ft_pct)}
          deltaText={`${lastDelta(series.ft_pct) > 0 ? "↑" : lastDelta(series.ft_pct) < 0 ? "↓" : "•"} ${Math.abs(lastDelta(series.ft_pct)).toFixed(1)} pts`}
          series={series.ft_pct}
        />
      </div>

      {/* Tabla por partido */}
      <div className="card" style={{ padding: 8, overflowX: "auto" }}>
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
            {rows.map((r, i) => {
              const fg = r.fga ? ((r.fgm / r.fga) * 100).toFixed(1) : "0.0";
              const p2 = r.two_pa ? ((r.two_pm / r.two_pa) * 100).toFixed(1) : "0.0";
              const p3 = r.three_pa ? ((r.three_pm / r.three_pa) * 100).toFixed(1) : "0.0";
              const ft = r.fta ? ((r.ftm / r.fta) * 100).toFixed(1) : "0.0";
              return (
                <tr key={i}>
                  <td>{r.date || "—"}</td>
                  <td>{r.opponent}</td>
                  <td>{r.min_str ?? ""}</td>
                  <td>{r.pts}</td>
                  <td>{r.reb}</td>
                  <td>{r.ast}</td>
                  <td>{fg}%</td>
                  <td>{p2}%</td>
                  <td>{p3}%</td>
                  <td>{ft}%</td>
                  <td>{r.plus_minus}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <StatLegend defaultOpen={false} />
    </section>
  );
}
