import { useEffect } from "react";
import LiveStatsPage from "./LiveStatsPage.jsx";
import LiveStaffDisciplinePanel from "../features/live-stats/LiveStaffDisciplinePanel.jsx";
import LiveActionHistoryPanel from "../features/live-stats/LiveActionHistoryPanel.jsx";
import LiveClockPeriodPanel from "../features/live-stats/LiveClockPeriodPanel.jsx";
import LiveReviewEntry from "../features/live-stats/LiveReviewEntry.jsx";
import LiveReliabilityGuard from "../features/live-stats/LiveReliabilityGuard.jsx";
import { hapticTap } from "../features/live-stats/haptics.js";
import { retryPendingLiveSync } from "../features/live-stats/localSession.js";

export default function LiveStatsWithStaffPage() {
  useEffect(() => {
    const handleLiveControl = (event) => {
      const control = event.target?.closest?.("button, [role='button'], select");
      if (!control || control.disabled || control.getAttribute?.("aria-disabled") === "true") return;
      hapticTap();
    };

    const handleOnline = () => {
      void retryPendingLiveSync();
    };

    document.addEventListener("click", handleLiveControl);
    window.addEventListener("online", handleOnline);
    void retryPendingLiveSync();

    return () => {
      document.removeEventListener("click", handleLiveControl);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  return (
    <LiveReliabilityGuard>
      <LiveStatsPage />
      <LiveActionHistoryPanel />
      <LiveClockPeriodPanel />
      <LiveStaffDisciplinePanel />
      <LiveReviewEntry />
    </LiveReliabilityGuard>
  );
}
