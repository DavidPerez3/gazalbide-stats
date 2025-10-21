import { useEffect, useMemo, useState } from "react";
import { getMatches, getMatchStats } from "../lib/data";

// Helpers
const pct = (m, a) => (a > 0 ? ((m / a) * 100).toFixed(1) : "0.0");
const byDateDesc = (a, b) => new Date(b.date) - new Date(a.date);

// Configurable
const MIN_FGA_FOR_TOP_FG = 20; // mínimo de intentos en la temporada para optar a Top FG%

export default function DashboardHighlights() {
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState([]);
  const [byMatchStats, setByMatchStats] = useState(new Map()); // matchId -> rows[]

  useEffect(() => {
    (async () => {
      const ms = await getMatches();
      // ordenamos por fecha descendente por si no vienen ya así
      const sorted = [...ms].sort(byDateDesc);
      setMatches(sorted);

      const map = new Map();
      for (const m of sorted) {
        const stats = await getMatchStats(m.id);
        map.set(m.id, stats || []);
      }
      setByMatchStats(map);
      setLoading(false);
    })();
  }, []);

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

  if (loading) {
    return (
      <div className="card" style={{ padding: 16 }}>
        <div className="text-dim">Cargando destacados…</div>
      </div>
    );
  }

  return (
    <div
      className="mb-4"
      style={{
        display: "grid",
        gap: 16,
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
      }}
    >
      {/* Jugador del último partido */}
      <div className="card card--p">
        <div className="text-dim" style={{ fontSize: 12, marginBottom: 6 }}>
          Jugador del último partido
        </div>
        {lastMatch && lastGameMVP ? (
          <>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              #{lastGameMVP.number} — {lastGameMVP.name}
            </div>
            <div className="text-dim" style={{ fontSize: 12, marginTop: 6 }}>
              {lastMatch.date} • {lastMatch.opponent}
            </div>
            <div style={{ marginTop: 8 }}>
              <b>{(lastGameMVP.pir ?? lastGameMVP.eff) ?? 0}</b> VAL
              <span className="text-dim"> · {lastGameMVP.pts} PTS · {lastGameMVP.reb} REB · {lastGameMVP.ast} AST · {lastGameMVP.fg} FG</span>
            </div>
          </>
        ) : (
          <div className="text-dim">Sin datos</div>
        )}
      </div>

      {/* Top FG% temporada */}
      <div className="card card--p">
        <div className="text-dim" style={{ fontSize: 12, marginBottom: 6 }}>
          Top FG% temporada
        </div>
        {topFG ? (
          <>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              #{topFG.number} — {topFG.name}
            </div>
            <div style={{ marginTop: 6, fontSize: 20, fontWeight: 700 }}>
              {topFG.pct}%
            </div>
            <div className="text-dim" style={{ fontSize: 12 }}>
              {topFG.made}/{topFG.att}
            </div>
          </>
        ) : (
          <div className="text-dim">Aún no hay suficientes intentos</div>
        )}
      </div>

      {/* Top asistente temporada */}
      <div className="card card--p">
        <div className="text-dim" style={{ fontSize: 12, marginBottom: 6 }}>
          Top asistente temporada
        </div>
        {topAssist ? (
          <>
            <div style={{ display: "grid", gap: 6 }}>
              <div>
                <div className="text-dim" style={{ fontSize: 12 }}>Por TOTAL</div>
                <div><b>#{topAssist.total.number} — {topAssist.total.name}</b></div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{topAssist.total.val} Asistencias</div>
              </div>
            </div>
          </>
        ) : (
          <div className="text-dim">Sin datos</div>
        )}
      </div>
    </div>
  );
}
