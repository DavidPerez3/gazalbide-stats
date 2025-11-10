import React, { useEffect, useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient.js";

// ========================
// Rasgos / atributos
// ========================

function normalizeName(name) {
  return name
    ?.toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Mapeo nombre jugador -> rasgos
const PLAYER_TRAITS = {
  iker: ["J", "S"],
  josu: ["S", "L"],
  imanol: ["S", "L"],
  kusky: ["S", "A"],
  ibon: ["A", "V"],
  lucho: ["A", "J"],
  aimar: ["S", "A"],
  aingeru: ["V", "P"],
  julen: ["V", "P"],
  aguirre: ["V", "A"],
  covela: ["C", "A"],
  inaki: ["V", "L"],
  jorge: ["A", "V"],
  oier: ["J", "A"],
};

const COACH_TRAITS = {
  david: ["S", "A"],
  gorka: ["V", "C"],
  unai: ["J", "L"],
};

const COACH_LABELS = {
  david: "David",
  gorka: "Gorka",
  unai: "Unai",
};

const TRAIT_LABELS = {
  A: "Alcohólico",
  L: "Ludópata",
  S: "Sexólogo",
  V: "Vieja guardia",
  J: "Joven promesa",
  C: "Boost Covela 1.5x",
  P: "Primos",
};

function getPlayerTraitsForName(name) {
  const key = normalizeName(name);
  return PLAYER_TRAITS[key] || [];
}

function getCoachTraits(code) {
  return COACH_TRAITS[code] || [];
}

// ========================
// Barras last3 PIR
// ========================

const MIN_PIR = -10;
const MAX_PIR = 30;
const MIN_HEIGHT = 16; // px
const MAX_HEIGHT = 56; // px

function getBarVisual(value) {
  const v = Math.max(MIN_PIR, Math.min(MAX_PIR, value));
  const absV = Math.abs(v);
  const t = Math.min(absV / MAX_PIR, 1);
  const height = MIN_HEIGHT + t * (MAX_HEIGHT - MIN_HEIGHT);

  const red = [231, 76, 60];
  const yellow = [241, 196, 15];
  const green = [46, 204, 113];

  let color;

  if (v < 0) {
    color = `rgb(${red[0]}, ${red[1]}, ${red[2]})`;
  } else {
    const tt = v / MAX_PIR;
    const r = Math.round(yellow[0] + (green[0] - yellow[0]) * tt);
    const g = Math.round(yellow[1] + (green[1] - yellow[1]) * tt);
    const b = Math.round(yellow[2] + (green[2] - yellow[2]) * tt);
    color = `rgb(${r}, ${g}, ${b})`;
  }

  return { height, color };
}

const EMPTY_SLOT = "-1";

const displayNumber = (raw) => {
  const num = Number(raw);
  return !Number.isNaN(num) && num === 0 ? "00" : String(raw);
};

// Los 3 entrenadores permitidos
const COACHES = [
  { code: "david" },
  { code: "gorka" },
  { code: "unai" },
];

export default function FantasyBuilder() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const coachParam = searchParams.get("coach");
  const isCoachMode = coachParam === "1";
  const slotParam = searchParams.get("slot");
  const slotIndex = !isCoachMode && slotParam != null ? Number(slotParam) : -1;

  const [team, setTeam] = useState(null);
  const [gameweek, setGameweek] = useState(null);
  const [lineup, setLineup] = useState(null);
  const [players, setPlayers] = useState([]);
  const [playerStatuses, setPlayerStatuses] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const BASE = import.meta.env.BASE_URL || "/";

  // ========================
  // 1) Cargar equipo, jornada, lineup, jugadores y estados
  // ========================
  useEffect(() => {
    if (!user) return;

    async function init() {
      try {
        setLoading(true);
        setErrorMsg(null);

        // Equipo del usuario
        const { data: teamData, error: teamError } = await supabase
          .from("fantasy_teams")
          .select("*")
          .eq("user_id", user.id)
          .single();

        if (teamError) throw teamError;
        setTeam(teamData);

        // Jornada activa (status = scheduled y deadline > ahora)
        const nowIso = new Date().toISOString();
        const { data: gwData, error: gwError } = await supabase
          .from("gameweeks")
          .select("*")
          .eq("status", "scheduled")
          .gt("deadline", nowIso)
          .order("deadline", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (gwError) throw gwError;
        if (!gwData) {
          setErrorMsg("No hay ninguna jornada activa ahora mismo.");
          setLoading(false);
          return;
        }
        setGameweek(gwData);

        // Lineup para este equipo y jornada (si existe)
        const { data: lineupData, error: lineupError } = await supabase
          .from("fantasy_lineups")
          .select("*")
          .eq("fantasy_team_id", teamData.id)
          .eq("gameweek_id", gwData.id)
          .maybeSingle();

        if (lineupError && lineupError.code !== "PGRST116") throw lineupError;
        setLineup(lineupData || null);

        // Jugadores disponibles
        const res = await fetch(`${BASE}data/fantasy_players.json`);
        if (!res.ok)
          throw new Error("No se ha podido cargar fantasy_players.json");
        const json = await res.json();
        setPlayers(json);

        // Estados de los jugadores para esta jornada
        const { data: statuses, error: statusError } = await supabase
          .from("player_statuses")
          .select("player_number, status, note")
          .eq("gameweek_id", gwData.id);

        if (statusError) {
          console.error("Error cargando estados de jugadores:", statusError);
        } else {
          const map = new Map();
          for (const s of statuses || []) {
            map.set(Number(s.player_number), {
              status: s.status,
              note: s.note,
            });
          }
          setPlayerStatuses(map);
        }
      } catch (err) {
        console.error("Error inicializando FantasyBuilder:", err);
        setErrorMsg(err.message || "Error cargando mercado");
      } finally {
        setLoading(false);
      }
    }

    init();
  }, [user, BASE]);

  // ========================
  // 1.1) Info derivada del lineup
  // ========================

  const totalBudget = team?.cervezas ?? 0;

  // Array de 5 posiciones de strings siempre
  const currentPlayersArray = useMemo(() => {
    let arr = Array.isArray(lineup?.players) ? [...lineup.players] : [];
    while (arr.length < 5) arr.push(EMPTY_SLOT);
    if (arr.length > 5) arr = arr.slice(0, 5);
    return arr;
  }, [lineup]);

  const selectedNumbers = useMemo(
    () =>
      currentPlayersArray
        .filter((v) => v && v !== EMPTY_SLOT)
        .map((v) => Number(v))
        .filter((n) => !Number.isNaN(n)),
    [currentPlayersArray]
  );

  const selectedNumbersSet = useMemo(
    () => new Set(selectedNumbers),
    [selectedNumbers]
  );

  const currentSlotNumber = useMemo(() => {
    if (
      isCoachMode ||
      slotIndex < 0 ||
      slotIndex > 4 ||
      !currentPlayersArray ||
      !currentPlayersArray.length
    )
      return null;
    const raw = currentPlayersArray[slotIndex];
    if (!raw || raw === EMPTY_SLOT) return null;
    const n = Number(raw);
    return Number.isNaN(n) ? null : n;
  }, [currentPlayersArray, slotIndex, isCoachMode]);

  const usedBeers = useMemo(() => {
    if (!players.length) return 0;
    return currentPlayersArray.reduce((sum, val) => {
      if (!val || val === EMPTY_SLOT) return sum;
      const num = Number(val);
      const pl = players.find((p) => Number(p.number ?? p.dorsal) === num);
      return sum + (pl?.price || 0);
    }, 0);
  }, [currentPlayersArray, players]);

  const remainingBeers = Math.max(totalBudget - usedBeers, 0);

  const currentSlotPlayer = useMemo(() => {
    if (isCoachMode || !currentSlotNumber || !players.length) return null;
    return (
      players.find(
        (p) => Number(p.number ?? p.dorsal) === Number(currentSlotNumber)
      ) || null
    );
  }, [currentSlotNumber, players, isCoachMode]);

  const maxPriceForSlot = useMemo(() => {
    if (isCoachMode) return null;
    const currentPrice = currentSlotPlayer?.price || 0;
    return remainingBeers + currentPrice;
  }, [remainingBeers, currentSlotPlayer, isCoachMode]);

  const currentCoachCode = lineup?.coach_code || null;

  // ========================
  // 2) Añadir jugador al slot
  // ========================
  async function handleAddPlayer(player) {
    try {
      if (!team || !gameweek || isCoachMode) return;

      if (slotIndex < 0 || slotIndex > 4) {
        console.warn("slotIndex fuera de rango:", slotIndex);
        return navigate("/fantasy");
      }

      const playerNumber = String(player.number);

      let currentPlayers = [...currentPlayersArray];

      // Evitar duplicados (si ya estaba en otro hueco)
      const existingIndex = currentPlayers.findIndex((n) => n === playerNumber);
      if (existingIndex !== -1) currentPlayers[existingIndex] = EMPTY_SLOT;

      // Asignar jugador al hueco actual
      currentPlayers[slotIndex] = playerNumber;

      // --- Comprobar cervezas con el nuevo quinteto ---
      const totalCost = currentPlayers.reduce((sum, val) => {
        if (!val || val === EMPTY_SLOT) return sum;
        const num = Number(val);
        const pl = players.find((p) => Number(p.number ?? p.dorsal) === num);
        return sum + (pl?.price || 0);
      }, 0);

      const budget = team?.cervezas ?? 0;
      if (totalCost > budget) {
        alert(
          `No tienes suficientes cervezas.\nCoste actual: ${totalCost} 🍺\nPresupuesto: ${budget} 🍺`
        );
        return;
      }

      if (lineup) {
        const { error: updError } = await supabase
          .from("fantasy_lineups")
          .update({ players: currentPlayers })
          .eq("id", lineup.id);
        if (updError) throw updError;
      } else {
        const { error: insError } = await supabase
          .from("fantasy_lineups")
          .insert({
            fantasy_team_id: team.id,
            gameweek_id: gameweek.id,
            players: currentPlayers,
          });
        if (insError) throw insError;
      }

      navigate("/fantasy");
    } catch (err) {
      console.error("Error al añadir jugador:", err);
      alert(
        "No se pudo añadir el jugador: " +
          (err.message || "Error desconocido")
      );
    }
  }

  // ========================
  // 3) Vaciar hueco de jugador
  // ========================
  async function handleClearSlot() {
    try {
      if (!team || !gameweek || isCoachMode) return;

      let currentPlayers = [...currentPlayersArray];
      if (slotIndex < 0 || slotIndex > 4) return;
      currentPlayers[slotIndex] = EMPTY_SLOT;

      if (lineup) {
        const { error: updError } = await supabase
          .from("fantasy_lineups")
          .update({ players: currentPlayers })
          .eq("id", lineup.id);
        if (updError) throw updError;
      } else {
        const { error: insError } = await supabase
          .from("fantasy_lineups")
          .insert({
            fantasy_team_id: team.id,
            gameweek_id: gameweek.id,
            players: currentPlayers,
          });
        if (insError) throw insError;
      }

      navigate("/fantasy");
    } catch (err) {
      console.error("Error al vaciar hueco:", err);
      alert(
        "No se pudo vaciar el hueco: " +
          (err.message || "Error desconocido")
      );
    }
  }

  // ========================
  // 4) Seleccionar entrenador
  // ========================
  async function handleSelectCoach(code) {
    try {
      if (!team || !gameweek || !isCoachMode) return;

      const currentPlayers = [...currentPlayersArray];

      if (lineup) {
        const { error: updError } = await supabase
          .from("fantasy_lineups")
          .update({ coach_code: code, players: currentPlayers })
          .eq("id", lineup.id);
        if (updError) throw updError;
      } else {
        const { error: insError } = await supabase
          .from("fantasy_lineups")
          .insert({
            fantasy_team_id: team.id,
            gameweek_id: gameweek.id,
            players: currentPlayers,
            coach_code: code,
          });
        if (insError) throw insError;
      }

      navigate("/fantasy");
    } catch (err) {
      console.error("Error al seleccionar entrenador:", err);
      alert(
        "No se pudo seleccionar entrenador: " +
          (err.message || "Error desconocido")
      );
    }
  }

  // ========================
  // 5) Renderizado
  // ========================
  if (loading) {
    return (
      <div className="fantasy-builder">
        <div className="container">
          <div className="fantasy-builder__card">
            <p>Cargando mercado...</p>
          </div>
        </div>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="fantasy-builder">
        <div className="container">
          <div className="fantasy-builder__card">
            <p className="fantasy-builder__message fantasy-builder__message--error">
              {errorMsg}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const deadlineText =
    gameweek &&
    new Date(gameweek.deadline).toLocaleString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="fantasy-builder">
      <div className="container">
        <div className="fantasy-builder__card">
          {/* Header */}
          <header className="fantasy-builder__header">
            <button
              type="button"
              className="fantasy-builder__back"
              onClick={() => navigate("/fantasy")}
            >
              ← Volver
            </button>

            <div className="fantasy-builder__header-top">
              <div>
                <h1 className="fantasy-builder__title">
                  {isCoachMode ? "Elegir entrenador" : "Mercado de jugadores"}
                </h1>
                <p className="fantasy-builder__subtitle">
                  Jornada{" "}
                  <strong>
                    {gameweek?.name || `#${gameweek?.id ?? ""}`}
                  </strong>{" "}
                  · Deadline: <strong>{deadlineText}</strong>
                  <br />
                  {isCoachMode ? (
                    <>
                      Elige tu entrenador para la jornada.
                      {currentCoachCode && (
                        <>
                          {" "}
                          Actual:{" "}
                          <strong>{COACH_LABELS[currentCoachCode]}</strong>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      Hueco #{slotIndex + 1}{" "}
                      {currentSlotPlayer ? (
                        <>
                          · actual:{" "}
                          <strong>
                            #{displayNumber(currentSlotPlayer.number)}{" "}
                            {currentSlotPlayer.name}
                          </strong>{" "}
                          ({currentSlotPlayer.price} 🍺)
                        </>
                      ) : (
                        <>· actualmente libre</>
                      )}
                    </>
                  )}
                </p>
              </div>

              {/* Cervezas */}
              {team && (
                <div className="fantasy-builder__budget">
                  <div className="fantasy-builder__budget-pill">
                    Total: <strong>{totalBudget}</strong> 🍺
                  </div>
                  <div className="fantasy-builder__budget-pill">
                    Usadas: <strong>{usedBeers}</strong> 🍺 · Libres:{" "}
                    <strong>{remainingBeers}</strong> 🍺
                  </div>
                  {!isCoachMode && (
                    <div className="fantasy-builder__budget-pill">
                      Máx. precio para este hueco:{" "}
                      <strong>{maxPriceForSlot}</strong> 🍺
                    </div>
                  )}
                </div>
              )}
            </div>

            {!isCoachMode && slotIndex >= 0 && slotIndex <= 4 && (
              <button
                type="button"
                className="fantasy-builder__btn-secondary"
                onClick={handleClearSlot}
                style={{ marginTop: "6px" }}
              >
                Vaciar este hueco
              </button>
            )}
          </header>

          {/* Lista */}
          {isCoachMode ? (
            <ul className="fantasy-builder__list fantasy-builder__list--coaches">
              {COACHES.map((coach) => {
                const code = coach.code;
                const name = COACH_LABELS[code] || code;
                const traits = getCoachTraits(code);
                const isSelected = currentCoachCode === code;
              
                return (
                  <li
                    key={code}
                    className={
                      "fantasy-builder__coach-card" +
                      (isSelected ? " fantasy-builder__coach-card--selected" : "")
                    }
                    style={{
                      listStyle: "none",
                      marginBottom: "12px",
                      padding: "12px 14px",
                      borderRadius: "16px",
                      background: "rgba(24,24,27,0.96)",
                      border: isSelected
                        ? "1px solid rgba(250,204,21,0.9)"
                        : "1px solid rgba(55,65,81,0.8)",
                      boxShadow: "0 8px 18px rgba(0,0,0,0.6)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "12px",
                    }}
                  >
                    {/* Izquierda: avatar + info */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                      }}
                    >
                      {/* Avatar en círculo */}
                      <div
                        style={{
                          width: 64,
                          height: 64,
                          borderRadius: "999px",
                          overflow: "hidden",
                          border: "2px solid #FACC15",
                          flexShrink: 0,
                        }}
                      >
                        <img
                          src={`${import.meta.env.BASE_URL}images/coaches/${code}.png`}
                          alt={name}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            display: "block",
                          }}
                        />
                      </div>
                        
                      {/* Nombre + atributos */}
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 4,
                        }}
                      >
                        <div
                          style={{
                            fontSize: "0.95rem",
                            fontWeight: 700,
                            color: "#F9FAFB",
                          }}
                        >
                          {name}
                        </div>
                        
                        {traits.length > 0 && (
                          <div className="fantasy-builder__item-traits">
                            {traits.map((t) => (
                              <span
                                key={t}
                                className="fantasy-builder__trait-chip"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                      
                    {/* Derecha: botón */}
                    <div>
                      <button
                        type="button"
                        className="fantasy-builder__btn"
                        onClick={() => handleSelectCoach(code)}
                        disabled={isSelected}
                      >
                        {isSelected ? "Seleccionado" : "Elegir"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <ul className="fantasy-builder__list">
              {players.map((p) => {
                const rawNumber = p.number ?? p.dorsal;
                const num = Number(rawNumber);
                const last3 = p.last3_pir || [];
                const traits = getPlayerTraitsForName(p.name);

                const st = playerStatuses.get(Number(p.number));
                const status = st?.status || "available";
                const note = st?.note || "";

                const isInTeam =
                  !Number.isNaN(num) && selectedNumbersSet.has(num);
                const isInThisSlot =
                  !Number.isNaN(num) &&
                  currentSlotNumber != null &&
                  currentSlotNumber === num;

                const disableAdd = isInTeam && !isInThisSlot;
                const itemSelectedClass = isInTeam
                  ? " fantasy-builder__item--selected"
                  : "";

                return (
                  <li
                    key={rawNumber}
                    className={"fantasy-builder__item" + itemSelectedClass}
                    style={{ position: "relative" }}
                  >
                    {/* Bloque principal: foto + info */}
                    <div
                      className="fantasy-builder__item-main"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                      }}
                    >
                      {/* Foto */}
                      {p.image && (
                        <img
                          src={`${import.meta.env.BASE_URL}${p.image.replace(
                            /^\/+/,
                            ""
                          )}`}
                          alt={p.name}
                          className="fantasy-builder__player-photo"
                        />
                      )}

                      {/* Texto: nombre, estado, PIR, rasgos */}
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 4,
                        }}
                      >
                        {/* Nombre + dorsal */}
                        <div className="fantasy-builder__item-name">
                          #{displayNumber(rawNumber)} · {p.name}
                          {isInThisSlot && (
                            <span
                              style={{
                                marginLeft: 6,
                                fontSize: "0.7rem",
                                padding: "2px 6px",
                                borderRadius: "999px",
                                border:
                                  "1px solid rgba(250,204,21,0.85)",
                              }}
                            >
                              En este hueco
                            </span>
                          )}
                          {!isInThisSlot && isInTeam && (
                            <span
                              style={{
                                marginLeft: 6,
                                fontSize: "0.7rem",
                                padding: "2px 6px",
                                borderRadius: "999px",
                                border:
                                  "1px solid rgba(156,163,175,0.85)",
                                color: "#9CA3AF",
                              }}
                            >
                              En tu equipo
                            </span>
                          )}
                        </div>

                        {/* Estado justo debajo del nombre */}
                        <div
                          className={`fantasy__player-status fantasy__player-status--${status}`}
                          title={note}
                          style={{
                            alignSelf: "flex-start",
                            fontSize: "0.7rem",
                            fontWeight: 600,
                            padding: "2px 8px",
                            borderRadius: "999px",
                            background:
                              status === "injured"
                                ? "rgba(239,68,68,0.25)"
                                : status === "doubtful"
                                ? "rgba(250,204,21,0.25)"
                                : "rgba(16,185,129,0.25)",
                            color:
                              status === "injured"
                                ? "#FCA5A5"
                                : status === "doubtful"
                                ? "#FBBF24"
                                : "#34D399",
                          }}
                        >
                          {status === "injured"
                            ? "Lesionado"
                            : status === "doubtful"
                            ? "Dudoso"
                            : "Disponible"}
                        </div>

                        {/* PIR medio */}
                        <div className="fantasy-builder__item-sub">
                          PIR medio:{" "}
                          <strong>
                            {p.pir_avg?.toFixed?.(1) ?? p.pir_avg ?? "–"}
                          </strong>
                        </div>

                        {/* Rasgos */}
                        {traits.length > 0 && (
                          <div className="fantasy-builder__item-traits">
                            {traits.map((t) => (
                              <span
                                key={t}
                                className="fantasy-builder__trait-chip"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Barras últimas 3 valoraciones */}
                    <div className="fantasy-builder__item-middle">
                      {last3.length === 0 ? (
                        <span className="fantasy-builder__last3-empty">
                          Sin datos
                        </span>
                      ) : (
                        <div className="fantasy__market-bars">
                          {last3.map((val, idx) => {
                            const { height, color } = getBarVisual(val);
                            return (
                              <div
                                key={idx}
                                className="fantasy__market-bar"
                                style={{
                                  height: `${height}px`,
                                  backgroundColor: color,
                                }}
                              >
                                <span className="fantasy__market-bar-number">
                                  {val}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Precio + botón Añadir */}
                    <div className="fantasy-builder__item-right">
                      <div className="fantasy-builder__price">
                        {p.price} 🍺
                      </div>
                      <button
                        type="button"
                        className="fantasy-builder__btn"
                        onClick={() => handleAddPlayer(p)}
                        disabled={disableAdd || isInThisSlot}
                      >
                        {isInThisSlot
                          ? "En este hueco"
                          : disableAdd
                          ? "En tu equipo"
                          : "Añadir"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Leyenda de atributos */}
          <section className="fantasy-builder__section">
            <h2 className="fantasy-builder__section-title">
              Leyenda atributos
            </h2>
            <p className="fantasy-builder__text fantasy-builder__legend">
              {Object.entries(TRAIT_LABELS).map(([letter, desc]) => (
                <span
                  key={letter}
                  className="fantasy-builder__legend-item"
                >
                  <span className="fantasy-builder__trait-chip">
                    {letter}
                  </span>{" "}
                  {desc}
                </span>
              ))}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
