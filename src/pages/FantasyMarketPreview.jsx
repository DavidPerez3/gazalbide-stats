import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CURRENT_SEASON_ID } from "../lib/seasons.js";
import { loadFantasyCoaches, loadFantasyMarket, loadFantasyTraitConfig } from "../lib/fantasyMarket.js";

const formatPrice = (value) => value == null
  ? "—"
  : new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(Number(value));

export default function FantasyMarketPreview({ embedded = false }) {
  const navigate = useNavigate();
  const [players, setPlayers] = useState([]);
  const [coaches, setCoaches] = useState([]);
  const [traits, setTraits] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([
      loadFantasyMarket({ seasonId: CURRENT_SEASON_ID }),
      loadFantasyTraitConfig(CURRENT_SEASON_ID),
      loadFantasyCoaches(CURRENT_SEASON_ID),
    ]).then(([market, config, staff]) => {
      if (active) {
        setPlayers([...market].sort((a, b) => Number(b.price || 0) - Number(a.price || 0)));
        setTraits(config);
        setCoaches(staff);
      }
    }).catch((err) => { if (active) setError(err.message || "No se pudo cargar el mercado."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const traitLabels = (codes) => (codes || []).map((code) => traits?.traits?.[code]?.label || code).join(" · ");

  return (
    <div className={embedded ? "" : "container"} style={embedded ? { marginTop: 16 } : { maxWidth: 850, paddingBlock: 20 }}>
      {!embedded && <button type="button" className="fantasy-builder__back" onClick={() => navigate("/fantasy")}>← Volver a Fantasy</button>}
      {embedded ? <h3>Mercado {CURRENT_SEASON_ID}</h3> : <h1>Mercado {CURRENT_SEASON_ID}</h1>}
      <p className="text-dim">Consulta precios y rasgos. La compra y los cambios de alineación se habilitan con una jornada abierta.</p>
      {loading && <p className="text-dim">Cargando mercado…</p>}
      {error ? <p role="alert">No se pudo cargar el mercado: {error}</p> : null}
      {!loading && !error && players.length === 0 && <p className="text-dim">Todavía no hay precios disponibles.</p>}
      <div style={{ display: "grid", gap: 8 }}>
        {players.map((player) => (
          <article key={player.player_id} className="card card--p" style={{ display: "grid", gridTemplateColumns: "45px minmax(0, 1fr) auto", alignItems: "center", gap: 12 }}>
            {player.image ? <img src={player.image} alt="" style={{ width: 45, height: 45, objectFit: "cover", borderRadius: 9 }} /> : null}
            <div style={{ minWidth: 0 }}>
              <strong>#{player.number} · {player.name}</strong>
              <div className="text-dim" style={{ fontSize: ".75rem" }}>{traitLabels(traits?.playerTraitsByPlayerId?.[player.player_id]) || "Sin rasgos"}</div>
            </div>
            <strong style={{ whiteSpace: "nowrap" }}>{formatPrice(player.price)} 🍺</strong>
          </article>
        ))}
      </div>
      {coaches.length > 0 && <>
        <h3 style={{ marginTop: 20 }}>Entrenadores</h3>
        <div style={{ display: "grid", gap: 8 }}>
          {coaches.map((coach) => (
            <article key={coach.id} className="card card--p">
              <strong>{coach.name}</strong>
              <div className="text-dim" style={{ fontSize: ".75rem" }}>{traitLabels(traits?.staffTraitsById?.[coach.id]) || "Sin rasgos"}</div>
            </article>
          ))}
        </div>
      </>}
    </div>
  );
}
