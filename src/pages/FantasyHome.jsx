import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient.js";

export default function FantasyHome() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [team, setTeam] = useState(null);
  const [loadingTeam, setLoadingTeam] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  // Próxima jornada futura (para abrir/cerrar mercado)
  const [nextGameweek, setNextGameweek] = useState(null);
  const [loadingNextGw, setLoadingNextGw] = useState(true);
  const [nextGwError, setNextGwError] = useState(null);

  // Último lineup guardado (cualquier jornada)
  const [lineupNumbers, setLineupNumbers] = useState([]); // dorsales numéricos
  const [lineupGameweek, setLineupGameweek] = useState(null); // info de esa jornada
  const [loadingLineup, setLoadingLineup] = useState(false);
  const [lineupError, setLineupError] = useState(null);
  

  // Stats del partido de esa jornada (para puntos)
  const [statsByNumber, setStatsByNumber] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [statsError, setStatsError] = useState(null);

  const [fantasyPlayers, setFantasyPlayers] = useState([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);

  const [creating, setCreating] = useState(false);
  const [teamName, setTeamName] = useState("");

  const BASE = import.meta.env.BASE_URL || "/";

  // 1) Cargar equipo del usuario
  useEffect(() => {
    if (!user) return;

    async function fetchTeam() {
      setLoadingTeam(true);
      setErrorMsg(null);

      const { data, error } = await supabase
        .from("fantasy_teams")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Error cargando fantasy_teams:", error);
        setErrorMsg("No se ha podido cargar tu equipo de Fantasy.");
      } else {
        setTeam(data);
      }

      setLoadingTeam(false);
    }

    fetchTeam();
  }, [user]);

  // 2) Cargar próxima gameweek FUTURA (para abrir/cerrar mercado)
  useEffect(() => {
    if (!team) return;

    async function fetchNextGameweek() {
      setLoadingNextGw(true);
      setNextGwError(null);

      const nowIso = new Date().toISOString();

      const { data, error } = await supabase
        .from("gameweeks")
        .select("*")
        .eq("status", "scheduled")
        .gt("deadline", nowIso)
        .order("deadline", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("Error cargando próxima gameweek:", error);
        setNextGwError("No se ha podido cargar la próxima jornada.");
      } else {
        setNextGameweek(data);
      }

      setLoadingNextGw(false);
    }

    fetchNextGameweek();
  }, [team]);

  // 3) Cargar SIEMPRE el ÚLTIMO lineup que exista + jugadores fantasy
  useEffect(() => {
    if (!team) return;

    async function fetchLastLineupAndPlayers() {
      setLoadingLineup(true);
      setLineupError(null);
      setLoadingPlayers(true);

      try {
        // Último lineup por gameweek_id (asumimos que crece con las jornadas)
        const { data: lineupRow, error: lineupError } = await supabase
          .from("fantasy_lineups")
          .select("*")
          .eq("fantasy_team_id", team.id)
          .order("gameweek_id", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lineupError && lineupError.code !== "PGRST116") {
          throw lineupError;
        }

        if (lineupRow && Array.isArray(lineupRow.players)) {
          setLineupNumbers(
            lineupRow.players
              .map((n) => Number(n))
              .filter((n) => !Number.isNaN(n))
          );

          // Info de la gameweek de ese lineup (incluye stats_file)
          if (lineupRow.gameweek_id != null) {
            const { data: gw, error: gwError } = await supabase
              .from("gameweeks")
              .select("*")
              .eq("id", lineupRow.gameweek_id)
              .maybeSingle();

            if (gwError) {
              console.error("Error cargando gameweek de lineup:", gwError);
            } else {
              setLineupGameweek(gw);
            }
          } else {
            setLineupGameweek(null);
          }
        } else {
          setLineupNumbers([]);
          setLineupGameweek(null);
        }

        // Jugadores fantasy
        const res = await fetch(`${BASE}data/fantasy_players.json`);
        if (!res.ok)
          throw new Error("No se ha podido cargar fantasy_players.json");
        const json = await res.json();
        setFantasyPlayers(json);
      } catch (err) {
        console.error("Error cargando último lineup/jugadores:", err);
        setLineupError(
          "No se ha podido cargar tu alineación o los jugadores disponibles."
        );
      } finally {
        setLoadingLineup(false);
        setLoadingPlayers(false);
      }
    }

    fetchLastLineupAndPlayers();
  }, [team, BASE]);

  // 4) Cargar stats del partido usando gameweeks.stats_file (linkeado a mano)
  useEffect(() => {
    if (!lineupGameweek || !lineupGameweek.stats_file) {
      setStatsByNumber(null);
      setStatsError(null);
      return;
    }

    async function fetchStats() {
      setLoadingStats(true);
      setStatsError(null);

      try {
        const statsPath = String(lineupGameweek.stats_file).trim();
        const url = `${BASE}data/player_stats/${statsPath}`;

        console.log("Cargando stats Fantasy desde:", url);

        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`Respuesta ${res.status} al cargar ${url}`);
        }

        const contentType = res.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
          throw new Error(
            `Respuesta no es JSON (content-type: ${contentType}) en ${url}`
          );
        }

        const stats = await res.json(); // array de jugadores con "number", "pir", etc.
        const map = new Map();
        for (const row of stats) {
          const n = Number(row.number);
          if (!Number.isNaN(n)) {
            map.set(n, row);
          }
        }

        console.log("Stats Fantasy cargadas correctamente desde:", url);
        setStatsByNumber(map);
      } catch (err) {
        console.error("Error cargando stats de la jornada:", err);
        setStatsByNumber(null);
        setStatsError(
          "Las estadísticas de esta jornada estarán disponibles el domingo por la noche."
        );
      } finally {
        setLoadingStats(false);
      }
    }

    console.log("🔍 BASE:", BASE);
    console.log("🔍 lineupGameweek:", lineupGameweek);
    console.log("🔍 stats_file bruto:", JSON.stringify(lineupGameweek?.stats_file));
    const cleaned = String(lineupGameweek?.stats_file || "").replace(/\s+/g, "");
    console.log("🔍 stats_file limpio:", cleaned);
    const url = `${BASE}data/${cleaned}`;
    console.log("🔍 URL FINAL (fetch):", url);

    fetchStats();
  }, [lineupGameweek, BASE]);

  async function handleCreateTeam(e) {
    e.preventDefault();
    if (!teamName.trim()) return;

    setCreating(true);
    setErrorMsg(null);

    const { data, error } = await supabase
      .from("fantasy_teams")
      .insert({
        user_id: user.id,
        name: teamName.trim(),
      })
      .select("*")
      .single();

    setCreating(false);

    if (error) {
      console.error("Error creando equipo:", error);
      setErrorMsg("No se ha podido crear el equipo.");
    } else {
      setTeam(data);
    }
  }

  const username = profile?.username || user?.email?.split("@")[0];
  const totalBudget = team?.cervezas ?? 0;

  // Mercado abierto SOLO si hay próxima gameweek futura y aún no ha pasado el deadline
  let canEditLineup = false;
  let nextDeadlineText = null;

  if (nextGameweek?.deadline) {
    const nowIso = new Date().toISOString();
    canEditLineup =
      nextGameweek.status === "scheduled" && nowIso < nextGameweek.deadline;

    nextDeadlineText = new Date(nextGameweek.deadline).toLocaleString(
      "es-ES",
      {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }
    );
  }

  // Jugadores seleccionados del ÚLTIMO lineup
  const selectedPlayers = useMemo(() => {
    if (!lineupNumbers.length || !fantasyPlayers.length) return [];
    const setNums = new Set(lineupNumbers);

    return fantasyPlayers.filter((p) => {
      const raw = p.number ?? p.dorsal;
      if (raw == null) return false;
      const num = Number(raw);
      if (Number.isNaN(num)) return false;
      return setNums.has(num);
    });
  }, [fantasyPlayers, lineupNumbers]);

    // Puntos fantasy por jugador (basados en statsByNumber.pir de esa jornada)
    const playersWithPoints = useMemo(() => {
      if (!selectedPlayers.length) return [];
    
      return selectedPlayers.map((p) => {
        const raw = p.number ?? p.dorsal;
        const num = Number(raw);
        let points = null;
      
        if (statsByNumber && !Number.isNaN(num)) {
          const row = statsByNumber.get(num);
        
          if (row && row.pir != null) {
            // Asegurarnos de convertir a número aunque venga como string
            const pirParsed = typeof row.pir === "number"
              ? row.pir
              : Number(String(row.pir).replace(",", "."));
          
            if (!Number.isNaN(pirParsed)) {
              points = pirParsed;
            }
          }
        }
      
        return { ...p, fantasyPoints: points };
      });
    }, [selectedPlayers, statsByNumber]);


  const totalFantasyPoints = useMemo(() => {
    if (!playersWithPoints.length) return null;
    let sum = 0;
    let hasAny = false;

    for (const p of playersWithPoints) {
      if (typeof p.fantasyPoints === "number") {
        hasAny = true;
        sum += p.fantasyPoints;
      }
    }

    return hasAny ? sum : null;
  }, [playersWithPoints]);

  const usedBeers = playersWithPoints.reduce(
    (sum, p) => sum + (p.price || 0),
    0
  );
  const remainingBeers = Math.max(totalBudget - usedBeers, 0);

  const displayNumber = (raw) => {
    const n = Number(raw);
    return n === 0 ? "00" : String(raw);
  };

  const renderPlayerCard = (p, index) => (
    <div key={p.number ?? index} className="fantasy__player-card">
      <div className="fantasy__player-card-header">
        <span className="fantasy__player-number">
          #{displayNumber(p.number ?? p.dorsal)}
        </span>
        <span className="fantasy__player-name">{p.name}</span>
      </div>

      <div className="fantasy__player-meta">
        <span className="fantasy__player-price">{p.price} 🍺</span>
        {p.pir_avg != null && (
          <span className="fantasy__player-pir">
            PIR medio{" "}
            <strong>
              {p.pir_avg.toFixed ? p.pir_avg.toFixed(1) : p.pir_avg}
            </strong>
          </span>
        )}
      </div>

      <div className="fantasy__player-score">
        Puntos jornada:{" "}
        <span>
          {typeof p.fantasyPoints === "number" ? p.fantasyPoints : "–"}
        </span>
      </div>
    </div>
  );

  return (
    <div className="fantasy">
      <div className="container">
        <div className="fantasy__card">
          {loadingTeam ? (
            <p>Cargando tu Fantasy...</p>
          ) : (
            <>
              <div className="fantasy__header">
                <h1 className="fantasy__title">Fantasy Gazalbide</h1>
                <p className="fantasy__subtitle">
                  Hola <strong>{username}</strong>, prepárate para dejarte las{" "}
                  <strong>cervezas</strong> en fichajes.
                </p>
              </div>

              {errorMsg && (
                <p className="fantasy__message fantasy__message--error">
                  {errorMsg}
                </p>
              )}

              {/* Próxima jornada futura (puede no existir) */}
              <section className="fantasy__section">
                <h2 className="fantasy__section-title">
                  Próxima jornada Fantasy
                </h2>

                {loadingNextGw ? (
                  <p className="fantasy__text">Cargando próxima jornada...</p>
                ) : nextGwError ? (
                  <p className="fantasy__message fantasy__message--error">
                    {nextGwError}
                  </p>
                ) : !nextGameweek ? (
                  <p className="fantasy__text">
                    Todavía no hay ninguna jornada futura programada.
                  </p>
                ) : (
                  <div className="fantasy__gw-box">
                    <div className="fantasy__gw-main">
                      <div className="fantasy__gw-title">
                        {nextGameweek.name || `Gameweek #${nextGameweek.id}`}
                      </div>
                      <div className="fantasy__gw-sub">
                        {nextGameweek.date}
                        {nextGameweek.opponent &&
                          ` · vs ${nextGameweek.opponent}`}
                      </div>
                    </div>
                    <div className="fantasy__gw-meta">
                      <span className="fantasy__tag">
                        {nextGameweek.status}
                      </span>
                      <span className="fantasy__gw-deadline">
                        Fecha límite: <strong>{nextDeadlineText}</strong>
                      </span>
                    </div>
                  </div>
                )}
              </section>

              {/* Crear equipo si aún no hay */}
              {!team && (
                <section className="fantasy__section">
                  <h2 className="fantasy__section-title">Crea tu equipo</h2>
                  <p className="fantasy__text">
                    Empiezas con <strong>{totalBudget || 0} cervezas</strong> para
                    fichar jugadores. Elige un nombre para tu equipo:
                  </p>

                  <form className="fantasy__form" onSubmit={handleCreateTeam}>
                    <label className="fantasy__field">
                      <span className="fantasy__label">Nombre del equipo</span>
                      <input
                        type="text"
                        className="fantasy__input"
                        maxLength={40}
                        value={teamName}
                        onChange={(e) => setTeamName(e.target.value)}
                        placeholder="Ej: Los Mandarinas, Gazal Team..."
                        required
                      />
                    </label>

                    <button
                      type="submit"
                      className="fantasy__button"
                      disabled={creating}
                    >
                      {creating ? "Creando equipo..." : "Crear equipo"}
                    </button>
                  </form>
                </section>
              )}

              {/* Si ya hay equipo */}
              {team && (
                <section className="fantasy__section">
                  <h2 className="fantasy__section-title">Tu equipo</h2>

                  <div className="fantasy__team-header">
                    <span className="fantasy__team-name-main">{team.name}</span>

                    <div className="fantasy__team-badges">
                      <span className="fantasy__badge fantasy__badge--beer">
                        {totalBudget}
                        <span className="fantasy__badge-emoji">🍺</span>
                      </span>
                      <span className="fantasy__badge fantasy__badge--beer-left">
                        Libres: {remainingBeers}
                        <span className="fantasy__badge-emoji">🍺</span>
                      </span>
                    </div>
                  </div>

                  {lineupGameweek && (
                    <p className="fantasy__text" style={{ marginTop: "0.3rem" }}>
                      Quinteto guardado para:{" "}
                      <strong>
                        {lineupGameweek.name ||
                          `Gameweek #${lineupGameweek.id}`}
                      </strong>
                      {lineupGameweek.date && ` · ${lineupGameweek.date}`}
                    </p>
                  )}

                  {statsError && (
                    <p className="fantasy__message fantasy__message--error">
                      {statsError}
                    </p>
                  )}

                  {/* Alineación del ÚLTIMO lineup */}
                  <div className="fantasy__lineup">
                    {loadingLineup || loadingPlayers ? (
                      <p className="fantasy__text">Cargando alineación...</p>
                    ) : lineupError ? (
                      <p className="fantasy__message fantasy__message--error">
                        {lineupError}
                      </p>
                    ) : playersWithPoints.length === 0 ? (
                      <p className="fantasy__text">Aún no has elegido tu quinteto.</p>
                    ) : (
                      <div className="fantasy__lineup-pyramid">
                        {/* Fila superior (3 jugadores) */}
                        <div className="fantasy__lineup-row fantasy__lineup-row--top">
                          {playersWithPoints.slice(0, 3).map((p) => (
                            <div key={p.number} className="fantasy__player-card">
                              {p.image && (() => {
                                const imgSrc = `${import.meta.env.BASE_URL}${p.image.replace(/^\/+/, "")}`;
                                return (
                                  <img
                                    src={imgSrc}
                                    alt={p.name}
                                    className="fantasy-builder__player-photo"
                                  />
                                );
                              })()}
                              <div className="fantasy__player-info">
                                <h3>
                                  <span className="fantasy__player-number">#{p.number}</span>{" "}
                                  {p.name}
                                </h3>
                                <p className="fantasy__player-meta">
                                  {p.price} 🍺 · PIR medio {p.pir_avg.toFixed(1)}
                                </p>
                                <p className="fantasy__player-points">
                                  Puntos jornada:{" "}
                                  {typeof p.fantasyPoints === "number"
                                    ? p.fantasyPoints
                                    : "–"}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                        
                        {/* Fila inferior (2 jugadores) */}
                        <div className="fantasy__lineup-row fantasy__lineup-row--bottom">
                          {playersWithPoints.slice(3, 5).map((p) => (
                            <div key={p.number} className="fantasy__player-card">
                              {p.image && (
                                <img
                                  src={p.image}
                                  alt={p.name}
                                  className="fantasy__player-photo"
                                />
                              )}
                              <div className="fantasy__player-info">
                                <h3>
                                  <span className="fantasy__player-number">#{p.number}</span>{" "}
                                  {p.name}
                                </h3>
                                <p className="fantasy__player-meta">
                                  {p.price} 🍺 · PIR medio {p.pir_avg.toFixed(1)}
                                </p>
                                <p className="fantasy__player-points">
                                  Puntos jornada:{" "}
                                  {typeof p.fantasyPoints === "number"
                                    ? p.fantasyPoints
                                    : "–"}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Resumen de puntos de la jornada */}
                  {loadingStats ? (
                    <p className="fantasy__text">
                      Calculando puntos de la jornada...
                    </p>
                  ) : totalFantasyPoints != null ? (
                    <p className="fantasy__text" style={{ marginTop: "0.5rem" }}>
                      Puntos totales de la jornada:{" "}
                      <strong>{totalFantasyPoints}</strong>
                    </p>
                  ) : (
                    <p className="fantasy__text" style={{ margin: 16 }}>
                      Puntos de la jornada aún no disponibles.
                    </p>
                  )}

                  {/* Botón de edición */}
                  <div className="fantasy__actions">
                    <button
                      type="button"
                      className="fantasy__button fantasy__button--ghost"
                      disabled={!canEditLineup}
                      onClick={() => {
                        if (canEditLineup) navigate("/fantasy/crear-equipo");
                      }}
                      title={
                        canEditLineup
                          ? "Abrir creador de equipo"
                          : "Solo se puede editar cuando haya una jornada futura y antes del límite."
                      }
                      style={{ margin: 16 }}
                    >
                      Ir al creador de equipo
                    </button>
                    <button
                      type="button"
                      className="fantasy__button fantasy__button--ghost"
                      onClick={() => navigate("/fantasy/historial")}
                      style={{ margin: 16 }}
                    >
                      Ver historial
                    </button>
                    <button
                      type="button"
                      className="fantasy__button fantasy__button--ghost"
                      onClick={() => navigate("/fantasy/ranking")}
                      style={{ margin: 16 }}
                    >
                      Ver ranking Fantasy
                    </button>
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
