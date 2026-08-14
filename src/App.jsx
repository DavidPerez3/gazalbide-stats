import { Outlet, useLocation } from "react-router-dom";
import Navbar from "./components/NavBar";
import SeasonTabs from "./components/SeasonTabs.jsx";

export default function App() {
  const { pathname } = useLocation();
  const isLiveScorer = pathname === "/admin/live";
  const hidesSeasonTabs =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/fantasy") ||
    pathname.startsWith("/le-gazal") ||
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

  return (
    <div className="h-100">
      <Navbar />
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
