import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient.js";
import "../fantasy-gameweek-statuses.css";

const available = { status: "available", note: "" };
const getEntry = (entries, number) => entries[Number(number)] || available;

export default function FantasyGameweekStatuses({ gameweekId, players }) {
  const [entries, setEntries] = useState({});
  const [original, setOriginal] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setLoadFailed(false);
    supabase.from("player_statuses")
      .select("player_number,status,note")
      .eq("gameweek_id", gameweekId)
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) {
          setError(`No se pudieron cargar los estados: ${loadError.message}`);
          setLoadFailed(true);
        }
        else {
          const rows = Object.fromEntries((data || []).map((row) => [Number(row.player_number), {
            status: row.status,
            note: row.note || "",
          }]));
          setEntries(rows);
          setOriginal(rows);
        }
        setLoading(false);
      });
    return () => { active = false; };
  }, [gameweekId]);

  function change(number, patch) {
    setMessage("");
    setEntries((prev) => {
      const next = { ...getEntry(prev, number), ...patch };
      if (next.status === "available") next.note = "";
      return { ...prev, [Number(number)]: next };
    });
  }

  async function save() {
    const changes = players.flatMap((player) => {
      const number = Number(player.number);
      const next = getEntry(entries, number);
      const previous = getEntry(original, number);
      const note = next.status === "available" ? "" : next.note.trim();
      if (next.status === previous.status && note === previous.note.trim()) return [];
      return [{ gameweek_id: gameweekId, player_number: number, status: next.status,
        note: note || null, updated_at: new Date().toISOString() }];
    });
    if (!changes.length) { setMessage("No hay cambios pendientes."); return; }

    setSaving(true);
    setError("");
    setMessage("");
    const { error: saveError } = await supabase.from("player_statuses")
      .upsert(changes, { onConflict: "gameweek_id,player_number" });
    setSaving(false);
    if (saveError) { setError(`No se pudieron guardar los estados: ${saveError.message}`); return; }
    const refreshed = { ...original };
    for (const row of changes) refreshed[row.player_number] = {
      status: row.status, note: row.note || "",
    };
    setOriginal(refreshed);
    setMessage(`${changes.length} estado${changes.length === 1 ? "" : "s"} guardado${changes.length === 1 ? "" : "s"}.`);
  }

  if (loading) return <p className="admin__text">Cargando estados de la jornada…</p>;

  return (
    <div className="gameweek-statuses">
      <p className="admin__text">Selecciona Disponible, Dudoso o Lesionado / otro. En la nota puedes escribir «vacaciones», «pádel», «piba» o el motivo que quieras.</p>
      {error && <p role="alert" className="fantasy__message fantasy__message--error">{error}</p>}
      {message && <p role="status" className="admin__text">{message}</p>}
      {!players.length && <p className="admin__text">No hay jugadores activos en el mercado.</p>}
      <div className="gameweek-statuses__list">
        {players.map((player) => {
          const entry = getEntry(entries, player.number);
          return (
            <div className="gameweek-statuses__row" key={player.player_id}>
              <strong>#{player.number} · {player.name}</strong>
              <select className="admin__input" aria-label={`Estado de ${player.name}`}
                value={entry.status} onChange={(event) => change(player.number, { status: event.target.value })}>
                <option value="available">Disponible</option>
                <option value="doubtful">Dudoso</option>
                <option value="injured">Lesionado / otro</option>
              </select>
              <input className="admin__input" aria-label={`Motivo de ${player.name}`}
                value={entry.note} disabled={entry.status === "available"} maxLength={100}
                placeholder={entry.status === "injured" ? "Ej: vacaciones, pádel, piba…" : "Motivo opcional"}
                onChange={(event) => change(player.number, { note: event.target.value })} />
            </div>
          );
        })}
      </div>
      <button type="button" className="admin__button" onClick={save}
        disabled={saving || loadFailed || !players.length}>
        {saving ? "Guardando estados…" : "Guardar estados"}
      </button>
    </div>
  );
}
