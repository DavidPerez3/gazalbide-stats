import { FOUL_KIND } from "./rules.js";

const FOUL_SUBTYPE_DELTA = Object.freeze({
  [FOUL_KIND.DEFENSIVE]: { pf_defensive: 1 },
  [FOUL_KIND.OFFENSIVE]: { pf_offensive: 1 },
  [FOUL_KIND.TECHNICAL]: { pf_technical: 1 },
  [FOUL_KIND.UNSPORTSMANLIKE]: { pf_unsportsmanlike: 1 },
  [FOUL_KIND.DISQUALIFYING]: { pf_disqualifying: 1 },
  [FOUL_KIND.TECHNICAL_CAT_1]: { pf_technical_cat_1: 1 },
  [FOUL_KIND.TECHNICAL_CAT_2]: { pf_technical_cat_2: 1 },
  [FOUL_KIND.DISRUPTIVE]: { pf_disruptive: 1 },
  [FOUL_KIND.FLAGRANT]: { pf_flagrant: 1 },
});

export const FOUL_BREAKDOWN_FIELDS = Object.freeze([
  "pf_defensive",
  "pf_offensive",
  "pf_technical",
  "pf_unsportsmanlike",
  "pf_disqualifying",
  "pf_technical_cat_1",
  "pf_technical_cat_2",
  "pf_disruptive",
  "pf_flagrant",
]);

export function getFoulStatDelta(foulKind) {
  const subtype = FOUL_SUBTYPE_DELTA[foulKind];
  if (!subtype) {
    throw new Error(`Tipo de falta desconocido: ${foulKind}`);
  }

  // Every special foul is still a normal PF for player totals and team bonus.
  return { pf: 1, ...subtype };
}

export function getTechnicalTotal(stats = {}) {
  return (
    (stats.pf_technical || 0) +
    (stats.pf_technical_cat_1 || 0) +
    (stats.pf_technical_cat_2 || 0)
  );
}
