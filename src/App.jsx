import RouteExperience, { SkipLink } from "./components/RouteExperience.jsx";
import BottomNavigation from "./components/BottomNavigation.jsx";
import { OfflineStatus } from "./components/AppInstall.jsx";
import { Link, Outlet, useLocation } from "react-router-dom";
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
  const { pathname, search } = useLocation();
  const hasBottomNav = !pathname.startsWith("/admin") && !pathname.startsWith("/fantasy/le-gazal");
  const isLiveScorer = pathname === "/admin/live";
  const isLiveFlow = pathname.startsWith("/admin/live");
  const isPublicLive = pathname.startsWith("/live/");
  const isLeGazal = pathname.startsWith("/fantasy/le-gazal");
  const isLeGazalDemo = pathname === "/fantasy/le-gazal-demo" || pathname === "/fantasy/le-gazal-diversion";
  const isFantasy = pathname.startsWith("/fantasy");
  const isCoachSelection = pathname === "/fantasy/crear-equipo" && new URLSearchParams(search).get("coach") === "1";
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
    pathname === "/ayuda" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password");

  if (isLiveScorer) {
    return (
      <div className="live-app-shell">
        <RouteExperience />
        <Outlet />
      </div>
    );
  }

  if (isLeGazal) {
    const demoSuffix = isLeGazalDemo ? " le-gazal-demo-shell" : "";
    return (
      <div className={`le-gazal-app-shell${demoSuffix}`}>
        <RouteExperience />
        <SkipLink />
        <Navbar />
      <OfflineStatus />
        <main id="main-content" tabIndex={-1} className={`main le-gazal-app-main${demoSuffix}`}>
          <div className={`container le-gazal-app-container${demoSuffix}`}>
            <Outlet />
          </div>
        </main>
        {!isLiveFlow ? <ActiveLiveShortcut /> : null}
      </div>
    );
  }

  return (
    <div className={`h-100${hasBottomNav ? " app-with-bottom-nav" : ""}`}>
      <RouteExperience />
        <SkipLink />
        <Navbar />
      <OfflineStatus />
      {isFantasy && !isCoachSelection && <FantasyEconomySummary />}
      {isFantasyHome && <FantasyLeGazalOffer />}
      {!hidesSeasonTabs && <SeasonTabs />}
      <main id="main-content" tabIndex={-1} className="main">
        <div className="container">
          {isFantasyHome && <FantasyLivePreview />}
          <Outlet />
          {publishedMatchId && <PublishedBestLineup matchId={publishedMatchId} />}
        </div>
      </main>
      <footer className="footer">
        <div className="container">© {new Date().getFullYear()} Gazalbide CB
          <nav aria-label="Ayuda e información legal" style={{ display: "flex", flexWrap: "wrap", gap: "1rem", marginTop: ".5rem" }}>
            <Link to="/ayuda">Ayuda</Link>
            <a href={`${import.meta.env.BASE_URL}privacidad.html`}>Privacidad</a>
            <a href={`${import.meta.env.BASE_URL}condiciones.html`}>Condiciones de uso</a>
          </nav>
        </div>
      </footer>
      {!isLiveFlow ? <ActiveLiveShortcut /> : null}
      {hasBottomNav && <BottomNavigation />}
    </div>
  );
}
