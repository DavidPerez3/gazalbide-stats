import { summarizeFantasyHistory } from '../lib/fantasyHistoryStats.js';
import TrendChart from './TrendChart.jsx';
import '../advanced-stats.css';
import '../fantasy-polish.css';
export default function FantasyHistorySummary({ entries }) {
  const summary=summarizeFantasyHistory(entries);
  return <section className="fantasy-history-summary"><h2>Resumen del historial seleccionado</h2><div className="stats-kpis">{[['Jornadas con datos',summary.games],['Pendientes',summary.pending],['Total',summary.total.toFixed(1)],['Media',summary.average.toFixed(1)],['Mejor jornada',summary.best==null?'—':summary.best.toFixed(1)],['Peor jornada',summary.worst==null?'—':summary.worst.toFixed(1)]].map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>{summary.games>0&&<TrendChart title="Puntos Fantasy por jornada" points={summary.evolution}/>}</section>;
}
