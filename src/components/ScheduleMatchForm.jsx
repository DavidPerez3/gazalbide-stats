import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient.js";
import { CURRENT_SEASON_ID } from "../lib/seasons.js";
import { makeMatchId } from "../lib/matchLinks.js";

export default function ScheduleMatchForm({ marketReady, onCreated }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", opponent: "", date: "", deadline: "", fantasy: true, markets: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(null);
  const [scheduled, setScheduled] = useState([]);
  useEffect(() => {
    let active = true;
    supabase.from("matches").select("id,date,opponent").eq("season", CURRENT_SEASON_ID).eq("status", "draft").eq("is_scheduled", true).order("date").then(({ data, error: failure }) => {
      if (!active) return;
      if (failure) setError("No se pudieron consultar los partidos programados.");
      else setScheduled(data || []);
    });
    return () => { active = false; };
  }, [created]);
  const field = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  async function submit(e) {
    e.preventDefault(); setSaving(true); setError(""); setCreated(null);
    try {
      const { data, error: failure } = await supabase.rpc("schedule_match", {
        p_match_id: makeMatchId(form.date, form.opponent), p_season: CURRENT_SEASON_ID,
        p_date: form.date, p_opponent: form.opponent.trim(), p_fantasy: form.fantasy,
        p_name: form.name, p_deadline: form.fantasy ? new Date(form.deadline).toISOString() : null,
        p_markets: form.fantasy && form.markets,
      });
      if (failure) throw failure;
      setCreated(data); if (data.gameweek) onCreated(data.gameweek);
    } catch (failure) { setError(failure.message || "No se pudo programar el partido."); }
    finally { setSaving(false); }
  }
  return <form className="admin__form" onSubmit={submit}>
    <h3>Programar partido · {CURRENT_SEASON_ID}</h3>
    <p>Una misma convocatoria conecta Live Stats, el resultado y la jornada.</p>
    {[['name','Nombre de jornada (opcional)','text'],['opponent','Rival','text'],['date','Fecha del partido','date']].map(([key,label,type]) => <label className="admin__label" key={key}>{label}<input className="admin__input" type={type} value={form[key]} onChange={field(key)} required={key !== 'name'} /></label>)}
    <label><input type="checkbox" checked={form.fantasy} onChange={field('fantasy')} /> Crear jornada Fantasy</label>
    {form.fantasy && <><label className="admin__label">Cierre Fantasy y apuestas<input className="admin__input" type="datetime-local" value={form.deadline} onChange={field('deadline')} required /></label><label><input type="checkbox" checked={form.markets} onChange={field('markets')} /> Generar mercados GazalBet ahora</label>{!marketReady && <p role="status">Activa primero el mercado Fantasy de esta temporada.</p>}</>}
    {error && <p role="alert">{error}</p>}
    <button className="admin__button" disabled={saving || (form.fantasy && !marketReady)}>{saving ? 'Programando…' : 'Programar partido'}</button>
    {created && <div role="status"><p>Partido programado correctamente.</p><button className="admin__button" type="button" onClick={() => navigate(`/admin/live/setup?match=${encodeURIComponent(created.match_id)}${created.gameweek ? `&gameweek=${created.gameweek.id}` : ''}`)}>Preparar convocatoria →</button></div>}
    {scheduled.length > 0 && <div><h3>Partidos pendientes de iniciar</h3>{scheduled.map((match) => <p key={match.id}><button className="admin__button" type="button" onClick={() => navigate(`/admin/live/setup?match=${encodeURIComponent(match.id)}`)}>{match.date} · {match.opponent} · Abrir convocatoria</button></p>)}</div>}
  </form>;
}
