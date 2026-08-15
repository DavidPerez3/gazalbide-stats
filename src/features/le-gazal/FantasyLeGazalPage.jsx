import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LE_GAZAL_ASSETS } from "./assetPaths";
import { useLeGazalFantasy } from "./useLeGazalFantasy";
import LeGazalGrid from "./components/LeGazalGrid";
import LeGazalControlPanel from "./components/LeGazalControlPanel";
import LeGazalRulesModal from "./components/LeGazalRulesModal";
import LeGazalBonusModal from "./components/LeGazalBonusModal";
import LeGazalMascotPanel from "./components/LeGazalMascotPanel";
import "./leGazal.css";
import "./leGazalMobile.css";

const setupCard = {
  maxWidth: 720,
  margin: "28px auto",
  padding: 20,
  borderRadius: 18,
  border: "1px solid rgba(250, 204, 21, 0.35)",
  background: "rgba(24, 24, 27, 0.96)",
};

const buttonStyle = {
  border: "1px solid rgba(250, 204, 21, 0.45)",
  borderRadius: 12,
  padding: "10px 14px",
  background: "rgba(250, 204, 21, 0.12)",
  color: "#FAFAFA",
  fontWeight: 700,
  cursor: "pointer",
};

export default function FantasyLeGazalPage() {
  const navigate = useNavigate();
  const state = useLeGazalFantasy();
  const [allocation, setAllocation] = useState(1);

  useEffect(() => {
    if (state.offer?.available) {
      setAllocation(Number(state.offer.available));
    }
  }, [state.offer]);

  if (state.loading) {
    return <div style={setupCard}>Cargando Le Gazal...</div>;
  }

  const active = state.session?.status === "active";

  if (!active) {
    const saved = state.cashoutSummary ||
      (state.session?.status === "cashed_out"
        ? { transferred: state.session.cashout_amount || 0 }
        : null);

    return (
      <section className="le-gazal-page">
        <div style={setupCard}>
          <button type="button" style={buttonStyle} onClick={() => navigate("/fantasy")}>
            ← Volver a Fantasy
          </button>

          <div style={{ textAlign: "center", marginTop: 16 }}>
            <img
              src={LE_GAZAL_ASSETS.titleLogo}
              alt="Le Gazal"
              style={{ maxWidth: 360, width: "82%", height: "auto" }}
            />
            <p style={{ color: "#A1A1AA" }}>Cervezas virtuales de Fantasy · sin valor económico real.</p>
          </div>

          {state.error ? <p style={{ color: "#FCA5A5" }}>{state.error}</p> : null}

          {saved ? (
            <div>
              <h2>Saldo guardado</h2>
              <p>El resultado queda registrado y se aplicará a la siguiente jornada.</p>
              <strong>{Number(saved.transferred || 0)} 🍺 añadidas al ahorro</strong>
            </div>
          ) : state.offer ? (
            <div>
              <h2>{state.offer.gameweekName}: ahorrar o Le Gazal</h2>
              <p>
                Tienes <strong>{state.offer.available} 🍺</strong> sobrantes de una alineación válida.
                Si no haces nada, se guardan automáticamente.
              </p>

              <label style={{ display: "block", marginTop: 16 }}>
                <strong>Destinar a Le Gazal: {allocation} 🍺</strong>
                <input
                  type="range"
                  min="1"
                  max={state.offer.available}
                  step="1"
                  value={allocation}
                  onChange={(event) => setAllocation(Number(event.target.value))}
                  disabled={state.actionLoading}
                  style={{ width: "100%", marginTop: 10 }}
                />
              </label>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
                <button type="button" style={buttonStyle} onClick={() => navigate("/fantasy")}>
                  Ahorrar {state.offer.available} 🍺
                </button>
                <button
                  type="button"
                  style={buttonStyle}
                  disabled={state.actionLoading}
                  onClick={() => state.startSession(allocation)}
                >
                  {state.actionLoading ? "Abriendo..." : `Jugar con ${allocation} 🍺`}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <h2>Le Gazal no está disponible</h2>
              <p>
                Se habilita después de una jornada finalizada con alineación válida y cervezas sobrantes.
              </p>
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="le-gazal-page">
      <div className="le-gazal-arena">
        <div className="le-gazal-cabinet">
          <header className="le-gazal-marquee">
            <img src={LE_GAZAL_ASSETS.titleLogo} alt="Le Gazal" className="le-gazal-marquee__title-logo" />
            <p>Fantasy · saldo virtual persistido en servidor · sin valor económico real</p>
          </header>

          {state.error ? (
            <div role="alert" style={{ margin: 12, color: "#FCA5A5" }}>{state.error}</div>
          ) : null}

          <div className="le-gazal-cabinet__body">
            <aside className="le-gazal-totem">
              <div className="le-gazal-totem__label">Saldo</div>
              <div className="le-gazal-totem__value">{Number(state.session.balance || 0)}</div>
              <div className="le-gazal-totem__label">Total Win</div>
              <div className="le-gazal-totem__value">{Number(state.sessionStats.totalWon || 0)}</div>
              <div className="le-gazal-totem__foot">
                <span>Fantasy</span>
                <strong>
                  {state.bonusState.remaining > 0
                    ? `Clutch x${state.bonusState.multiplier}`
                    : "Servidor"}
                </strong>
              </div>
            </aside>

            <div className="le-gazal-core">
              <section className="le-gazal-machine card">
                <LeGazalGrid
                  grid={state.grid}
                  isSpinning={state.isSpinning}
                  stoppedColumns={state.stoppedColumns}
                  winningCellKeys={[]}
                  coinBurstKey={state.coinBurstKey}
                  amountWon={Number(state.result?.payout || 0)}
                  reduceMotion={state.prefersReducedMotion}
                />
              </section>

              <LeGazalControlPanel
                bet={state.bet}
                setBet={state.setBet}
                balance={Number(state.session.balance || 0)}
                isSpinning={state.isSpinning}
                actionLoading={state.actionLoading}
                onOpenRules={state.openRules}
                onSpin={state.spin}
                onCashout={state.cashout}
                result={state.result}
                resultMessage={state.resultMessage}
                sessionStats={state.sessionStats}
                bonusState={state.bonusState}
              />
            </div>

            <LeGazalMascotPanel />
          </div>
        </div>
      </div>

      <LeGazalRulesModal open={state.rulesOpen} onClose={state.closeRules} />
      <LeGazalBonusModal modal={state.bonusIntro} onClose={state.closeBonusIntro} />
      <LeGazalBonusModal modal={state.bonusSummary} onClose={state.closeBonusSummary} />
    </section>
  );
}
