// src/pages/Compare.jsx
import { useEffect, useMemo, useState } from "react";
import { getMatches, getMatchStats } from "../lib/data";

// Helpers
const pct = (m, a) => (a > 0 ? ((m / a) * 100).toFixed(1) : "0.0");
const mmss = (secs) => {
  const s = Math.round(Number(secs) || 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
};

// Qué métricas comparamos (sin “avanzadas”)
const COUNT_METRICS = [
  { key: "pts", label: "PTS" },
  { key: "reb", label: "REB" },
  { key: "oreb", label: "OREB" },
  { key: "dreb", label: "DREB" },
  { key: "ast", label: "AST" },
  { key: "stl", label: "ROB" },
  { key: "blk", label: "BLK" },
  { key: "tov", label: "TOV" },
  { key: "pf",  label: "PF"  },
  { key: "pfd", label: "PFD" },
  { key: "plus_minus", label: "+/-" },
  { key: "pir", label: "PIR" },
  { key: "eff", label: "EFF" },
];

function aggregateSeason(rows) {
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
    agg.min_secs  += Number(r.min || 0);
    for (const { key } of COUNT_METRICS) agg[key] += Number(r[key] ?? 0);
    agg.two_pm    += Number(r.two_pm   ?? 0);
    agg.two_pa    += Number(r.two_pa   ?? 0);
    agg.three_pm  += Number(r.three_pm ?? 0);
    agg.three_pa  += Number(r.three_pa ?? 0);
    agg.fgm       += Number(r.fgm      ?? 0);
    agg.fga       += Number(r.fga      ?? 0);
    agg.ftm       += Number(r.ftm      ?? 0);
    agg.fta       += Number(r.fta      ?? 0);
  }
  return agg;
}

export default function Compare() {
  const [loading, setLoading] = useState(true);
  const [playersMap, setPlayersMap] = useState(new Map()); // name -> rows[]
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [mode, setMode] = useState("media"); // "media" | "total"

  // Carga y organiza datos por jugador (temporada completa)
  useEffect(() => {
    (async () => {
      const matches = await getMatches();
      const map = new Map();
      for (const m of matches) {
        const stats = await getMatchStats(m.id);
        for (const r of stats) {
          const arr = map.get(r.name) || [];
          arr.push({ ...r, date: m.date, opponent: m.opponent });
          map.set(r.name, arr);
        }
      }
      setPlayersMap(map);
      setLoading(false);
    })();
  }, []);

  const players = useMemo(
    () => Array.from(playersMap.keys()).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" })),
    [playersMap]
  );

  const agg1 = useMemo(() => aggregateSeason(playersMap.get(p1) || []), [playersMap, p1]);
  const agg2 = useMemo(() => aggregateSeason(playersMap.get(p2) || []), [playersMap, p2]);

  const val = (agg, key) => (
    mode === "media"
      ? (agg.games ? (agg[key] || 0) / agg.games : 0)
      : (agg[key] || 0)
  );

  const minDisplay = (agg) => (mode === "media" ? mmss(agg.games ? agg.min_secs / agg.games : 0) : mmss(agg.min_secs));

  const rows = [
    { label: "Partidos",      a: agg1.games, b: agg2.games, fmt: (x) => x },
    { label: "MIN",           a: minDisplay(agg1), b: minDisplay(agg2), fmt: (x) => x, raw: true },

    // Conteos
    ...COUNT_METRICS.map(({ key, label }) => ({
      label,
      a: val(agg1, key),
      b: val(agg2, key),
      fmt: (x) => (mode === "media" ? x.toFixed(2) : String(x)),
    })),

    // % de tiro (totales de temporada siempre)
    { label: "FG%",  a: `${pct(agg1.fgm, agg1.fga)}% (${agg1.fgm}/${agg1.fga})`, b: `${pct(agg2.fgm, agg2.fga)}% (${agg2.fgm}/${agg2.fga})`, fmt: (x) => x, raw: true },
    { label: "2P%",  a: `${pct(agg1.two_pm, agg1.two_pa)}% (${agg1.two_pm}/${agg1.two_pa})`, b: `${pct(agg2.two_pm, agg2.two_pa)}% (${agg2.two_pm}/${agg2.two_pa})`, fmt: (x) => x, raw: true },
    { label: "3P%",  a: `${pct(agg1.three_pm, agg1.three_pa)}% (${agg1.three_pm}/${agg1.three_pa})`, b: `${pct(agg2.three_pm, agg2.three_pa)}% (${agg2.three_pm}/${agg2.three_pa})`, fmt: (x) => x, raw: true },
    { label: "FT%",  a: `${pct(agg1.ftm, agg1.fta)}% (${agg1.ftm}/${agg1.fta})`, b: `${pct(agg2.ftm, agg2.fta)}% (${agg2.ftm}/${agg2.fta})`, fmt: (x) => x, raw: true },
  ];

  if (loading) return <section><div className="text-dim">Cargando…</div></section>;

  return (
    <section className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 style={{ fontSize: 22, fontWeight: 700 }}>
          <span style={{ color: "var(--color-gold)" }}>Comparar jugadores</span>
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

      {/* Selectores */}
      <div className="card" style={{ padding: 12, marginBottom: 16 }}>
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label className="text-dim">Jugador A</label>
            <select className="input" value={p1} onChange={(e) => setP1(e.target.value)} style={{ marginTop: 16 }}>
              <option value="" disabled>Selecciona</option>
              {players.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label className="text-dim">Jugador B</label>
            <select className="input" value={p2} onChange={(e) => setP2(e.target.value)} style={{ marginTop: 16 }}>
              <option value="" disabled>Selecciona</option>
              {players.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Tabla comparativa */}
      {(p1 && p2) ? (
        <div className="card" style={{ padding: 8, overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Métrica</th>
                <th>{p1}</th>
                <th>{p2}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label}>
                  <td className="text-dim">{r.label}{r.label.endsWith("%") ? " (Temporada)" : ""}</td>
                  <td>{r.raw ? r.a : r.fmt(r.a)}</td>
                  <td>{r.raw ? r.b : r.fmt(r.b)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-dim">Selecciona dos jugadores para comparar.</div>
      )}
    </section>
  );
}
