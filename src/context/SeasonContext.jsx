import { createContext, useContext, useMemo, useState } from "react";
import { LEGACY_SEASON_ID, SEASONS, getSeason } from "../lib/seasons.js";

// Start with the last season that has published results. The previous preference
// defaulted everyone to an empty 2026-2027 dashboard; let them choose it again.
const STORAGE_KEY = "gazalbide.activeSeason.v2";
const SeasonContext = createContext(null);

function getInitialSeason() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (SEASONS.some((season) => season.id === saved)) return saved;
  } catch {
    // Ignore storage failures (private mode / blocked storage).
  }
  return LEGACY_SEASON_ID;
}

export function SeasonProvider({ children }) {
  const [activeSeasonId, setActiveSeasonIdState] = useState(getInitialSeason);

  const setActiveSeasonId = (seasonId) => {
    if (!SEASONS.some((season) => season.id === seasonId) || seasonId === activeSeasonId) return;
    setActiveSeasonIdState(seasonId);
    try {
      window.localStorage.setItem(STORAGE_KEY, seasonId);
      // Existing statistics screens load their aggregates on mount. Reloading here keeps
      // every legacy screen season-consistent until they are progressively migrated to hooks.
      window.location.reload();
    } catch {
      // Context state still works if persistence is unavailable.
    }
  };

  const value = useMemo(
    () => ({
      seasons: SEASONS,
      activeSeasonId,
      activeSeason: getSeason(activeSeasonId),
      setActiveSeasonId,
    }),
    [activeSeasonId]
  );

  return <SeasonContext.Provider value={value}>{children}</SeasonContext.Provider>;
}

export function useSeason() {
  const context = useContext(SeasonContext);
  if (!context) throw new Error("useSeason debe usarse dentro de SeasonProvider");
  return context;
}
