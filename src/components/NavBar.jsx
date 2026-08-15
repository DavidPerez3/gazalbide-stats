import { NavLink, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();

  const link = ({ isActive }) =>
    "nav__link " + (isActive ? "nav__link--active" : "");

  const BASE = import.meta.env.BASE_URL;

  const handleToggle = () => setIsOpen((prev) => !prev);
  const handleLinkClick = () => setIsOpen(false);

  const handleSignOut = async () => {
    await signOut();
    setIsOpen(false);
    navigate("/"); // o "/login" si prefieres que redirija al login
  };

  // criterio de admin: is_admin TRUE o email concreto
  const isAdmin =
    user &&
    (profile?.is_admin === true ||
      user.email === "perez.david@opendeusto.es");

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
          <NavLink to="/fantasy" className={link} onClick={handleLinkClick}>
            Fantasy
          </NavLink>

          {/* Si NO hay usuario → mostrar Login */}
          {!user && (
            <NavLink to="/login" className={link} onClick={handleLinkClick}>
              Login
            </NavLink>
          )}

          {/* Si hay usuario → mostrar Fantasy y Salir */}
          {user && (
            <>
              {/* Solo admin → mostrar Admin */}
              {isAdmin && (
                <NavLink
                  to="/admin"
                  className={link}
                  onClick={handleLinkClick}
                >
                  Admin
                </NavLink>
              )}

              <button
                type="button"
                onClick={handleSignOut}
                className="nav__link nav__link--button"
              >
                Salir
              </button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
