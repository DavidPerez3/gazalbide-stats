import { Outlet, useLocation } from "react-router-dom";
import Navbar from "./components/NavBar";
import SeasonTabs from "./components/SeasonTabs.jsx";
import FantasyEconomySummary from "./components/FantasyEconomySummary.jsx";
import "./mobile-polish.css";

export default function App() {
  const { pathname } = useLocation();
  const isLiveScorer = pathname === "/admin/live";
  const isLeGazal = pathname.startsWith("/le-gazal");
  const isFantasy = pathname.startsWith("/fantasy");
  const hidesSeasonTabs =
    pathname.startsWith("/admin") ||
    isFantasy ||
    isLeGazal ||
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
    return (
      <div className="le-gazal-app-shell">
        <Navbar />
        <main className="main le-gazal-app-main">
          <div className="container le-gazal-app-container">
            <Outlet />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="h-100">
      <Navbar />
      {isFantasy && <FantasyEconomySummary />}
      {!hidesSeasonTabs && <SeasonTabs />}
      <main className="main">
        <div className="container">
          <Outlet />
        </div>
      </main>
      <footer className="footer">
        <div className="container">© {new Date().getFullYear()} Gazalbide CB</div>
      </footer>
    </div>
  );
}
