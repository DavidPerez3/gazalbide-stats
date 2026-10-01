import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { fetchGazalBetBuilder, fetchGazalBetData, fetchGazalBetRanking, formatCredits, formatDeadline, placeGazalBetSingles, placeGazalBetTicket, quoteGazalBetGameLine, quoteGazalBetPlayerLine, STAKES } from "../lib/gazalbet.js";
import { loadLiveCenterSnapshot, subscribeLiveCenter } from "../lib/liveCenter.js";
import "../gazalbet.css";

const TABS = [["markets", "Apuestas"], ["live", "En directo"], ["ranking", "Ranking"], ["history", "Mis apuestas"]];
const STATUS = { pending: "Pendiente", won: "Ganada", lost: "Perdida", void: "Anulada" };
const STAT_LABEL = { pts: "puntos", three_pm: "triples", reb: "rebotes", ast: "asistencias", pf: "faltas", pir: "valoración" };
const keyOf = (leg) => leg.type === "market" ? `m:${leg.market_id}:${leg.selection_key}` : leg.type === "game_prop" ? `g:${leg.stat_key}:${leg.selection_key || "all"}:${leg.direction || "cover"}:${leg.line}` : `p:${leg.player_id}:${leg.stat_key}:${leg.direction}:${leg.line}`;

function liveLeg(leg, snapshot) {
  if (leg.status === "void") return { value: null, progress: 0, caption: "Selección anulada", tone: "void" };
  if (!snapshot) return { value: 0, progress: 0, caption: "Esperando Live Stats", tone: "waiting" };
  let value = 0;
  let caption = "";
  let progress = 0;
  if (leg.leg_type === "player_prop") {
    const player = snapshot.players?.find((item) => String(item.playerId) === String(leg.player_id));
    value = Number(player?.stats?.[leg.stat_key] || 0);
    progress = Math.min(100, Math.max(0, (value / Math.max(Number(leg.line), 1)) * 100));
    caption = `${value} ${STAT_LABEL[leg.stat_key] || ""} · objetivo ${leg.direction === "under" ? "menos de" : "más de"} ${Number(leg.line)}`;
  } else if (leg.leg_type === "game_prop" && leg.stat_key === "handicap") {
    value = leg.selection_key === "gazalbide" ? snapshot.score.gazalbide - snapshot.score.opponent : snapshot.score.opponent - snapshot.score.gazalbide;
    const adjusted = value + Number(leg.line);
    progress = Math.min(100, Math.max(0, 50 + adjusted * 4));
    caption = `Margen actual ${value > 0 ? "+" : ""}${value} · con hándicap ${adjusted > 0 ? "+" : ""}${adjusted.toFixed(1)}`;
  } else if (leg.leg_type === "game_prop") {
    value = Number(snapshot.score.gazalbide) + Number(snapshot.score.opponent);
    progress = Math.min(100, Math.max(0, (value / Math.max(Number(leg.line), 1)) * 100));
    caption = `${value} puntos · objetivo ${leg.direction === "under" ? "menos de" : "más de"} ${Number(leg.line)}`;
  } else {
    const gazal = Number(snapshot.score.gazalbide); const rival = Number(snapshot.score.opponent);
    value = `${gazal}-${rival}`; progress = gazal + rival ? Math.min(100, Math.max(0, 50 + (gazal - rival) * 5)) : 50;
    caption = `Marcador actual ${value}`;
  }
  const winning = leg.leg_type === "game_prop" && leg.stat_key === "handicap"
    ? value + Number(leg.line) > 0
    : leg.direction === "under" ? Number(value) < Number(leg.line) : leg.direction === "over" ? Number(value) > Number(leg.line) : null;
  return { value, progress, caption, tone: winning === true ? "ahead" : winning === false ? "behind" : "neutral" };
}

