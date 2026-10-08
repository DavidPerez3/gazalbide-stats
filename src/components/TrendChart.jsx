export default function TrendChart({ points, title }) {
  if (!points.length) return <p>No hay datos para este gráfico.</p>;
  const low = Math.min(0,...points.map((p)=>p.value));
  const high = Math.max(1,...points.map((p)=>p.value));
  const y = (value)=>155-(value-low)/(high-low)*125;
  const coordinates=points.map((p,i)=>`${30+i/Math.max(1,points.length-1)*540},${y(p.value)}`).join(' ');
  return <figure className="stats-trend"><svg viewBox="0 0 600 180" role="img" aria-label={`${title}. Mínimo ${low}, máximo ${high}. Último valor ${points.at(-1).value}.`}><title>{title}</title><line x1="30" x2="570" y1={y(0)} y2={y(0)} stroke="#777" strokeDasharray="4 4" /><polyline points={coordinates} fill="none" stroke="#ffbf24" strokeWidth="3" /><text x="2" y="30" fill="currentColor" fontSize="12">{high}</text><text x="2" y="158" fill="currentColor" fontSize="12">{low}</text>{points.map((p,i)=><circle key={i} cx={30+i/Math.max(1,points.length-1)*540} cy={y(p.value)} r="3" fill="#ffbf24"><title>{p.label}: {p.value}</title></circle>)}</svg><figcaption>{title} · de izquierda a derecha, en orden de juego</figcaption></figure>;
}
