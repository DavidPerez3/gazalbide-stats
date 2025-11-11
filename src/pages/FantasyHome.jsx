import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient.js";
import { computeLineupBreakdown } from "../lib/fantasyScoring.js";

// ==== helpers de rasgos / entrenadores (igual que en el builder) ====

function normalizeName(name) {
  return name
    ?.toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

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

function getPlayerTraits(name) {
  return PLAYER_TRAITS[normalizeName(name)] || [];
}

function getCoachTraits(code) {
  return COACH_TRAITS[code] || [];
}

// valor para hueco vacío (en BD se guarda como "-1")
const EMPTY_SLOT_NUM = -1;
const EMPTY_SLOT_RAW = "-1";

// Posiciones (en %) de los 5 huecos sobre el campo (3–2)
const COURT_SLOTS = [
  // fila superior un poco más arriba
  { id: 0, top: "26%", left: "20%" },
  { id: 1, top: "26%", left: "50%" },
  { id: 2, top: "26%", left: "80%" },

  // fila inferior más abajo
  { id: 3, top: "74%", left: "35%" },
  { id: 4, top: "74%", left: "65%" },
];


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
  const [lineupNumbers, setLineupNumbers] = useState([]); // array de 5 números por slot
  const [lineupGameweek, setLineupGameweek] = useState(null);
  const [captainNumber, setCaptainNumber] = useState(null);
  const [coachCode, setCoachCode] = useState(null);
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

  const [playerStatuses, setPlayerStatuses] = useState(new Map());

  const BASE = import.meta.env.BASE_URL || "/";
  const courtSrc = `${BASE}images/court.png`;

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
          let raw = [...lineupRow.players];

          // Siempre 5 posiciones, usando "-1" como hueco vacío
          while (raw.length < 5) raw.push(EMPTY_SLOT_RAW);
          if (raw.length > 5) raw = raw.slice(0, 5);

          const slots = raw.map((val) => {
            if (val == null || val === EMPTY_SLOT_RAW) return EMPTY_SLOT_NUM;
            const n = Number(val);
            return Number.isNaN(n) ? EMPTY_SLOT_NUM : n;
          });

          setLineupNumbers(slots);

          // Capitán guardado en esta jornada
          if (lineupRow.captain_number != null) {
            const cap = Number(lineupRow.captain_number);
            setCaptainNumber(Number.isNaN(cap) ? null : cap);
          } else {
            setCaptainNumber(null);
          }

          // Entrenador guardado
          if (lineupRow.coach_code) {
            setCoachCode(lineupRow.coach_code);
          } else {
            setCoachCode(null);
          }

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
          setCaptainNumber(null);
          setCoachCode(null);
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

  // 4) Cargar stats del partido usando gameweeks.stats_file
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

        const stats = await res.json();
        const map = new Map();
        for (const row of stats) {
          const n = Number(row.number);
          if (!Number.isNaN(n)) {
            map.set(n, row);
          }
        }

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

    fetchStats();
  }, [lineupGameweek, BASE]);

  // Estados de jugador
  useEffect(() => {
    if (!lineupGameweek || !lineupGameweek.id) {
      setPlayerStatuses(new Map());
      return;
    }

    async function fetchPlayerStatuses() {
      try {
        const { data, error } = await supabase
          .from("player_statuses")
          .select("player_number, status, note")
          .eq("gameweek_id", lineupGameweek.id);

        if (error) {
          console.error("Error cargando estados de jugadores:", error);
          setPlayerStatuses(new Map());
          return;
        }

        const map = new Map();
        for (const row of data || []) {
          const num = Number(row.player_number);
          if (!Number.isNaN(num)) {
            map.set(num, { status: row.status, note: row.note });
          }
        }
        setPlayerStatuses(map);
      } catch (e) {
        console.error("Error cargando estados de jugadores:", e);
        setPlayerStatuses(new Map());
      }
    }

    fetchPlayerStatuses();
  }, [lineupGameweek]);

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

    nextDeadlineText = new Date(nextGameweek.deadline).toLocaleString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  // Jugador por slot (0..4)
  const playersBySlot = useMemo(() => {
    if (!lineupNumbers.length || !fantasyPlayers.length) return [];

    return lineupNumbers.map((num) => {
      if (
        num == null ||
        num === EMPTY_SLOT_NUM ||
        Number.isNaN(num) ||
        num < 0
      ) {
        return null;
      }
      return (
        fantasyPlayers.find((p) => {
          const raw = p.number ?? p.dorsal;
          const n = Number(raw);
          return !Number.isNaN(n) && n === num;
        }) || null
      );
    });
  }, [fantasyPlayers, lineupNumbers]);

  // nº de slots llenos y cervezas usadas
  const filledSlots = useMemo(
    () =>
      lineupNumbers.filter(
        (n) => n != null && n !== EMPTY_SLOT_NUM && !Number.isNaN(n)
      ).length,
    [lineupNumbers]
  );

  const usedBeers = useMemo(
    () =>
      playersBySlot.reduce(
        (sum, p) => (p ? sum + (p.price || 0) : sum),
        0
      ),
    [playersBySlot]
  );

  const remainingBeers = Math.max(totalBudget - usedBeers, 0);

  const hasCoach = !!coachCode;
  const hasCaptain =
    captainNumber != null && !Number.isNaN(captainNumber) && captainNumber >= 0;

  const isValidLineup =
    filledSlots === 5 && hasCoach && hasCaptain && usedBeers <= totalBudget;

  // Breakdown fantasy (solo si equipo válido)
  const breakdown = useMemo(() => {
    if (!statsByNumber || !lineupNumbers.length || !isValidLineup) return null;

    const playersNums = lineupNumbers.filter(
      (n) => n != null && n !== EMPTY_SLOT_NUM && !Number.isNaN(n)
    );
    if (!playersNums.length) return null;

    try {
      return computeLineupBreakdown({
        playersNums,
        statsMap: statsByNumber,
        captainNumber,
        coachCode,
      });
    } catch (e) {
      console.error("Error calculando breakdown en FantasyHome:", e);
      return null;
    }
  }, [lineupNumbers, statsByNumber, captainNumber, coachCode, isValidLineup]);

  // Puntos fantasy por jugador por slot
  const playersWithPoints = useMemo(() => {
    if (!playersBySlot.length) return [];

    const breakdownMap =
      breakdown && breakdown.players
        ? new Map(breakdown.players.map((pl) => [Number(pl.number), pl]))
        : null;

    return playersBySlot.map((p) => {
      if (!p) return null;

      const raw = p.number ?? p.dorsal;
      const num = Number(raw);

      let isCaptain =
        captainNumber != null && !Number.isNaN(num) && num === captainNumber;
      let fantasyPoints = null;
      let synergies = [];

      if (breakdownMap && !Number.isNaN(num)) {
        const bd = breakdownMap.get(num);
        if (bd) {
          fantasyPoints =
            typeof bd.finalScore === "number" ? bd.finalScore : null;
          synergies = bd.synergies || [];
          if (bd.isCaptain) isCaptain = true;
        }
      }

      let status = "available";
      let statusNote = "";
      if (playerStatuses && playerStatuses.size && !Number.isNaN(num)) {
        const st = playerStatuses.get(num);
        if (st) {
          status = st.status || "available";
          statusNote = st.note || "";
        }
      }

      return {
        ...p,
        isCaptain,
        fantasyPoints,
        traits: getPlayerTraits(p.name),
        synergies,
        status,
        statusNote,
      };
    });
  }, [playersBySlot, breakdown, captainNumber, playerStatuses]);

  const totalFantasyPoints = useMemo(() => {
    if (breakdown) return breakdown.totalPoints;
    if (!playersWithPoints.length) return null;

    let sum = 0;
    let hasAny = false;

    for (const p of playersWithPoints) {
      if (p && typeof p.fantasyPoints === "number") {
        hasAny = true;
        sum += p.fantasyPoints;
      }
    }

    return hasAny ? sum : null;
  }, [breakdown, playersWithPoints]);

  const displayNumber = (raw) => {
    const n = Number(raw);
    return n === 0 ? "00" : String(raw);
  };

  const usernameLabel = username;

  // navegación al builder desde un hueco del campo
  const goToBuilderFromField = (slotIndex) => {
    if (!canEditLineup) return;
    navigate(`/fantasy/crear-equipo?slot=${slotIndex}`);
  };

  // mini-tarjeta de jugador para los huecos del campo
  const renderPlayerSlotCard = (p) => {
    // HUECO VACÍO
    if (!p) {
      return (
        <div
          className="fantasy__court-slot-card"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "10px 8px",
            background: "rgba(24,24,27,0.95)",
            borderRadius: "12px",
            border: "1px solid rgba(250,204,21,0.4)",
            boxShadow: "0 6px 16px rgba(0,0,0,0.5)",
            overflow: "hidden",
            fontSize: "0.75rem",
            lineHeight: 1.2,
            boxSizing: "border-box",
            minHeight: "165px",
          }}
        >
          <span
            className="fantasy__court-slot-title"
            style={{ fontWeight: 600, color: "#E5E7EB" }}
          >
            Hueco libre
          </span>
          <span
            className="fantasy__court-slot-sub"
            style={{ color: "#9CA3AF", marginTop: 2, textAlign: "center" }}
          >
            Toca para fichar jugador
          </span>
        </div>
      );
    }

    // HAY JUGADOR
    return (
      <div
        className="fantasy__court-slot-card"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "8px 6px",
          background: "rgba(24,24,27,0.96)",
          borderRadius: "12px",
          border: "1px solid rgba(250,204,21,0.6)",
          boxShadow: "0 8px 18px rgba(0,0,0,0.6)",
          overflow: "hidden",
          fontSize: "0.7rem",
          lineHeight: 1.15,
          boxSizing: "border-box",
          minHeight: "165px",
        }}
      >
        {/* 1. Foto */}
        {p.image && (() => {
          const imgSrc = `${import.meta.env.BASE_URL}${p.image.replace(
            /^\/+/,
            ""
          )}`;
          return (
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: "999px",
                overflow: "hidden",
                border: "2px solid #FACC15",
                marginBottom: 4,
                flexShrink: 0,
              }}
            >
              <img
                src={imgSrc}
                alt={p.name}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
              />
            </div>
          );
        })()}

        {/* 2. Dorsal + nombre */}
        <div
          className="fantasy__court-slot-header"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            marginBottom: 2,
            maxWidth: "100%",
            overflow: "hidden",      // protegemos todo el header
          }}
        >
          <span
            className="fantasy__player-number"
            style={{ fontWeight: 700, color: "#FACC15", fontSize: "0.85rem" }}
          >
            #{displayNumber(p.number)}
          </span>
        
          {/* Nombre con ellipsis y ancho limitado: cuando hay CAP, recortamos nombre */}
          <span
            className="fantasy__court-slot-name"
            style={{
              fontWeight: 600,
              color: "#F9FAFB",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: p.isCaptain ? "60px" : "90px", // menos ancho si hay CAP
              fontSize: "0.8rem",
            }}
          >
            {p.name}
          </span>
          
          {p.isCaptain && (
            <span
              className="fantasy-builder__captain-badge"
              style={{
                flexShrink: 0,             // que no se aplaste el chip
                marginLeft: 4,
                fontSize: "0.6rem",
                padding: "2px 6px",
                borderRadius: "999px",
                background: "#FACC15",
                color: "#111827",
                fontWeight: 700,
              }}
            >
              CAP
            </span>
          )}
        </div>

        {/* 3. Status */}
        {p.status && (
          <div
            className={`fantasy__player-status fantasy__player-status--${p.status}`}
            title={p.statusNote || ""}
            style={{
              fontSize: "0.62rem",
              marginBottom: 2,
              fontWeight: 600,
              padding: "2px 6px",
              borderRadius: "6px",
              background:
                p.status === "injured"
                  ? "rgba(239,68,68,0.2)"
                  : p.status === "doubtful"
                  ? "rgba(250,204,21,0.2)"
                  : "rgba(16,185,129,0.25)",
              color:
                p.status === "injured"
                  ? "#FCA5A5"
                  : p.status === "doubtful"
                  ? "#FBBF24"
                  : "#34D399",
            }}
          >
            {p.status === "injured"
              ? "Lesionado"
              : p.status === "doubtful"
              ? "Dudoso"
              : "Disponible"}
          </div>
        )}

        {/* 4. Precio + PIR */}
        <div
          className="fantasy__court-slot-meta"
          style={{
            fontSize: "0.65rem",
            color: "#D1D5DB",
            marginBottom: 2,
          }}
        >
          {p.price} 🍺 · PIR{" "}
          {p.pir_avg?.toFixed ? p.pir_avg.toFixed(1) : p.pir_avg}
        </div>

        {/* 5. Rasgos */}
        {p.traits && p.traits.length > 0 && (
          <div
            className="fantasy-builder__item-traits"
            style={{
              display: "flex",
              gap: 4,
              flexWrap: "wrap",
              justifyContent: "center",
              marginBottom: 2,
            }}
          >
            {p.traits.map((t) => (
              <span
                key={t}
                className="fantasy-builder__trait-chip"
                style={{
                  fontSize: "0.55rem",
                  padding: "1px 5px",
                  borderRadius: "999px",
                  border: "1px solid rgba(250,204,21,0.7)",
                }}
              >
                {t}
              </span>
            ))}
          </div>
        )}

        {/* 6. Puntos fantasy */}
        <div
          className="fantasy__court-slot-points"
          style={{
            marginTop: 1,
            fontSize: "0.62rem",
            color: "#E5E7EB",
          }}
        >
          Puntos:{" "}
          {typeof p.fantasyPoints === "number"
            ? p.fantasyPoints.toFixed(1)
            : "–"}
        </div>
      </div>
    );
  };

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
                  Hola <strong>{usernameLabel}</strong>, prepárate para dejarte
                  las <strong>cervezas</strong> en fichajes.
                </p>
              </div>

              {errorMsg && (
                <p className="fantasy__message fantasy__message--error">
                  {errorMsg}
                </p>
              )}

              {/* Próxima jornada futura */}
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
                    Empiezas con{" "}
                    <strong>{totalBudget || 0} cervezas</strong> para fichar
                    jugadores. Elige un nombre para tu equipo:
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

                  {/* Tarjeta de entrenador */}
                  {coachCode && (
                    <div
                      className="fantasy__coach-card"
                      style={{ marginTop: "0.75rem", cursor: canEditLineup ? "pointer" : "default" }}
                      onClick={() => {
                        if (canEditLineup) navigate("/fantasy/crear-equipo?coach=1");
                      }}
                    >
                      <h3 className="fantasy__section-subtitle">Entrenador</h3>
                      <div className="fantasy-builder__coach-traits">
                        <div className="fantasy-builder__coach-avatar">
                          <img
                            src={`${import.meta.env.BASE_URL}images/coaches/${coachCode}.png`}
                            alt={COACH_LABELS[coachCode] || coachCode}
                            className="fantasy-builder__coach-photo"
                          />
                        </div>
                        <div className="fantasy-builder__coach-info">
                          <span className="fantasy-builder__coach-name">
                            {COACH_LABELS[coachCode] || coachCode}
                          </span>
                          <div className="fantasy-builder__traits">
                            {getCoachTraits(coachCode).map((t) => (
                              <span
                                key={t}
                                className="fantasy-builder__trait-chip"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

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

                  {captainNumber != null && (
                    <p className="fantasy__text" style={{ marginTop: "0.2rem" }}>
                      Capitán de la jornada:{" "}
                      <strong>#{displayNumber(captainNumber)}</strong>
                    </p>
                  )}

                  {statsError && (
                    <p className="fantasy__message fantasy__message--error">
                      {statsError}
                    </p>
                  )}

                  {/* aviso de validez del equipo */}
                  {!isValidLineup && (
                    <p className="fantasy__message fantasy__message--warning">
                      Tu equipo no puntuará esta jornada hasta que tengas 5
                      jugadores, un capitán y un entrenador, y no te pases de
                      cervezas.
                    </p>
                  )}

                  {/* Alineación sobre el campo */}
                  <div className="fantasy__lineup">
                    {loadingLineup || loadingPlayers ? (
                      <p className="fantasy__text">Cargando alineación...</p>
                    ) : lineupError ? (
                      <p className="fantasy__message fantasy__message--error">
                        {lineupError}
                      </p>
                    ) : filledSlots === 0 ? (
                      <p className="fantasy__text">
                        Aún no has elegido tu quinteto.
                      </p>
                    ) : (
                      <div
                        className="fantasy__court-wrapper"
                        style={{ display: "flex", justifyContent: "center" }}
                      >
                        <div
                          className="fantasy__court"
                          style={{
                            position: "relative",
                            width: "100%",
                            maxWidth: "400px",
                            margin: "0 auto",
                            height: "550px",
                            backgroundImage: `url(${courtSrc})`,
                            backgroundSize: "100% 100%",
                            backgroundRepeat: "no-repeat",
                            backgroundPosition: "center",
                          }}
                        >
                          {COURT_SLOTS.map((slot, index) => {
                            const player = playersWithPoints[index] || null;
                            return (
                              <button
                                key={slot.id}
                                type="button"
                                className="fantasy__court-slot"
                                style={{
                                  position: "absolute",
                                  top: slot.top,
                                  left: slot.left,
                                  transform: "translate(-50%, -50%)",
                                  background: "transparent",
                                  border: "none",
                                  padding: 0,
                                  cursor: canEditLineup ? "pointer" : "default",
                                  width: "28%",
                                  maxWidth: "130px",
                                }}
                                onClick={() => goToBuilderFromField(index)}
                                disabled={!canEditLineup}
                              >
                                {renderPlayerSlotCard(player)}
                              </button>
                            );
                          })}
                        </div>
                        {!canEditLineup && (
                          <p className="fantasy__text fantasy__court-hint">
                            El quinteto se puede editar solo cuando haya una
                            jornada futura y antes del límite.
                          </p>
                        )}
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
                      <strong>{totalFantasyPoints.toFixed(1)}</strong>
                    </p>
                  ) : (
                    <p className="fantasy__text" style={{ margin: 16 }}>
                      Puntos de la jornada aún no disponibles.
                    </p>
                  )}

                  {/* Leyenda atributos */}
                  <section className="fantasy__section" style={{ marginTop: 12 }}>
                    <h3 className="fantasy__section-subtitle">
                      Leyenda de atributos
                    </h3>
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

                  {/* Botones */}
                  <div className="fantasy__actions">
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
