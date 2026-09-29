import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchGazalBetAdmin, formatDeadline, voidGazalBetMarket } from "../lib/gazalbet.js";
import "../gazalbet.css";

export default function AdminPorraPage() {
  const navigate = useNavigate();
  const [markets, setMarkets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setMarkets(await fetchGazalBetAdmin()); }
    catch (err) { setError(err.message || "No se pudo cargar GazalBet."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function handleVoid(market) {
    if (!window.confirm(`¿Anular “${market.title}” y devolver todas sus fichas?`)) return;
    try { await voidGazalBetMarket(market.id); await load(); }
    catch (err) { setError(err.message || "No se pudo anular el mercado."); }
  }

  return <div className="gazalbet-page">
    <button type="button" className="porra-back" onClick={() => navigate("/admin")}>← Volver a Admin</button>
    <header className="gazalbet-hero">
      <img src={`${import.meta.env.BASE_URL}gazalbet-logo.webp`} alt="GazalBet" />
      <div className="gazalbet-hero__copy"><span>ADMIN · SUPERVISIÓN</span><h1>GazalBet</h1><p>Los mercados, cuotas, cierres y resultados son automáticos. Aquí solo puedes revisar o anular una incidencia.</p></div>
    </header>
    {error && <div className="gazalbet-alert gazalbet-alert--error">{error}</div>}
    <section className="gazalbet-panel">
      <h2>Mercados generados</h2>
      <p className="gazalbet-muted">No necesitas crear nada. Cada jornada recibe un máximo de seis mercados al visitarse por primera vez.</p>
      {loading ? <div className="gazalbet-loading">Cargando supervisión…</div> : <div className="gazalbet-admin-list">{markets.map((market) => {
        const volume = (market.gazalbet_bets || []).reduce((sum, bet) => sum + Number(bet.stake), 0);
        return <article className="gazalbet-admin-market" key={market.id}><div><small>{market.gameweeks?.name || `Jornada ${market.gameweek_id}`} · {formatDeadline(market.gameweeks?.deadline)}</small><h3>{market.title}</h3><span>{market.status.toUpperCase()} · Modelo {market.confidence}% · {(market.gazalbet_bets || []).length} apuestas · {volume} fichas</span></div>{["open", "closed"].includes(market.status) && <button type="button" onClick={() => handleVoid(market)}>Anular y devolver</button>}</article>;
      })}{!markets.length && <div className="gazalbet-empty">Aún no se ha generado ninguna jornada GazalBet.</div>}</div>}
    </section>
  </div>;
}
