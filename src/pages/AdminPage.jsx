import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient.js";

// Genera un slug tipo "2025-11-09-vs-pozo-i-moicar"
function slugifyOpponent(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function AdminPage() {
  const { user, profile } = useAuth();
  const [gameweeks, setGameweeks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [infoMsg, setInfoMsg] = useState(null);

  const [name, setName] = useState("");
  const [opponent, setOpponent] = useState("");
  const [date, setDate] = useState(""); // YYYY-MM-DD
  const [deadline, setDeadline] = useState(""); // datetime-local
  const [matchId, setMatchId] = useState("");

  useEffect(() => {
    async function fetchGameweeks() {
      setLoading(true);
      setErrorMsg(null);

      const { data, error } = await supabase
        .from("gameweeks")
        .select("*")
        .order("date", { ascending: false });

      if (error) {
        console.error("Error cargando gameweeks:", error);
        setErrorMsg(
          "No se han podido cargar las jornadas: " +
            (error.message || "error desconocido")
        );
      } else {
        setGameweeks(data || []);
      }

      setLoading(false);
    }

    fetchGameweeks();
  }, []);

  async function handleCreateGameweek(e) {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);

    if (!date || !deadline) {
      setErrorMsg("Debes indicar fecha del partido y deadline.");
      return;
    }

    setSaving(true);

    // deadline viene como "2025-10-12T23:59" → lo pasamos a ISO
    const deadlineIso = new Date(deadline).toISOString();

    // 1) Generar ID base si no se ha escrito a mano
    let finalMatchId = matchId.trim() || null;

    if (!finalMatchId) {
      const oppSlug = slugifyOpponent(opponent) || "sin-rival";
      // ID tipo "2025-11-09-vs-pozo-i-moicar"
      finalMatchId = `${date}-vs-${oppSlug}`;
    }

    // 2) stats_file = id + ".json"
    const statsFile = finalMatchId ? `${finalMatchId}.json` : null;

    const { data, error } = await supabase
      .from("gameweeks")
      .insert({
        name: name.trim() || null,
        opponent: opponent.trim() || null,
        date, // el input date ya da "YYYY-MM-DD"
        deadline: deadlineIso,
        match_id: finalMatchId,
        stats_file: statsFile,
      })
      .select("*")
      .single();

    setSaving(false);

    if (error) {
      console.error("Error creando gameweek:", error);
      setErrorMsg(
        "No se ha podido crear la jornada: " +
          (error.message || "error desconocido")
      );
      return;
    }

    setInfoMsg("Jornada creada correctamente.");

    setGameweeks((prev) => [data, ...prev]);

    // limpiar formulario
    setName("");
    setOpponent("");
    setDate("");
    setDeadline("");
    setMatchId("");
  }

  const adminName =
    profile?.username || user?.email?.split("@")[0] || "admin";

  return (
    <div className="admin">
      <div className="container">
        <div className="admin__card">
          <header className="admin__header">
            <h1 className="admin__title">Panel Admin</h1>
            <p className="admin__subtitle">
              Hola <strong>{adminName}</strong>, aquí puedes gestionar las{" "}
              <strong>jornadas Fantasy</strong>.
            </p>
          </header>

          {errorMsg && (
            <p className="admin__message admin__message--error">{errorMsg}</p>
          )}
          {infoMsg && (
            <p className="admin__message admin__message--success">
              {infoMsg}
            </p>
          )}

          {/* Formulario creación de jornada */}
          <section className="admin__section">
            <h2 className="admin__section-title">Crear nueva jornada</h2>
            <p className="admin__text">
              Crea una <strong>gameweek</strong> indicando fecha, rival y
              deadline para que la gente cierre sus equipos.
            </p>

            <form className="admin__form" onSubmit={handleCreateGameweek}>
              <div className="admin__field">
                <label className="admin__label">
                  Nombre (opcional)
                  <input
                    type="text"
                    className="admin__input"
                    placeholder="Ej: Jornada 3 vs Anboto"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
              </div>

              <div className="admin__field">
                <label className="admin__label">
                  Rival (opcional)
                  <input
                    type="text"
                    className="admin__input"
                    placeholder="Ej: Anboto Jatetxea"
                    value={opponent}
                    onChange={(e) => setOpponent(e.target.value)}
                  />
                </label>
              </div>

              <div className="admin__field admin__field--inline">
                <label className="admin__label admin__label--inline">
                  Fecha del partido
                  <input
                    type="date"
                    className="admin__input"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </label>

                <label className="admin__label admin__label--inline">
                  Deadline para hacer equipo
                  <input
                    type="datetime-local"
                    className="admin__input"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    required
                  />
                </label>
              </div>

              <div className="admin__field">
                <label className="admin__label">
                  ID del partido (opcional)
                  <input
                    type="text"
                    className="admin__input"
                    placeholder="Ej: 2025-10-12-vs-anboto-jatetxea"
                    value={matchId}
                    onChange={(e) => setMatchId(e.target.value)}
                  />
                </label>
              </div>

              <button
                type="submit"
                className="admin__button"
                disabled={saving}
              >
                {saving ? "Creando jornada..." : "Crear jornada"}
              </button>
            </form>
          </section>

          {/* Lista de jornadas existentes */}
          <section className="admin__section">
            <h2 className="admin__section-title">Jornadas existentes</h2>

            {loading ? (
              <p className="admin__text">Cargando jornadas...</p>
            ) : gameweeks.length === 0 ? (
              <p className="admin__text">
                Todavía no hay ninguna jornada creada.
              </p>
            ) : (
              <ul className="admin__list">
                {gameweeks.map((gw) => (
                  <li key={gw.id} className="admin__list-item">
                    <div className="admin__list-main">
                      <div>
                        <div className="admin__gw-name">
                          {gw.name || `Gameweek #${gw.id}`}
                        </div>
                        <div className="admin__gw-sub">
                          {gw.date} {gw.opponent && ` · vs ${gw.opponent}`}
                        </div>
                      </div>
                      <div className="admin__gw-meta">
                        <span className="admin__tag admin__tag--status">
                          {gw.status}
                        </span>
                        <span className="admin__gw-deadline">
                          Deadline:{" "}
                          {new Date(gw.deadline).toLocaleString("es-ES", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {gw.match_id && (
                          <span className="admin__gw-match">
                            ID partido: {gw.match_id}
                          </span>
                        )}
                        {gw.stats_file && (
                          <span className="admin__gw-match">
                            Stats file: {gw.stats_file}
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
