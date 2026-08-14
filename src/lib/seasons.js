export const CURRENT_SEASON_ID = "2026-2027";
export const LEGACY_SEASON_ID = "2025-2026";

export const SEASONS = Object.freeze([
  {
    id: CURRENT_SEASON_ID,
    label: "2026-2027",
    shortLabel: "26/27",
    current: true,
    historical: false,
  },
  {
    id: LEGACY_SEASON_ID,
    label: "2025-2026",
    shortLabel: "25/26",
    current: false,
    historical: true,
  },
]);

export function normaliseSeasonId(value) {
  const raw = String(value || "").trim();
  if (raw === "2025-26") return LEGACY_SEASON_ID;
  if (raw === "2026-27") return CURRENT_SEASON_ID;
  return SEASONS.some((season) => season.id === raw) ? raw : null;
}

// Gazalbide's app season boundary is July 1. This keeps preseason/summer setup
// attached to the season that starts that year while preserving the 2025-26 archive.
export function getSeasonIdForDate(dateValue) {
  const date = new Date(`${String(dateValue || "").slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return LEGACY_SEASON_ID;

  const year = date.getFullYear();
  const month = date.getMonth(); // 0 = January
  const startYear = month >= 6 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

export function getSeason(seasonId) {
  return SEASONS.find((season) => season.id === seasonId) || SEASONS[0];
}
