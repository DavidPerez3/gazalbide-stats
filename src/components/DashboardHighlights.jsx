import PlayerJersey from "./PlayerJersey.jsx";
import "../bottom-navigation.css";
import { useEffect, useMemo, useState } from "react";
import { getMatches, getMatchStats } from "../lib/data";

// Helpers
const pct = (m, a) => (a > 0 ? ((m / a) * 100).toFixed(1) : "0.0");
const byDateDesc = (a, b) => new Date(b.date) - new Date(a.date);

// Configurable
const MIN_FGA_FOR_TOP_FG = 20; // mínimo de intentos en la temporada para optar a Top FG%

export default function DashboardHighlights({ seasonId }) {
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState([]);
  const [byMatchStats, setByMatchStats] = useState(new Map()); // matchId -> rows[]

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const ms = await getMatches(seasonId);
      // ordenamos por fecha descendente por si no vienen ya así
      const sorted = [...ms].sort(byDateDesc);
      const rows = await Promise.all(sorted.map((m) => getMatchStats(m.id)));
      if (cancelled) return;
      setMatches(sorted);
      setByMatchStats(new Map(sorted.map((m, index) => [m.id, rows[index] || []])));
    })().catch((error) => {
      console.error("No se pudieron cargar los destacados:", error);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [seasonId]);

  // Último partido y su MVP
  const lastMatch = useMemo(() => matches[0] || null, [matches]);

  const lastGameMVP = useMemo(() => {
    if (!lastMatch) return null;
    const rows = byMatchStats.get(lastMatch.id) || [];
    if (!rows.length) return null;

    // Criterio: PIR (si existe), si no EFF, y desempate con PTS.
    const score = (r) => {
      const base = (r.pir ?? r.eff ?? 0);
      return { base, tie: r.pts ?? 0 };
    };
    const best = [...rows].sort((a, b) => {
      const sa = score(a), sb = score(b);
      if (sb.base !== sa.base) return sb.base - sa.base;
      return (sb.tie - sa.tie);
    })[0];

    return {
      name: best.name,
      number: best.number,
      pir: best.pir ?? null,
      eff: best.eff ?? null,
      pts: best.pts ?? 0,
      reb: best.reb ?? 0,
      ast: best.ast ?? 0,
      fg: `${best.fgm ?? 0}/${best.fga ?? 0}`,
      fgPct: pct(Number(best.fgm ?? 0), Number(best.fga ?? 0)),
    };
  }, [lastMatch, byMatchStats]);

  // Agregación de temporada por jugador
  const seasonAgg = useMemo(() => {
    const map = new Map(); // name -> agg
    for (const m of matches) {
      const stats = byMatchStats.get(m.id) || [];
      for (const r of stats) {
        const cur = map.get(r.name) || {
          name: r.name,
          number: r.number,
          games: 0,
          fgm: 0, fga: 0,
          ast: 0,
        };
        cur.games += 1;
        cur.fgm += Number(r.fgm ?? 0);
        cur.fga += Number(r.fga ?? 0);
        cur.ast += Number(r.ast ?? 0);
        map.set(r.name, cur);
      }
    }
    return Array.from(map.values());
  }, [matches, byMatchStats]);

  // Top FG% (con mínimo de intentos en temporada)
  const topFG = useMemo(() => {
    const candid = seasonAgg
      .filter(p => p.fga >= MIN_FGA_FOR_TOP_FG)
      .map(p => ({
        ...p,
        fgPctNum: p.fga ? p.fgm / p.fga : 0,
      }))
      .sort((a, b) => b.fgPctNum - a.fgPctNum)[0];
    return candid
      ? { name: candid.name, number: candid.number, pct: pct(candid.fgm, candid.fga), made: candid.fgm, att: candid.fga }
      : null;
  }, [seasonAgg]);

  // Top asistente (Total y Media)
  const topAssist = useMemo(() => {
    if (!seasonAgg.length) return null;
    const byTotal = [...seasonAgg].sort((a, b) => (b.ast - a.ast))[0];
    const byAvg = [...seasonAgg]
      .map(p => ({ ...p, astAvg: p.games ? p.ast / p.games : 0 }))
      .sort((a, b) => (b.astAvg - a.astAvg))[0];
    return {
      total: { name: byTotal.name, number: byTotal.number, val: byTotal.ast },
      media: { name: byAvg.name, number: byAvg.number, val: byAvg.astAvg.toFixed(2) },
    };
  }, [seasonAgg]);

  if (loading) return <p className="text-dim" role="status">Cargando destacados…</p>;
  return <div className="home-highlights">
    {lastMatch && lastGameMVP && <article className="home-panel home-mvp">
      <PlayerJersey number={lastGameMVP.number} />
      <div className="home-mvp-identity">
        <span className="home-eyebrow">MVP · Último partido</span>
        <h3>{lastGameMVP.name}</h3>
        <p>{new Date(`${lastMatch.date}T12:00:00`).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })} · {lastMatch.opponent}</p>
      </div>
      <div className="home-mvp-stats">
        {[[lastGameMVP.pir ?? lastGameMVP.eff ?? 0, 'VAL'], [lastGameMVP.pts, 'PTS'], [lastGameMVP.reb, 'REB'], [lastGameMVP.ast, 'AST']].map(([value, label]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}
        <div className="home-mvp-shots"><strong>{lastGameMVP.fg}</strong><span>TC · {lastGameMVP.fgPct.replace('.', ',')} %</span></div>
      </div>
    </article>}
    <div className="home-leaders">
      <article className="home-panel home-leader">
        <span className="home-eyebrow">Mejor % de tiro</span>
        {topFG ? <><div className="home-leader-identity"><PlayerJersey number={topFG.number} /><h3>{topFG.name}</h3></div><strong className="home-leader-value">{topFG.pct.replace('.', ',')} %</strong><p>{topFG.made}/{topFG.att} TC</p></> : <p>Mínimo {MIN_FGA_FOR_TOP_FG} intentos</p>}
      </article>
      <article className="home-panel home-leader">
        <span className="home-eyebrow">Más asistencias</span>
        {topAssist ? <><div className="home-leader-identity"><PlayerJersey number={topAssist.total.number} /><h3>{topAssist.total.name}</h3></div><strong className="home-leader-value">{topAssist.total.val}</strong><p>asistencias</p></> : <p>Sin datos</p>}
      </article>
    </div>
  </div>;
}
