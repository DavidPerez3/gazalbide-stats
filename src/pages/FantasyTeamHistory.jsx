import React, { useEffect, useMemo, useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient.js";

export default function FantasyTeamHistory() {
  const { teamId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const BASE = import.meta.env.BASE_URL || "/";

  const passedState = location.state || {};
  const fallbackTeamName = passedState.teamName || "Equipo sin nombre";
  const fallbackOwnerName = passedState.ownerName || "Manager";

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [selectedGwId, setSelectedGwId] = useState("all");
  const [teamName, setTeamName] = useState(fallbackTeamName);

  useEffect(() => {
    if (!teamId) return;

    async function loadHistory() {
      setLoading(true);
      setErrorMsg(null);

      try {
        // 0) Intentamos cargar el nombre del equipo desde la BD (por si no viene en state)
        const { data: teamData, error: teamError } = await supabase
          .from("fantasy_teams")
          .select("id, name")
          .eq("id", teamId)
          .maybeSingle();

        if (!teamError && teamData && teamData.name) {
          setTeamName(teamData.name);
        }

        // 1) Lineups de este equipo
        const { data: lineups, error: lineupError } = await supabase
          .from("fantasy_lineups")
          .select("*")
          .eq("fantasy_team_id", teamId);

        if (lineupError) throw lineupError;
        if (!lineups || lineups.length === 0) {
          setEntries([]);
          setLoading(false);
          return;
        }

        // 2) Gameweeks asociados
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

        // 3) Stats de cada jornada
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
                map.set(num, row);
              }
            }
            statsByGw.set(gw.id, map);
          } catch (e) {
            console.error("Error cargando stats de", url, e);
          }
        }

        // 4) Construir entries
        const newEntries = [];

        for (const lineup of lineups) {
          const gw = gwMap.get(lineup.gameweek_id);
          if (!gw) continue;

          const statsMap = statsByGw.get(gw.id);
          const playersNums = (lineup.players || [])
            .map((n) => Number(n))
            .filter((n) => !Number.isNaN(n));

          const playersDetailed = playersNums.map((num) => {
            const s = statsMap ? statsMap.get(num) : null;
            return {
              number: num,
              name: s?.name || `#${num}`,
              pir: typeof s?.pir === "number" ? s.pir : null,
            };
          });

          const totalPoints = playersDetailed.reduce(
            (acc, p) => acc + (p.pir || 0),
            0
          );

          newEntries.push({
            id: lineup.id,
            gameweekId: gw.id,
            gameweekName: gw.name || `Jornada ${gw.id}`,
            gameweekDate: gw.date || null,
            opponent: gw.opponent || null,
            players: playersDetailed,
            totalPoints,
          });
        }

        newEntries.sort((a, b) => {
          if (a.gameweekDate && b.gameweekDate) {
            return new Date(a.gameweekDate) - new Date(b.gameweekDate);
          }
          return a.gameweekName.localeCompare(b.gameweekName);
        });

        setEntries(newEntries);
      } catch (err) {
        console.error("Error cargando historial del equipo:", err);
        setErrorMsg("No se ha podido cargar el historial de este equipo.");
      } finally {
        setLoading(false);
      }
    }

    loadHistory();
  }, [teamId, BASE]);

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

  const filteredEntries =
    selectedGwId === "all"
      ? entries
      : entries.filter((e) => String(e.gameweekId) === String(selectedGwId));

  const ownerName = fallbackOwnerName;

  return (
    <div className="fantasy">
      <div className="container">
        <div className="fantasy__card">
          <header className="fantasy__header">
            <button
              type="button"
              className="fantasy-builder__back"
              onClick={() => navigate(-1)}
            >
              ← Volver
            </button>

            <h1 className="fantasy__title">Historial de equipo</h1>
            <p className="fantasy__subtitle">
              <strong>{teamName}</strong> · Manager:{" "}
              <strong>{ownerName}</strong>
            </p>
          </header>

          {loading ? (
            <p className="fantasy__text">Cargando historial...</p>
          ) : errorMsg ? (
            <p className="fantasy__message fantasy__message--error">
              {errorMsg}
            </p>
          ) : entries.length === 0 ? (
            <p className="fantasy__text">
              Este equipo todavía no tiene quintetos registrados.
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
                        <strong>{e.totalPoints.toFixed(1)}</strong>
                      </p>
                    </div>
                    <table className="fantasy__ranking-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Jugador</th>
                          <th>PIR</th>
                        </tr>
                      </thead>
                      <tbody>
                        {e.players.map((p) => (
                          <tr key={p.number}>
                            <td>{p.number}</td>
                            <td>{p.name}</td>
                            <td>
                              {p.pir !== null && p.pir !== undefined
                                ? p.pir
                                : "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
