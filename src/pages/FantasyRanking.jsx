import React, { useEffect, useState, useMemo } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient.js";
import { useNavigate } from "react-router-dom";
import { computeLineupPoints } from "../lib/fantasyScoring.js";

export default function FantasyRanking() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [rowsAll, setRowsAll] = useState([]); // ranking total
  const [rowsByGw, setRowsByGw] = useState({}); // ranking por jornada { gwId: [rows] }
  const [gameweekOptions, setGameweekOptions] = useState([]);
  const [selectedGwId, setSelectedGwId] = useState("all");

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  const BASE = import.meta.env.BASE_URL || "/";

  useEffect(() => {
    if (!user) return;

    async function loadRanking() {
      setLoading(true);
      setErrorMsg(null);

      try {
        // 1) Equipos fantasy
        const { data: teams, error: teamError } = await supabase
          .from("fantasy_teams")
          .select("*");

        if (teamError) throw teamError;
        if (!teams || teams.length === 0) {
          setRowsAll([]);
          setRowsByGw({});
          setGameweekOptions([]);
          setLoading(false);
          return;
        }

        const teamIds = teams.map((t) => t.id);

        // 2) Perfiles (para mostrar dueño)
        const { data: profiles, error: profError } = await supabase
          .from("profiles")
          .select("id, username, email");

        if (profError) throw profError;

        const userMap = new Map();
        for (const p of profiles || []) {
          userMap.set(p.id, p);
        }

        // 3) Todos los lineups de esos equipos
        const { data: lineups, error: lineupError } = await supabase
          .from("fantasy_lineups")
          .select("*")
          .in("fantasy_team_id", teamIds);

        if (lineupError) throw lineupError;
        if (!lineups || lineups.length === 0) {
          setRowsAll([]);
          setRowsByGw({});
          setGameweekOptions([]);
          setLoading(false);
          return;
        }

        // 4) Gameweeks
        const gwIds = [
          ...new Set(
            lineups.map((l) => l.gameweek_id).filter((id) => id != null)
          ),
        ];

        let gameweeks = [];
        if (gwIds.length > 0) {
          const { data: gwData, error: gwError } = await supabase
            .from("gameweeks")
            .select("id, name, date, opponent, stats_file")
            .in("id", gwIds);

          if (gwError) throw gwError;
          gameweeks = gwData || [];
        }

        const gwMap = new Map(gameweeks.map((g) => [g.id, g]));

        // opciones de jornada para el dropdown
        const gwOptions = gameweeks
          .slice()
          .sort((a, b) => {
            if (a.date && b.date) {
              return new Date(a.date) - new Date(b.date);
            }
            return (a.name || "").localeCompare(b.name || "");
          })
          .map((g) => ({
            id: g.id,
            label: g.name || `Jornada ${g.id}`,
          }));
        setGameweekOptions(gwOptions);

        // 5) Cargar stats (guardamos la fila entera por jugador)
        const statsByGw = new Map();
        for (const gw of gameweeks) {
          if (!gw.stats_file) continue;
          const cleaned = String(gw.stats_file).trim().replace(/\s+/g, "");
          if (!cleaned) continue;
          const url = `${BASE}data/player_stats/${cleaned}`;
          try {
            const res = await fetch(url);
            if (!res.ok) continue;
            const stats = await res.json();
            const map = new Map();
            for (const row of stats) {
              const n = Number(row.number);
              if (!Number.isNaN(n) && typeof row.pir === "number") {
                map.set(n, row); // fila completa: { number, name, pir, ... }
              }
            }
            statsByGw.set(gw.id, map);
          } catch (e) {
            console.error("Error cargando stats para ranking:", e);
          }
        }

        // 6) Mapa base de equipos (nombre, dueño...)
        const baseTeamInfo = new Map();
        const teamRowMapTotal = new Map();

        for (const team of teams) {
          const owner = userMap.get(team.user_id) || null;
          const base = {
            teamId: team.id,
            teamName: team.name || "Equipo sin nombre",
            ownerName:
              owner?.username || owner?.email?.split("@")[0] || "Anónimo",
            userId: team.user_id,
          };
          baseTeamInfo.set(team.id, base);
          teamRowMapTotal.set(team.id, {
            ...base,
            totalPoints: 0,
            jornadas: 0,
          });
        }

        // 7) Ranking por jornada: gwId -> Map(teamId -> row)
        const rowsByGwMap = new Map(); // gwId -> Map(teamId -> row)

        for (const lineup of lineups) {
          const baseInfo = baseTeamInfo.get(lineup.fantasy_team_id);
          if (!baseInfo) continue;

          const gw = gwMap.get(lineup.gameweek_id);
          if (!gw) continue;

          const statsMap = statsByGw.get(gw.id);
          if (!statsMap) continue;

          const nums = (lineup.players || [])
            .map((n) => Number(n))
            .filter((n) => !Number.isNaN(n));
          if (nums.length === 0) continue;

          const captainNumber =
            lineup.captain_number != null
              ? Number(lineup.captain_number)
              : null;
          const coachCode = lineup.coach_code || null;

          const points = computeLineupPoints({
            playersNums: nums,
            statsMap,
            captainNumber,
            coachCode,
          });

          // Acumulado total
          const totalRow = teamRowMapTotal.get(lineup.fantasy_team_id);
          if (totalRow) {
            totalRow.totalPoints += points;
            totalRow.jornadas += 1;
          }

          // Ranking de esa jornada concreta
          if (!rowsByGwMap.has(gw.id)) {
            rowsByGwMap.set(gw.id, new Map());
          }
          const gwMapRows = rowsByGwMap.get(gw.id);
          let gwRow = gwMapRows.get(lineup.fantasy_team_id);
          if (!gwRow) {
            gwRow = {
              ...baseInfo,
              totalPoints: 0,
              jornadas: 0,
            };
            gwMapRows.set(lineup.fantasy_team_id, gwRow);
          }
          gwRow.totalPoints += points;
          gwRow.jornadas += 1;
        }

        const rowsAllArr = Array.from(teamRowMapTotal.values());

        const rowsByGwObj = {};
        for (const [gwId, map] of rowsByGwMap.entries()) {
          rowsByGwObj[gwId] = Array.from(map.values());
        }

        setRowsAll(rowsAllArr);
        setRowsByGw(rowsByGwObj);
      } catch (err) {
        console.error("Error cargando ranking Fantasy:", err);
        setErrorMsg("No se ha podido cargar el ranking de Fantasy.");
      } finally {
        setLoading(false);
      }
    }

    loadRanking();
  }, [user, BASE]);

  // Filtrado por jornada
  const rows = useMemo(() => {
    if (selectedGwId === "all") return rowsAll;
    const gwRows = rowsByGw[selectedGwId];
    return Array.isArray(gwRows) ? gwRows : [];
  }, [rowsAll, rowsByGw, selectedGwId]);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) {
        return b.totalPoints - a.totalPoints;
      }
      return a.teamName.localeCompare(b.teamName);
    });
  }, [rows]);

  // 🟡 detectar el equipo del usuario logueado
  const myUserId = user?.id || null;
  const myTeam = sortedRows.find((r) => r.userId === myUserId) || null;
  const myPosition = myTeam
    ? sortedRows.findIndex((r) => r.userId === myUserId) + 1
    : null;

  const handleOpenTeamHistory = (row) => {
    navigate(`/fantasy/team/${row.teamId}`, {
      state: {
        teamId: row.teamId,
        teamName: row.teamName,
        ownerName: row.ownerName,
        userId: row.userId,
      },
    });
  };

  const currentFilterLabel =
    selectedGwId === "all"
      ? "todas las jornadas"
      : gameweekOptions.find((gw) => String(gw.id) === String(selectedGwId))
          ?.label || "jornada";

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
            <h1 className="fantasy__title">Ranking Fantasy</h1>
            {myTeam && myPosition ? (
              <p className="fantasy__subtitle">
                Tu equipo <strong>{myTeam.teamName}</strong> está en posición{" "}
                <strong>#{myPosition}</strong> de{" "}
                <strong>{sortedRows.length}</strong> en{" "}
                <strong>{currentFilterLabel}</strong>.
              </p>
            ) : (
              <p className="fantasy__subtitle">
                Clasificación por puntos de{" "}
                <strong>{currentFilterLabel}</strong>.
              </p>
            )}
          </header>

          {loading ? (
            <p className="fantasy__text">Cargando ranking...</p>
          ) : errorMsg ? (
            <p className="fantasy__message fantasy__message--error">
              {errorMsg}
            </p>
          ) : (
            <section className="fantasy__section">
              <div className="fantasy__section-header">
                <h2 className="fantasy__section-title">
                  Clasificación ({sortedRows.length} equipos)
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

              {sortedRows.length === 0 ? (
                <p className="fantasy__text">
                  No hay puntos para esta jornada. Prueba con otra jornada o con{" "}
                  <strong>Todas</strong>.
                </p>
              ) : (
                <div className="fantasy__ranking">
                  <table className="fantasy__ranking-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Equipo</th>
                        <th>Manager</th>
                        <th>Jornadas</th>
                        <th>Puntos totales</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRows.map((r, idx) => {
                        const avg =
                          r.jornadas > 0
                            ? (r.totalPoints / r.jornadas).toFixed(1)
                            : "-";
                        const isMe = r.userId === myUserId;
                        return (
                          <tr
                            key={r.teamId}
                            style={
                              isMe
                                ? {
                                    backgroundColor:
                                      "rgba(250, 204, 21, 0.12)",
                                    fontWeight: "600",
                                  }
                                : undefined
                            }
                          >
                            <td>{idx + 1}</td>
                            <td>{r.teamName}</td>
                            <td>
                              <button
                                type="button"
                                className="fantasy__link-button"
                                onClick={() => handleOpenTeamHistory(r)}
                              >
                                {r.ownerName}
                              </button>
                            </td>
                            <td>{r.jornadas}</td>
                            <td>{r.totalPoints.toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
