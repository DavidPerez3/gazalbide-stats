import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { fetchGazalBetData, fetchGazalBetRanking, formatCredits, formatDeadline, placeGazalBet, STAKES } from "../lib/gazalbet.js";
import "../gazalbet.css";

const TABS = [["markets", "Apuestas"], ["ranking", "Ranking"], ["history", "Mis apuestas"]];
const STATUS = { pending: "Pendiente", won: "Ganada", lost: "Perdida", void: "Anulada" };

export default function PorraPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState("markets");
  const [data, setData] = useState({ gameweek: null, markets: [], bets: [], wallet: null });
  const [ranking, setRanking] = useState([]);
  const [slip, setSlip] = useState(null);
  const [stake, setStake] = useState(10);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const [nextData, nextRanking] = await Promise.all([fetchGazalBetData(user.id), fetchGazalBetRanking()]);
      setData(nextData);
      setRanking(nextRanking);
    } catch (err) {
      console.error(err);
      setError(err.message || "No se pudo cargar GazalBet.");
    } finally { setLoading(false); }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const betsByMarket = useMemo(() => new Map(data.bets.map((bet) => [bet.market_id, bet])), [data.bets]);
  const gameweekBets = data.gameweek ? data.bets.filter((bet) => bet.gameweek_id === data.gameweek.id) : [];
  const stakedThisWeek = gameweekBets.reduce((sum, bet) => sum + Number(bet.stake), 0);
  const closed = !data.gameweek || Date.now() >= new Date(data.gameweek.deadline).getTime();

  async function confirmBet() {
    if (!slip) return;
    setSaving(true); setError(""); setMessage("");
    try {
      await placeGazalBet({ marketId: slip.market.id, selectionKey: slip.selection.key, stake });
      setMessage(`Apuesta confirmada: ${stake} fichas a cuota ${slip.selection.odds}.`);
      setSlip(null);
      await load();
    } catch (err) {
      const known = err.message?.includes("Maximum 3") ? "Solo puedes hacer 3 apuestas por jornada."
        : err.message?.includes("Maximum 60") ? "El límite es de 60 fichas apostadas por jornada."
          : err.message?.includes("already bet") ? "Ya tienes una apuesta en este mercado."
            : err.message?.includes("Insufficient") ? "No tienes fichas suficientes."
              : err.message || "No se pudo confirmar la apuesta.";
      setError(known);
    } finally { setSaving(false); }
  }

  if (loading) return <div className="gazalbet-page"><div className="gazalbet-loading">Calculando mercados y cuotas…</div></div>;

  return <div className="gazalbet-page">
    <header className="gazalbet-hero">
      <img src={`${import.meta.env.BASE_URL}gazalbet-logo.webp`} alt="GazalBet" />
      <div className="gazalbet-hero__copy"><span>CASA DE APUESTAS VIRTUAL</span><h1>GazalBet</h1><p>Pocas apuestas, creadas automáticamente y solo con fichas virtuales.</p></div>
      <div className="gazalbet-balance"><small>Tu saldo</small><strong>{formatCredits(data.wallet?.balance)} 🪙</strong></div>
    </header>

    <div className="gazalbet-limits"><span>Máximo 3 apuestas</span><span>{formatCredits(stakedThisWeek)}/60 fichas usadas</span><span>Sin combinadas</span></div>
    <nav className="gazalbet-tabs" aria-label="Secciones de GazalBet">{TABS.map(([value, label]) => <button key={value} type="button" className={tab === value ? "active" : ""} onClick={() => setTab(value)}>{label}</button>)}</nav>
    {error && <div className="gazalbet-alert gazalbet-alert--error">{error}</div>}
    {message && <div className="gazalbet-alert gazalbet-alert--ok">{message}</div>}

    {tab === "markets" && <section>
      {data.gameweek ? <div className="gazalbet-event"><div><small>JORNADA {data.gameweek.id}</small><h2>Gazalbide vs {data.gameweek.opponent || "Rival"}</h2></div><div className={closed ? "gazalbet-event__status closed" : "gazalbet-event__status"}>{closed ? "Cerrado" : `Cierra ${formatDeadline(data.gameweek.deadline)}`}</div></div> : <div className="gazalbet-empty">No hay una jornada disponible.</div>}
      <div className="gazalbet-markets">{data.markets.map((market) => {
        const existing = betsByMarket.get(market.id);
        return <article className="gazalbet-market" key={market.id}>
          <div className="gazalbet-market__head"><div><h3>{market.title}</h3><p>{market.subtitle}</p></div><span title="Muestra histórica utilizada">{market.sample_size ? `${market.sample_size} partidos` : "Datos iniciales"}</span></div>
          <div className={`gazalbet-options gazalbet-options--${Math.min(market.selections.length, 3)}`}>{market.selections.map((selection) => {
            const chosen = existing?.selection_key === selection.key;
            const winner = market.status === "settled" && market.winning_key === selection.key;
            return <button key={selection.key} type="button" disabled={closed || market.status !== "open" || Boolean(existing)} className={`${chosen ? "chosen" : ""}${winner ? " winner" : ""}`} onClick={() => setSlip({ market, selection })}><span>{selection.label}</span><strong>{Number(selection.odds).toFixed(2)}</strong></button>;
          })}</div>
          {existing && <p className={`gazalbet-ticket-state ${existing.status}`}>Tu apuesta: {existing.selection_label} · {existing.stake} fichas · {STATUS[existing.status]}</p>}
        </article>;
      })}{data.gameweek && !data.markets.length && <div className="gazalbet-empty">Todavía no hay datos suficientes para generar mercados fiables.</div>}</div>
    </section>}

    {tab === "ranking" && <section className="gazalbet-panel"><h2>Ranking GazalBet</h2><p className="gazalbet-muted">Ordenado por saldo de fichas virtuales.</p><div className="gazalbet-ranking">{ranking.map((item) => <div key={item.user_id} className={item.user_id === user.id ? "me" : ""}><b>{item.position}</b><span>{item.username}</span><strong>{formatCredits(item.balance)} 🪙</strong></div>)}</div></section>}
    {tab === "history" && <section className="gazalbet-panel"><h2>Mis apuestas</h2><div className="gazalbet-history">{data.bets.map((bet) => <article key={bet.id}><div><small>{bet.gazalbet_markets?.title}</small><h3>{bet.selection_label}</h3><span>{new Date(bet.placed_at).toLocaleDateString("es-ES")}</span></div><div className={bet.status}><b>{STATUS[bet.status]}</b><strong>{bet.status === "won" ? `+${formatCredits(bet.payout)}` : `${formatCredits(bet.stake)} 🪙`}</strong></div></article>)}{!data.bets.length && <div className="gazalbet-empty">Aún no has hecho ninguna apuesta.</div>}</div></section>}

    {slip && <div className="gazalbet-slip-backdrop" role="presentation" onClick={() => !saving && setSlip(null)}><aside className="gazalbet-slip" role="dialog" aria-modal="true" aria-label="Cupón de apuesta" onClick={(event) => event.stopPropagation()}>
      <button className="gazalbet-slip__close" type="button" onClick={() => setSlip(null)}>×</button><small>CUPÓN SIMPLE</small><h2>{slip.market.title}</h2><p>{slip.selection.label} <strong>@ {Number(slip.selection.odds).toFixed(2)}</strong></p>
      <label>Fichas</label><div className="gazalbet-stakes">{STAKES.map((value) => <button type="button" className={stake === value ? "active" : ""} onClick={() => setStake(value)} key={value}>{value}</button>)}</div>
      <div className="gazalbet-return"><span>Retorno posible</span><strong>{formatCredits(stake * Number(slip.selection.odds))} 🪙</strong></div>
      <button className="gazalbet-confirm" type="button" disabled={saving} onClick={confirmBet}>{saving ? "Confirmando…" : "Confirmar apuesta"}</button>
      <p className="gazalbet-responsible">Solo fichas virtuales. No tienen valor económico ni se convierten en cervezas Fantasy.</p>
    </aside></div>}
  </div>;
}
