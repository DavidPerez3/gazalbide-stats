import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { fetchGazalBetBuilder, fetchGazalBetData, fetchGazalBetRanking, formatCredits, formatDeadline, placeGazalBetSingles, placeGazalBetTicket, quoteGazalBetPlayerLine, STAKES } from "../lib/gazalbet.js";
import "../gazalbet.css";

const TABS = [["markets", "Apuestas"], ["ranking", "Ranking"], ["history", "Mis apuestas"]];
const STATUS = { pending: "Pendiente", won: "Ganada", lost: "Perdida", void: "Anulada" };
const keyOf = (leg) => leg.type === "market" ? `m:${leg.market_id}:${leg.selection_key}` : `p:${leg.player_id}:${leg.stat_key}:${leg.direction}:${leg.line}`;

export default function PorraPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState("markets");
  const [data, setData] = useState({ gameweek: null, markets: [], bets: [], tickets: [], wallet: null });
  const [ranking, setRanking] = useState([]);
  const [builder, setBuilder] = useState(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [playerId, setPlayerId] = useState("");
  const [statKey, setStatKey] = useState("pts");
  const [direction, setDirection] = useState("over");
  const [line, setLine] = useState(10.5);
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [selections, setSelections] = useState([]);
  const [slipOpen, setSlipOpen] = useState(false);
  const [ticketMode, setTicketMode] = useState("accumulator");
  const [stake, setStake] = useState(5);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError("");
    try {
      const [next, nextRanking] = await Promise.all([fetchGazalBetData(user.id), fetchGazalBetRanking()]);
      setData(next); setRanking(nextRanking);
      if (next.gameweek) setBuilder(await fetchGazalBetBuilder(next.gameweek.id));
    } catch (err) { setError(err.message || "No se pudo cargar GazalBet."); }
    finally { setLoading(false); }
  }, [user]);
  useEffect(() => { load(); }, [load]);

  const selectedPlayer = builder?.players?.find((p) => String(p.id) === String(playerId));
  useEffect(() => {
    if (selectedPlayer) setLine(Math.floor(Number(selectedPlayer.averages?.[statKey] || 0)) + .5);
  }, [playerId, statKey]);
  useEffect(() => {
    if (!data.gameweek || !playerId) { setQuote(null); return; }
    let active = true; setQuoteLoading(true);
    const timer = setTimeout(async () => {
      try {
        const next = await quoteGazalBetPlayerLine({ gameweekId: data.gameweek.id, playerId: Number(playerId), statKey, direction, line });
        if (active) setQuote(next);
      } catch { if (active) setQuote(null); }
      finally { if (active) setQuoteLoading(false); }
    }, 180);
    return () => { active = false; clearTimeout(timer); };
  }, [data.gameweek, playerId, statKey, direction, line]);

  const weekBets = data.gameweek ? data.bets.filter((b) => b.gameweek_id === data.gameweek.id) : [];
  const weekTickets = data.gameweek ? data.tickets.filter((t) => t.gameweek_id === data.gameweek.id) : [];
  const used = [...weekBets, ...weekTickets].reduce((sum, item) => sum + Number(item.stake), 0);
  const remaining = Math.max(0, 60 - used);
  const closed = !data.gameweek || Date.now() >= new Date(data.gameweek.deadline).getTime();
  const combinedOdds = Math.min(100, selections.reduce((total, leg) => total * Number(leg.odds), 1));
  const totalStake = ticketMode === "singles" ? stake * selections.length : stake;

  function add(leg) {
    setSelections((current) => current.some((item) => keyOf(item) === keyOf(leg)) ? current : [...current, leg]);
    setSlipOpen(true); setError("");
  }
  function addProp() {
    if (!quote) return;
    add({ type: "player_prop", player_id: quote.player_id, stat_key: quote.stat_key, direction: quote.direction, line: Number(quote.line), odds: Number(quote.odds), label: quote.label });
    setBuilderOpen(false);
  }
  async function confirm() {
    if (!selections.length || !data.gameweek) return;
    if (totalStake > remaining) { setError(`Solo te quedan ${remaining} fichas del límite de esta jornada.`); return; }
    const related = ticketMode === "accumulator" && selections.some((leg, i) => leg.type === "player_prop" && selections.findIndex((other) => other.type === "player_prop" && other.player_id === leg.player_id && other.stat_key === leg.stat_key) !== i);
    if (related) { setError("Esas líneas están relacionadas. Puedes jugarlas como apuestas individuales, pero no en una misma combinada."); return; }
    setSaving(true); setError(""); setMessage("");
    try {
      if (ticketMode === "singles") {
        await placeGazalBetSingles({ gameweekId: data.gameweek.id, legs: selections, stake });
        setMessage(`${selections.length} apuestas individuales confirmadas.`);
      } else {
        const result = await placeGazalBetTicket({ gameweekId: data.gameweek.id, legs: selections, stake });
        setMessage(`Combinada confirmada a cuota ${Number(result.odds).toFixed(2)}.`);
      }
      setSelections([]); setSlipOpen(false); await load();
    } catch (err) {
      setError(err.message?.includes("Maximum 60") ? "El límite conjunto es de 60 fichas por jornada." : err.message?.includes("Related") ? "Hay selecciones relacionadas en la combinada." : err.message?.includes("Insufficient") ? "No tienes fichas suficientes." : err.message || "No se pudo confirmar el boleto.");
    } finally { setSaving(false); }
  }

  if (loading) return <div className="gazalbet-page"><div className="gazalbet-loading">Calculando mercados y cuotas…</div></div>;
  return <div className="gazalbet-page">
    <header className="gazalbet-hero"><img src={`${import.meta.env.BASE_URL}gazalbet-logo.webp`} alt="GazalBet" /><div className="gazalbet-hero__copy"><span>APUESTAS CON FICHAS VIRTUALES</span><h1>GazalBet</h1><p>Crea tus líneas, apuesta por separado o monta una combinada.</p></div><div className="gazalbet-balance"><small>Tu saldo</small><strong>{formatCredits(data.wallet?.balance)} 🪙</strong></div></header>
    <div className="gazalbet-limits"><span>Sin límite de apuestas</span><span>{formatCredits(used)}/60 fichas usadas</span><span>Combinadas de hasta 6</span></div>
    <nav className="gazalbet-tabs">{TABS.map(([value, label]) => <button key={value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}>{label}</button>)}</nav>
    {error && <div className="gazalbet-alert gazalbet-alert--error">{error}</div>}{message && <div className="gazalbet-alert gazalbet-alert--ok">{message}</div>}

    {tab === "markets" && <section>
      {data.gameweek ? <div className="gazalbet-event"><div><small>JORNADA {data.gameweek.id}</small><h2>Gazalbide vs {data.gameweek.opponent || "Rival"}</h2><p>{remaining} fichas disponibles</p></div><div className={closed ? "gazalbet-event__status closed" : "gazalbet-event__status"}>{closed ? "Cerrado" : `Cierra ${formatDeadline(data.gameweek.deadline)}`}</div></div> : <div className="gazalbet-empty">No hay una jornada disponible.</div>}
      <button className="gazalbet-builder-cta" disabled={closed} onClick={() => setBuilderOpen(true)}><span><small>CREADOR DE APUESTAS</small><strong>Elige jugador, estadística y línea</strong></span><b>Crear apuesta →</b></button>
      <h2 className="gazalbet-section-title">Mercados del partido</h2>
      <div className="gazalbet-markets">{data.markets.filter((m) => ["winner", "handicap", "total"].includes(m.kind)).map((market) => <article className="gazalbet-market" key={market.id}><div className="gazalbet-market__head"><div><h3>{market.title}</h3><p>{market.subtitle}</p></div><span>{market.sample_size ? `${market.sample_size} partidos` : "Datos iniciales"}</span></div><div className={`gazalbet-options gazalbet-options--${market.selections.length}`}>{market.selections.map((selection) => <button key={selection.key} disabled={closed || market.status !== "open"} onClick={() => add({ type: "market", market_id: market.id, selection_key: selection.key, label: `${market.title} · ${selection.label}`, odds: Number(selection.odds) })}><span>{selection.label}</span><strong>{Number(selection.odds).toFixed(2)}</strong></button>)}</div></article>)}</div>
    </section>}
    {tab === "ranking" && <section className="gazalbet-panel"><h2>Ranking GazalBet</h2><div className="gazalbet-ranking">{ranking.map((item) => <div key={item.user_id} className={item.user_id === user.id ? "me" : ""}><b>{item.position}</b><span>{item.username}</span><strong>{formatCredits(item.balance)} 🪙</strong></div>)}</div></section>}
    {tab === "history" && <section className="gazalbet-panel"><h2>Mis apuestas</h2><div className="gazalbet-history">{data.tickets.map((ticket) => <article key={ticket.id}><div><small>{ticket.ticket_type === "accumulator" ? `COMBINADA · ${ticket.gazalbet_ticket_legs.length} selecciones` : "INDIVIDUAL"}</small><h3>{ticket.gazalbet_ticket_legs.map((leg) => leg.label).join(" + ")}</h3><span>Cuota {Number(ticket.total_odds).toFixed(2)}</span></div><div className={ticket.status}><b>{STATUS[ticket.status]}</b><strong>{ticket.status === "won" ? `+${formatCredits(ticket.payout)}` : `${formatCredits(ticket.stake)} 🪙`}</strong></div></article>)}{data.bets.map((bet) => <article key={bet.id}><div><small>Apuesta anterior</small><h3>{bet.selection_label}</h3></div><div className={bet.status}><b>{STATUS[bet.status]}</b><strong>{formatCredits(bet.stake)} 🪙</strong></div></article>)}{!data.tickets.length && !data.bets.length && <div className="gazalbet-empty">Aún no has hecho ninguna apuesta.</div>}</div></section>}

    {builderOpen && <div className="gazalbet-modal-backdrop" onClick={() => setBuilderOpen(false)}><section className="gazalbet-builder" onClick={(e) => e.stopPropagation()}><button className="gazalbet-slip__close" onClick={() => setBuilderOpen(false)}>×</button><small>CREAR MI APUESTA</small><h2>Mercado de jugador</h2><label>Jugador</label><select value={playerId} onChange={(e) => setPlayerId(e.target.value)}><option value="">Elige un jugador</option>{builder?.players?.map((p) => <option value={p.id} key={p.id}>{p.number} · {p.name}</option>)}</select><label>Categoría</label><div className="gazalbet-category-grid">{builder?.categories?.map((c) => <button className={statKey === c.key ? "active" : ""} key={c.key} onClick={() => setStatKey(c.key)}>{c.label}</button>)}</div><label>Pronóstico</label><div className="gazalbet-direction"><button className={direction === "over" ? "active" : ""} onClick={() => setDirection("over")}>Más de</button><button className={direction === "under" ? "active" : ""} onClick={() => setDirection("under")}>Menos de</button></div><label>Línea</label><div className="gazalbet-line"><button onClick={() => setLine((v) => Math.max(-9.5, v - 1))}>−</button><strong>{line.toFixed(1)}</strong><button onClick={() => setLine((v) => Math.min(79.5, v + 1))}>+</button></div><input className="gazalbet-range" type="range" min={statKey === "pir" ? -9.5 : .5} max={statKey === "pts" || statKey === "pir" ? 40.5 : statKey === "reb" ? 20.5 : 8.5} step="1" value={line} onChange={(e) => setLine(Number(e.target.value))}/>{selectedPlayer && <p className="gazalbet-builder__context">Media: {selectedPlayer.averages?.[statKey]} · {selectedPlayer.games} partidos</p>}<div className="gazalbet-quote"><span>Cuota calculada</span><strong>{quoteLoading ? "…" : quote ? Number(quote.odds).toFixed(2) : "—"}</strong></div><button className="gazalbet-confirm" disabled={!quote || quoteLoading} onClick={addProp}>Añadir al cupón</button></section></div>}

    {selections.length > 0 && <button className="gazalbet-floating-slip" onClick={() => setSlipOpen(true)}><span>Cupón · {selections.length} {selections.length === 1 ? "selección" : "selecciones"}</span><strong>{selections.length > 1 ? `Cuota ${combinedOdds.toFixed(2)}` : "Ver boleto"}</strong></button>}
    {slipOpen && selections.length > 0 && <div className="gazalbet-slip-backdrop" onClick={() => !saving && setSlipOpen(false)}><aside className="gazalbet-slip" onClick={(e) => e.stopPropagation()}><button className="gazalbet-slip__close" onClick={() => setSlipOpen(false)}>×</button><small>TU CUPÓN</small><h2>{selections.length} selecciones</h2><div className="gazalbet-slip-list">{selections.map((leg) => <div key={keyOf(leg)}><span>{leg.label}</span><strong>{Number(leg.odds).toFixed(2)}</strong><button onClick={() => setSelections((all) => all.filter((item) => keyOf(item) !== keyOf(leg)))}>×</button></div>)}</div>{selections.length > 1 && <div className="gazalbet-ticket-modes"><button className={ticketMode === "singles" ? "active" : ""} onClick={() => setTicketMode("singles")}>Individuales</button><button className={ticketMode === "accumulator" ? "active" : ""} onClick={() => setTicketMode("accumulator")}>Combinada</button></div>}<label>{ticketMode === "singles" ? "Fichas por apuesta" : "Fichas apostadas"}</label><div className="gazalbet-stakes">{STAKES.map((value) => <button className={stake === value ? "active" : ""} onClick={() => setStake(value)} key={value}>{value}</button>)}</div><div className="gazalbet-return"><span>{ticketMode === "singles" ? `Total: ${totalStake}` : `Cuota: ${combinedOdds.toFixed(2)}`}<small>Quedan {remaining} fichas</small></span><strong>{ticketMode === "singles" ? "Simples" : `${formatCredits(stake * combinedOdds)} 🪙`}</strong></div><button className="gazalbet-confirm" disabled={saving || totalStake > remaining} onClick={confirm}>{saving ? "Confirmando…" : ticketMode === "singles" ? "Confirmar individuales" : "Confirmar combinada"}</button><p className="gazalbet-responsible">Solo fichas virtuales. Sin dinero real ni efecto sobre Fantasy.</p></aside></div>}
  </div>;
}
