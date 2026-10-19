import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient.js";
import "./leaguePreview.css";

export default function LeaguePreview({ seasonId, gameweek = null }) {
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    setPreview(null); setError(false);
    supabase.rpc("get_league_preview", {
      p_season: seasonId, p_opponent: gameweek?.opponent || null,
      p_date: gameweek?.date || null,
    }).then(({ data, error: loadError }) => {
      if (!active) return;
      if (loadError) setError(true); else setPreview(data);
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [seasonId, gameweek?.opponent, gameweek?.date]);
  if (error) return <p className="league-preview__notice" role="status">La previa del grupo no está disponible ahora.</p>;
  if (!preview) return null;
  const rival = preview.rival || {};
  const previous = preview.h2h || [];
  const victories = previous.filter(match => match.gazal > match.rival).length;
  const synced = preview.source?.synced_at;
  const stale = synced && Date.now() - new Date(synced).getTime() > 72 * 60 * 60 * 1000;
  return <section className="league-preview" aria-label="Previa del rival">
    <div className="league-preview__header"><div><span>PREVIA · LIGA</span><h2>{preview.opponent}</h2><p>{preview.date} · Gazalbide {preview.home ? "local" : "visitante"}</p></div>
      <strong>{Number(rival.wins || 0)}–{Number(rival.losses || 0)}<small>balance del rival</small></strong></div>
    <p>{Number(rival.games || 0)} partidos del rival · últimos resultados: {(rival.form || []).slice(-5).join(" · ") || "sin resultados todavía"}.</p>
    <div className="league-preview__h2h"><h3>Enfrentamientos anteriores</h3>
      {previous.length ? <><p>{victories} victorias y {previous.length - victories} derrotas de Gazalbide en {previous.length} partidos.</p>
        {previous.map(match => <Link key={match.id} to={`/partido/${encodeURIComponent(match.id)}`}><span>{match.date}</span><strong>{match.gazal}–{match.rival}</strong><span aria-hidden="true">›</span></Link>)}</>
        : <p>No hay enfrentamientos de liga publicados contra este rival.</p>}
    </div>
    <details><summary>Balance del grupo · {preview.group_games} partidos disputados</summary>
      <div className="league-preview__table"><table><caption>Ordenado por victorias y diferencial; no sustituye la clasificación oficial.</caption><thead><tr><th>Equipo</th><th>PJ</th><th>V–D</th><th>PF</th><th>PC</th></tr></thead><tbody>
        {(preview.standings || []).map(team => <tr key={team.name}><th scope="row">{team.name}</th><td>{team.games}</td><td>{team.wins}–{team.losses}</td><td>{team.pf}</td><td>{team.pa}</td></tr>)}
      </tbody></table></div>
    </details>
    <p className="league-preview__notice">{preview.provisional ? "Datos iniciales: todavía hay pocos partidos. " : ""}El modelo combina forma del grupo, nivel de los oponentes, localía e histórico reciente. Los amistosos no cuentan.</p>
    {preview.source?.url && <p className="league-preview__source"><a href={preview.source.url} target="_blank" rel="noreferrer">Resultados de Basketaraba ↗</a>{synced && <span> · Actualizado {new Date(synced).toLocaleString("es-ES")}</span>}</p>}
    {(preview.source?.last_error || stale) && <p className="league-preview__notice" role="status">Pendiente de actualizar: se muestra la última copia disponible.</p>}
  </section>;
}
