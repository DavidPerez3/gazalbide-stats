// src/pages/Player.jsx
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
  { key: "tov",        label: "TOV", positiveIsGood: false },
  { key: "pf",         label: "PF",  positiveIsGood: false },
  { key: "pfd",        label: "PFD" },
  { key: "pir",        label: "PIR" },
  { key: "eff",        label: "EFF" },
  { key: "plus_minus", label: "+/-" },
];

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

  // Filtro rápido para la tabla de partidos
  const [matchQuery, setMatchQuery] = useState("");
  const [matchSortDir, setMatchSortDir] = useState("desc"); // "asc" | "desc"


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
              date: m.date,          // "2025-10-12"
              opponent: m.opponent,
              ...r,
            });
          }
        }
      }

      // 🔹 Ordenar por fecha ascendente (más antiguo → más reciente)
      // Como las fechas son YYYY-MM-DD, el string.localeCompare ya sirve.
      all.sort((a, b) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return -1;
        if (!b.date) return 1;
        return a.date.localeCompare(b.date);
      });

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

  // Series por partido para tendencias y delta (en orden cronológico)
  const series = useMemo(() => {
    const out = {
      min: rows.map(r => Number(r.min ?? 0)),
      ...Object.fromEntries(
        COUNT_METRICS.map(({ key }) => [key, rows.map(r => Number(r[key] ?? 0))])
      ),
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

  const isPctKey = (k) => ["fg_pct","two_pct","three_pct","ft_pct"].includes(k);

  const seasonPctValue = (k) => {
    if (k === "fg_pct")    return Number(pct(aggregates.fgm,      aggregates.fga));
    if (k === "two_pct")   return Number(pct(aggregates.two_pm,   aggregates.two_pa));
    if (k === "three_pct") return Number(pct(aggregates.three_pm, aggregates.three_pa));
    if (k === "ft_pct")    return Number(pct(aggregates.ftm,      aggregates.fta));
    return 0;
  };

  const deltaVsMean = (key) => {
    const arr = series[key];
    if (!arr?.length || aggregates.games === 0) return 0;
    const last = arr[arr.length - 1];

    if (key === "min") {
      const meanSecs = aggregates.min_secs / aggregates.games;
      return last - meanSecs;
    }
    if (isPctKey(key)) {
      const seasonPct = seasonPctValue(key);
      return last - seasonPct;
    }
    const mean = aggregates[key] / aggregates.games;
    return last - mean;
  };

  const deltaVsPrev = (key) => {
    const arr = series[key];
    if (!arr?.length) return 0;
    const last = arr[arr.length - 1];
    const prev = arr.length > 1 ? arr[arr.length - 2] : last;
    return last - prev;
  };

  const getDelta = (key) => (mode === "media" ? deltaVsMean(key) : deltaVsPrev(key));

  const deltaTextFor = (key, d) => {
    const sign = d > 0 ? "↑" : d < 0 ? "↓" : "•";
    const abs = Math.abs(d);
    if (key === "min") return `${sign} ${fmt(abs)}`;
    if (isPctKey(key)) return `${sign} ${abs.toFixed(1)} pts`;
    return `${sign} ${abs.toFixed(2)}`;
  };

  const valueForCount = (key) => {
    const total = aggregates[key] || 0;
    if (mode === "media") {
      const v = aggregates.games ? total / aggregates.games : 0;
      return { text: v.toFixed(2), val: v };
    }
    return { text: String(total), val: total };
  };

  const valueForMin = () => {
    const secs = mode === "media"
      ? (aggregates.games ? aggregates.min_secs / aggregates.games : 0)
      : aggregates.min_secs;
    const d = getDelta("min");
    return { text: fmt(secs), deltaVal: d, deltaText: deltaTextFor("min", d) };
  };

  const totals = {
    fg_pct:   { pct: pct(aggregates.fgm,      aggregates.fga),      made: aggregates.fgm,      att: aggregates.fga },
    two_pct:  { pct: pct(aggregates.two_pm,   aggregates.two_pa),   made: aggregates.two_pm,   att: aggregates.two_pa },
    three_pct:{ pct: pct(aggregates.three_pm, aggregates.three_pa), made: aggregates.three_pm, att: aggregates.three_pa },
    ft_pct:   { pct: pct(aggregates.ftm,      aggregates.fta),      made: aggregates.ftm,      att: aggregates.fta },
  };

  // Filtrado y ordenación de la tabla de partidos
  const filteredRows = useMemo(() => {
    const q = matchQuery.toLowerCase().trim();

    // 1) filtro por rival o fecha
    const base = rows.filter((r) => {
      if (!q) return true;
      const opp = (r.opponent || "").toLowerCase();
      const dateStr = (r.date || "").toLowerCase();
      return opp.includes(q) || dateStr.includes(q);
    });

    // 2) orden por fecha (string YYYY-MM-DD → sirve orden lexicográfico)
    const factor = matchSortDir === "asc" ? 1 : -1;
    const sorted = [...base].sort((a, b) => {
      const da = a.date || "";
      const db = b.date || "";
      if (da === db) return 0;
      return da < db ? -1 * factor : 1 * factor;
    });

    return sorted;
  }, [rows, matchQuery, matchSortDir]);


  return (
    <section>
      {/* Header */}
      <div className="flex justify-between items-center mb-2">
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

      {/* Info con icono */}
      <div className="text-dim mb-3" style={{ fontSize: 13 }}>
        <span
          title={
            mode === "media"
              ? "Deltas: último partido vs media de la temporada. En porcentajes, vs total de temporada."
              : "Deltas: último partido vs partido anterior."
          }
          aria-label="Información"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            cursor: "help",
            userSelect: "none"
          }}
        >
          <span style={{ fontWeight: 700 }}>ℹ️</span>
          {mode === "media"
            ? "Incrementos respecto a la media (en %: respecto al total de temporada)."
            : "Incrementos respecto al partido anterior."}
        </span>
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
          deltaVal={valueForMin().deltaVal}
          deltaText={valueForMin().deltaText}
          series={series.min}
        />

        {/* Conteos */}
        {COUNT_METRICS.map(({ key, label, positiveIsGood = true }) => {
          const main = valueForCount(key);
          const d = getDelta(key);
          return (
            <KpiSparkCard
              key={key}
              title={label}
              mainValue={main.text}
              deltaVal={d}
              deltaText={deltaTextFor(key, d)}
              series={series[key]}
              positiveIsGood={positiveIsGood}
            />
          );
        })}

        {/* Partidos */}
        <div className="card card--p">
          <div className="text-dim" style={{ fontSize: 12, marginBottom: 6 }}>Partidos</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{aggregates.games}</div>
        </div>

        {/* % TOTALES tiro */}
        {[
          ["fg_pct", "FGPCT% — Total"],
          ["two_pct","TWOPCT% — Total"],
          ["three_pct","THREEPCT% — Total"],
          ["ft_pct","FTPCT% — Total"],
        ].map(([key, title]) => {
          const d = getDelta(key);
          const { pct: pctVal, made, att } = totals[key];
          return (
            <KpiSparkCard
              key={key}
              title={title}
              mainValue={`${pctVal}%`}
              subLabel={`${made}/${att}`}
              deltaVal={d}
              deltaText={deltaTextFor(key, d)}
              series={series[key]}
            />
          );
        })}
      </div>

      {/* Tabla por partido */}
      <div className="card" style={{ padding: 8, overflowX: "auto" }}>
        {/* === NUEVO SISTEMA DE ORDENACIÓN COMO EN Match.jsx === */}
        {(() => {
          // Helpers internos
          const pctNum = (m, a) => (Number(a) > 0 ? (Number(m) / Number(a)) * 100 : 0);
          const pctTxt = (m, a) => pctNum(m, a).toFixed(1) + "%";
          const mmssToSecs = (v) => {
            if (v == null) return 0;
            if (typeof v === "number" && Number.isFinite(v)) return v;
            const s = String(v).trim();
            const m = s.match(/^(\d{1,2}):(\d{2})$/);
            if (!m) return Number(s) || 0;
            return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
          };
          const secsToMMSS = (secs) => {
            const s = Math.max(0, Math.round(Number(secs) || 0));
            const m = Math.floor(s / 60);
            const r = s % 60;
            return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
          };
          const getMinSecs = (row) => {
            if (row.min != null) return mmssToSecs(row.min);
            if (row.min_str != null) return mmssToSecs(row.min_str);
            return 0;
          };
          const getMinTxt = (row) => {
            if (row.min_str) return row.min_str;
            return secsToMMSS(getMinSecs(row));
          };
        
          // Estado interno de orden
          const [sortKey, setSortKey] = useState("date");
          const [sortDir, setSortDir] = useState("desc");
        
          // Columnas con render y función de orden
          const columns = [
            { key: "date", title: "Fecha", getSort: (r) => r.date ?? "", render: (r) => r.date ?? "—" },
            { key: "opponent", title: "Partido", getSort: (r) => String(r.opponent || "").toLowerCase(), render: (r) => r.opponent ?? "—" },
            { key: "min", title: "MIN", getSort: (r) => getMinSecs(r), render: (r) => getMinTxt(r) },
          
            // Métricas
            { key: "pts", title: "PTS", getSort: (r) => Number(r.pts) || 0, render: (r) => r.pts ?? 0 },
            { key: "reb", title: "REB", getSort: (r) => Number(r.reb) || 0, render: (r) => r.reb ?? 0 },
            { key: "oreb", title: "OREB", getSort: (r) => Number(r.oreb) || 0, render: (r) => r.oreb ?? 0 },
            { key: "dreb", title: "DREB", getSort: (r) => Number(r.dreb) || 0, render: (r) => r.dreb ?? 0 },
            { key: "ast", title: "AST", getSort: (r) => Number(r.ast) || 0, render: (r) => r.ast ?? 0 },
            { key: "stl", title: "ROB", getSort: (r) => Number(r.stl) || 0, render: (r) => r.stl ?? 0 },
            { key: "blk", title: "BLK", getSort: (r) => Number(r.blk) || 0, render: (r) => r.blk ?? 0 },
            { key: "tov", title: "TOV", getSort: (r) => Number(r.tov) || 0, render: (r) => r.tov ?? 0 },
            { key: "pf", title: "PF", getSort: (r) => Number(r.pf) || 0, render: (r) => r.pf ?? 0 },
            { key: "pfd", title: "PFD", getSort: (r) => Number(r.pfd) || 0, render: (r) => r.pfd ?? 0 },
          
            // Porcentajes
            { key: "fg_pct", title: "FG%", getSort: (r) => pctNum(r.fgm, r.fga), render: (r) => pctTxt(r.fgm, r.fga) },
            { key: "two_pct", title: "2P%", getSort: (r) => pctNum(r.two_pm, r.two_pa), render: (r) => pctTxt(r.two_pm, r.two_pa) },
            { key: "three_pct", title: "3P%", getSort: (r) => pctNum(r.three_pm, r.three_pa), render: (r) => pctTxt(r.three_pm, r.three_pa) },
            { key: "ft_pct", title: "FT%", getSort: (r) => pctNum(r.ftm, r.fta), render: (r) => pctTxt(r.ftm, r.fta) },
          
            // Índices
            { key: "pir", title: "PIR", getSort: (r) => Number(r.pir) || 0, render: (r) => r.pir ?? 0 },
            { key: "eff", title: "EFF", getSort: (r) => Number(r.eff) || 0, render: (r) => r.eff ?? 0 },
            { key: "plus_minus", title: "+/-", getSort: (r) => Number(r.plus_minus) || 0, render: (r) => r.plus_minus ?? 0 },
          ];
        
          const activeCol = columns.find((c) => c.key === sortKey) || columns[0];
        
          // Ordenar filas sin afectar cálculos de delta
          const sortedRows = useMemo(() => {
            const arr = [...rows];
            const getter = activeCol.getSort;
            arr.sort((a, b) => {
              const va = getter(a);
              const vb = getter(b);
              if (typeof va === "string" || typeof vb === "string") {
                const cmp = String(va).localeCompare(String(vb), "es", { sensitivity: "base" });
                return sortDir === "asc" ? cmp : -cmp;
              }
              const na = Number.isFinite(va) ? va : -Infinity;
              const nb = Number.isFinite(vb) ? vb : -Infinity;
              const cmp = na - nb;
              return sortDir === "asc" ? cmp : -cmp;
            });
            return arr;
          }, [rows, activeCol, sortDir]);
        
          const onClickHeader = (key) => {
            if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
            else {
              setSortKey(key);
              setSortDir("asc");
            }
          };
        
          const Indicator = ({ colKey }) =>
            colKey === sortKey ? (
              <span className="sort-ind">{sortDir === "asc" ? "▲" : "▼"}</span>
            ) : null;
          
          return (
            <table className="table border-separate w-full">
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c.key}>
                      <button
                        type="button"
                        className="th-btn"
                        onClick={() => onClickHeader(c.key)}
                      >
                        {c.title}
                        <Indicator colKey={c.key} />
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r, i) => (
                  <tr key={i}>
                    {columns.map((c) => (
                      <td key={c.key}>{c.render(r)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          );
        })()}
      </div>
      <StatLegend defaultOpen={false} />
    </section>
  );
}
