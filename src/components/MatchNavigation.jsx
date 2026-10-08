import { Link } from "react-router-dom";
import { matchLinks } from "../lib/matchLinks.js";
export default function MatchNavigation({ matchId }) {
  if (!matchId) return null;
  const links = matchLinks(matchId);
  return <nav className="match-navigation" aria-label="Vistas del partido"><Link to={links.live}>Live Center</Link><Link to={links.stats}>Estadísticas</Link><Link to={links.bets}>Mis boletos</Link><Link to="/fantasy">Fantasy</Link></nav>;
}
