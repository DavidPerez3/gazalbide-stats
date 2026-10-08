import "../advanced-stats.css";
import '../fantasy-polish.css';
const number=(n)=>Number(n||0).toFixed(2);
export default function FantasyScoreBreakdown({ breakdown, available = true }) {
  if(!available||!breakdown)return <p className="fantasy-score-note">Puntuación pendiente de estadísticas. Una jornada sin datos no se cuenta como cero en tus promedios.</p>;
  return <details className="fantasy-score-breakdown"><summary>Cómo se calculan estos {number(breakdown.totalPoints)} puntos</summary>
    <p>PIR × capitán × sinergias activas. Los multiplicadores también se aplican a un PIR negativo.</p>
    <dl>{[['PIR base',breakdown.baseTotal],['Aporte del capitán',breakdown.captainBonus],['Aporte de sinergias y rasgos',breakdown.synergyBonus],['Bonus independiente por victoria',breakdown.victoryBonus],['Total',breakdown.totalPoints]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{number(value)}</dd></div>)}</dl>
    <p className="fantasy-score-note">Las reglas actuales no añaden un bonus independiente por victoria. Los rasgos configurados y las coincidencias con el entrenador determinan las sinergias.</p>
    <div className="stats-table"><table><thead><tr><th>Jugador</th><th>PIR</th><th>Capitán</th><th>Sinergias</th><th>Final</th></tr></thead><tbody>{breakdown.players.map((player)=><tr key={player.number}><td>#{player.number} {player.name}</td><td>{number(player.pirBase)}</td><td>×{player.captainMult}</td><td>×{number(player.synergyFactor)}<small>{player.synergies.filter((s)=>!s.includes('CAP')).join(' · ') || 'Sin sinergia activa'}</small></td><td>{number(player.finalScore)}</td></tr>)}</tbody></table></div>
  </details>;
}
