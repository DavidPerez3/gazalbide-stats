export const BET_STATUS = { pending: "Pendiente", won: "Ganada", lost: "Perdida", void: "Anulada" };
export const LIVE_PHASE = { pregame: "PREPARTIDO", live: "EN DIRECTO", paused: "PAUSA", review: "PENDIENTE DE REVISIÓN", official: "RESULTADO OFICIAL" };
const STAT_LABEL = { pts: "puntos", three_pm: "triples", reb: "rebotes", ast: "asistencias", pf: "faltas", pir: "valoración" };
const clamp = (n) => Math.min(100, Math.max(0, n));
const numeric = (n) => n != null && n !== "" && Number.isFinite(Number(n));
const waiting = (caption = "Esperando Live Stats") => ({ progress: 50, caption, tone: "waiting", label: "Pendiente", marker: 50 });
const signed = (n) => `${n > 0 ? "+" : ""}${Number(n.toFixed(2))}`;

// Progress is a signed distance to the threshold, never a win probability.
export function trackLeg(leg, snapshot) {
  if (["won", "lost", "void"].includes(leg.status)) {
    return { progress: leg.status === "won" ? 100 : 0, caption: leg.status === "void" ? "Selección anulada · no cuenta en la combinada" : numeric(leg.result_value) ? `Resultado oficial: ${Number(leg.result_value)}` : "Resultado liquidado", tone: leg.status, label: BET_STATUS[leg.status], marker: null };
  }
  if (!snapshot || snapshot.phase === "pregame") return waiting();
  const market = leg.gazalbet_markets;
  const kind = leg.leg_type === "market" ? market?.kind : leg.stat_key;
  const line = Number(leg.line ?? market?.line);
  const direction = leg.direction || leg.selection_key;
  const gazal = Number(snapshot.score?.gazalbide);
  const rival = Number(snapshot.score?.opponent);
  let delta, scale, caption;
  if (leg.leg_type === "player_prop" || kind === "player_points") {
    const playerId = leg.player_id ?? market?.selections?.[0]?.player_id;
    const player = snapshot.players?.find((p) => String(p.playerId) === String(playerId));
    const stat = leg.stat_key || "pts";
    if (!player || !numeric(player.stats?.[stat])) return waiting("Estadísticas del jugador aún no disponibles");
    if (!numeric(leg.line ?? market?.line) || !["over", "under"].includes(direction)) return waiting("Línea no disponible");
    const value = Number(player.stats[stat]);
    delta = direction === "under" ? line - value : value - line;
    scale = Math.max(Math.abs(line), 1);
    caption = `${value} ${STAT_LABEL[stat] || stat} · ${direction === "under" ? "menos de" : "más de"} ${line}`;
  } else if (["winner", "handicap", "total"].includes(kind)) {
    if (!numeric(snapshot.score?.gazalbide) || !numeric(snapshot.score?.opponent)) return waiting();
    if (kind === "total") {
      if (!numeric(leg.line ?? market?.line) || !["over", "under"].includes(direction)) return waiting("Línea no disponible");
      delta = direction === "under" ? line - (gazal + rival) : gazal + rival - line;
      scale = Math.max(Math.abs(line), 1);
      caption = `${gazal + rival} puntos · ${direction === "under" ? "menos de" : "más de"} ${line}`;
    } else {
      if (!["gazalbide", "opponent"].includes(leg.selection_key)) return waiting("Selección no disponible");
      const margin = leg.selection_key === "gazalbide" ? gazal - rival : rival - gazal;
      // Legacy handicap markets store Gazalbide's line; custom props store the selected team's line.
      const handicap = kind === "handicap" ? (leg.leg_type === "market" && leg.selection_key === "opponent" ? -line : line) : 0;
      if (!Number.isFinite(handicap)) return waiting("Línea no disponible");
      delta = margin + handicap;
      scale = 15;
      caption = kind === "winner" ? `Marcador ${gazal}–${rival} · margen de tu equipo ${signed(margin)}` : `Margen ${signed(margin)} · con hándicap ${signed(delta)}`;
    }
  } else if (["top_scorer", "head_to_head"].includes(kind)) {
    const contenders = (market?.selections || []).map((selection) => ({ id: String(selection.key), player: snapshot.players?.find((p) => String(p.playerId) === String(selection.key)) }));
    const selected = contenders.find((p) => p.id === String(leg.selection_key));
    if (contenders.length < 2 || contenders.some((p) => !numeric(p.player?.stats?.pts)) || !selected) return waiting("Estadísticas de los jugadores aún no disponibles");
    const value = Number(selected.player.stats.pts);
    const other = Math.max(...contenders.filter((p) => p !== selected).map((p) => Number(p.player.stats.pts)));
    delta = value - other; scale = 10;
    caption = `${value} puntos · ${kind === "top_scorer" ? "máximo del resto" : "otro jugador"}: ${other}`;
  } else return waiting("Este mercado no tiene seguimiento disponible");
  const label = delta > 0 ? "Cumpliéndose" : delta < 0 ? "No se cumple ahora" : "En el límite";
  const provisional = snapshot.phase === "review" || snapshot.phase === "official" ? " · pendiente de liquidación" : " · provisional";
  return { progress: clamp(50 + delta / scale * 50), marker: 50, caption: caption + provisional, tone: delta > 0 ? "ahead" : delta < 0 ? "behind" : "neutral", label };
}

export function selectTrackingGameweek(gameweeks, tickets, current, now = Date.now()) {
  const pendingIds = new Set(tickets.filter((t) => t.status === "pending").map((t) => String(t.gameweek_id)));
  const pending = gameweeks.filter((g) => g.match_id && pendingIds.has(String(g.id)));
  const started = pending.filter((g) => new Date(g.deadline).getTime() <= now).sort((a, b) => new Date(b.deadline) - new Date(a.deadline));
  return started[0] || pending.sort((a, b) => new Date(a.deadline) - new Date(b.deadline))[0] || current || gameweeks[0] || null;
}
export function matchesHistoryFilter(status, filter) {
  return filter === "all" || (filter === "settled" ? ["won", "lost"].includes(status) : status === filter);
}
