import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getMatches, getMatchStats } from "../lib/data";

// Helpers
const pct = (m, a) => (a > 0 ? ((m / a) * 100).toFixed(1) : "0.0");
const mmss = (secs) => {
  const s = Math.round(Number(secs) || 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
};

// Métricas y reglas (lowerIsBetter para TOV y PF)
const COUNT_METRICS = [
  { key: "pts", label: "PTS" },
  { key: "reb", label: "REB" },
  { key: "oreb", label: "OREB" },
  { key: "dreb", label: "DREB" },
  { key: "ast", label: "AST" },
  { key: "stl", label: "ROB" },
  { key: "blk", label: "BLK" },
  { key: "tov", label: "TOV", lowerIsBetter: true },
  { key: "pf",  label: "PF",  lowerIsBetter: true },
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

// Estilos para ganador y perdedor
const styleWinner = {
  background: "rgba(22,163,74,0.18)", // verde
  boxShadow: "inset 0 0 0 1px rgba(22,163,74,0.45)",
  borderRadius: 8,
  transition: "background 160ms ease, box-shadow 160ms ease",
};
const styleLoser = {
  background: "rgba(220,38,38,0.18)", // rojo
  boxShadow: "inset 0 0 0 1px rgba(220,38,38,0.45)",
  borderRadius: 8,
  transition: "background 160ms ease, box-shadow 160ms ease",
};

export default function Compare() {
  const [searchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [playersMap, setPlayersMap] = useState(new Map());
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [mode, setMode] = useState("media");

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

  // Solo preselecciona si hay query params
  useEffect(() => {
    if (!players.length) return;
    const qp1 = searchParams.get("p1");
    const qp2 = searchParams.get("p2");

    if (qp1 && players.includes(qp1)) setP1(qp1);
    if (qp2 && players.includes(qp2)) setP2(qp2);
  }, [players, searchParams]);

  const agg1 = useMemo(() => aggregateSeason(playersMap.get(p1) || []), [playersMap, p1]);
  const agg2 = useMemo(() => aggregateSeason(playersMap.get(p2) || []), [playersMap, p2]);

  const val = (agg, key) =>
    mode === "media"
      ? (agg.games ? (agg[key] || 0) / agg.games : 0)
      : (agg[key] || 0);

  const rows = useMemo(() => {
    if (!p1 || !p2) return [];
    const list = [];

    // Partidos
    list.push({
      label: "Partidos",
      aDisplay: String(agg1.games),
      bDisplay: String(agg2.games),
      aCompare: agg1.games,
      bCompare: agg2.games,
    });

    // Minutos
    const aMin = mode === "media" ? (agg1.games ? agg1.min_secs / agg1.games : 0) : agg1.min_secs;
    const bMin = mode === "media" ? (agg2.games ? agg2.min_secs / agg2.games : 0) : agg2.min_secs;
    list.push({
      label: "MIN",
      aDisplay: mmss(aMin),
      bDisplay: mmss(bMin),
      aCompare: aMin,
      bCompare: bMin,
    });

    // Métricas base
    for (const { key, label, lowerIsBetter } of COUNT_METRICS) {
      const a = val(agg1, key);
      const b = val(agg2, key);
      list.push({
        label,
        aDisplay: mode === "media" ? a.toFixed(2) : String(a),
        bDisplay: mode === "media" ? b.toFixed(2) : String(b),
        aCompare: a,
        bCompare: b,
        lowerIsBetter: !!lowerIsBetter,
      });
    }

    // Porcentajes
    const pcts = [
      { label: "FG%",  madeA: agg1.fgm, attA: agg1.fga, madeB: agg2.fgm, attB: agg2.fga },
      { label: "2P%",  madeA: agg1.two_pm, attA: agg1.two_pa, madeB: agg2.two_pm, attB: agg2.two_pa },
      { label: "3P%",  madeA: agg1.three_pm, attA: agg1.three_pa, madeB: agg2.three_pm, attB: agg2.three_pa },
      { label: "FT%",  madeA: agg1.ftm, attA: agg1.fta, madeB: agg2.ftm, attB: agg2.fta },
    ];

    for (const p of pcts) {
      const aPct = Number(pct(p.madeA, p.attA));
      const bPct = Number(pct(p.madeB, p.attB));
      list.push({
        label: p.label,
        aDisplay: `${aPct}% (${p.madeA}/${p.attA})`,
        bDisplay: `${bPct}% (${p.madeB}/${p.attB})`,
        aCompare: aPct,
        bCompare: bPct,
      });
    }

    return list;
  }, [p1, p2, agg1, agg2, mode]);

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
            <select
              className="input"
              value={p1}
              onChange={(e) => {
                const v = e.target.value;
                setP1(v);
                if (v && v === p2) setP2("");
              }}
              style={{ marginTop: 16 }}
            >
              <option value="">— Selecciona un jugador —</option>
              {players.map((n) => (
                <option key={n} value={n} disabled={n === p2}>{n}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-dim">Jugador B</label>
            <select
              className="input"
              value={p2}
              onChange={(e) => {
                const v = e.target.value;
                setP2(v);
                if (v && v === p1) setP1("");
              }}
              style={{ marginTop: 16 }}
            >
              <option value="">— Selecciona un jugador —</option>
              {players.map((n) => (
                <option key={n} value={n} disabled={n === p1}>{n}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Tabla comparativa */}
      {p1 && p2 ? (
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
              {rows.map((r) => {
                const aWins = r.lowerIsBetter ? r.aCompare < r.bCompare : r.aCompare > r.bCompare;
                const bWins = r.lowerIsBetter ? r.bCompare < r.aCompare : r.bCompare > r.aCompare;
                const tie = !aWins && !bWins;

                const aStyle = tie ? {} : (aWins ? styleWinner : styleLoser);
                const bStyle = tie ? {} : (bWins ? styleWinner : styleLoser);

                return (
                  <tr key={r.label}>
                    <td className="text-dim">{r.label}</td>
                    <td style={aStyle}>{r.aDisplay}</td>
                    <td style={bStyle}>{r.bDisplay}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="text-dim" style={{ fontSize: 12, marginTop: 8 }}>
            Verde = mejor valor · Rojo = peor valor · (TOV y PF: menor es mejor)
          </div>
        </div>
      ) : (
        <div className="text-dim">Elige dos jugadores para ver la comparación.</div>
      )}
    </section>
  );
}
