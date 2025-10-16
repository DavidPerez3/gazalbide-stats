import { useEffect, useMemo, useState } from "react";
import { getMatches, getMatchStats } from "../lib/data";
import StatLegend from "../components/StatLegend";

// helper: segundos → "mm:ss"
const fmt = (secs) => {
  const s = Math.round(Number(secs) || 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2,"0")}:${String(r).padStart(2,"0")}`;
};

// TODAS las métricas disponibles para ranking
const METRICS = [
  // tiempo
  { key: "min",        label: "MIN", isTime: true },

  // conteos principales
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
  { key: "plus_minus", label: "+/-" },
  { key: "pir",        label: "PIR" },
  { key: "eff",        label: "EFF" },

  // tiro
  { key: "fgm",        label: "FGM" },
  { key: "fga",        label: "FGA" },
  { key: "two_pm",     label: "2PM" },
  { key: "two_pa",     label: "2PA" },
  { key: "three_pm",   label: "3PM" },
  { key: "three_pa",   label: "3PA" },
  { key: "ftm",        label: "FTM" },
  { key: "fta",        label: "FTA" },
];

export default function Ranking() {
  const [metric, setMetric] = useState("pts");
  const [mode, setMode] = useState("media"); // "media" | "total"
  const [rows, setRows] = useState([]);

  // carga y agrega
  useEffect(() => {
    (async () => {
      const matches = await getMatches();
      const agg = new Map();
      for (const m of matches) {
        const s = await getMatchStats(m.id);
        for (const r of s) {
          const key = `${r.number}::${r.name}`;
          const cur = agg.get(key) || { name:r.name, number:r.number, sum:0, games:0 };
          const add = metric === "min" ? Number(r.min || 0) : Number(r[metric] || 0);
          agg.set(key, { ...cur, sum: cur.sum + add, games: cur.games + 1 });
        }
      }
      setRows(Array.from(agg.values()));
    })();
  }, [metric]);

  const meta = METRICS.find(x => x.key === metric) || METRICS[0];

  // ranking calculado
  const ranking = useMemo(() => {
    return rows
      .map(r => {
        const valueNum = mode === "media"
          ? (r.games ? r.sum / r.games : 0)
          : r.sum;
        // representación para pintar
        const display = meta.isTime ? fmt(valueNum) :
                        mode === "media" ? valueNum.toFixed(2) : String(valueNum);
        return { ...r, valueNum, display };
      })
      .sort((a,b) => b.valueNum - a.valueNum)
      .slice(0, 50); // por si quieres ver más de 14
  }, [rows, mode, meta]);

  const valueHeader = `${mode === "media" ? "Media" : "Total"} ${meta.label}`;

  return (
    <section>
      <div className="flex justify-between items-center mb-4">
        <h2 style={{fontSize:'22px', fontWeight:700, color:'var(--color-gold)'}}>Ranking</h2>
        <div className="flex items-center gap-3">
          <label className="text-dim" htmlFor="metric">Métrica:</label>
          <select id="metric" className="input" style={{width:'auto'}}
                  value={metric} onChange={e=>setMetric(e.target.value)}>
            {METRICS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>

          <label className="text-dim" htmlFor="mode">Modo:</label>
          <select id="mode" className="input" style={{width:'auto'}}
                  value={mode} onChange={e=>setMode(e.target.value)}>
            <option value="media">Media</option>
            <option value="total">Total</option>
          </select>
        </div>
      </div>

      <div className="card" style={{padding:'8px', overflowX:'auto'}}>
        <table className="table">
          <thead><tr><th>#</th><th>Jugador</th><th>{valueHeader}</th><th>Partidos</th></tr></thead>
          <tbody>
            {ranking.map((r,i)=>(
              <tr key={i}>
                <td>{i+1}</td>
                <td>#{r.number} — {r.name}</td>
                <td>{r.display}</td>
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
