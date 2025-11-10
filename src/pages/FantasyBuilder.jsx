import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
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

const TRAIT_LABELS = {
  A: "Alcohólico",
  L: "Ludópata",
  S: "Sexólogo",
  V: "Vieja guardia",
  J: "Joven promesa",
  C: "Boost Covela 1.5x",
  P: "Primos",
};

const COACH_TRAITS = {
  david: ["S", "A"], // Sexólogo, Alcohólico
  gorka: ["V", "C"], // Vieja guardia, Boost Covela
  unai: ["J", "L"], // Joven promesa, Ludópata
};

const COACH_LABELS = {
  david: "David",
  gorka: "Gorka",
  unai: "Unai",
};

function getPlayerTraitsForName(name) {
  const key = normalizeName(name);
  return PLAYER_TRAITS[key] || [];
}

function getCoachTraits(code) {
  return COACH_TRAITS[code] || [];
}

export default function FantasyBuilder() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [team, setTeam] = useState(null);
  const [gameweek, setGameweek] = useState(null);
  const [players, setPlayers] = useState([]);
  const [selectedNumbers, setSelectedNumbers] = useState([]);
  const [captainNumber, setCaptainNumber] = useState(null);
  const [coachCode, setCoachCode] = useState("david"); // entrenador por defecto
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [infoMsg, setInfoMsg] = useState(null);

  const BASE = import.meta.env.BASE_URL || "/";

  // ========================
  // 1) Carga inicial
  // ========================
  useEffect(() => {
    if (!user) return;

    async function init() {
      setLoading(true);
      setErrorMsg(null);

      try {
        // Equipo Fantasy del usuario
        const { data: teamData, error: teamError } = await supabase
          .from("fantasy_teams")
          .select("*")
          .eq("user_id", user.id)
          .single();

        if (teamError) throw teamError;
        setTeam(teamData);

        // Gameweek activa (deadline en el futuro)
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
          setErrorMsg("No hay ninguna jornada Fantasy activa ahora mismo.");
          setLoading(false);
          return;
        }

        setGameweek(gwData);

        // Jugadores Fantasy (precio, PIR medio, last3_pir, etc.)
        const res = await fetch(`${BASE}data/fantasy_players.json`);
        if (!res.ok) {
          throw new Error("No se ha podido cargar fantasy_players.json");
        }
        const json = await res.json();
        setPlayers(json);

        // Lineup que ya tenía guardado para esta jornada (si existe)
        const { data: lineupData, error: lineupError } = await supabase
          .from("fantasy_lineups")
          .select("*")
          .eq("fantasy_team_id", teamData.id)
          .eq("gameweek_id", gwData.id)
          .maybeSingle();

        if (lineupError && lineupError.code !== "PGRST116") {
          throw lineupError;
        }

        if (lineupData && Array.isArray(lineupData.players)) {
          const nums = lineupData.players
            .map((n) => Number(n))
            .filter((n) => !Number.isNaN(n));
          setSelectedNumbers(nums);

          if (lineupData.captain_number != null) {
            const cap = Number(lineupData.captain_number);
            setCaptainNumber(Number.isNaN(cap) ? null : cap);
          } else {
            setCaptainNumber(null);
          }

          if (lineupData.coach_code) {
            setCoachCode(lineupData.coach_code);
          }
        } else {
          setSelectedNumbers([]);
          setCaptainNumber(null);
          // coachCode se queda en el valor por defecto
        }
      } catch (err) {
        console.error("Error inicializando FantasyBuilder:", err);
        setErrorMsg(
          "No se ha podido cargar el mercado: " +
            (err.message || "error desconocido")
        );
      } finally {
        setLoading(false);
      }
    }

    init();
  }, [user, BASE]);

  // ========================
  // 2) Derivados (cervezas, equipo actual...)
  // ========================

  const cervezasTotales = team?.cervezas ?? 0;

  const selectedPlayers = useMemo(() => {
    if (!selectedNumbers.length || !players.length) return [];
    const selectedSet = new Set(selectedNumbers);
    return players.filter((p) => selectedSet.has(Number(p.number ?? p.dorsal)));
  }, [players, selectedNumbers]);

  const costeUsado = useMemo(
    () => selectedPlayers.reduce((sum, p) => sum + (p.price || 0), 0),
    [selectedPlayers]
  );

  const cervezasRestantes = Math.max(cervezasTotales - costeUsado, 0);

  const canConfirm =
    selectedNumbers.length === 5 &&
    costeUsado <= cervezasTotales &&
    !!gameweek &&
    captainNumber != null &&
    selectedNumbers.includes(captainNumber);
  // Nota: no obligamos aún a elegir entrenador, pero siempre hay uno seleccionado.

  // ========================
  // 3) Seleccionar / quitar jugadores
  // ========================

  function togglePlayer(number) {
    const num = Number(number);
    if (Number.isNaN(num)) return;

    setSelectedNumbers((prev) => {
      if (prev.includes(num)) {
        // Si quitamos al capitán, dejamos de tener capitán
        if (captainNumber === num) {
          setCaptainNumber(null);
        }
        return prev.filter((n) => n !== num);
      }
      if (prev.length >= 5) {
        return prev;
      }
      return [...prev, num];
    });
  }

  function handleSetCaptain(number) {
    const num = Number(number);
    if (Number.isNaN(num)) return;
    if (!selectedNumbers.includes(num)) return; // solo se puede hacer capitán a un seleccionado
    setCaptainNumber(num);
  }

  // ========================
  // 4) Guardar quinteto
  // ========================

  async function handleSave() {
    if (!canConfirm || !team || !gameweek) return;

    setSaving(true);
    setErrorMsg(null);
    setInfoMsg(null);

    try {
      const { data: existing, error: existingError } = await supabase
        .from("fantasy_lineups")
        .select("*")
        .eq("fantasy_team_id", team.id)
        .eq("gameweek_id", gameweek.id)
        .maybeSingle();

      if (existingError && existingError.code !== "PGRST116") {
        throw existingError;
      }

      const playersToSave = selectedNumbers;

      if (existing) {
        const { error: updError } = await supabase
          .from("fantasy_lineups")
          .update({
            players: playersToSave,
            captain_number: captainNumber,
            coach_code: coachCode,
          })
          .eq("id", existing.id);

        if (updError) throw updError;
      } else {
        const { error: insError } = await supabase
          .from("fantasy_lineups")
          .insert({
            fantasy_team_id: team.id,
            gameweek_id: gameweek.id,
            players: playersToSave,
            captain_number: captainNumber,
            coach_code: coachCode,
          });

        if (insError) throw insError;
      }

      setInfoMsg("Equipo guardado para esta jornada 🎉");
      navigate("/fantasy");
    } catch (err) {
      console.error("Error guardando lineup:", err);
      setErrorMsg(
        "No se ha podido guardar el equipo: " +
          (err.message || "error desconocido")
      );
    } finally {
      setSaving(false);
    }
  }

  // ========================
  // 5) Barras de rendimiento (last3_pir)
  // ========================

  const MIN_PIR = -10;
  const MAX_PIR = 30;
  const MIN_HEIGHT = 16; // px
  const MAX_HEIGHT = 56; // px

  function getBarVisual(value) {
    // Clamp dentro de rango
    const v = Math.max(MIN_PIR, Math.min(MAX_PIR, value));
    const absV = Math.abs(v);
    const t = Math.min(absV / MAX_PIR, 1); // escala 0..1
    const height = MIN_HEIGHT + t * (MAX_HEIGHT - MIN_HEIGHT);

    // Colores base
    const red = [231, 76, 60]; // rojo
    const yellow = [241, 196, 15]; // amarillo
    const green = [46, 204, 113]; // verde

    let color;

    if (v < 0) {
      // siempre rojo si es negativo
      color = `rgb(${red[0]}, ${red[1]}, ${red[2]})`;
    } else {
      // de 0 a MAX_PIR degradado amarillo → verde
      const tt = v / MAX_PIR;
      const r = Math.round(yellow[0] + (green[0] - yellow[0]) * tt);
      const g = Math.round(yellow[1] + (green[1] - yellow[1]) * tt);
      const b = Math.round(yellow[2] + (green[2] - yellow[2]) * tt);
      color = `rgb(${r}, ${g}, ${b})`;
    }

    return { height, color };
  }

  const displayNumber = (raw) => {
    const num = Number(raw);
    return !Number.isNaN(num) && num === 0 ? "00" : String(raw);
  };

  // ========================
  // 6) Render
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

  const coachTraits = getCoachTraits(coachCode);

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
            <h1 className="fantasy-builder__title">Creador de equipo</h1>
            <p className="fantasy-builder__subtitle">
              Jornada <strong>{gameweek?.name || `#${gameweek?.id}`}</strong> ·
              Deadline: <strong>{deadlineText}</strong>
            </p>
          </header>

          {/* Resumen */}
          <section className="fantasy-builder__summary">
            <div className="fantasy-builder__badge">
              En caja: <strong>{cervezasRestantes} 🍺</strong>
            </div>
            <div className="fantasy-builder__badge">
              Jugadores: <strong>{selectedNumbers.length} / 5</strong>
            </div>
            <div className="fantasy-builder__badge">
              Capitán:{" "}
              <strong>
                {captainNumber != null
                  ? `#${displayNumber(captainNumber)}`
                  : "Sin capitán"}
              </strong>
            </div>
          </section>

          {/* Entrenador */}
          <section className="fantasy-builder__section">
            <h2 className="fantasy-builder__section-title">Entrenador</h2>
            <p className="fantasy-builder__text">
              El entrenador no cuesta cervezas pero activa los rasgos de los
              jugadores que compartan atributo. Leyenda al final de la página.
            </p>

            <div className="fantasy-builder__coach-selector">
              <label className="fantasy-builder__field">
                <span className="fantasy-builder__label">Selecciona técnico</span>
                <select
                  value={coachCode}
                  onChange={(e) => setCoachCode(e.target.value)}
                  className="fantasy-builder__input"
                >
                  <option value="david">
                    David ({COACH_TRAITS.david.join(" · ")})
                  </option>
                  <option value="gorka">
                    Gorka ({COACH_TRAITS.gorka.join(" · ")})
                  </option>
                  <option value="unai">
                    Unai ({COACH_TRAITS.unai.join(" · ")})
                  </option>
                </select>
              </label>

              <div className="fantasy-builder__coach-traits">
                <div className="fantasy-builder__coach-avatar">
                  <img
                    src={`${import.meta.env.BASE_URL}images/coaches/${coachCode}.png`}
                    alt={COACH_LABELS[coachCode]}
                    className="fantasy-builder__coach-photo"
                  />
                </div>

                <div className="fantasy-builder__coach-info">
                  <span className="fantasy-builder__coach-name">
                    {COACH_LABELS[coachCode]}
                  </span>
                  <div className="fantasy-builder__traits">
                    {coachTraits.map((t) => (
                      <span key={t} className="fantasy-builder__trait-chip">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {infoMsg && (
            <p className="fantasy-builder__message fantasy-builder__message--success">
              {infoMsg}
            </p>
          )}
          {errorMsg && (
            <p className="fantasy-builder__message fantasy-builder__message--error">
              {errorMsg}
            </p>
          )}

          {/* Mercado */}
          <section className="fantasy-builder__section">
            <h2 className="fantasy-builder__section-title">
              Mercado de jugadores
            </h2>

            <ul className="fantasy-builder__list">
              {players.map((p) => {
                const rawNumber = p.number ?? p.dorsal;
                const num = Number(rawNumber);
                const isSelected =
                  !Number.isNaN(num) && selectedNumbers.includes(num);
                const isCaptain =
                  !Number.isNaN(num) && captainNumber === num && isSelected;
                const last3 = p.last3_pir || [];
                const traits = getPlayerTraitsForName(p.name);

                return (
                  <li
                    key={rawNumber}
                    className={
                      "fantasy-builder__item" +
                      (isSelected ? " fantasy-builder__item--selected" : "")
                    }
                  >
                    <div className="fantasy-builder__item-main">
                      {p.image &&
                        (() => {
                          const imgSrc = `${import.meta.env.BASE_URL}${p.image.replace(
                            /^\/+/,
                            ""
                          )}`;
                          return (
                            <img
                              src={imgSrc}
                              alt={p.name}
                              className="fantasy-builder__player-photo"
                            />
                          );
                        })()}

                      <div className="fantasy-builder__item-name">
                        #{displayNumber(rawNumber)} · {p.name}
                        {isCaptain && (
                          <span className="fantasy-builder__captain-badge">
                            CAP
                          </span>
                        )}
                      </div>

                      <div className="fantasy-builder__item-sub">
                        PIR medio:{" "}
                        <strong>
                          {p.pir_avg?.toFixed?.(1) ?? p.pir_avg ?? "–"}
                        </strong>
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

                    {/* Barras de los últimos 3 PIR */}
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

                    <div className="fantasy-builder__item-right">
                      <div className="fantasy-builder__price">
                        {p.price} 🍺
                      </div>
                      <button
                        type="button"
                        className={
                          "fantasy-builder__btn" +
                          (isSelected
                            ? " fantasy-builder__btn--remove"
                            : "")
                        }
                        onClick={() => togglePlayer(rawNumber)}
                      >
                        {isSelected ? "Quitar" : "Añadir"}
                      </button>
                      <button
                        type="button"
                        className={
                          "fantasy-builder__btn-secondary" +
                          (isCaptain ? " is-captain" : "")
                        }
                        disabled={!isSelected}
                        onClick={() => handleSetCaptain(rawNumber)}
                      >
                        {isCaptain ? "Capitán ✅" : "Hacer capitán"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Leyenda de atributos */}
          <section className="fantasy-builder__section">
            <h2 className="fantasy-builder__section-title">Leyenda atributos</h2>
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

          {/* Footer */}
          <section className="fantasy-builder__footer">
            <button
              type="button"
              className="fantasy-builder__confirm"
              disabled={!canConfirm || saving}
              onClick={handleSave}
            >
              {saving
                ? "Guardando equipo..."
                : "Confirmar equipo (5 jugadores y capitán)"}
            </button>
            {!canConfirm && (
              <p className="fantasy-builder__hint">
                Necesitas exactamente 5 jugadores, no pasarte de cervezas y
                elegir un capitán para poder confirmar.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
