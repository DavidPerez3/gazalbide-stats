import { useEffect, useState } from "react";
import { loadLiveCenterSnapshot, subscribeLiveCenter } from "../../lib/liveCenter";
import { fetchGazalBetPortfolio } from "../../lib/gazalbet";

export function useGazalBetTracking({ enabled, matchId, userId, onPortfolio }) {
  const [state, setState] = useState({ matchId: null, snapshot: null, loading: false, error: "", updatedAt: null });
  useEffect(() => {
    if (!enabled || !userId) return undefined;
    let active = true;
    let inFlight = false;
    let queued = false;
    setState({ matchId, snapshot: null, loading: Boolean(matchId), error: "", updatedAt: null });
    const refresh = async () => {
      if (!active) return;
      if (inFlight) { queued = true; return; }
      inFlight = true;
      // Independently refresh portfolio even if the Live endpoint is unavailable.
      const [liveResult, portfolioResult] = await Promise.allSettled([
        matchId ? loadLiveCenterSnapshot(matchId) : Promise.resolve(null),
        fetchGazalBetPortfolio(userId),
      ]);
      if (active) {
        if (portfolioResult.status === "fulfilled") onPortfolio(portfolioResult.value);
        setState((previous) => ({
          matchId,
          snapshot: liveResult.status === "fulfilled" ? liveResult.value : previous.snapshot,
          loading: false,
          error: liveResult.status === "rejected" || portfolioResult.status === "rejected" ? "No se pudo actualizar el seguimiento. Reintentando…" : "",
          updatedAt: liveResult.status === "fulfilled" && liveResult.value ? Date.now() : previous.updatedAt,
        }));
      }
      inFlight = false;
      if (queued && active) { queued = false; void refresh(); }
    };
    void refresh();
    const unsubscribe = matchId ? subscribeLiveCenter(matchId, refresh) : () => {};
    const timer = setInterval(refresh, 15000);
    const onResume = () => { if (!document.hidden) void refresh(); };
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", onResume);
    return () => {
      active = false;
      clearInterval(timer);
      unsubscribe();
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", onResume);
    };
  }, [enabled, matchId, userId, onPortfolio]);
  // Never display a previous match's snapshot while the new effect starts.
  return state.matchId === matchId ? state : { snapshot: null, loading: enabled && Boolean(matchId), error: "", updatedAt: null };
}