export default function PorraPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState("markets");
  const [data, setData] = useState({ gameweek: null, markets: [], bets: [], tickets: [], wallet: null, notification: null });
  const [live, setLive] = useState(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [ranking, setRanking] = useState([]);
  const [builder, setBuilder] = useState(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderType, setBuilderType] = useState("player");
  const [playerId, setPlayerId] = useState("");
  const [statKey, setStatKey] = useState("pts");
  const [direction, setDirection] = useState("over");
  const [line, setLine] = useState(10.5);
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [gameTeam, setGameTeam] = useState("gazalbide");
  const [gameDirection, setGameDirection] = useState("over");
  const [gameLine, setGameLine] = useState(120.5);
  const [gameQuote, setGameQuote] = useState(null);
  const [gameQuoteLoading, setGameQuoteLoading] = useState(false);
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

  useEffect(() => {
    const matchId = data.gameweek?.match_id;
    if (!matchId || tab !== "live") return undefined;
    let active = true;
    const refresh = async () => {
      setLiveLoading(true);
      try { const next = await loadLiveCenterSnapshot(matchId); if (active) setLive(next); }
      catch { if (active) setLive(null); }
      finally { if (active) setLiveLoading(false); }
    };
    refresh();
    const unsubscribe = subscribeLiveCenter(matchId, refresh);
    const timer = setInterval(refresh, 15000);
    return () => { active = false; clearInterval(timer); unsubscribe(); };
  }, [tab, data.gameweek?.match_id]);

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

  useEffect(() => {
    if (builderType === "total") {
      const totalMarket = data.markets.find((market) => market.kind === "total");
      setGameLine(Number(totalMarket?.line || 130.5));
    } else if (builderType === "handicap") {
      const winner = data.markets.find((market) => market.kind === "winner");
      const gazalOdds = Number(winner?.selections?.find((item) => item.key === "gazalbide")?.odds || 1.85);
      const opponentOdds = Number(winner?.selections?.find((item) => item.key === "opponent")?.odds || 1.85);
      const gazalLine = gazalOdds > opponentOdds ? 2.5 : -2.5;
      setGameLine(gameTeam === "gazalbide" ? gazalLine : -gazalLine);
    }
  }, [builderType, gameTeam, data.markets]);

  useEffect(() => {
    if (!data.gameweek || builderType === "player") { setGameQuote(null); return; }
    let active = true; setGameQuoteLoading(true);
    const timer = setTimeout(async () => {
      try {
        const next = await quoteGazalBetGameLine({
          gameweekId: data.gameweek.id,
          statKey: builderType,
          selectionKey: builderType === "handicap" ? gameTeam : null,
          direction: builderType === "total" ? gameDirection : null,
          line: gameLine,
        });
        if (active) setGameQuote(next);
      } catch { if (active) setGameQuote(null); }
      finally { if (active) setGameQuoteLoading(false); }
    }, 180);
    return () => { active = false; clearTimeout(timer); };
  }, [data.gameweek, builderType, gameTeam, gameDirection, gameLine]);

  const balance = Number(data.wallet?.balance || 0);
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
  function addGameProp() {
    if (!gameQuote) return;
    add({ type: "game_prop", stat_key: gameQuote.stat_key, selection_key: gameQuote.selection_key, direction: gameQuote.direction, line: Number(gameQuote.line), odds: Number(gameQuote.odds), label: gameQuote.label });
    setBuilderOpen(false);
  }
  async function confirm() {
    if (!selections.length || !data.gameweek) return;
    if (totalStake > balance) { setError(`Tu saldo disponible es de ${formatCredits(balance)} monedas.`); return; }
    const related = ticketMode === "accumulator" && selections.some((leg, i) => (leg.type === "player_prop" && selections.findIndex((other) => other.type === "player_prop" && other.player_id === leg.player_id && other.stat_key === leg.stat_key) !== i) || (leg.type === "game_prop" && selections.findIndex((other) => other.type === "game_prop" && other.stat_key === leg.stat_key) !== i));
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
      setError(err.message?.includes("Related") ? "Hay selecciones relacionadas en la combinada." : err.message?.includes("Insufficient") ? "No tienes monedas suficientes." : err.message || "No se pudo confirmar el boleto.");
    } finally { setSaving(false); }
  }

  if (loading) return <div className="gazalbet-page"><div className="gazalbet-loading">Calculando mercados y cuotas…</div></div>;
  return <div className="gazalbet-page">
    <header className="gazalbet-hero"><img src={`${import.meta.env.BASE_URL}gazalbet-logo.webp`} alt="GazalBet" /><div className="gazalbet-hero__copy"><span>APUESTAS CON FICHAS VIRTUALES</span><h1>GazalBet</h1><p>Crea tus líneas, apuesta por separado o monta una combinada.</p></div><div className="gazalbet-balance"><small>Tu saldo</small><strong>{formatCredits(data.wallet?.balance)} 🪙</strong></div></header>
    <div className="gazalbet-limits"><span>Sin límite semanal</span><span>100 monedas iniciales</span><span>Rescate hasta 20 por jornada</span><span>Combinadas de hasta 6</span></div>
    <nav className="gazalbet-tabs">{TABS.map(([value, label]) => <button key={value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}>{label}</button>)}</nav>
    {error && <div className="gazalbet-alert gazalbet-alert--error">{error}</div>}{message && <div className="gazalbet-alert gazalbet-alert--ok">{message}</div>}
    {data.notification && <div className="gazalbet-alert gazalbet-alert--notice"><b>{data.notification.title}</b><span>{data.notification.body}</span></div>}

    {tab === "markets" && <section>
      {data.gameweek ? <div className="gazalbet-event"><div><small>JORNADA {data.gameweek.id}</small><h2>Gazalbide vs {data.gameweek.opponent || "Rival"}</h2><p>{formatCredits(balance)} monedas disponibles</p></div><div className={closed ? "gazalbet-event__status closed" : "gazalbet-event__status"}>{closed ? "Cerrado" : `Cierra ${formatDeadline(data.gameweek.deadline)}`}</div></div> : <div className="gazalbet-empty">No hay una jornada disponible.</div>}
      <button className="gazalbet-builder-cta" disabled={closed} onClick={() => setBuilderOpen(true)}><span><small>CREADOR DE APUESTAS</small><strong>Jugador, hándicap o puntos totales</strong></span><b>Crear apuesta →</b></button>
      <h2 className="gazalbet-section-title">Mercado rápido</h2>
      <div className="gazalbet-markets">{data.markets.filter((m) => m.kind === "winner").map((market) => <article className="gazalbet-market" key={market.id}><div className="gazalbet-market__head"><div><h3>{market.title}</h3><p>{market.subtitle}</p></div><span>{market.sample_size ? `${market.sample_size} partidos` : "Datos iniciales"}</span></div><div className={`gazalbet-options gazalbet-options--${market.selections.length}`}>{market.selections.map((selection) => <button key={selection.key} disabled={closed || market.status !== "open"} onClick={() => add({ type: "market", market_id: market.id, selection_key: selection.key, label: `${market.title} · ${selection.label}`, odds: Number(selection.odds) })}><span>{selection.label}</span><strong>{Number(selection.odds).toFixed(2)}</strong></button>)}</div></article>)}</div>
    </section>}
    {tab === "live" && <section className="gazalbet-panel gazalbet-live">
      <div className="gazalbet-live__head"><div><small>SEGUIMIENTO LIVE</small><h2>Así van tus boletos</h2></div>{live && <span>{live.score.gazalbide} — {live.score.opponent}<small>{live.phase === "live" ? "EN DIRECTO" : live.phase === "paused" ? "PAUSA" : "PREPARTIDO"}</small></span>}</div>
      {liveLoading && !live && <div className="gazalbet-empty">Conectando con Live Stats…</div>}
      {!liveLoading && !live && <div className="gazalbet-empty">El seguimiento aparecerá cuando se abra Live Stats para este partido.</div>}
      <div className="gazalbet-live-tickets">{data.tickets.filter((ticket) => ticket.gameweek_id === data.gameweek?.id).map((ticket) => <article className="gazalbet-live-ticket" key={ticket.id}>
        <header><div><small>{ticket.ticket_type === "accumulator" ? `COMBINADA · ${ticket.gazalbet_ticket_legs.length} SELECCIONES` : "APUESTA INDIVIDUAL"}</small><strong>{formatCredits(ticket.stake)} 🪙 · cuota {Number(ticket.total_odds).toFixed(2)}</strong></div><b className={ticket.status}>{STATUS[ticket.status]}</b></header>
        <div className="gazalbet-live-legs">{ticket.gazalbet_ticket_legs.map((leg, index) => { const progress = liveLeg(leg, live); return <div className={`gazalbet-live-leg ${progress.tone}`} key={leg.id}><i>{index + 1}</i><div><strong>{leg.label}</strong><span>{progress.caption}</span><div className="gazalbet-progress"><em style={{ width: `${progress.progress}%` }} /><mark style={{ left: `${Math.min(98, Math.max(2, leg.leg_type === "game_prop" && leg.stat_key === "handicap" ? 50 : 100))}%` }} /></div></div><b>{leg.status === "void" ? "ANULADA" : Number(leg.odds).toFixed(2)}</b></div> })}</div>
      </article>)}{!data.tickets.some((ticket) => ticket.gameweek_id === data.gameweek?.id) && <div className="gazalbet-empty">No tienes boletos para esta jornada.</div>}</div>
    </section>}
    {tab === "ranking" && <section className="gazalbet-panel"><h2>Ranking GazalBet</h2><div className="gazalbet-ranking">{ranking.map((item) => <div key={item.user_id} className={item.user_id === user.id ? "me" : ""}><b>{item.position}</b><span>{item.username}</span><strong>{formatCredits(item.balance)} 🪙</strong></div>)}</div></section>}
    {tab === "history" && <section className="gazalbet-panel"><h2>Mis apuestas</h2><div className="gazalbet-history">{data.tickets.map((ticket) => <article key={ticket.id}><div><small>{ticket.ticket_type === "accumulator" ? `COMBINADA · ${ticket.gazalbet_ticket_legs.length} selecciones` : "INDIVIDUAL"}</small><div className="gazalbet-history-legs">{ticket.gazalbet_ticket_legs.map((leg) => <h3 key={leg.id}>{leg.label}{leg.status === "void" && <b>ANULADA</b>}</h3>)}</div><span>Cuota {Number(ticket.total_odds).toFixed(2)}</span>{ticket.status === "void" && <p>Fichas devueltas al saldo</p>}</div><div className={ticket.status}><b>{STATUS[ticket.status]}</b><strong>{ticket.status === "won" ? `+${formatCredits(ticket.payout)}` : ticket.status === "void" ? `+${formatCredits(ticket.payout)} 🪙` : `${formatCredits(ticket.stake)} 🪙`}</strong></div></article>)}{data.bets.map((bet) => <article key={bet.id}><div><small>Apuesta anterior</small><h3>{bet.selection_label}</h3></div><div className={bet.status}><b>{STATUS[bet.status]}</b><strong>{formatCredits(bet.stake)} 🪙</strong></div></article>)}{!data.tickets.length && !data.bets.length && <div className="gazalbet-empty">Aún no has hecho ninguna apuesta.</div>}</div></section>}

    {builderOpen && <div className="gazalbet-modal-backdrop" onClick={() => setBuilderOpen(false)}><section className="gazalbet-builder" onClick={(e) => e.stopPropagation()}><button className="gazalbet-slip__close" onClick={() => setBuilderOpen(false)}>×</button><small>CREAR MI APUESTA</small><h2>Elige tu mercado</h2><div className="gazalbet-builder-types"><button className={builderType === "player" ? "active" : ""} onClick={() => setBuilderType("player")}>Jugador</button><button className={builderType === "handicap" ? "active" : ""} onClick={() => setBuilderType("handicap")}>Hándicap</button><button className={builderType === "total" ? "active" : ""} onClick={() => setBuilderType("total")}>Puntos totales</button></div>
      {builderType === "player" && <><label>Jugador</label><select value={playerId} onChange={(e) => setPlayerId(e.target.value)}><option value="">Elige un jugador</option>{builder?.players?.map((p) => <option value={p.id} key={p.id}>{p.number} · {p.name}</option>)}</select><label>Categoría</label><div className="gazalbet-category-grid">{builder?.categories?.map((c) => <button className={statKey === c.key ? "active" : ""} key={c.key} onClick={() => setStatKey(c.key)}>{c.label}</button>)}</div><label>Pronóstico</label><div className="gazalbet-direction"><button className={direction === "over" ? "active" : ""} onClick={() => setDirection("over")}>Más de</button><button className={direction === "under" ? "active" : ""} onClick={() => setDirection("under")}>Menos de</button></div><label>Línea</label><div className="gazalbet-line"><button onClick={() => setLine((v) => Math.max(-9.5, v - 1))}>−</button><strong>{line.toFixed(1)}</strong><button onClick={() => setLine((v) => Math.min(79.5, v + 1))}>+</button></div><input className="gazalbet-range" type="range" min={statKey === "pir" ? -9.5 : .5} max={statKey === "pts" || statKey === "pir" ? 40.5 : statKey === "reb" ? 20.5 : 8.5} step="1" value={line} onChange={(e) => setLine(Number(e.target.value))}/>{selectedPlayer && <p className="gazalbet-builder__context">Media: {selectedPlayer.averages?.[statKey]} · {selectedPlayer.games} partidos</p>}<div className="gazalbet-quote"><span>Cuota calculada</span><strong>{quoteLoading ? "…" : quote ? Number(quote.odds).toFixed(2) : "—"}</strong></div><button className="gazalbet-confirm" disabled={!quote || quoteLoading} onClick={addProp}>Añadir al cupón</button></>}
      {builderType === "handicap" && <><label>Equipo</label><div className="gazalbet-direction"><button className={gameTeam === "gazalbide" ? "active" : ""} onClick={() => setGameTeam("gazalbide")}>Gazalbide</button><button className={gameTeam === "opponent" ? "active" : ""} onClick={() => setGameTeam("opponent")}>{data.gameweek?.opponent || "Rival"}</button></div><label>Hándicap elegido</label><div className="gazalbet-line"><button onClick={() => setGameLine((v) => Math.max(-40.5, v - 1))}>−</button><strong>{gameLine > 0 ? "+" : ""}{gameLine.toFixed(1)}</strong><button onClick={() => setGameLine((v) => Math.min(40.5, v + 1))}>+</button></div><input className="gazalbet-range" type="range" min="-20.5" max="20.5" step="1" value={gameLine} onChange={(e) => setGameLine(Number(e.target.value))}/><p className="gazalbet-builder__context">El hándicap se suma al marcador del equipo elegido.</p><div className="gazalbet-quote"><span>Cuota calculada</span><strong>{gameQuoteLoading ? "…" : gameQuote ? Number(gameQuote.odds).toFixed(2) : "—"}</strong></div><button className="gazalbet-confirm" disabled={!gameQuote || gameQuoteLoading} onClick={addGameProp}>Añadir al cupón</button></>}
      {builderType === "total" && <><label>Pronóstico</label><div className="gazalbet-direction"><button className={gameDirection === "over" ? "active" : ""} onClick={() => setGameDirection("over")}>Más de</button><button className={gameDirection === "under" ? "active" : ""} onClick={() => setGameDirection("under")}>Menos de</button></div><label>Puntos entre ambos equipos</label><div className="gazalbet-line"><button onClick={() => setGameLine((v) => Math.max(60.5, v - 1))}>−</button><strong>{gameLine.toFixed(1)}</strong><button onClick={() => setGameLine((v) => Math.min(220.5, v + 1))}>+</button></div><input className="gazalbet-range" type="range" min="80.5" max="180.5" step="1" value={gameLine} onChange={(e) => setGameLine(Number(e.target.value))}/><p className="gazalbet-builder__context">Suma del marcador final de Gazalbide y {data.gameweek?.opponent || "el rival"}.</p><div className="gazalbet-quote"><span>Cuota calculada</span><strong>{gameQuoteLoading ? "…" : gameQuote ? Number(gameQuote.odds).toFixed(2) : "—"}</strong></div><button className="gazalbet-confirm" disabled={!gameQuote || gameQuoteLoading} onClick={addGameProp}>Añadir al cupón</button></>}
    </section></div>}

    {selections.length > 0 && <button className="gazalbet-floating-slip" onClick={() => setSlipOpen(true)}><span>Cupón · {selections.length} {selections.length === 1 ? "selección" : "selecciones"}</span><strong>{selections.length > 1 ? `Cuota ${combinedOdds.toFixed(2)}` : "Ver boleto"}</strong></button>}
    {slipOpen && selections.length > 0 && <div className="gazalbet-slip-backdrop" onClick={() => !saving && setSlipOpen(false)}><aside className="gazalbet-slip" onClick={(e) => e.stopPropagation()}><button className="gazalbet-slip__close" onClick={() => setSlipOpen(false)}>×</button><small>TU CUPÓN</small><h2>{selections.length} selecciones</h2><div className="gazalbet-slip-list">{selections.map((leg) => <div key={keyOf(leg)}><span>{leg.label}</span><strong>{Number(leg.odds).toFixed(2)}</strong><button onClick={() => setSelections((all) => all.filter((item) => keyOf(item) !== keyOf(leg)))}>×</button></div>)}</div>{selections.length > 1 && <div className="gazalbet-ticket-modes"><button className={ticketMode === "singles" ? "active" : ""} onClick={() => setTicketMode("singles")}>Individuales</button><button className={ticketMode === "accumulator" ? "active" : ""} onClick={() => setTicketMode("accumulator")}>Combinada</button></div>}<label>{ticketMode === "singles" ? "Monedas por apuesta" : "Monedas apostadas"}</label><div className="gazalbet-stakes">{STAKES.map((value) => <button className={stake === value ? "active" : ""} onClick={() => setStake(value)} key={value}>{value}</button>)}</div><input className="gazalbet-stake-input" type="number" min="1" step="1" value={stake} onChange={(e) => setStake(Math.max(1, Math.floor(Number(e.target.value) || 1)))} aria-label="Cantidad personalizada"/><div className="gazalbet-return"><span>{ticketMode === "singles" ? `Total: ${totalStake}` : `Cuota: ${combinedOdds.toFixed(2)}`}<small>Saldo: {formatCredits(balance)} monedas</small></span><strong>{ticketMode === "singles" ? "Simples" : `${formatCredits(stake * combinedOdds)} 🪙`}</strong></div><button className="gazalbet-confirm" disabled={saving || totalStake > balance} onClick={confirm}>{saving ? "Confirmando…" : ticketMode === "singles" ? "Confirmar individuales" : "Confirmar combinada"}</button><p className="gazalbet-responsible">Solo monedas virtuales. Sin dinero real ni efecto sobre Fantasy.</p></aside></div>}
  </div>;
}
