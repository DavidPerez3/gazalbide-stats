import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { CURRENT_SEASON_ID } from "../lib/seasons.js";
import { loadFantasyMarket } from "../lib/fantasyMarket.js";

function signed(value) {
  const n = Number(value || 0);
  return n > 0 ? `+${n}` : `${n}`;
}

export default function FantasyPriceProposalPanel() {
  const [marketPlayers, setMarketPlayers] = useState([]);
  const [latestMatch, setLatestMatch] = useState(null);
  const [proposals, setProposals] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState(null);

  const playerById = useMemo(
    () => new Map(marketPlayers.map((player) => [Number(player.player_id), player])),
    [marketPlayers]
  );

  const proposalApplied = useMemo(
    () => proposals.length > 0 && proposals.every((row) => row.status === "applied"),
    [proposals]
  );

  async function loadProposals(match) {
    if (!match) {
      setProposals([]);
      setDrafts({});
      return;
    }

    const { data, error } = await supabase
      .from("fantasy_price_proposals")
      .select("*")
      .eq("season_id", CURRENT_SEASON_ID)
      .eq("source_match_id", match.id)
      .order("proposed_price", { ascending: false });

    if (error) throw error;
    const rows = data || [];
    setProposals(rows);
    setDrafts(
      Object.fromEntries(
        rows.map((row) => [
          row.player_id,
          Number(row.reviewed_price ?? row.proposed_price),
        ])
      )
    );
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [players, matchResult] = await Promise.all([
          loadFantasyMarket({ seasonId: CURRENT_SEASON_ID }),
          supabase
            .from("matches")
            .select("id, date, opponent, status")
            .eq("season", CURRENT_SEASON_ID)
            .eq("status", "published")
            .order("date", { ascending: false })
            .order("id", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

        if (matchResult.error) throw matchResult.error;
        if (cancelled) return;

        setMarketPlayers(players || []);
        setLatestMatch(matchResult.data || null);
        if (matchResult.data) await loadProposals(matchResult.data);
      } catch (error) {
        console.error("Error cargando propuestas de precios:", error);
        if (!cancelled) setMessage("No se han podido cargar las propuestas de precios.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function generate() {
    if (!latestMatch || generating || proposalApplied) return;
    setGenerating(true);
    setMessage(null);

    try {
      const { error } = await supabase.rpc("generate_fantasy_price_proposals", {
        p_season_id: CURRENT_SEASON_ID,
        p_match_id: latestMatch.id,
      });
      if (error) throw error;
      await loadProposals(latestMatch);
      setMessage("Propuesta recalculada. Corrige cualquier precio antes de aplicarla.");
    } catch (error) {
      console.error("Error generando precios Fantasy:", error);
      setMessage(error.message || "No se ha podido generar la propuesta.");
    } finally {
      setGenerating(false);
    }
  }

  async function applyReviewed() {
    if (!latestMatch || proposals.length === 0 || applying || proposalApplied) return;
    setApplying(true);
    setMessage(null);

    try {
      const prices = Object.fromEntries(
        proposals.map((row) => [row.player_id, Number(drafts[row.player_id])])
      );
      const { error } = await supabase.rpc("apply_fantasy_price_review", {
        p_season_id: CURRENT_SEASON_ID,
        p_match_id: latestMatch.id,
        p_prices: prices,
      });
      if (error) throw error;

      // AdminPage below this panel owns a separate market-price state. Reloading
      // after an atomic apply prevents that stale editor from restoring old prices.
      window.location.reload();
    } catch (error) {
      console.error("Error aplicando precios Fantasy:", error);
      setMessage(error.message || "No se han podido aplicar los precios revisados.");
    } finally {
      setApplying(false);
    }
  }

  const reviewedCheapestFive = useMemo(() => {
    if (proposals.length < 5) return null;
    return proposals
      .map((row) => Number(drafts[row.player_id]))
      .filter((value) => Number.isFinite(value) && value >= 8)
      .sort((a, b) => a - b)
      .slice(0, 5)
      .reduce((sum, value) => sum + value, 0);
  }, [proposals, drafts]);

  if (loading) {
    return <p className="admin__text">Cargando evolución automática de precios...</p>;
  }

  return (
    <section className="admin__section">
      <h2 className="admin__section-title">Evolución automática de precios</h2>

      {!latestMatch ? (
        <p className="admin__text">
          Se habilitará cuando exista el primer partido publicado de {CURRENT_SEASON_ID}.
          Los precios iniciales siguen gestionándose en el editor manual inferior.
        </p>
      ) : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "0.65rem", alignItems: "center" }}>
            <div>
              <strong>{latestMatch.date}</strong>
              <span className="admin__text"> {latestMatch.opponent ? `· vs ${latestMatch.opponent}` : `· ${latestMatch.id}`}</span>
            </div>
            <button type="button" className="admin__button" onClick={generate} disabled={generating || applying || proposalApplied}>
              {proposalApplied
                ? "Propuesta aplicada"
                : generating
                  ? "Calculando..."
                  : proposals.length
                    ? "Recalcular propuesta"
                    : "Calcular propuesta"}
            </button>
          </div>

          <p className="admin__text" style={{ marginTop: "0.7rem" }}>
            Jornada 40% · últimos 3 partidos 35% · temporada 25% · precio anterior con inercia · máximo ±2 🍺 por jornada (±1 en las 3 primeras apariciones).
          </p>

          {proposals.length > 0 ? (
            <>
              <div style={{ overflowX: "auto" }}>
                <table className="fantasy__ranking-table" style={{ width: "100%" }}>
                  <thead>
                    <tr>
                      <th>Jugador</th>
                      <th>Anterior</th>
                      <th>J</th>
                      <th>Rec.</th>
                      <th>Temp.</th>
                      <th>Propuesta</th>
                      <th>Δ</th>
                      <th>Revisado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proposals.map((row) => {
                      const player = playerById.get(Number(row.player_id));
                      const delta = Number(row.proposed_price) - Number(row.previous_price);
                      return (
                        <tr key={row.id}>
                          <td>{player?.name || `#${row.player_id}`}</td>
                          <td>{row.previous_price} 🍺</td>
                          <td>{row.game_pir ?? "-"}</td>
                          <td>{row.recent_pir ?? "-"}</td>
                          <td>{row.season_pir ?? "-"}</td>
                          <td><strong>{row.proposed_price} 🍺</strong></td>
                          <td>{signed(delta)}</td>
                          <td>
                            <input
                              type="number"
                              min="8"
                              max="30"
                              step="1"
                              className="admin__input"
                              style={{ width: 72, textAlign: "center" }}
                              value={drafts[row.player_id] ?? ""}
                              disabled={proposalApplied}
                              onChange={(event) =>
                                setDrafts((current) => ({
                                  ...current,
                                  [row.player_id]: event.target.value,
                                }))
                              }
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <p className="admin__text">
                Cinco más baratos revisados: <strong>{reviewedCheapestFive ?? "-"} 🍺</strong> · límite con presupuesto base 80: <strong>64 🍺</strong>.
              </p>

              {!proposalApplied ? (
                <button type="button" className="admin__button" onClick={applyReviewed} disabled={applying || generating}>
                  {applying ? "Aplicando..." : "Aplicar precios revisados"}
                </button>
              ) : (
                <p className="admin__message admin__message--success">
                  Precios de este partido ya aplicados al mercado. Las jornadas anteriores conservan su snapshot.
                </p>
              )}
            </>
          ) : null}
        </>
      )}

      {message ? <p className="admin__text" style={{ marginTop: "0.65rem" }}>{message}</p> : null}
    </section>
  );
}
