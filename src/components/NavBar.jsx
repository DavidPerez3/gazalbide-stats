import { NavLink } from "react-router-dom";

export default function Navbar() {
  const link = ({ isActive }) =>
    "nav__link " + (isActive ? "nav__link--active" : "");
  const BASE = import.meta.env.BASE_URL;

  return (
    <header className="navbar">
      <div className="container navbar__inner">
        <div className="brand">
          <NavLink to="/" className="flex items-center gap-2">
            <img
              src={`${BASE}logo.png`}
              alt="logo"
              className="brand__logo cursor-pointer"
            />
            <span className="brand__title">Gazalbide CB</span>
          </NavLink>
        </div>
        <nav className="nav">
          <NavLink to="/" className={link}>
            Inicio
          </NavLink>
          <NavLink to="/jugadores" className={link}>
            Jugadores
          </NavLink>
          <NavLink to="/ranking" className={link}>
            Ranking
          </NavLink>
        </nav>
      </div>
    </header>
  );
}
