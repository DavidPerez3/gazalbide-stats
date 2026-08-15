import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { CURRENT_SEASON_ID } from "../lib/seasons.js";

function signed(value) {
  const n = Number(value || 0);
  return n > 0 ? `+${n}` : `${n}`;
}

export default function FantasyPriceProposalPanel({ marketPlayers, setPriceDrafts }) {
  const [latestMatch, setLatestMatch] = useState(null);
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState(null);

  const playerById = useMemo(
    () => new Map((marketPlayers || []).map((player) => [Number(player.player_id), player])),
    [marketPlayers]
  );

  async function loadProposals(match) {
    if (!match) {
      setProposals([]);
      return;
    }

    const { data, error } = await supabase
      .from("fantasy_price_proposals")
      .select("*")
      .eq("season_id", CURRENT_SEASON_ID)
      .eq("source_match_id", match.id)
      .order("proposed_price", { ascending: false });

    if (error) throw error;
    setProposals(data || []);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const { data: match, error } = await supabase
          .from("matches")
          .select("id, date, opponent, status")
          .eq("season", CURRENT_SEASON_ID)
          .eq("status", "published")
          .order("date", { ascending: false })
          .order("id", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) throw error;
        if (cancelled) return;
        setLatestMatch(match || null);
        if (match) await loadProposals(match);
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
    if (!latestMatch || generating) return;
    setGenerating(true);
    setMessage(null);

    try {
      const { error } = await supabase.rpc("generate_fantasy_price_proposals", {
        p_season_id: CURRENT_SEASON_ID,
        p_match_id: latestMatch.id,
      });
      if (error) throw error;
      await loadProposals(latestMatch);
      setMessage("Propuesta recalculada. Revísala antes de copiarla al editor.");
    } catch (error) {
      console.error("Error generando precios Fantasy:", error);
      setMessage(error.message || "No se ha podido generar la propuesta.");
    } finally {
      setGenerating(false);
    }
  }

  function useAllProposals() {
    setPriceDrafts((current) => {
      const next = { ...current };
      for (const row of proposals) {
        next[row.player_id] = row.proposed_price;
      }
      return next;
    });
    setMessage("Propuestas copiadas al editor. Puedes corregir cualquier precio antes de guardar.");
  }

  function useOneProposal(row) {
    setPriceDrafts((current) => ({
      ...current,
      [row.player_id]: row.proposed_price,
    }));
  }

  const cheapestFive = useMemo(() => {
    if (proposals.length < 5) return null;
    return proposals
      .map((row) => Number(row.proposed_price))
      .sort((a, b) => a - b)
      .slice(0, 5)
      .reduce((sum, value) => sum + value, 0);
  }, [proposals]);

  if (loading) {
    return <p className="admin__text">Cargando evolución automática de precios...</p>;
  }

  if (!latestMatch) {
    return (
      <div className="admin__list-item" style={{ padding: "0.75rem", marginBottom: "0.75rem" }}>
        <strong>Evolución automática</strong>
        <p className="admin__text" style={{ marginBottom: 0 }}>
          Se habilitará cuando exista el primer partido publicado de {CURRENT_SEASON_ID}.
        </p>
      </div>
    );
  }

  return (
    <div className="admin__list-item" style={{ padding: "0.8rem", marginBottom: "0.85rem" }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "0.65rem", alignItems: "center" }}>
        <div>
          <strong>Evolución automática · {latestMatch.date}</strong>
          <div className="admin__text" style={{ margin: "0.2rem 0 0" }}>
            {latestMatch.opponent ? `vs ${latestMatch.opponent}` : latestMatch.id}
          </div>
        </div>
        <button type="button" className="admin__button" onClick={generate} disabled={generating}>
          {generating ? "Calculando..." : proposals.length ? "Recalcular propuesta" : "Calcular propuesta"}
        </button>
      </div>

      {message ? <p className="admin__text">{message}</p> : null}

      {proposals.length > 0 ? (
        <>
          <p className="admin__text" style={{ marginTop: "0.7rem" }}>
            Jornada 40% · últimos 3 partidos 35% · temporada 25% · cambio máximo ±2 🍺 (±1 en las 3 primeras apariciones).
            {cheapestFive != null ? ` Cinco más baratos: ${cheapestFive} 🍺.` : ""}
          </p>

          <div style={{ overflowX: "auto" }}>
            <table className="fantasy__ranking-table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Jugador</th>
                  <th>Ant.</th>
                  <th>J</th>
                  <th>Rec.</th>
                  <th>Temp.</th>
                  <th>Prop.</th>
                  <th>Δ</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {proposals.map((row) => {
                  const player = playerById.get(Number(row.player_id));
                  const delta = Number(row.proposed_price) - Number(row.previous_price);
                  return (
                    <tr key={row.id}>
                      <td>{player?.name || `#${row.player_id}`}</td>
                      <td>{row.previous_price}</td>
                      <td>{row.game_pir ?? "-"}</td>
                      <td>{row.recent_pir ?? "-"}</td>
                      <td>{row.season_pir ?? "-"}</td>
                      <td><strong>{row.proposed_price}</strong></td>
                      <td>{signed(delta)}</td>
                      <td>
                        <button type="button" onClick={() => useOneProposal(row)}>
                          Usar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <button type="button" className="admin__button" style={{ marginTop: "0.75rem" }} onClick={useAllProposals}>
            Copiar todas al editor
          </button>
        </>
      ) : null}
    </div>
  );
}
