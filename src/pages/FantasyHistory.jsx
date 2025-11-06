import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient.js";
import { useNavigate } from "react-router-dom";

export default function FantasyHistory() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [entries, setEntries] = useState([]);
  const navigate = useNavigate();

  const BASE = import.meta.env.BASE_URL || "/";

  useEffect(() => {
    if (!user) return;

    async function loadHistory() {
      setLoading(true);
      setErrorMsg(null);

      try {
        const { data: team, error: teamError } = await supabase
          .from("fantasy_teams")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();

        if (teamError) throw teamError;
        if (!team) {
          setEntries([]);
          setLoading(false);
          return;
        }

        const { data: lineups, error: lineupError } = await supabase
          .from("fantasy_lineups")
          .select("*")
          .eq("fantasy_team_id", team.id)
          .order("gameweek_id", { ascending: false });

        if (lineupError) throw lineupError;
        if (!lineups || lineups.length === 0) {
          setEntries([]);
          setLoading(false);
          return;
        }

        const gwIds = [
          ...new Set(
            lineups.map((l) => l.gameweek_id).filter((id) => id != null)
          ),
        ];

        let gameweeks = [];
        if (gwIds.length > 0) {
          const { data: gwData, error: gwError } = await supabase
            .from("gameweeks")
            .select("*")
            .in("id", gwIds);
          if (gwError) throw gwError;
          gameweeks = gwData || [];
        }

        const gwMap = new Map(gameweeks.map((g) => [g.id, g]));

        const playersRes = await fetch(`${BASE}data/fantasy_players.json`);
        if (!playersRes.ok)
          throw new Error("No se ha podido cargar fantasy_players.json");
        const fantasyPlayers = await playersRes.json();
        const fpByNumber = new Map();
        for (const p of fantasyPlayers) {
          const raw = p.number ?? p.dorsal;
          const num = Number(raw);
          if (!Number.isNaN(num)) fpByNumber.set(num, p);
        }

        const statsByGw = new Map();
        for (const gw of gameweeks) {
          if (!gw.stats_file) continue;
          const file = String(gw.stats_file).trim().replace(/\s+/g, "");
          if (!file) continue;
          const url = `${BASE}data/player_stats/${file}`;
          try {
            const res = await fetch(url);
            if (!res.ok) continue;
            const stats = await res.json();
            const map = new Map();
            for (const row of stats) {
              const n = Number(row.number);
              if (!Number.isNaN(n)) map.set(n, row);
            }
            statsByGw.set(gw.id, map);
          } catch (e) {
            console.error("Error cargando stats para historial:", e);
          }
        }

        const result = lineups.map((lineup) => {
          const gw = gwMap.get(lineup.gameweek_id) || null;
          const nums = (lineup.players || [])
            .map((n) => Number(n))
            .filter((n) => !Number.isNaN(n));
          const statsMap = gw ? statsByGw.get(gw.id) : null;
          let totalPoints = 0;
          let hasAnyPoints = false;

          const players = nums.map((num) => {
            const basePlayer = fpByNumber.get(num) || {
              number: num,
              name: `#${num}`,
              price: 0,
            };
            let fantasyPoints = null;
            if (statsMap) {
              const row = statsMap.get(num);
              if (row && typeof row.pir === "number") {
                fantasyPoints = row.pir;
                hasAnyPoints = true;
                totalPoints += row.pir;
              }
            }
            return { ...basePlayer, fantasyPoints };
          });

          if (!hasAnyPoints) totalPoints = null;

          return {
            id: lineup.id,
            created_at: lineup.created_at,
            gameweek: gw,
            players,
            totalPoints,
          };
        });

        setEntries(result);
      } catch (err) {
        console.error("Error cargando historial Fantasy:", err);
        setErrorMsg("No se ha podido cargar el historial de Fantasy.");
      } finally {
        setLoading(false);
      }
    }

    loadHistory();
  }, [user, BASE]);

  const username =
    profile?.username || user?.email?.split("@")[0] || "usuario";

  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => {
      const da = a.gameweek?.date || "";
      const db = b.gameweek?.date || "";
      return db.localeCompare(da);
    });
  }, [entries]);

  const renderPlayerCard = (p) => (
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
          #{p.number} {p.name}
        </h3>
        <p>
          {p.price} 🍺 · PIR medio {p.pir_avg?.toFixed?.(1) ?? p.pir_avg ?? "-"}
        </p>
        <p>
          Puntos jornada:{" "}
          {typeof p.fantasyPoints === "number" ? p.fantasyPoints : "–"}
        </p>
      </div>
    </div>
  );

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
            <h1 className="fantasy__title">Historial Fantasy</h1>
            <p className="fantasy__subtitle">
              Aquí puedes ver cuántos puntos has hecho cada jornada y con qué
              quinteto, <strong>{username}</strong>.
            </p>
          </header>

          {loading ? (
            <p className="fantasy__text">Cargando historial...</p>
          ) : errorMsg ? (
            <p className="fantasy__message fantasy__message--error">
              {errorMsg}
            </p>
          ) : sortedEntries.length === 0 ? (
            <p className="fantasy__text">
              Todavía no tienes ninguna jornada jugada en Fantasy.
            </p>
          ) : (
            <section className="fantasy__section">
              <h2 className="fantasy__section-title">
                Jornadas jugadas ({sortedEntries.length})
              </h2>
              <div className="fantasy__history-list">
                {sortedEntries.map((entry) => {
                  const gw = entry.gameweek;
                  const title =
                    gw?.name ||
                    (gw
                      ? `Gameweek #${gw.id}`
                      : `Jornada (id lineup ${entry.id})`);
                  const subtitle = gw
                    ? `${gw.date || ""}${
                        gw.opponent ? ` · vs ${gw.opponent}` : ""
                      }`
                    : "";
                  return (
                    <article
                      key={entry.id}
                      className="fantasy__history-item"
                    >
                      <header className="fantasy__history-header">
                        <div>
                          <div className="fantasy__gw-title">{title}</div>
                          {subtitle && (
                            <div className="fantasy__gw-sub">{subtitle}</div>
                          )}
                        </div>
                        <div className="fantasy__history-meta">
                          <span className="fantasy__badge fantasy__badge--points" style={{ marginTop: 16 }}>
                            {entry.totalPoints != null
                              ? `Puntos: ${entry.totalPoints}`
                              : "Puntos: –"}
                          </span>
                        </div>
                      </header>

                      {/* Quinteto 3+2 */}
                      {entry.players.length === 5 ? (
                        <div className="fantasy__lineup-pyramid">
                          <div className="fantasy__lineup-row fantasy__lineup-row--top">
                            {entry.players.slice(0, 3).map(renderPlayerCard)}
                          </div>
                          <div className="fantasy__lineup-row fantasy__lineup-row--bottom">
                            {entry.players.slice(3).map(renderPlayerCard)}
                          </div>
                        </div>
                      ) : (
                        <div className="fantasy__lineup-grid fantasy__lineup-grid--history">
                          {entry.players.map(renderPlayerCard)}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
