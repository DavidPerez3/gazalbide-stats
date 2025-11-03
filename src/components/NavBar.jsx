import { NavLink } from "react-router-dom";
import { useState } from "react";

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  const link = ({ isActive }) =>
    "nav__link " + (isActive ? "nav__link--active" : "");

  const BASE = import.meta.env.BASE_URL;

  const handleToggle = () => setIsOpen((prev) => !prev);
  const handleLinkClick = () => setIsOpen(false);

  const toggleClassName =
    "navbar__toggle" + (isOpen ? " navbar__toggle--active" : "");

  return (
    <header className="navbar">
      <div className="container navbar__inner">
        <div className="brand">
          <NavLink
            to="/"
            className="flex items-center gap-2"
            onClick={handleLinkClick}
          >
            <img
              src={`${BASE}logo.png`}
              alt="logo"
              className="brand__logo cursor-pointer"
            />
            <span className="brand__title">Gazalbide CB</span>
          </NavLink>
        </div>

        {/* Botón hamburger */}
        <button
          className={toggleClassName}
          type="button"
          onClick={handleToggle}
          aria-expanded={isOpen}
          aria-label="Abrir menú de navegación"
        >
          <span className="navbar__toggle-bar" />
          <span className="navbar__toggle-bar" />
          <span className="navbar__toggle-bar" />
        </button>

        {/* Menú navegación */}
        <nav className={`nav ${isOpen ? "nav--open" : ""}`}>
          <NavLink to="/" className={link} onClick={handleLinkClick}>
            Inicio
          </NavLink>
          <NavLink to="/jugadores" className={link} onClick={handleLinkClick}>
            Jugadores
          </NavLink>
          <NavLink to="/ranking" className={link} onClick={handleLinkClick}>
            Ranking
          </NavLink>
          <NavLink to="/compare" className={link} onClick={handleLinkClick}>
            Comparar
          </NavLink>
        </nav>
      </div>
    </header>
  );
}
