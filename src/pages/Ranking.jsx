import { useEffect, useMemo, useState } from "react";
import { getMatches, getMatchStats } from "../lib/data";
import StatLegend from "../components/StatLegend";

// Helper para formatear minutos
const fmt = (secs) => {
  const s = Math.round(Number(secs) || 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
};

// Definición de métricas disponibles
const METRICS = [
  // Tiempo
  { key: "min", label: "MIN", type: "time" },

  // Conteos generales
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

  // Tiro (conteos)
  { key: "fgm", label: "FGM", type: "count" },
  { key: "fga", label: "FGA", type: "count" },
  { key: "two_pm", label: "2PM", type: "count" },
  { key: "two_pa", label: "2PA", type: "count" },
  { key: "three_pm", label: "3PM", type: "count" },
  { key: "three_pa", label: "3PA", type: "count" },
  { key: "ftm", label: "FTM", type: "count" },
  { key: "fta", label: "FTA", type: "count" },

  // Porcentajes (siempre sobre totales de temporada)
  { key: "fg_pct", label: "FG%", type: "pct", made: "fgm", att: "fga" },
  { key: "two_pct", label: "2P%", type: "pct", made: "two_pm", att: "two_pa" },
  { key: "three_pct", label: "3P%", type: "pct", made: "three_pm", att: "three_pa" },
  { key: "ft_pct", label: "FT%", type: "pct", made: "ftm", att: "fta" },
];

// Claves que agregamos siempre
const SUM_KEYS = [
  "min", "pts", "reb", "oreb", "dreb", "ast", "stl", "blk", "tov", "pf", "pfd",
  "plus_minus", "pir", "eff",
  "fgm", "fga", "two_pm", "two_pa", "three_pm", "three_pa", "ftm", "fta",
];

export default function Ranking() {
  const [metric, setMetric] = useState("pts");
  const [mode, setMode] = useState("media");
  const [rows, setRows] = useState([]);

  // Cargar y agregar datos por jugador
  useEffect(() => {
    (async () => {
      const matches = await getMatches();
      const agg = new Map();

      for (const m of matches) {
        const stats = await getMatchStats(m.id);
        for (const r of stats) {
          const key = `${r.number}::${r.name}`;
          const cur = agg.get(key) || {
            name: r.name,
            number: r.number,
            games: 0,
          };

          for (const k of SUM_KEYS) {
            cur[k] = (cur[k] || 0) + Number(r[k] || 0);
          }

          cur.games = (cur.games || 0) + 1;
          agg.set(key, cur);
        }
      }

      setRows(Array.from(agg.values()));
    })();
  }, []);

  const meta = METRICS.find((x) => x.key === metric) || METRICS[0];

  const ranking = useMemo(() => {
    return rows
      .map((r) => {
        let valueNum = 0;
        let display = "";
        let made = 0;
        let att = 0;

        if (meta.type === "pct") {
          made = Number(r[meta.made] || 0);
          att = Number(r[meta.att] || 0);
          valueNum = att ? made / att : 0;
          display = `${(valueNum * 100).toFixed(1)}%`;
        } else if (meta.type === "time") {
          const base = mode === "media" ? (r.games ? r.min / r.games : 0) : r.min;
          valueNum = base;
          display = fmt(base);
        } else {
          const base = mode === "media" ? (r.games ? r[meta.key] / r.games : 0) : r[meta.key];
          valueNum = Number(base || 0);
          display = mode === "media" ? valueNum.toFixed(2) : String(valueNum);
        }

        return { ...r, valueNum, display, made, att };
      })
      .sort((a, b) => b.valueNum - a.valueNum)
      .slice(0, 50);
  }, [rows, meta, mode]);

  const isPct = meta.type === "pct";
  const valueHeader = isPct
    ? `${meta.label} (Temporada)`
    : `${mode === "media" ? "Media" : "Total"} ${meta.label}`;

  return (
    <section>
      <div className="flex justify-between items-center mb-4">
        <h2 style={{ fontSize: "22px", fontWeight: 700, color: "var(--color-gold)" }}>
          Ranking
        </h2>
        <div className="flex items-center gap-3">
          <label className="text-dim" htmlFor="metric">Métrica:</label>
          <select
            id="metric"
            className="input"
            style={{ width: "auto" }}
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
          >
            {METRICS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>

          <label className="text-dim" htmlFor="mode">Modo:</label>
          <select
            id="mode"
            className="input"
            style={{ width: "auto", opacity: isPct ? 0.5 : 1 }}
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            disabled={isPct}
          >
            <option value="media">Media</option>
            <option value="total">Total</option>
          </select>
        </div>
      </div>

      <div className="card" style={{ padding: "8px", overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Jugador</th>
              <th>{valueHeader}</th>
              <th>Partidos</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((r, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>#{r.number} — {r.name}</td>
                {isPct ? (
                  <td>
                    <div>{r.display}</div>
                    <div className="text-dim" style={{ fontSize: 12 }}>
                      {r.made}/{r.att}
                    </div>
                  </td>
                ) : (
                  <td>{r.display}</td>
                )}
                <td>{r.games}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <StatLegend defaultOpen={false} />
    </section>
  );
}
