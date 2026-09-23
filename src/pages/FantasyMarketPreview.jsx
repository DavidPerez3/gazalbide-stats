import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CURRENT_SEASON_ID } from "../lib/seasons.js";
import { loadFantasyMarket, loadFantasyTraitConfig } from "../lib/fantasyMarket.js";

export default function FantasyMarketPreview() {
  const navigate = useNavigate();
  const [players, setPlayers] = useState([]);
  const [traits, setTraits] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      loadFantasyMarket({ seasonId: CURRENT_SEASON_ID }),
      loadFantasyTraitConfig(CURRENT_SEASON_ID),
    ]).then(([market, config]) => {
      if (active) { setPlayers([...market].sort((a, b) => Number(b.price || 0) - Number(a.price || 0))); setTraits(config); }
    }).catch((err) => { if (active) setError(err.message || "No se pudo cargar el mercado."); });
    return () => { active = false; };
  }, []);

  return (
    <div className="container" style={{ maxWidth: 850, paddingBlock: 20 }}>
      <button type="button" className="fantasy-builder__back" onClick={() => navigate("/fantasy")}>← Volver a Fantasy</button>
      <h1>Mercado {CURRENT_SEASON_ID}</h1>
      <p className="text-dim">Consulta precios y rasgos. La compra y los cambios de alineación se habilitan con una jornada abierta.</p>
      {error ? <p role="alert">{error}</p> : null}
      <div style={{ display: "grid", gap: 8 }}>
        {players.map((player) => (
          <article key={player.player_id} className="card card--p" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {player.image ? <img src={player.image} alt="" style={{ width: 45, height: 45, objectFit: "cover", borderRadius: 9 }} /> : null}
            <strong style={{ flex: 1 }}>#{player.number} · {player.name}</strong>
            <span className="text-dim">{(traits?.playerTraitsByPlayerId?.[player.player_id] || []).join(" · ")}</span>
            <strong>{player.price ?? "—"} 🍺</strong>
          </article>
        ))}
      </div>
    </div>
  );
}
