import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LE_GAZAL_ASSETS } from "./assetPaths";
import { createDisplayGrid, spinSlot } from "./slotEngine";
import { SLOT_COLUMNS, SPECIAL_SYMBOLS } from "./slotTypes";
import LeGazalGrid from "./components/LeGazalGrid";
import LeGazalControlPanel from "./components/LeGazalControlPanel";
import LeGazalRulesModal from "./components/LeGazalRulesModal";
import LeGazalBonusModal from "./components/LeGazalBonusModal";
import LeGazalMascotPanel from "./components/LeGazalMascotPanel";
import LeGazalClutchAnimation from "./components/LeGazalClutchAnimation";
import LeGazalClutchPlusAnimation from "./components/LeGazalClutchPlusAnimation";
import "./leGazal.css";
import "./leGazalMobile.css";
import "./leGazalDemo.css";

const INITIAL_BALANCE = 20;
const DEMO_SCATTER_FREE_SPINS = 10;
const DEMO_SCATTER4_FREE_SPINS = 15;
const DEMO_SCATTER4_MULTIPLIER = 3;

const SCENARIOS = [
  { value: "random", label: "Aleatoria" },
  { value: "lose", label: "Sin premio" },
  { value: "small", label: "Premio pequeño" },
  { value: "medium", label: "Premio medio" },
  { value: "high", label: "Premio grande" },
  { value: "wild", label: "Wild" },
  { value: "scatter", label: "3 Scatter · CLUTCH TIME" },
  { value: "scatter4", label: "4 Scatter · CLUTCH TIME+" },
  { value: "bonus", label: "Bonus legacy · CLUTCH TIME+" },
];

function getReducedMotionPreference() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function replaceColumn(previousGrid, nextGrid, columnIndex) {
  return previousGrid.map((row, rowIndex) =>
    row.map((cell, colIndex) =>
      colIndex === columnIndex ? nextGrid[rowIndex][columnIndex] : cell
    )
  );
}

function mergeSpinFrame(previousGrid, nextGrid, stoppedColumns) {
  const randomFrame = createDisplayGrid();
  return previousGrid.map((row, rowIndex) =>
    row.map((cell, colIndex) =>
      stoppedColumns[colIndex] ? nextGrid[rowIndex][colIndex] : randomFrame[rowIndex][colIndex] || cell
    )
  );
}

function ensureScatterCount(grid, desiredCount) {
  const nextGrid = grid.map((row) => [...row]);
  let count = nextGrid.flat().filter((symbol) => symbol === SPECIAL_SYMBOLS.SCATTER).length;

  for (let row = 0; row < nextGrid.length && count < desiredCount; row += 1) {
    for (let col = 0; col < nextGrid[row].length && count < desiredCount; col += 1) {
      if (nextGrid[row][col] !== SPECIAL_SYMBOLS.SCATTER) {
        nextGrid[row][col] = SPECIAL_SYMBOLS.SCATTER;
        count += 1;
      }
    }
  }

  return nextGrid;
}

function createDemoSession() {
  return {
    id: `admin-demo-${Date.now()}`,
    status: "active",
    balance: INITIAL_BALANCE,
    free_spins_remaining: 0,
    free_spin_bet: null,
    bonus_multiplier: 1,
    total_spins: 0,
    total_bet: 0,
    total_payout: 0,
  };
}

function demoResultMessage(result) {
  if (!result) return "Modo prueba: ninguna tirada modifica Fantasy ni Supabase.";
  if (result.scenario === "scatter") {
    return `CLUTCH TIME: ${result.free_spins_awarded} tiradas gratis. Saldo ${result.balance} 🍺 de prueba.`;
  }
  if (result.scenario === "scatter4") {
    return `CLUTCH TIME+: ${result.free_spins_awarded} tiradas gratis con calderos multi y jackpot multi. Saldo ${result.balance} 🍺 de prueba.`;
  }
  if (result.scenario === "bonus") {
    return `CLUTCH TIME+ legacy: ${result.free_spins_awarded} tiradas gratis. Saldo ${result.balance} 🍺 de prueba.`;
  }
  if (Number(result.payout || 0) > 0) {
    return `Premio de ${result.payout} 🍺. Saldo de prueba: ${result.balance} 🍺.`;
  }
  return `Sin premio. Saldo de prueba: ${result.balance} 🍺.`;
}

