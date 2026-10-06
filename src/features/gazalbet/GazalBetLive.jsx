import { formatCredits } from "../../lib/gazalbet";
import { BET_STATUS, LIVE_PHASE, trackLeg } from "./liveTracking";

export default function GazalBetLive({ gameweeks, gameweek, onGameweekChange, tickets, snapshot, loading, error, updatedAt }) {
  return <section className="gazalbet-panel gazalbet-live">
    <div className="gazalbet-live__head"><div><small>SEGUIMIENTO LIVE</small><h2>Así van tus boletos</h2></div>{snapshot && <span>{snapshot.score.gazalbide} — {snapshot.score.opponent}<small>{LIVE_PHASE[snapshot.phase] || "SEGUIMIENTO"}</small></span>}</div>
    <label className="gazalbet-live-selector">Partido<select value={gameweek?.id || ""} onChange={(e) => onGameweekChange(e.target.value)}>{gameweeks.map((gw) => <option value={gw.id} key={gw.id}>{gw.name || `Jornada ${gw.id}`} · {gw.opponent || "Rival"} · {gw.date}</option>)}</select></label>
    <p className="gazalbet-live-note">El seguimiento es provisional. Los boletos se liquidan con el resultado publicado. El centro de cada barra marca el objetivo; no representa una probabilidad.</p>
    {error && <div className="gazalbet-alert gazalbet-alert--error" role="status">{error}{snapshot && " Se mantienen los últimos datos recibidos."}</div>}
    {updatedAt && <small className="gazalbet-live-updated">Última actualización: {new Date(updatedAt).toLocaleTimeString("es-ES")}</small>}
    {loading && !snapshot && <div className="gazalbet-empty">Conectando con Live Stats…</div>}
    {!loading && !snapshot && !error && <div className="gazalbet-empty">{gameweek?.match_id ? "El seguimiento aparecerá cuando se abra Live Stats para este partido." : "Esta jornada todavía no tiene un partido vinculado."}</div>}
    <div className="gazalbet-live-tickets">{tickets.map((ticket) => <article className="gazalbet-live-ticket" key={ticket.id}>
      <header><div><small>{ticket.ticket_type === "accumulator" ? `COMBINADA · ${ticket.gazalbet_ticket_legs.length} SELECCIONES` : "APUESTA INDIVIDUAL"}</small><strong>{formatCredits(ticket.stake)} 🪙 · cuota {Number(ticket.total_odds).toFixed(2)}</strong><span>{ticket.status === "pending" ? `Posible retorno: ${formatCredits(Math.min(100, Number(ticket.total_odds)) * Number(ticket.stake))} 🪙` : `Retorno: ${formatCredits(ticket.payout)} 🪙`}</span></div><b className={ticket.status}>{BET_STATUS[ticket.status]}</b></header>
      <div className="gazalbet-live-legs">{ticket.gazalbet_ticket_legs.map((leg, index) => {
        const tracking = trackLeg(leg, snapshot);
        return <div className={`gazalbet-live-leg ${tracking.tone}`} key={leg.id}><i>{tracking.tone === "won" ? "✓" : tracking.tone === "lost" ? "✕" : tracking.tone === "void" ? "—" : index + 1}</i><div><strong>{leg.label}</strong><span>{tracking.caption}</span><small className="gazalbet-leg-state">{tracking.label}</small>{tracking.marker != null && tracking.tone !== "waiting" && <div className="gazalbet-progress" role="img" aria-label={`${leg.label}: ${tracking.label}. ${tracking.caption}`}><em style={{ width: `${tracking.progress}%` }} /><mark style={{ left: `${tracking.marker}%` }} /></div>}</div><b>{Number(leg.odds).toFixed(2)}</b></div>;
      })}</div>
    </article>)}{!tickets.length && <div className="gazalbet-empty">No tienes boletos para esta jornada.</div>}</div>
  </section>;
}
