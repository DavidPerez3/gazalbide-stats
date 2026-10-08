import { NavLink } from 'react-router-dom';
import '../bottom-navigation.css';
export default function BottomNavigation() {
  const className = ({ isActive }) => `bottom-nav__link${isActive ? ' bottom-nav__link--active' : ''}`;
  return <nav className="bottom-nav" aria-label="Navegación principal inferior">
    <NavLink to="/fantasy" className={className}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v5a5 5 0 0 1-10 0V4Zm0 2H4v3a4 4 0 0 0 4 4m9-7h3v3a4 4 0 0 1-4 4m-4 1v6m-4 0h8" /></svg><span>Fantasy</span></NavLink>
    <NavLink to="/" end className={className}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9" /></svg><span>Inicio</span></NavLink>
    <NavLink to="/porra" className={className}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 5v14m3-11c-1-2-6-2-6 1 0 3 6 2 6 5 0 3-5 3-6 1" /></svg><span>GazalBet</span></NavLink>
  </nav>;
}