export default function LeGazalAdminDemoPage() {
  const navigate = useNavigate();
  const timeoutRefs = useRef([]);
  const intervalRef = useRef(null);
  const stoppedColumnsRef = useRef(Array(SLOT_COLUMNS).fill(true));

  const [session, setSession] = useState(createDemoSession);
  const [bet, setBet] = useState(3);
  const [grid, setGrid] = useState(() => createDisplayGrid());
  const [isSpinning, setIsSpinning] = useState(false);
  const [stoppedColumns, setStoppedColumns] = useState(() => Array(SLOT_COLUMNS).fill(true));
  const [result, setResult] = useState(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(getReducedMotionPreference);
  const [bonusIntro, setBonusIntro] = useState(null);
  const [bonusSummary, setBonusSummary] = useState(null);
  const [clutchAnimation, setClutchAnimation] = useState(null);
  const [clutchPlusAnimation, setClutchPlusAnimation] = useState(null);
  const [coinBurstKey, setCoinBurstKey] = useState(0);
  const [forcedScenario, setForcedScenario] = useState("random");
  const [cashoutSummary, setCashoutSummary] = useState(null);

  const isBusy = isSpinning || Boolean(clutchAnimation) || Boolean(clutchPlusAnimation);

  const clearTimers = useCallback(() => {
    timeoutRefs.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    timeoutRefs.current = [];
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setPrefersReducedMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const closeClutchAnimation = useCallback(() => {
    setClutchAnimation(null);
  }, []);

  const closeClutchPlusAnimation = useCallback(() => {
    setClutchPlusAnimation(null);
  }, []);

  const finishAnimation = useCallback((spinOutcome, nextResult, previousSession) => {
    clearTimers();
    setGrid(spinOutcome.grid);
    const allStopped = Array(SLOT_COLUMNS).fill(true);
    setStoppedColumns(allStopped);
    stoppedColumnsRef.current = allStopped;
    setResult(nextResult);
    setIsSpinning(false);

    if (Number(nextResult.payout || 0) > 0) setCoinBurstKey((previous) => previous + 1);

    if (Number(nextResult.free_spins_awarded || 0) > 0) {
      if (nextResult.scenario === "scatter") {
        setClutchAnimation({
          freeSpins: Number(nextResult.free_spins_awarded),
          multiplier: Number(nextResult.bonus_multiplier),
        });
      } else if (nextResult.scenario === "scatter4") {
        setClutchPlusAnimation({
          freeSpins: Number(nextResult.free_spins_awarded),
          multiplier: Number(nextResult.bonus_multiplier),
        });
      } else {
        setBonusIntro({
          title: "CLUTCH TIME+",
          description: `${nextResult.free_spins_awarded} tiradas gratis con multiplicador x${nextResult.bonus_multiplier}.`,
          freeSpins: Number(nextResult.free_spins_awarded),
          multiplier: Number(nextResult.bonus_multiplier),
        });
      }
    }

    if (
      Number(previousSession?.free_spins_remaining || 0) > 0 &&
      Number(nextResult.free_spins_remaining || 0) === 0 &&
      Number(nextResult.free_spins_awarded || 0) === 0
    ) {
      setBonusSummary({
        title: "Fin del CLUTCH TIME",
        totalWon: Number(previousSession?.total_payout || 0) + Number(nextResult.payout || 0),
        spins: Number(previousSession?.total_spins || 0) + 1,
        multiplier: Number(previousSession?.bonus_multiplier || 1),
      });
    }
  }, [clearTimers]);

  const spin = useCallback(() => {
    if (session.status !== "active" || isBusy) return;

    const hasFreeSpin = Number(session.free_spins_remaining || 0) > 0;
    const spinBet = hasFreeSpin ? Number(session.free_spin_bet || bet) : Number(bet);
    if (!hasFreeSpin && spinBet > Number(session.balance || 0)) return;

    setResult(null);
    setBonusIntro(null);
    setBonusSummary(null);
    setClutchAnimation(null);
    setClutchPlusAnimation(null);
    setIsSpinning(true);
    clearTimers();

    const previousSession = session;
    const roundMultiplier = hasFreeSpin ? Number(session.bonus_multiplier || 1) : 1;
    const requestedScenario = forcedScenario;
    const engineScenario = requestedScenario === "scatter4"
      ? "scatter"
      : requestedScenario === "random"
        ? null
        : requestedScenario;

    let visualOutcome = spinSlot({
      bet: spinBet,
      roundMultiplier,
      forcedOutcome: engineScenario,
    });

    if (requestedScenario === "scatter4") {
      visualOutcome = {
        ...visualOutcome,
        grid: ensureScatterCount(visualOutcome.grid, 4),
        scenarioId: "scatter4",
        scatterCount: 4,
      };
    }

    if (forcedScenario !== "random") setForcedScenario("random");

    const betSpent = hasFreeSpin ? 0 : spinBet;
    const engineFreeSpins = Number(visualOutcome.freeSpinsAwarded || 0);
    const freeSpinsAwarded = visualOutcome.scenarioId === "scatter"
      ? DEMO_SCATTER_FREE_SPINS
      : visualOutcome.scenarioId === "scatter4"
        ? DEMO_SCATTER4_FREE_SPINS
        : engineFreeSpins;
    const remainingAfterConsumed = Math.max(
      0,
      Number(session.free_spins_remaining || 0) - (hasFreeSpin ? 1 : 0)
    );
    const freeSpinsRemaining = remainingAfterConsumed + freeSpinsAwarded;
    const bonusMultiplier = freeSpinsAwarded > 0
      ? visualOutcome.scenarioId === "scatter4"
        ? DEMO_SCATTER4_MULTIPLIER
        : Number(visualOutcome.awardedMultiplier || 1)
      : freeSpinsRemaining > 0
        ? Number(session.bonus_multiplier || 1)
        : 1;
    const payout = Number(visualOutcome.amountWon || 0);
    const nextBalance = Math.max(0, Number(session.balance || 0) - betSpent + payout);

    const nextResult = {
      scenario: visualOutcome.scenarioId,
      bet: spinBet,
      bet_spent: betSpent,
      round_multiplier: roundMultiplier,
      payout,
      balance: nextBalance,
      free_spins_awarded: freeSpinsAwarded,
      free_spins_remaining: freeSpinsRemaining,
      bonus_multiplier: bonusMultiplier,
    };

    setSession((previous) => ({
      ...previous,
      balance: nextBalance,
      free_spins_remaining: freeSpinsRemaining,
      free_spin_bet: freeSpinsRemaining > 0 ? Number(previous.free_spin_bet || spinBet) : null,
      bonus_multiplier: bonusMultiplier,
      total_spins: Number(previous.total_spins || 0) + 1,
      total_bet: Number(previous.total_bet || 0) + betSpent,
      total_payout: Number(previous.total_payout || 0) + payout,
    }));

    const allMoving = Array(SLOT_COLUMNS).fill(false);
    stoppedColumnsRef.current = allMoving;
    setStoppedColumns(allMoving);

    if (!prefersReducedMotion) {
      intervalRef.current = window.setInterval(() => {
        setGrid((previous) => mergeSpinFrame(previous, visualOutcome.grid, stoppedColumnsRef.current));
      }, 68);
    }

    const baseDelay = prefersReducedMotion ? 0 : 360;
    const stepDelay = prefersReducedMotion ? 36 : 190;

    for (let columnIndex = 0; columnIndex < SLOT_COLUMNS; columnIndex += 1) {
      const timeoutId = window.setTimeout(() => {
        stoppedColumnsRef.current[columnIndex] = true;
        setStoppedColumns((previous) => {
          const next = [...previous];
          next[columnIndex] = true;
          return next;
        });
        setGrid((previous) => replaceColumn(previous, visualOutcome.grid, columnIndex));
      }, baseDelay + columnIndex * stepDelay);
      timeoutRefs.current.push(timeoutId);
    }

    const finishDelay = baseDelay + SLOT_COLUMNS * stepDelay + (prefersReducedMotion ? 20 : 260);
    const finishTimeoutId = window.setTimeout(
      () => finishAnimation(visualOutcome, nextResult, previousSession),
      finishDelay
    );
    timeoutRefs.current.push(finishTimeoutId);
  }, [session, isBusy, bet, clearTimers, forcedScenario, prefersReducedMotion, finishAnimation]);

  const cashout = useCallback(() => {
    if (session.status !== "active" || isBusy) return;
    clearTimers();
    setCashoutSummary({ transferred: Number(session.balance || 0) });
    setSession((previous) => ({
      ...previous,
      status: "cashed_out",
      free_spins_remaining: 0,
      free_spin_bet: null,
      bonus_multiplier: 1,
      cashout_amount: Number(previous.balance || 0),
    }));
  }, [session, isBusy, clearTimers]);

  const resetDemo = useCallback(() => {
    clearTimers();
    setSession(createDemoSession());
    setBet(3);
    setGrid(createDisplayGrid());
    setStoppedColumns(Array(SLOT_COLUMNS).fill(true));
    stoppedColumnsRef.current = Array(SLOT_COLUMNS).fill(true);
    setResult(null);
    setBonusIntro(null);
    setBonusSummary(null);
    setClutchAnimation(null);
    setClutchPlusAnimation(null);
    setCashoutSummary(null);
    setForcedScenario("random");
    setIsSpinning(false);
  }, [clearTimers]);

  const bonusState = useMemo(() => ({
    remaining: Number(session.free_spins_remaining || 0),
    multiplier: Number(session.bonus_multiplier || 1),
    totalWon: Number(session.total_payout || 0),
  }), [session]);

  const sessionStats = useMemo(() => {
    const totalBet = Number(session.total_bet || 0);
    const totalWon = Number(session.total_payout || 0);
    return {
      spins: Number(session.total_spins || 0),
      totalBet,
      totalWon,
      net: totalWon - totalBet,
      bestWin: Number(result?.payout || 0),
      lastResult: demoResultMessage(result),
    };
  }, [session, result]);

  if (session.status !== "active") {
    return (
      <section className="le-gazal-page le-gazal-demo">
        <div className="le-gazal-demo__end card card--p">
          <span className="le-gazal-demo__badge">MODO PRUEBA ADMIN</span>
          <h1>Prueba terminada</h1>
          <p>
            Has guardado <strong>{Number(cashoutSummary?.transferred || 0)} 🍺 ficticias</strong>.
            No se ha modificado tu Fantasy, tu ahorro ni ninguna tabla de Supabase.
          </p>
          <div className="le-gazal-demo__actions">
            <button type="button" onClick={resetDemo}>↻ Reiniciar prueba</button>
            <button type="button" onClick={() => navigate("/admin/fantasy")}>← Volver a Admin Fantasy</button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="le-gazal-page le-gazal-demo">
      <div className="le-gazal-demo__toolbar">
        <div>
          <span className="le-gazal-demo__badge">MODO PRUEBA ADMIN</span>
          <strong>20 🍺 ficticias · nada se guarda en servidor</strong>
        </div>
        <div className="le-gazal-demo__toolbar-actions">
          <label>
            Próxima tirada
            <select value={forcedScenario} onChange={(event) => setForcedScenario(event.target.value)} disabled={isBusy}>
              {SCENARIOS.map((scenario) => (
                <option key={scenario.value} value={scenario.value}>{scenario.label}</option>
              ))}
            </select>
          </label>
          <button type="button" onClick={resetDemo} disabled={isBusy}>Reiniciar</button>
          <button type="button" onClick={() => navigate("/admin/fantasy")} disabled={isBusy}>Salir</button>
        </div>
      </div>

      <div className="le-gazal-arena">
        <div className="le-gazal-cabinet">
          <header className="le-gazal-marquee">
            <img src={LE_GAZAL_ASSETS.titleLogo} alt="Le Gazal" className="le-gazal-marquee__title-logo" />
            <p>Sandbox Admin · 3 y 4 Scatter animados · saldo totalmente ficticio</p>
          </header>

          <div className="le-gazal-cabinet__body">
            <aside className="le-gazal-totem">
              <div className="le-gazal-totem__label">Saldo prueba</div>
              <div className="le-gazal-totem__value">{Number(session.balance || 0)}</div>
              <div className="le-gazal-totem__label">Total Win</div>
              <div className="le-gazal-totem__value">{Number(sessionStats.totalWon || 0)}</div>
              <div className="le-gazal-totem__foot">
                <span>Admin QA</span>
                <strong>{bonusState.remaining > 0 ? `Clutch x${bonusState.multiplier}` : "Sandbox"}</strong>
              </div>
            </aside>

            <div className="le-gazal-core">
              <section className="le-gazal-machine card">
                <LeGazalGrid
                  grid={grid}
                  isSpinning={isSpinning}
                  stoppedColumns={stoppedColumns}
                  winningCellKeys={[]}
                  coinBurstKey={coinBurstKey}
                  amountWon={Number(result?.payout || 0)}
                  reduceMotion={prefersReducedMotion}
                />
              </section>

              <LeGazalControlPanel
                bet={bet}
                setBet={setBet}
                balance={Number(session.balance || 0)}
                isSpinning={isBusy}
                actionLoading={false}
                onOpenRules={() => setRulesOpen(true)}
                onSpin={spin}
                onCashout={cashout}
                result={result}
                resultMessage={demoResultMessage(result)}
                sessionStats={sessionStats}
                bonusState={bonusState}
              />
            </div>

            <LeGazalMascotPanel />
          </div>
        </div>
      </div>

      <LeGazalRulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
      <LeGazalBonusModal modal={bonusIntro} onClose={() => setBonusIntro(null)} />
      <LeGazalBonusModal modal={bonusSummary} onClose={() => setBonusSummary(null)} />
      <LeGazalClutchAnimation
        open={Boolean(clutchAnimation)}
        freeSpins={Number(clutchAnimation?.freeSpins || DEMO_SCATTER_FREE_SPINS)}
        multiplier={Number(clutchAnimation?.multiplier || 1)}
        reduceMotion={prefersReducedMotion}
        onComplete={closeClutchAnimation}
      />
      <LeGazalClutchPlusAnimation
        open={Boolean(clutchPlusAnimation)}
        freeSpins={Number(clutchPlusAnimation?.freeSpins || DEMO_SCATTER4_FREE_SPINS)}
        multiplier={Number(clutchPlusAnimation?.multiplier || DEMO_SCATTER4_MULTIPLIER)}
        reduceMotion={prefersReducedMotion}
        onComplete={closeClutchPlusAnimation}
      />
    </section>
  );
}
