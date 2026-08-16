import "../best-lineup.css";

function formatMinutes(ms) {
  const seconds = Math.max(0, Math.round(Number(ms || 0) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function BestLineupCard({ lineup, players = [], compact = false }) {
  if (!lineup) return null;
  const byId = new Map((players || []).map((player) => [String(player.id ?? player.playerId), player]));
  const names = (lineup.lineupIds || []).map((id) => {
    const player = byId.get(String(id));
    return player ? `#${player.number} ${player.name}` : String(id);
  });

  return (
    <article className={`best-lineup card card--p ${compact ? "best-lineup--compact" : ""}`}>
      <div className="best-lineup__eyebrow">🏆 MEJOR QUINTETO</div>
      <div className="best-lineup__names">{names.join(" · ")}</div>
      <div className="best-lineup__metrics">
        <strong>{Number(lineup.plusMinus) > 0 ? "+" : ""}{Number(lineup.plusMinus || 0)}</strong>
        <span>{formatMinutes(lineup.durationMs)} juntos</span>
        <span>{Number(lineup.gazalbidePts || 0)}–{Number(lineup.opponentPts || 0)} parcial</span>
        <span>{Number(lineup.stints || 0)} stint{Number(lineup.stints || 0) === 1 ? "" : "s"}</span>
      </div>
      {!compact ? (
        <div className="best-lineup__foot">
          <span>+/- por 40: {Number(lineup.plusMinusPer40 || 0).toFixed(1)}</span>
          {!lineup.sampleQualified ? (
            <span className="best-lineup__sample-warning">Muestra inferior a 3:00 · se muestra el mejor disponible.</span>
          ) : (
            <span>Muestra mínima superada: 3:00.</span>
          )}
        </div>
      ) : null}
    </article>
  );
}
