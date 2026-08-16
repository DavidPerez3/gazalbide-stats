import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getMatches, getMatchStats } from "../lib/data";
import { useSeason } from "../context/SeasonContext.jsx";

const pct = (m, a) => (a > 0 ? ((m / a) * 100).toFixed(1) : "0.0");
const mmss = (secs) => {
  const s = Math.round(Number(secs) || 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
};

const COUNT_METRICS = [
  { key: "pts", label: "PTS" },
  { key: "reb", label: "REB" },
  { key: "oreb", label: "OREB" },
  { key: "dreb", label: "DREB" },
  { key: "ast", label: "AST" },
  { key: "stl", label: "ROB" },
  { key: "blk", label: "BLK" },
  { key: "tov", label: "TOV", lowerIsBetter: true },
  { key: "pf", label: "PF", lowerIsBetter: true },
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
    agg.min_secs += Number(r.min || 0);
    for (const { key } of COUNT_METRICS) agg[key] += Number(r[key] ?? 0);
    agg.two_pm += Number(r.two_pm ?? 0);
    agg.two_pa += Number(r.two_pa ?? 0);
    agg.three_pm += Number(r.three_pm ?? 0);
    agg.three_pa += Number(r.three_pa ?? 0);
    agg.fgm += Number(r.fgm ?? 0);
    agg.fga += Number(r.fga ?? 0);
    agg.ftm += Number(r.ftm ?? 0);
    agg.fta += Number(r.fta ?? 0);
  }
  return agg;
}

const styleWinner = {
  background: "rgba(22,163,74,0.18)",
  boxShadow: "inset 0 0 0 1px rgba(22,163,74,0.45)",
  borderRadius: 8,
  transition: "background 160ms ease, box-shadow 160ms ease",
};
const styleLoser = {
  background: "rgba(220,38,38,0.18)",
  boxShadow: "inset 0 0 0 1px rgba(220,38,38,0.45)",
  borderRadius: 8,
  transition: "background 160ms ease, box-shadow 160ms ease",
};

export default function Compare() {
  const [searchParams] = useSearchParams();
  const { activeSeason } = useSeason();
  const [loading, setLoading] = useState(true);
  const [playersMap, setPlayersMap] = useState(new Map());
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [mode, setMode] = useState("media");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      const matches = await getMatches(activeSeason.id);
      const map = new Map();
      for (const m of matches) {
        const stats = await getMatchStats(m.id);
        for (const r of stats) {
          const arr = map.get(r.name) || [];
          arr.push({ ...r, date: m.date, opponent: m.opponent });
          map.set(r.name, arr);
        }
      }
      if (!cancelled) {
        setPlayersMap(map);
        setP1("");
        setP2("");
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [activeSeason.id]);

  const players = useMemo(
    () => Array.from(playersMap.keys()).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" })),
    [playersMap]
  );

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

    list.push({
      label: "Partidos",
      aDisplay: String(agg1.games),
      bDisplay: String(agg2.games),
      aCompare: agg1.games,
      bCompare: agg2.games,
    });

    const aMin = mode === "media" ? (agg1.games ? agg1.min_secs / agg1.games : 0) : agg1.min_secs;
    const bMin = mode === "media" ? (agg2.games ? agg2.min_secs / agg2.games : 0) : agg2.min_secs;
    list.push({
      label: "MIN",
      aDisplay: mmss(aMin),
      bDisplay: mmss(bMin),
      aCompare: aMin,
      bCompare: bMin,
    });

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

    const pcts = [
      { label: "FG%", madeA: agg1.fgm, attA: agg1.fga, madeB: agg2.fgm, attB: agg2.fga },
      { label: "2P%", madeA: agg1.two_pm, attA: agg1.two_pa, madeB: agg2.two_pm, attB: agg2.two_pa },
      { label: "3P%", madeA: agg1.three_pm, attA: agg1.three_pa, madeB: agg2.three_pm, attB: agg2.three_pa },
      { label: "FT%", madeA: agg1.ftm, attA: agg1.fta, madeB: agg2.ftm, attB: agg2.fta },
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

  if (loading) {
    return <section className="stats-page"><div className="text-dim">Cargando…</div></section>;
  }

  const hasPublishedStats = players.length > 0;

  return (
    <section className="stats-page compare-page">
      <header className="stats-page__header">
        <div className="stats-page__heading">
          <h2>Comparar jugadores</h2>
          <div className="stats-page__season">Temporada {activeSeason.label}</div>
        </div>

        <div className="stats-page__controls stats-page__controls--single">
          <div className="stats-field">
            <label htmlFor="mode">Modo</label>
            <select id="mode" className="input" value={mode} disabled={!hasPublishedStats} onChange={(e) => setMode(e.target.value)}>
              <option value="media">Media</option>
              <option value="total">Total</option>
            </select>
          </div>
        </div>
      </header>

      {!hasPublishedStats ? (
        <div className="card stats-empty-card compare-empty-season">
          <strong>Aún no hay estadísticas publicadas en {activeSeason.label}</strong>
          <span className="text-dim">
            La lista de jugadores para comparar aparece cuando existe al menos un partido oficial con estadísticas en esta temporada. La plantilla no está vacía: simplemente todavía no hay datos comparables.
          </span>
        </div>
      ) : (
        <>
          <div className="card compare-selectors">
            <div className="compare-selectors__grid">
              <div className="compare-player-field">
                <label htmlFor="compare-player-a">Jugador A</label>
                <select
                  id="compare-player-a"
                  className="input"
                  value={p1}
                  onChange={(e) => {
                    const v = e.target.value;
                    setP1(v);
                    if (v && v === p2) setP2("");
                  }}
                >
                  <option value="">— Selecciona un jugador —</option>
                  {players.map((n) => (
                    <option key={n} value={n} disabled={n === p2}>{n}</option>
                  ))}
                </select>
              </div>

              <div className="compare-player-field">
                <label htmlFor="compare-player-b">Jugador B</label>
                <select
                  id="compare-player-b"
                  className="input"
                  value={p2}
                  onChange={(e) => {
                    const v = e.target.value;
                    setP2(v);
                    if (v && v === p1) setP1("");
                  }}
                >
                  <option value="">— Selecciona un jugador —</option>
                  {players.map((n) => (
                    <option key={n} value={n} disabled={n === p1}>{n}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {p1 && p2 ? (
            <div className="card stats-table-card">
              <table className="table compare-table">
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

              <div className="compare-legend">
                Verde = mejor valor · Rojo = peor valor · TOV y PF: menor es mejor.
              </div>
            </div>
          ) : (
            <div className="card stats-empty-card">
              <strong>Elige dos jugadores</strong>
              <span className="text-dim">Selecciona un jugador A y un jugador B para ver la comparación.</span>
            </div>
          )}
        </>
      )}
    </section>
  );
}
