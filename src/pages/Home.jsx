import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getMatches, getMatchStats, getPlayers, getTechs } from "../lib/data";
import { useSeason } from "../context/SeasonContext.jsx";
import DashboardHighlights from "../components/DashboardHighlights";
import PublicLiveBanner from "../components/PublicLiveBanner.jsx";
import { supabase } from "../lib/supabaseClient.js";

import "../home-dashboard.css";

const num = (v) => Number(v || 0);

export default function Home() {
  const { activeSeason } = useSeason();
  const [matches, setMatches] = useState([]);
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [q, setQ] = useState("");
  const [order, setOrder] = useState("desc");
  const [techs, setTechs] = useState({});
  const [plannedGameweeks, setPlannedGameweeks] = useState([]);
  const [gameweeksError, setGameweeksError] = useState("");
  const [teamTotals, setTeamTotals] = useState({
    games: 0, pointsFor: 0, pointsAgainst: 0, wins: 0, losses: 0, maxPF: 0,
  });

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [seasonTechs, seasonPlayers, ms] = await Promise.all([
        getTechs(activeSeason.id),
        getPlayers(activeSeason.id),
        getMatches(activeSeason.id),
      ]);
      setTechs(seasonTechs || {});
      setPlayers(seasonPlayers || []);
      setMatches(ms || []);

      const havePF = ms.every((m) => typeof m.gazal_pts !== "undefined");
      const havePA = ms.every((m) => typeof m.opp_pts !== "undefined");

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
        for (const m of ms) {
          const rows = await getMatchStats(m.id);
          const pf = rows.reduce((acc, r) => acc + num(r.pts), 0);
          pointsFor += pf;
          maxPF = Math.max(maxPF, pf);
        }
      }

      setTeamTotals({ games, pointsFor, pointsAgainst, wins, losses, maxPF });
      setLoading(false);
    })();
  }, [activeSeason.id]);

  useEffect(() => {
    let active = true;
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    supabase.from("gameweeks")
      .select("id,name,opponent,date,deadline,season_id")
      .eq("status", "scheduled")
      .gte("date", today)
      .order("date", { ascending: true })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setGameweeksError("No se pudieron cargar las jornadas planificadas.");
        else setPlannedGameweeks(data || []);
      });
    return () => { active = false; };
  }, []);

  const filteredMatches = useMemo(() => {
    const term = q.trim().toLowerCase();
    const f = term
      ? matches.filter((m) => (m.opponent || "").toLowerCase().includes(term))
      : matches;
    const s = [...f].sort((a, b) => (new Date(a.date).getTime() || 0) - (new Date(b.date).getTime() || 0));
    return order === "desc" ? s.reverse() : s;
  }, [matches, q, order]);

  const avgPF = useMemo(() => teamTotals.games ? (teamTotals.pointsFor / teamTotals.games).toFixed(1) : "0.0", [teamTotals]);
  const avgPA = useMemo(() => teamTotals.games && teamTotals.pointsAgainst ? (teamTotals.pointsAgainst / teamTotals.games).toFixed(1) : "—", [teamTotals]);
  const diffAvg = useMemo(() => {
    if (!teamTotals.games || !teamTotals.pointsAgainst) return "—";
    const d = teamTotals.pointsFor / teamTotals.games - teamTotals.pointsAgainst / teamTotals.games;
    return (d >= 0 ? "+" : "") + d.toFixed(1);
  }, [teamTotals]);

  const techTotals = useMemo(() => {
    let total = 0;
    let topPlayerId = null;
    let topValue = 0;
    for (const [playerId, raw] of Object.entries(techs || {})) {
      const value = typeof raw === "number" ? raw : Number(raw?.tech_fouls ?? 0);
      total += value;
      if (value > topValue) { topValue = value; topPlayerId = playerId; }
    }
    const topPlayerObj = players.find((p) => String(p.number) === String(topPlayerId));
    return { total, topPlayerId, topPlayer: topPlayerObj?.name ?? "—", topValue };
  }, [techs, players]);

  return (
    <section className="home-dashboard">
      <PublicLiveBanner />
      <div className="home-section-heading"><h2>Temporada en cifras</h2><span>{loading ? 'Cargando…' : `${teamTotals.games} partidos`}</span></div>
      <div className="home-panel home-team-stats" aria-label="Resumen de temporada">
        <div className="home-team-main">
          <div><strong>{loading ? '—' : `${teamTotals.wins}–${teamTotals.losses}`}</strong><span>Victorias · Derrotas</span></div>
          <div><strong>{loading ? '—' : diffAvg.replace('.', ',')}</strong><span>Diferencial</span></div>
        </div>
        <div className="home-team-secondary">
          <div><strong>{loading ? '—' : avgPF.replace('.', ',')}</strong><span>PF / partido</span></div>
          <div><strong>{loading ? '—' : avgPA.replace('.', ',')}</strong><span>PA / partido</span></div>
          <div title={techTotals.topPlayerId ? `Máximo: #${techTotals.topPlayerId} ${techTotals.topPlayer} (${techTotals.topValue})` : 'Sin técnicas'}><strong>{loading ? '—' : techTotals.total}</strong><span>Técnicas</span></div>
        </div>
      </div>
      {!loading && matches.length > 0 && <DashboardHighlights seasonId={activeSeason.id} />}
      <div className="home-panel home-shoulder">
        <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M6 8h17c9 0 13 6 13 12M10 40l8-14c-4-4-5-10-1-14m8 13c-7 0-9 5-8 10l-3 7m11-17c8-1 12 4 13 12l2 5H29l-4-9m14-22 4-3m-3 12h5" /></svg>
        <div><h3>Hombro de Imanol</h3><p>Veces que se le ha salido</p></div><strong>4</strong>
      </div>
      {(plannedGameweeks.some(gw => gw.season_id === activeSeason.id) || gameweeksError) && <section className="home-upcoming" aria-label="Próximas jornadas Fantasy">
        <h3>Próximas jornadas Fantasy</h3>
        {gameweeksError && <p role="alert">{gameweeksError}</p>}
        {plannedGameweeks.filter(gw => gw.season_id === activeSeason.id).slice(0, 2).map(gw => <Link className="home-panel home-upcoming-row" key={gw.id} to="/fantasy"><div><strong>{gw.opponent || gw.name}</strong><span>{gw.name} · {gw.date}</span></div><span>Fantasy →</span></Link>)}
      </section>}
      {!loading && matches.length === 0 && <p className="home-panel home-empty">{activeSeason.current ? 'Todavía no hay partidos publicados. Puedes consultar temporadas anteriores.' : 'No hay partidos en esta temporada.'}</p>}
      <div className="home-section-heading"><h2>{showAll ? 'Todos los partidos' : 'Últimos partidos'}</h2><span>{activeSeason.label}</span></div>
      {showAll && <div className="home-filters">
        <input className="input" aria-label="Buscar por rival" placeholder="Buscar por rival…" value={q} onChange={event => setQ(event.target.value)} />
        <select className="input" aria-label="Orden por fecha" value={order} onChange={event => setOrder(event.target.value)}><option value="desc">Más recientes</option><option value="asc">Más antiguos</option></select>
      </div>}
      {loading ? <p role="status">Cargando partidos…</p> : <div className="home-panel home-match-list">
        {(showAll ? filteredMatches : [...matches].sort((a,b) => String(b.date).localeCompare(String(a.date))).slice(0, 3)).map(m => {
          const date = new Date(`${m.date}T12:00:00`);
          return <Link className="home-match-row" key={m.id} to={`/partido/${m.id}`}>
            <time className="home-match-date" dateTime={m.date}><strong>{date.getDate().toString().padStart(2, '0')}</strong><span>{date.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '')}</span></time>
            <div className="home-match-opponent"><strong>{m.opponent || 'Rival'}</strong><span>{m.gazal_pts != null ? `${m.gazal_pts} – ${m.opp_pts ?? '—'}` : 'Ver estadísticas'}</span></div>
            {m.result && <span className={`home-result home-result--${m.result.toLowerCase()}`}>{m.result === 'W' ? 'Victoria' : m.result === 'L' ? 'Derrota' : 'Empate'}</span>}<span aria-hidden="true">›</span>
          </Link>;
        })}
        {showAll && !filteredMatches.length && <p className="home-empty">No hay partidos para este filtro.</p>}
      </div>}
      {!loading && matches.length > 3 && <button className="home-see-all" type="button" aria-expanded={showAll} onClick={() => setShowAll(value => !value)}>{showAll ? 'Ver últimos partidos' : 'Ver todos los partidos'} →</button>}
      <nav className="home-shortcuts" aria-label="Accesos rápidos"><Link to="/fantasy"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v5a5 5 0 0 1-10 0V4Zm0 2H4v3a4 4 0 0 0 4 4m9-7h3v3a4 4 0 0 1-4 4m-4 1v6m-4 0h8" /></svg>Fantasy</Link><Link to="/porra"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V11h4v9m2 0V7h4v13m2 0V3h4v17M3 20h18" /></svg>GazalBet</Link><Link to="/estadisticas"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v9h9M21 12a9 9 0 1 1-9-9m3 0a9 9 0 0 1 6 6h-6V3Z" /></svg>Estadísticas</Link></nav>
    </section>
  );
}
