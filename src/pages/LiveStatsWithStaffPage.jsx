import LiveStatsPage from "./LiveStatsPage.jsx";
import LiveStaffDisciplinePanel from "../features/live-stats/LiveStaffDisciplinePanel.jsx";
import LiveActionHistoryPanel from "../features/live-stats/LiveActionHistoryPanel.jsx";

export default function LiveStatsWithStaffPage() {
  return (
    <>
      <LiveStatsPage />
      <LiveActionHistoryPanel />
      <LiveStaffDisciplinePanel />
    </>
  );
}
