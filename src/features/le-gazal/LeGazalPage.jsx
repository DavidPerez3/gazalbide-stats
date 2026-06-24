import { useLocation } from "react-router-dom";
import { LE_GAZAL_ASSETS } from "./assetPaths";
import { LE_GAZAL_COPY } from "./slotConfig";
import { useLeGazalDemo } from "./useLeGazalDemo";
import LeGazalGrid from "./components/LeGazalGrid";
import LeGazalControlPanel from "./components/LeGazalControlPanel";
import LeGazalRulesModal from "./components/LeGazalRulesModal";
import LeGazalBonusModal from "./components/LeGazalBonusModal";
import LeGazalDebugPanel from "./components/LeGazalDebugPanel";
import LeGazalMascotPanel from "./components/LeGazalMascotPanel";
import "./leGazal.css";

function getDebugEnabled(search) {
  const routeParams = new URLSearchParams(search);
  const pageParams = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");

  return (
    routeParams.get("leGazalDebug") === "1" ||
    pageParams.get("leGazalDebug") === "1" ||
    import.meta.env.VITE_LE_GAZAL_DEBUG === "1"
  );
}

export default function LeGazalPage() {
  const location = useLocation();
  const debugEnabled = getDebugEnabled(location.search);
  const {
    bet,
    setBet,
    bonusIntro,
    bonusState,
    bonusSummary,
    closeBonusIntro,
    closeBonusSummary,
    coinBurstKey,
    grid,
    isSpinning,
    openRules,
    result,
    rulesOpen,
    sessionStats,
    closeRules,
    prefersReducedMotion,
    spin,
  } = useLeGazalDemo();

  const activeWin = result?.amountWon || 0;
  const winningCombinations = result?.winningCombinations || [];
  const resultMessage = result ? result.message : "Pulsa girar para arrancar el modo demo.";

  return (
    <section className="le-gazal-page">
      <div className="le-gazal-arena">
        <div className="le-gazal-cabinet">
          <header className="le-gazal-marquee" aria-label="Cabecera de Le Gazal">
            <img
              src={LE_GAZAL_ASSETS.titleLogo}
              alt={LE_GAZAL_COPY.title}
              className="le-gazal-marquee__title-logo"
            />
            <p>{LE_GAZAL_COPY.disclaimer}</p>
          </header>

          <div className="le-gazal-cabinet__body">
            <aside className="le-gazal-totem" aria-label="Panel de resultado">
              <div className="le-gazal-totem__label">Win</div>
              <div className="le-gazal-totem__value">{activeWin || "0.00"}</div>
              <div className="le-gazal-totem__label">Total Win</div>
              <div className="le-gazal-totem__value">{sessionStats.totalWon || "0.00"}</div>
              <div className="le-gazal-totem__foot">
                <span>Demo</span>
                <strong>{bonusState.remaining > 0 ? `Clutch x${bonusState.multiplier}` : "Activo"}</strong>
              </div>
            </aside>

            <div className="le-gazal-core">
              <section className="le-gazal-machine card">
                <div className="le-gazal-machine__topbar">
                  <div>
                    <span className="le-gazal-chip">Apuesta {bet}</span>
                    {bonusState.remaining > 0 ? (
                      <span className="le-gazal-chip le-gazal-chip--bonus">
                        {bonusState.remaining} free spins x{bonusState.multiplier}
                      </span>
                    ) : null}
                  </div>

                  <div className="le-gazal-machine__legend">
                    WILD: 88 | SCATTER: Escudo | BONUS: Bonus
                  </div>
                </div>

                <LeGazalGrid
                  grid={grid}
                  isSpinning={isSpinning}
                  winningCellKeys={result ? result.winningCellKeys : []}
                  coinBurstKey={coinBurstKey}
                  amountWon={activeWin}
                  reduceMotion={prefersReducedMotion}
                />

                {winningCombinations.length > 0 ? (
                  <div className="le-gazal-machine__footer" aria-live="polite">
                    <div className="le-gazal-machine__wins">
                      {winningCombinations.map((combination) => (
                        <div key={combination.id} className="le-gazal-win-pill">
                          Fila {combination.row + 1}: {combination.symbolLabel} x{combination.matchCount}
                          {combination.usedWild ? " + WILD" : ""} {"->"} {combination.amountWon}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>

              <LeGazalControlPanel
                bet={bet}
                setBet={setBet}
                isSpinning={isSpinning}
                onOpenRules={openRules}
                onSpin={spin}
                result={result}
                resultMessage={resultMessage}
                sessionStats={sessionStats}
                bonusState={bonusState}
              />
            </div>

            <LeGazalMascotPanel />
          </div>

          {debugEnabled ? <LeGazalDebugPanel onRunScenario={spin} /> : null}
        </div>
      </div>

      <LeGazalRulesModal open={rulesOpen} onClose={closeRules} />
      <LeGazalBonusModal modal={bonusIntro} onClose={closeBonusIntro} />
      <LeGazalBonusModal modal={bonusSummary} onClose={closeBonusSummary} />
    </section>
  );
}
