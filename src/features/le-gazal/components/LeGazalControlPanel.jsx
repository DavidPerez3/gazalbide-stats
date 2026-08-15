import { BET_OPTIONS } from "../slotTypes";

export default function LeGazalControlPanel({
  bet,
  setBet,
  balance = 0,
  isSpinning,
  actionLoading = false,
  onOpenRules,
  onSpin,
  onCashout,
  result,
  resultMessage,
  sessionStats,
  bonusState,
}) {
  const hasFreeSpin = bonusState.remaining > 0;
  const lockBet = isSpinning || actionLoading || hasFreeSpin;
  const lastPrize = result ? `${result.payout ?? 0}` : "0";
  const totalWon = sessionStats.totalWon || "0";
  const spinLabel = hasFreeSpin ? "Free Spin" : "Spin";
  const canSpin = hasFreeSpin || Number(balance) >= Number(bet);

  return (
    <section className="le-gazal-console">
      <div className="le-gazal-console__status" aria-label="Estado de la partida">
        <span className="le-gazal-console__status-pill">
          <span className="le-gazal-console__label">Saldo</span>
          <strong className="le-gazal-console__status-value">{balance} 🍺</strong>
        </span>
        <span className="le-gazal-console__status-pill">
          {hasFreeSpin
            ? `${bonusState.remaining} gratis x${bonusState.multiplier}`
            : `Win ${lastPrize}`}
        </span>
      </div>

      <div className="le-gazal-console__primary">
        <div className="le-gazal-console__plate le-gazal-console__plate--selector">
          <div className="le-gazal-console__label">Apuesta</div>
          <div className="le-gazal-console__bets" role="group" aria-label="Apuesta Le Gazal">
            {BET_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                className={`le-gazal-console__bet ${option === bet ? "le-gazal-console__bet--active" : ""}`}
                onClick={() => setBet(option)}
                disabled={lockBet || option > Number(balance)}
                aria-label={`Apostar ${option} cervezas`}
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
          disabled={isSpinning || actionLoading || !canSpin}
          aria-label="Girar Le Gazal"
        >
          <span className="le-gazal-console__spin-ring" />
          <span className="le-gazal-console__spin-core">
            <span className="le-gazal-console__spin-arrow">{"\u21bb"}</span>
            <span className="le-gazal-console__spin-text">
              {isSpinning || actionLoading ? "..." : spinLabel}
            </span>
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
        <button
          type="button"
          className="le-gazal-console__tool"
          onClick={onOpenRules}
          aria-label="Abrir reglas"
        >
          i
        </button>
        {onCashout ? (
          <button
            type="button"
            className="le-gazal-console__bet"
            onClick={onCashout}
            disabled={isSpinning || actionLoading}
            aria-label={`Retirarse y ahorrar ${balance} cervezas`}
            style={{ minWidth: "auto", paddingInline: "12px" }}
          >
            Guardar {balance} 🍺
          </button>
        ) : null}
      </div>
    </section>
  );
}
