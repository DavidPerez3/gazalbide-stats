import { Outlet, useLocation } from "react-router-dom";
import Navbar from "./components/NavBar";

export default function App() {
  const { pathname } = useLocation();
  const isLiveScorer = pathname === "/admin/live";

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
