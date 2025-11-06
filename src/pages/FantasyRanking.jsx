import React, { useEffect, useState, useMemo } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient.js";
import { useNavigate } from "react-router-dom";

export default function FantasyRanking() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const navigate = useNavigate();

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
          setRows([]);
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
          setRows([]);
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

        // 5) Cargar stats
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
                map.set(n, row.pir);
              }
            }
            statsByGw.set(gw.id, map);
          } catch (e) {
            console.error("Error cargando stats para ranking:", e);
          }
        }

        // 6) Acumular puntos por equipo
        const teamRowMap = new Map();
        for (const team of teams) {
          const owner = userMap.get(team.user_id) || null;
          teamRowMap.set(team.id, {
            teamId: team.id,
            teamName: team.name || "Equipo sin nombre",
            ownerName:
              owner?.username || owner?.email?.split("@")[0] || "Anónimo",
            totalPoints: 0,
            jornadas: 0,
            userId: team.user_id,
          });
        }

        for (const lineup of lineups) {
          const row = teamRowMap.get(lineup.fantasy_team_id);
          if (!row) continue;

          const gw = gwMap.get(lineup.gameweek_id);
          if (!gw) continue;

          const statsMap = statsByGw.get(gw.id);
          if (!statsMap) continue;

          const nums = (lineup.players || [])
            .map((n) => Number(n))
            .filter((n) => !Number.isNaN(n));
          if (nums.length === 0) continue;

          let points = 0;
          for (const num of nums) {
            const pir = statsMap.get(num);
            if (typeof pir === "number") points += pir;
          }

          row.totalPoints += points;
          row.jornadas += 1;
        }

        const rowsArr = Array.from(teamRowMap.values());
        setRows(rowsArr);
      } catch (err) {
        console.error("Error cargando ranking Fantasy:", err);
        setErrorMsg("No se ha podido cargar el ranking de Fantasy.");
      } finally {
        setLoading(false);
      }
    }

    loadRanking();
  }, [user, BASE]);

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
                <strong>{sortedRows.length}</strong>.
              </p>
            ) : (
              <p className="fantasy__subtitle">
                Clasificación acumulada por puntos de todas las jornadas.
              </p>
            )}
          </header>

          {loading ? (
            <p className="fantasy__text">Cargando ranking...</p>
          ) : errorMsg ? (
            <p className="fantasy__message fantasy__message--error">
              {errorMsg}
            </p>
          ) : sortedRows.length === 0 ? (
            <p className="fantasy__text">
              Todavía no hay puntos registrados en Fantasy.
            </p>
          ) : (
            <section className="fantasy__section">
              <h2 className="fantasy__section-title">
                Clasificación ({sortedRows.length} equipos)
              </h2>

              <div className="fantasy__ranking">
                <table className="fantasy__ranking-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Equipo</th>
                      <th>Manager</th>
                      <th>Jornadas</th>
                      <th>Puntos totales</th>
                      <th>Media / jornada</th>
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
                                  backgroundColor: "rgba(250, 204, 21, 0.12)",
                                  fontWeight: "600",
                                }
                              : undefined
                          }
                        >
                          <td>
                            {idx + 1}
                            {isMe && (
                              <span
                                style={{
                                  marginLeft: 8,
                                  fontSize: 11,
                                  padding: "2px 6px",
                                  borderRadius: 999,
                                  background: "var(--color-gold)",
                                  color: "#000",
                                  fontWeight: 600,
                                }}
                              >
                                Tu equipo
                              </span>
                            )}
                          </td>
                          <td>{r.teamName}</td>
                          <td>{r.ownerName}</td>
                          <td>{r.jornadas}</td>
                          <td>{r.totalPoints}</td>
                          <td>{avg}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
