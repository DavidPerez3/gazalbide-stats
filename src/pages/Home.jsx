import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getMatches, getMatchStats } from "../lib/data";
import DashboardHighlights from "../components/DashboardHighlights";

// suma segura
const num = (v) => Number(v || 0);

export default function Home() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(""); // 🔎 búsqueda por oponente
  const [order, setOrder] = useState("desc"); // ⬆⬇ orden por fecha
  const [teamTotals, setTeamTotals] = useState({
    games: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    wins: 0,
    losses: 0,
    maxPF: 0,
  });

  useEffect(() => {
    (async () => {
      const ms = await getMatches();
      setMatches(ms);

      // Si el convertidor ya mete PF/PA/resultado en matches.json, usamos eso.
      const havePF = ms.every(m => typeof m.gazal_pts !== "undefined");
      const havePA = ms.every(m => typeof m.opp_pts !== "undefined");

      let games = ms.length;
      let pointsFor = 0;
      let pointsAgainst = 0;
      let wins = 0;
      let losses = 0;
      let maxPF = 0;

      if (havePF) {
        for (const m of ms) {
          const pf = num(m.gazal_pts);
          const pa = havePA ? num(m.opp_pts) : 0;

          pointsFor += pf;
          pointsAgainst += pa;
          maxPF = Math.max(maxPF, pf);

          if (typeof m.result === "string") {
            if (m.result.toUpperCase() === "W") wins++;
            else if (m.result.toUpperCase() === "L") losses++;
          } else if (havePA) {
            if (pf > pa) wins++;
            else if (pf < pa) losses++;
          }
        }
      } else {
        // Fallback: sumar PTS del equipo leyendo player_stats/<matchId>.json (solo PF)
        for (const m of ms) {
          const rows = await getMatchStats(m.id);
          const pf = rows.reduce((acc, r) => acc + num(r.pts), 0);
          pointsFor += pf;
          maxPF = Math.max(maxPF, pf);
        }
        // No sabemos PA ni W/L sin la hoja del rival
      }

      setTeamTotals({ games, pointsFor, pointsAgainst, wins, losses, maxPF });
      setLoading(false);
    })();
  }, []);

  // 💡 Lista de partidos filtrada y ordenada
  const filteredMatches = useMemo(() => {
    const term = q.trim().toLowerCase();
    const f = term
      ? matches.filter(m => (m.opponent || "").toLowerCase().includes(term))
      : matches;

    const s = [...f].sort((a, b) => {
      const da = new Date(a.date).getTime() || 0;
      const db = new Date(b.date).getTime() || 0;
      return da - db; // asc por defecto
    });

    return order === "desc" ? s.reverse() : s;
  }, [matches, q, order]);

  const avgPF = useMemo(
    () => (teamTotals.games ? (teamTotals.pointsFor / teamTotals.games).toFixed(1) : "0.0"),
    [teamTotals]
  );
  const avgPA = useMemo(
    () => (teamTotals.games && teamTotals.pointsAgainst ? (teamTotals.pointsAgainst / teamTotals.games).toFixed(1) : "—"),
    [teamTotals]
  );
  const diffAvg = useMemo(() => {
    if (!teamTotals.games || !teamTotals.pointsAgainst) return "—";
    const d = teamTotals.pointsFor / teamTotals.games - teamTotals.pointsAgainst / teamTotals.games;
    return (d >= 0 ? "+" : "") + d.toFixed(1);
  }, [teamTotals]);

  return (
    <section className="space-y-4">
      {/* Bienvenida */}
      <div className="card card--p" style={{marginBottom: 16}}>
        <h2 style={{fontSize:'22px', fontWeight:700, marginBottom:6}}>
          Bienvenido a <span style={{color:'var(--color-gold)'}}>Gazalbide Stats</span>
        </h2>
        <p className="text-dim">
          Consulta resultados, estadísticas de cada partido y ranking por métrica. Los datos se importan tras cada encuentro.
        </p>
      </div>

      <DashboardHighlights />

      {/* Dashboard */}
      <div className="grid grid--3">
        <div className="card card--p">
          <div className="text-dim" style={{fontSize:'12px', marginBottom:6}}>Partidos</div>
          <div style={{fontSize:'22px', fontWeight:800}}>{teamTotals.games}</div>
        </div>
        <div className="card card--p">
          <div className="text-dim" style={{fontSize:'12px', marginBottom:6}}>Récord</div>
          <div style={{fontSize:'22px', fontWeight:800}}>
            {teamTotals.wins || teamTotals.losses ? `${teamTotals.wins} - ${teamTotals.losses}` : "—"}
          </div>
          <div className="text-dim" style={{fontSize:'12px'}}>Victorias – Derrotas</div>
        </div>
        <div className="card card--p">
          <div className="text-dim" style={{fontSize:'12px', marginBottom:6}}>Puntos totales</div>
          <div style={{fontSize:'22px', fontWeight:800}}>{teamTotals.pointsFor}</div>
          <div className="text-dim" style={{fontSize:'12px'}}>Máximo en un partido: {teamTotals.maxPF}</div>
        </div>

        <div className="card card--p">
          <div className="text-dim" style={{fontSize:'12px', marginBottom:6}}>Media PF</div>
          <div style={{fontSize:'22px', fontWeight:800}}>{avgPF}</div>
          <div className="text-dim" style={{fontSize:'12px'}}>Puntos a favor por partido</div>
        </div>
        <div className="card card--p">
          <div className="text-dim" style={{fontSize:'12px', marginBottom:6}}>Media PA</div>
          <div style={{fontSize:'22px', fontWeight:800}}>{avgPA}</div>
          <div className="text-dim" style={{fontSize:'12px'}}>Puntos en contra por partido</div>
        </div>
        <div className="card card--p">
          <div className="text-dim" style={{fontSize:'12px', marginBottom:6}}>Diferencial medio</div>
          <div style={{fontSize:'22px', fontWeight:800}}>{diffAvg}</div>
          <div className="text-dim" style={{fontSize:'12px'}}>PF/partido − PA/partido</div>
        </div>
      </div>

      {/* Lista de partidos */}
      <h3 className="mt-6" style={{fontSize:'18px', fontWeight:700, color:'var(--color-gold)'}}>Partidos</h3>

      {/* Controles de búsqueda/orden */}
      {!loading && (
        <div className="flex gap-2 mb-3" style={{marginBottom: 16}}>
          <input
            className="input flex-1"
            placeholder="Buscar por oponente…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="input"
            value={order}
            onChange={(e) => setOrder(e.target.value)}
            title="Orden por fecha"
          >
            <option value="desc">Fecha ↓ (recientes primero)</option>
            <option value="asc">Fecha ↑ (antiguos primero)</option>
          </select>
        </div>
      )}

      {loading ? (
        <div className="text-dim">Cargando…</div>
      ) : filteredMatches.length === 0 ? (
        <div className="card card--p text-center opacity-70">Sin resultados</div>
      ) : (
        <div className="grid grid--2">
          {filteredMatches.map(m => (
            <Link
              key={m.id}
              to={`/partido/${m.id}`}
              className="card card--p"
              title={`Ver estadísticas del ${m.date} vs ${m.opponent}`}
            >
              <div className="flex justify-between items-center">
                <div>
                  <div style={{fontSize:'18px', fontWeight:700}}>{m.date || "Fecha"}</div>
                  <div className="text-dim">vs {m.opponent || "—"}</div>
                </div>
                <div style={{textAlign:'right'}}>
                  {typeof m.gazal_pts !== "undefined" ? (
                    <>
                      <div style={{fontWeight:700}}>
                        {m.gazal_pts}{typeof m.opp_pts !== "undefined" ? ` - ${m.opp_pts}` : ""}
                      </div>
                      <div className="text-dim" style={{fontSize:'12px'}}>
                        {m.result ? (m.result === "W" ? "Victoria" : m.result === "L" ? "Derrota" : "Empate") : ""}
                      </div>
                    </>
                  ) : (
                    <span className="badge">Ver</span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
