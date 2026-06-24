import { BET_OPTIONS } from "../slotTypes";

export default function LeGazalControlPanel({
  bet,
  setBet,
  isSpinning,
  onOpenRules,
  onSpin,
  result,
  resultMessage,
  sessionStats,
  bonusState,
}) {
  const lockBet = isSpinning || bonusState.remaining > 0;
  const lastPrize = result ? `${result.amountWon}` : "0";
  const totalWon = sessionStats.totalWon || "0.00";
  const spinLabel = bonusState.remaining > 0 ? "Free Spin" : "Spin";

  return (
    <section className="le-gazal-console">
      <div className="le-gazal-console__status" aria-label="Estado de la partida">
        <span className="le-gazal-console__status-pill">
          <span className="le-gazal-console__label">Apuesta</span>
          <strong className="le-gazal-console__status-value">{bet}</strong>
        </span>
        <span className="le-gazal-console__status-pill">
          {bonusState.remaining > 0 ? `${bonusState.remaining} gratis x${bonusState.multiplier}` : `Win ${lastPrize}`}
        </span>
      </div>

      <div className="le-gazal-console__primary">
        <div className="le-gazal-console__plate le-gazal-console__plate--selector">
          <div className="le-gazal-console__label">Selector</div>
          <div className="le-gazal-console__bets" role="group" aria-label="Apuesta demo">
            {BET_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                className={`le-gazal-console__bet ${option === bet ? "le-gazal-console__bet--active" : ""}`}
                onClick={() => setBet(option)}
                disabled={lockBet}
                aria-label={`Apostar ${option} cervezas virtuales`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="le-gazal-console__spin"
          onClick={() => onSpin()}
          disabled={isSpinning}
          aria-label="Girar slot"
        >
          <span className="le-gazal-console__spin-ring" />
          <span className="le-gazal-console__spin-core">
            <span className="le-gazal-console__spin-arrow">{"\u21bb"}</span>
            <span className="le-gazal-console__spin-text">{isSpinning ? "..." : spinLabel}</span>
          </span>
        </button>
      </div>

      <div className="le-gazal-console__ticker" aria-live="polite">
        {resultMessage}
      </div>

      <div className="le-gazal-console__quickline" aria-label="Resumen de premio">
        <span>
          <strong>Win</strong>
          <em>{lastPrize}</em>
        </span>
        <span>
          <strong>Total Win</strong>
          <em>{totalWon}</em>
        </span>
      </div>

      <div className="le-gazal-console__secondary">
        <button type="button" className="le-gazal-console__tool" onClick={onOpenRules} aria-label="Abrir reglas">
          i
        </button>
      </div>
    </section>
  );
}
