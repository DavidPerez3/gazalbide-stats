import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient.js";
import { CURRENT_SEASON_ID } from "../lib/seasons.js";
import { getFantasySeasonStatus, loadFantasyCoaches, loadFantasyMarket, loadFantasyTraitConfig, replaceFantasyTraitAssignments } from "../lib/fantasyMarket.js";

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
  const [marketStatus, setMarketStatus] = useState(null);
  const [marketPlayers, setMarketPlayers] = useState([]);
  const [priceDrafts, setPriceDrafts] = useState({});
  const [savingPrices, setSavingPrices] = useState(false);
  const [fantasyCoaches, setFantasyCoaches] = useState([]);
  const [traitConfig, setTraitConfig] = useState(null);
  const [playerTraitDrafts, setPlayerTraitDrafts] = useState({});
  const [staffTraitDrafts, setStaffTraitDrafts] = useState({});
  const [savingTraits, setSavingTraits] = useState(false);

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
        .eq("season_id", CURRENT_SEASON_ID)
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

      try {
        const [status, players, coaches, seasonTraits] = await Promise.all([
          getFantasySeasonStatus(CURRENT_SEASON_ID),
          loadFantasyMarket({ seasonId: CURRENT_SEASON_ID }),
          loadFantasyCoaches(CURRENT_SEASON_ID),
          loadFantasyTraitConfig(CURRENT_SEASON_ID),
        ]);
        setMarketStatus(status);
        setMarketPlayers(players);
        setFantasyCoaches(coaches);
        setTraitConfig(seasonTraits);
        setPriceDrafts(
          Object.fromEntries(players.map((player) => [player.player_id, player.price ?? ""]))
        );
        setPlayerTraitDrafts(seasonTraits.playerTraitsByPlayerId || {});
        setStaffTraitDrafts(seasonTraits.staffTraitsById || {});
      } catch (marketError) {
        console.error("Error cargando estado del mercado:", marketError);
      }

      setLoading(false);
    }

    fetchGameweeks();
  }, []);

  function toggleTrait(setter, entityId, traitCode) {
    setter((prev) => {
      const current = prev[entityId] || [];
      const next = current.includes(traitCode)
        ? current.filter((code) => code !== traitCode)
        : [...current, traitCode];
      return { ...prev, [entityId]: next };
    });
  }

  async function handleSaveTraits() {
    setErrorMsg(null);
    setInfoMsg(null);
    setSavingTraits(true);
    try {
      await replaceFantasyTraitAssignments({
        seasonId: CURRENT_SEASON_ID,
        playerTraitsByPlayerId: playerTraitDrafts,
        staffTraitsById: staffTraitDrafts,
      });
      const refreshed = await loadFantasyTraitConfig(CURRENT_SEASON_ID);
      setTraitConfig(refreshed);
      setPlayerTraitDrafts(refreshed.playerTraitsByPlayerId || {});
      setStaffTraitDrafts(refreshed.staffTraitsById || {});
      setInfoMsg("Rasgos Fantasy guardados correctamente.");
    } catch (error) {
      console.error("Error guardando rasgos Fantasy:", error);
      setErrorMsg("No se han podido guardar los rasgos: " + (error.message || "error desconocido"));
    } finally {
      setSavingTraits(false);
    }
  }

  async function handleSaveMarketPrices() {
    setErrorMsg(null);
    setInfoMsg(null);

    const rows = [];
    for (const player of marketPlayers) {
      const price = Number(priceDrafts[player.player_id]);
      if (!Number.isInteger(price) || price <= 0) {
        setErrorMsg(`Precio inválido para ${player.name}.`);
        return;
      }
      rows.push({
        season_id: CURRENT_SEASON_ID,
        player_id: player.player_id,
        price,
        enabled: true,
        updated_at: new Date().toISOString(),
      });
    }

    if (!rows.length) {
      setErrorMsg("No hay jugadores en el mercado actual.");
      return;
    }

    setSavingPrices(true);
    const { error } = await supabase
      .from("fantasy_player_market")
      .upsert(rows, { onConflict: "season_id,player_id" });
    setSavingPrices(false);

    if (error) {
      console.error("Error guardando precios Fantasy:", error);
      setErrorMsg("No se han podido guardar los precios: " + (error.message || "error desconocido"));
      return;
    }

    setMarketPlayers((prev) =>
      prev.map((player) => ({
        ...player,
        price: Number(priceDrafts[player.player_id]),
      }))
    );
    setMarketStatus(await getFantasySeasonStatus(CURRENT_SEASON_ID));
    setInfoMsg("Precios Fantasy guardados. El mercado sigue bloqueado hasta terminar la configuración de temporada.");
  }

  async function handleCreateGameweek(e) {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);

    if (!marketStatus?.marketReady) {
      setErrorMsg(
        `El mercado ${CURRENT_SEASON_ID} todavía está en preparación (${marketStatus?.pricedPlayers ?? 0}/${marketStatus?.activePlayers ?? 0} jugadores con precio).`
      );
      return;
    }

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
        season_id: CURRENT_SEASON_ID,
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

          {/* Rasgos Fantasy de la temporada */}
          <section className="admin__section">
            <h2 className="admin__section-title">Rasgos Fantasy {CURRENT_SEASON_ID}</h2>
            <p className="admin__text">
              Se guardan por identidad y temporada. Julen Power se activa cuando dos jugadores con JP coinciden en el quinteto.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", marginBottom: "0.9rem" }}>
              {(traitConfig?.traitList || []).map((trait) => (
                <span key={trait.code} className="fantasy-builder__trait-chip">
                  {trait.code} · {trait.label} · x{trait.multiplier.toFixed(1)}
                </span>
              ))}
            </div>
            <h3 style={{ marginBottom: "0.55rem" }}>Jugadores</h3>
            <div style={{ display: "grid", gap: "0.65rem" }}>
              {marketPlayers.map((player) => (
                <div key={player.player_id} className="admin__list-item" style={{ padding: "0.7rem" }}>
                  <strong>#{Number(player.number) === 0 ? "00" : player.number} · {player.name}</strong>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.45rem" }}>
                    {(traitConfig?.traitList || []).map((trait) => {
                      const checked = (playerTraitDrafts[player.player_id] || []).includes(trait.code);
                      return (
                        <label key={trait.code} style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                          <input type="checkbox" checked={checked} onChange={() => toggleTrait(setPlayerTraitDrafts, player.player_id, trait.code)} />
                          <span className="fantasy-builder__trait-chip">{trait.code}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <h3 style={{ margin: "1rem 0 0.55rem" }}>Entrenadores</h3>
            <div style={{ display: "grid", gap: "0.65rem" }}>
              {fantasyCoaches.map((coach) => (
                <div key={coach.id} className="admin__list-item" style={{ padding: "0.7rem" }}>
                  <strong>{coach.name}</strong>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.45rem" }}>
                    {(traitConfig?.traitList || []).filter((trait) => trait.activation_type === "coach_match").map((trait) => {
                      const checked = (staffTraitDrafts[coach.id] || []).includes(trait.code);
                      return (
                        <label key={trait.code} style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                          <input type="checkbox" checked={checked} onChange={() => toggleTrait(setStaffTraitDrafts, coach.id, trait.code)} />
                          <span className="fantasy-builder__trait-chip">{trait.code}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <button type="button" className="admin__button" style={{ marginTop: "0.85rem" }} onClick={handleSaveTraits} disabled={savingTraits || !traitConfig}>
              {savingTraits ? "Guardando rasgos..." : "Guardar rasgos"}
            </button>
          </section>

          {/* Mercado Fantasy de la temporada */}
          <section className="admin__section">
            <h2 className="admin__section-title">Precios Fantasy {CURRENT_SEASON_ID}</h2>
            <p className="admin__text">
              Precios provisionales del mercado actual. Puedes ajustarlos desde aquí antes de abrir la primera jornada.
            </p>
            {marketPlayers.length === 0 ? (
              <p className="admin__text">Todavía no hay precios cargados.</p>
            ) : (
              <div className="admin__list" style={{ display: "grid", gap: "0.55rem" }}>
                {marketPlayers.map((player) => (
                  <div
                    key={player.player_id}
                    className="admin__list-item"
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}
                  >
                    <div>
                      <strong>#{Number(player.number) === 0 ? "00" : player.number} · {player.name}</strong>
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexShrink: 0 }}>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        className="admin__input"
                        style={{ width: 82, textAlign: "center" }}
                        value={priceDrafts[player.player_id] ?? ""}
                        onChange={(e) =>
                          setPriceDrafts((prev) => ({ ...prev, [player.player_id]: e.target.value }))
                        }
                      />
                      <span>🍺</span>
                    </label>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              className="admin__button"
              style={{ marginTop: "0.75rem" }}
              onClick={handleSaveMarketPrices}
              disabled={savingPrices || marketPlayers.length === 0}
            >
              {savingPrices ? "Guardando precios..." : "Guardar precios"}
            </button>
            <p className="admin__text" style={{ marginTop: "0.65rem" }}>
              Estado: <strong>{marketStatus?.marketReady ? "listo" : "bloqueado"}</strong>. Crear una jornada seguirá deshabilitado hasta terminar precios, rasgos y entrenadores.
            </p>
          </section>

          {/* Formulario creación de jornada */}
          <section className="admin__section">
            <h2 className="admin__section-title">Crear nueva jornada</h2>
            <p className="admin__text">
              Crea una <strong>gameweek</strong> indicando fecha, rival y
              deadline para que la gente cierre sus equipos.
            </p>
            {marketStatus && (
              <p className={marketStatus.marketReady ? "admin__message admin__message--success" : "admin__message admin__message--error"}>
                Mercado {CURRENT_SEASON_ID}: {marketStatus.marketReady ? "listo" : "en preparación"} · {marketStatus.pricedPlayers}/{marketStatus.activePlayers} jugadores con precio · base {marketStatus.baseBudget} 🍺
              </p>
            )}

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
                disabled={saving || !marketStatus?.marketReady}
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
