export default function ShotAccuracy({ made, attempted }) {
  const hits = Number(made) || 0;
  const tries = Number(attempted) || 0;
  const percentage = tries > 0 ? `${(hits / tries * 100).toFixed(1).replace('.', ',')} %` : '—';
  return <span className="shot-accuracy"><strong>{hits}/{tries}</strong><small>{percentage}</small></span>;
}
