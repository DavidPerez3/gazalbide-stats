import { Outlet, useLocation } from "react-router-dom";
import Navbar from "./components/NavBar";
import SeasonTabs from "./components/SeasonTabs.jsx";
import FantasyEconomySummary from "./components/FantasyEconomySummary.jsx";
import FantasyLeGazalOffer from "./components/FantasyLeGazalOffer.jsx";
import FantasyLivePreview from "./components/FantasyLivePreview.jsx";
import PublishedBestLineup from "./components/PublishedBestLineup.jsx";
import ActiveLiveShortcut from "./components/ActiveLiveShortcut.jsx";
import "./mobile-polish.css";
import "./active-live.css";

export default function App() {
  const { pathname } = useLocation();
  const isLiveScorer = pathname === "/admin/live";
  const isLiveFlow = pathname.startsWith("/admin/live");
  const isPublicLive = pathname.startsWith("/live/");
  const isLeGazal = pathname.startsWith("/fantasy/le-gazal");
  const isLeGazalDemo = pathname === "/fantasy/le-gazal-demo";
  const isFantasy = pathname.startsWith("/fantasy");
  const isFantasyHome = pathname === "/fantasy";
  const isNotifications = pathname.startsWith("/notificaciones");
  const publishedMatchId = pathname.startsWith("/partido/")
    ? decodeURIComponent(pathname.slice("/partido/".length))
    : null;
  const hidesSeasonTabs =
    pathname.startsWith("/admin") ||
    isPublicLive ||
    isFantasy ||
    isLeGazal ||
    isNotifications ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password");

  if (isLiveScorer) {
    return (
      <div className="live-app-shell">
        <Outlet />
      </div>
    );
  }

  if (isLeGazal) {
    const demoSuffix = isLeGazalDemo ? " le-gazal-demo-shell" : "";
    return (
      <div className={`le-gazal-app-shell${demoSuffix}`}>
        <Navbar />
        <main className={`main le-gazal-app-main${demoSuffix}`}>
          <div className={`container le-gazal-app-container${demoSuffix}`}>
            <Outlet />
          </div>
        </main>
        {!isLiveFlow ? <ActiveLiveShortcut /> : null}
      </div>
    );
  }

  return (
    <div className="h-100">
      <Navbar />
      {isFantasy && <FantasyEconomySummary />}
      {isFantasyHome && <FantasyLeGazalOffer />}
      {!hidesSeasonTabs && <SeasonTabs />}
      <main className="main">
        <div className="container">
          {isFantasyHome && <FantasyLivePreview />}
          <Outlet />
          {publishedMatchId && <PublishedBestLineup matchId={publishedMatchId} />}
        </div>
      </main>
      <footer className="footer">
        <div className="container">© {new Date().getFullYear()} Gazalbide CB</div>
      </footer>
      {!isLiveFlow ? <ActiveLiveShortcut /> : null}
    </div>
  );
}
