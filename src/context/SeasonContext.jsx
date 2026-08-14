import { createContext, useContext, useMemo, useState } from "react";
import { CURRENT_SEASON_ID, SEASONS, getSeason } from "../lib/seasons.js";

const STORAGE_KEY = "gazalbide.activeSeason";
const SeasonContext = createContext(null);

function getInitialSeason() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (SEASONS.some((season) => season.id === saved)) return saved;
  } catch {
    // Ignore storage failures (private mode / blocked storage).
  }
  return CURRENT_SEASON_ID;
}

export function SeasonProvider({ children }) {
  const [activeSeasonId, setActiveSeasonIdState] = useState(getInitialSeason);

  const setActiveSeasonId = (seasonId) => {
    if (!SEASONS.some((season) => season.id === seasonId)) return;
    setActiveSeasonIdState(seasonId);
    try {
      window.localStorage.setItem(STORAGE_KEY, seasonId);
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
