import { Outlet } from "react-router-dom";
import Navbar from "./components/NavBar";

export default function App() {
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
