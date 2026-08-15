export const RULE_PROFILE = Object.freeze({
  FIBA_2024: "FIBA_2024",
  FIBA_2026: "FIBA_2026",
});

export const PLAYER_STATUS = Object.freeze({
  BENCH: "bench",
  ON_COURT: "on_court",
  FOULED_OUT: "fouled_out",
  DISQUALIFIED: "disqualified",
});

export const FOUL_KIND = Object.freeze({
  DEFENSIVE: "defensive",
  OFFENSIVE: "offensive",
  TECHNICAL: "technical",
  UNSPORTSMANLIKE: "unsportsmanlike",
  DISQUALIFYING: "disqualifying",

  // FIBA 2026+
  TECHNICAL_CAT_1: "technical_cat_1",
  TECHNICAL_CAT_2: "technical_cat_2",
  DISRUPTIVE: "disruptive",
  FLAGRANT: "flagrant",
});

export const FOUL_LABEL = Object.freeze({
  [FOUL_KIND.DEFENSIVE]: "Defensiva",
  [FOUL_KIND.OFFENSIVE]: "En ataque",
  [FOUL_KIND.TECHNICAL]: "Técnica",
  [FOUL_KIND.UNSPORTSMANLIKE]: "Antideportiva",
  [FOUL_KIND.DISQUALIFYING]: "Descalificante",
  [FOUL_KIND.TECHNICAL_CAT_1]: "Técnica · categoría 1",
  [FOUL_KIND.TECHNICAL_CAT_2]: "Técnica · categoría 2",
  [FOUL_KIND.DISRUPTIVE]: "Disruptiva",
  [FOUL_KIND.FLAGRANT]: "Flagrante",
});

export const MAX_ROSTER_SIZE = 12;
export const MAX_ON_COURT = 5;
export const MAX_BENCH_SIZE = 7;
export const PLAYER_FOUL_LIMIT = 5;
export const TEAM_FOUL_PENALTY_THRESHOLD = 4;

export function getRuleProfileForDate(matchDate) {
  if (!matchDate) return RULE_PROFILE.FIBA_2026;
  const date = new Date(`${matchDate}T00:00:00`);
  const fiba2026Start = new Date("2026-10-01T00:00:00");
  return date >= fiba2026Start ? RULE_PROFILE.FIBA_2026 : RULE_PROFILE.FIBA_2024;
}

export function getFoulKindsForProfile(profile) {
  if (profile === RULE_PROFILE.FIBA_2026) {
    return [
      FOUL_KIND.DEFENSIVE,
      FOUL_KIND.OFFENSIVE,
      FOUL_KIND.TECHNICAL_CAT_1,
      FOUL_KIND.TECHNICAL_CAT_2,
      FOUL_KIND.DISRUPTIVE,
      FOUL_KIND.FLAGRANT,
      FOUL_KIND.DISQUALIFYING,
    ];
  }

  return [
    FOUL_KIND.DEFENSIVE,
    FOUL_KIND.OFFENSIVE,
    FOUL_KIND.TECHNICAL,
    FOUL_KIND.UNSPORTSMANLIKE,
    FOUL_KIND.DISQUALIFYING,
  ];
}

export function validateRoster(players) {
  if (!Array.isArray(players)) return { ok: false, reason: "La convocatoria no es válida." };
  if (players.length > MAX_ROSTER_SIZE) {
    return { ok: false, reason: `Solo se pueden convocar ${MAX_ROSTER_SIZE} jugadores.` };
  }
  return { ok: true, reason: null };
}

export function validateLineup(onCourtIds, rosterIds = []) {
  const unique = [...new Set(onCourtIds || [])];
  if (unique.length !== (onCourtIds || []).length) {
    return { ok: false, reason: "No puede haber jugadores repetidos en pista." };
  }
  if (unique.length > MAX_ON_COURT) {
    return { ok: false, reason: `No puede haber más de ${MAX_ON_COURT} jugadores en pista.` };
  }
  if (rosterIds.length && unique.some((id) => !rosterIds.includes(id))) {
    return { ok: false, reason: "Hay un jugador en pista que no está convocado." };
  }
  return { ok: true, reason: null };
}

export function getTeamFoulsForPeriod(teamFouls = {}, period = 1) {
  const safePeriod = Math.max(1, Number(period || 1));
  if (safePeriod <= 4) {
    return teamFouls[safePeriod] || { gazalbide: 0, opponent: 0 };
  }

  // Under FIBA, every overtime is an extension of Q4 for team-foul penalty.
  // Existing Live sessions store each overtime under its own period key, so
  // aggregate Q4 + every overtime up to the current one instead of rewriting
  // event history or changing the persisted event period.
  const total = { gazalbide: 0, opponent: 0 };
  for (let key = 4; key <= safePeriod; key += 1) {
    const fouls = teamFouls[key] || {};
    total.gazalbide += Number(fouls.gazalbide || 0);
    total.opponent += Number(fouls.opponent || 0);
  }
  return total;
}

export function isTeamInPenalty(teamFouls = {}, period = 1, team = "gazalbide") {
  const current = getTeamFoulsForPeriod(teamFouls, period);
  return Number(current?.[team] || 0) >= TEAM_FOUL_PENALTY_THRESHOLD;
}

export function deriveDisciplinaryStatus({ totalFouls = 0, foulKinds = [], profile }) {
  if (foulKinds.includes(FOUL_KIND.DISQUALIFYING)) {
    return PLAYER_STATUS.DISQUALIFIED;
  }

  if (profile === RULE_PROFILE.FIBA_2026) {
    // The 2026 rule profile is intentionally isolated here. FIBA has approved
    // the new two-category technical-foul model and Disruptive/Flagrant fouls,
    // while the detailed official rule text is still pending publication.
    // Keep the currently adopted project interpretation in one place so it can
    // be updated without touching the Live Stats state engine.
    const cat1 = foulKinds.filter((kind) => kind === FOUL_KIND.TECHNICAL_CAT_1).length;
    const flagrant = foulKinds.filter((kind) => kind === FOUL_KIND.FLAGRANT).length;
    if (cat1 >= 2 || flagrant >= 2 || (cat1 >= 1 && flagrant >= 1)) {
      return PLAYER_STATUS.DISQUALIFIED;
    }
  } else {
    const technical = foulKinds.filter((kind) => kind === FOUL_KIND.TECHNICAL).length;
    const unsportsmanlike = foulKinds.filter((kind) => kind === FOUL_KIND.UNSPORTSMANLIKE).length;
    if (
      technical >= 2 ||
      unsportsmanlike >= 2 ||
      (technical >= 1 && unsportsmanlike >= 1)
    ) {
      return PLAYER_STATUS.DISQUALIFIED;
    }
  }

  if (totalFouls >= PLAYER_FOUL_LIMIT) return PLAYER_STATUS.FOULED_OUT;
  return null;
}

export function isPlayerEligible(status) {
  return status !== PLAYER_STATUS.FOULED_OUT && status !== PLAYER_STATUS.DISQUALIFIED;
}
