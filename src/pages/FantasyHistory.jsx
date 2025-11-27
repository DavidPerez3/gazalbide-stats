import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient.js";
import { useAuth } from "../context/AuthContext.jsx";
import { computeLineupBreakdown } from "../lib/fantasyScoring.js";

// Entrenadores (solo para mostrar)
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

function getCoachTraits(code) {
  return COACH_TRAITS[code] || [];
}

export default function FantasyHistory() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const BASE = import.meta.env.BASE_URL || "/";

  const [entries, setEntries] = useState([]); // cada entry = una jornada con su quinteto
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [selectedGwId, setSelectedGwId] = useState("all");
  const [teamName, setTeamName] = useState(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      setErrorMsg("Debes iniciar sesión para ver tu historial.");
      return;
    }

    async function loadHistory() {
      setLoading(true);
      setErrorMsg(null);

      try {
        // 1) Buscar equipos fantasy del usuario
        const { data: teams, error: teamsError } = await supabase
          .from("fantasy_teams")
          .select("*")
          .eq("user_id", user.id);

        if (teamsError) throw teamsError;
        if (!teams || teams.length === 0) {
          setEntries([]);
          setTeamName(null);
          setLoading(false);
          return;
        }

        // Por simplicidad cogemos el primer equipo
        const team = teams[0];
        setTeamName(team.name || "Equipo sin nombre");

        // 2) Lineups de ese equipo
        const { data: lineups, error: lineupError } = await supabase
          .from("fantasy_lineups")
          .select("*")
          .eq("fantasy_team_id", team.id);

        if (lineupError) throw lineupError;
        if (!lineups || lineups.length === 0) {
          setEntries([]);
          setLoading(false);
          return;
        }

        // 3) Cargar gameweeks de esos lineups
        const gwIds = [
          ...new Set(
            lineups
              .map((l) => l.gameweek_id)
              .filter((id) => id !== null && id !== undefined)
          ),
        ];

        const { data: gameweeks, error: gwError } = await supabase
          .from("gameweeks")
          .select("id, name, date, opponent, stats_file")
          .in("id", gwIds);

        if (gwError) throw gwError;

        const gwMap = new Map((gameweeks || []).map((g) => [g.id, g]));

        // 4) Mapa dorsal -> nombre desde fantasy_players
        const playerNameMap = new Map();
        try {
          const resPlayers = await fetch(`${BASE}data/fantasy_players.json`);
          if (resPlayers.ok) {
            const fantasyPlayers = await resPlayers.json();
            for (const fp of fantasyPlayers) {
              const n = Number(fp.number ?? fp.dorsal);
              if (!Number.isNaN(n) && fp.name) {
                playerNameMap.set(n, fp.name);
              }
            }
          }
        } catch (e) {
          console.error("No se pudo cargar fantasy_players.json", e);
        }

        // 5) Cargar stats JSON por jornada
        const statsByGw = new Map();

        for (const gw of gameweeks || []) {
          if (!gw.stats_file) continue;

          const cleaned = String(gw.stats_file).trim().replace(/\s+/g, "");
          if (!cleaned) continue;

          const url = `${BASE}data/player_stats/${cleaned}`;

          try {
            const res = await fetch(url);
            if (!res.ok) {
              console.warn("No se pudo cargar stats para", url, res.status);
              continue;
            }
            const json = await res.json();
            const map = new Map();
            for (const row of json) {
              const num = Number(row.number);
              if (!Number.isNaN(num)) {
                map.set(num, row); // fila entera (name, pir, etc.)

                // si hay nombre en stats y aún no está en playerNameMap, lo añadimos
                if (row.name && !playerNameMap.has(num)) {
                  playerNameMap.set(num, row.name);
                }
              }
            }
            statsByGw.set(gw.id, map);
          } catch (e) {
            console.error("Error cargando stats de", url, e);
          }
        }

        // 6) Construir entries: una por jornada del equipo
        const newEntries = [];

        for (const lineup of lineups) {
          const gw = gwMap.get(lineup.gameweek_id);
          if (!gw) continue;

          const statsMap = statsByGw.get(gw.id) || new Map();

          // Jugadores de la alineación tal cual vienen de la DB
          const rawPlayers = Array.isArray(lineup.players)
            ? lineup.players
            : [];

          // ¿Hay algún hueco (-1 o "-1")?
          const hasEmptySlot = rawPlayers.some(
            (v) => v === -1 || v === "-1"
          );

          // Regla: exactamente 5 jugadores reales y ningún hueco
          if (rawPlayers.length !== 5 || hasEmptySlot) {
            // Alineación incompleta → no puntúa y no se muestra en el historial
            continue;
          }

          // A partir de aquí, ya sabemos que todos son dorsales reales
          const playersNums = rawPlayers.map((val) => Number(val));

          const captainNumber =
            lineup.captain_number != null
              ? Number(lineup.captain_number)
              : null;

          const coachCode = lineup.coach_code || null;

          const breakdown = computeLineupBreakdown({
            playersNums,
            statsMap,
            captainNumber,
            coachCode,
          });

          // rawPlayers viene directamente de la DB: ["00","13","25","8","10"]
          const playersDetailed = breakdown.players.map((p, idx) => {
            const rawNum = rawPlayers[idx]; // string exacto
            const num = Number(rawNum);
            const hasStats =
              !Number.isNaN(num) && statsMap.has(num);

            const mappedName =
              (!Number.isNaN(num) && playerNameMap.get(num))
                ? playerNameMap.get(num)
                : p.name;

            return {
              // dorsal EXACTO que viene de la DB (respeta "00")
              number: rawNum ?? String(p.number),
              name: mappedName,
              pir: hasStats ? p.pirBase : 0,
              isCaptain: p.isCaptain,
              synergies: hasStats ? p.synergies || [] : [],
              finalScore: hasStats ? p.finalScore : 0,
            };
          });

          newEntries.push({
            id: lineup.id,
            gameweekId: gw.id,
            gameweekName: gw.name || `Jornada ${gw.id}`,
            gameweekDate: gw.date || null,
            opponent: gw.opponent || null,
            players: playersDetailed,
            totalPoints: breakdown.totalPoints,
            baseTotal: breakdown.baseTotal,
            bonusTotal: breakdown.bonusTotal,
            coachCode, // 👈 guardamos entrenador usado en esa jornada
          });
        }

        // Ordenar por fecha o nombre
        newEntries.sort((a, b) => {
          if (a.gameweekDate && b.gameweekDate) {
            return new Date(a.gameweekDate) - new Date(b.gameweekDate);
          }
          return a.gameweekName.localeCompare(b.gameweekName);
        });

        setEntries(newEntries);
      } catch (err) {
        console.error("Error cargando historial:", err);
        setErrorMsg("No se ha podido cargar tu historial.");
      } finally {
        setLoading(false);
      }
    }

    loadHistory();
  }, [user, BASE]);

  // Opciones de jornada para el dropdown
  const gameweekOptions = useMemo(() => {
    const map = new Map();
    for (const e of entries) {
      if (!map.has(e.gameweekId)) {
        map.set(e.gameweekId, {
          id: e.gameweekId,
          label: e.gameweekName,
        });
      }
    }
    return Array.from(map.values());
  }, [entries]);

  // Filtrado por jornada
  const filteredEntries =
    selectedGwId === "all"
      ? entries
      : entries.filter((e) => String(e.gameweekId) === String(selectedGwId));

  return (
    <div className="fantasy">
      <div className="container">
        <div className="fantasy__card">
          <header className="fantasy__header">
            <button
              type="button"
              className="fantasy-builder__back"
              onClick={() => navigate("/fantasy")}
            >
              ← Volver
            </button>

            <h1 className="fantasy__title">Tu historial Fantasy</h1>
            {teamName && (
              <p className="fantasy__subtitle">
                Equipo: <strong>{teamName}</strong>
              </p>
            )}
          </header>

          {loading ? (
            <p className="fantasy__text">Cargando historial...</p>
          ) : errorMsg ? (
            <p className="fantasy__message fantasy__message--error">
              {errorMsg}
            </p>
          ) : entries.length === 0 ? (
            <p className="fantasy__text">
              Todavía no tienes quintetos registrados en Fantasy.
            </p>
          ) : (
            <section className="fantasy__section">
              <div className="fantasy__section-header">
                <h2 className="fantasy__section-title">
                  Quintetos por jornada
                </h2>
                {gameweekOptions.length > 0 && (
                  <div className="fantasy__filters">
                    <label className="fantasy__filter-label">
                      Jornada:{" "}
                      <select
                        value={selectedGwId}
                        onChange={(e) => setSelectedGwId(e.target.value)}
                      >
                        <option value="all">Todas</option>
                        {gameweekOptions.map((gw) => (
                          <option key={gw.id} value={gw.id}>
                            {gw.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
              </div>

              {filteredEntries.length === 0 ? (
                <p className="fantasy__text">
                  No tienes quinteto registrado para esta jornada. Prueba con
                  otra jornada o con <strong>Todas</strong>.
                </p>
              ) : (
                <div className="fantasy__ranking">
                  {filteredEntries.map((e) => (
                    <div key={e.id} className="fantasy__section-card">
                      <div className="fantasy__section-card-header">
                        <h3>
                          {e.gameweekName}
                          {e.opponent ? ` · vs ${e.opponent}` : ""}
                        </h3>
                        <p className="fantasy__text">
                          Puntos totales:{" "}
                          <strong>{e.totalPoints.toFixed(1)}</strong>{" "}
                          <span style={{ fontSize: "0.9rem", opacity: 0.8 }}>
                            (base {e.baseTotal.toFixed(1)}, bonus{" "}
                            {e.bonusTotal >= 0
                              ? `+${e.bonusTotal.toFixed(1)}`
                              : e.bonusTotal.toFixed(1)}
                            )
                          </span>
                        </p>
                        {e.coachCode && (
                          <p className="fantasy__text" style={{ marginTop: 4 }}>
                            Entrenador:{" "}
                            <strong>
                              {COACH_LABELS[e.coachCode] || e.coachCode}
                            </strong>{" "}
                            <span style={{ opacity: 0.8, fontSize: "0.85rem" }}>
                              (
                              {getCoachTraits(e.coachCode).join(" · ") ||
                                "sin rasgos"}
                              )
                            </span>
                          </p>
                        )}
                      </div>
                      <table className="fantasy__ranking-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Jugador</th>
                            <th>PIR base</th>
                            <th>Multiplicadores</th>
                            <th>Puntos finales</th>
                          </tr>
                        </thead>
                        <tbody>
                          {e.players.map((p) => (
                            <tr key={p.number}>
                              <td>{p.number}</td>
                              <td>
                                {p.name}
                                {p.isCaptain && (
                                  <span
                                    style={{
                                      marginLeft: 6,
                                      padding: "2px 6px",
                                      borderRadius: 999,
                                      background: "gold",
                                      color: "#000",
                                      fontSize: 11,
                                      fontWeight: 700,
                                    }}
                                  >
                                    CAP
                                  </span>
                                )}
                              </td>
                              <td>{p.pir}</td>
                              <td>
                                {p.synergies && p.synergies.length > 0
                                  ? p.synergies.join(" · ")
                                  : "–"}
                              </td>
                              <td>{p.finalScore.toFixed(1)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
