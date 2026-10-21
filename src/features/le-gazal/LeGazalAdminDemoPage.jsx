import { replaceLivingColumn, livingSpinFrame } from './bonusBoard';
import { queueLivingPlayback } from "./livingEngine";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LE_GAZAL_ASSETS, preloadLeGazalCharacters } from "./assetPaths";
import { spinLivingSlot } from "./slotEngine";
import { createCollectionDisplayGrid as createDisplayGrid } from "./collectionEngine";
import { SLOT_COLUMNS } from "./slotTypes";
import { formatBeers } from "./formatBeers";
import LeGazalGrid from "./components/LeGazalGrid";
import LeGazalControlPanel from "./components/LeGazalControlPanel";
import LeGazalRulesModal from "./components/LeGazalRulesModal";
import LeGazalBonusModal from "./components/LeGazalBonusModal";
import LeGazalClutchAnimation from "./components/LeGazalClutchAnimation";
import LeGazalClutchPlusAnimation from "./components/LeGazalClutchPlusAnimation";
import LeGazalMadnessAnimation from "./components/LeGazalMadnessAnimation";
import "./leGazal.css";
import "./leGazalMobile.css";
import "./leGazalDemo.css";

const INITIAL_BALANCE = 20;
const DEMO_SCATTER_FREE_SPINS = 10;
const DEMO_SCATTER4_FREE_SPINS = 15;
const DEMO_SCATTER4_MULTIPLIER = 3;
const DEMO_SCATTER5_FREE_SPINS = 20;
const DEMO_SCATTER5_MULTIPLIER = 5;

const SCENARIOS = [
  { value: "random", label: "Aleatoria" },
  { value: "lose", label: "Sin premio" },
  { value: "small", label: "Balón contiguo" },
  { value: "medium", label: "Trofeo contiguo" },
  { value: "high", label: "Varios símbolos contiguos" },
  { value: "scatter", label: "3 Scatter · CLUTCH TIME" },
  { value: "scatter4", label: "4 Scatter · CLUTCH TIME+" },
  { value: "scatter5", label: "5 Scatter · LOCURA GAZAL" },
];

function getReducedMotionPreference() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function replaceColumn(previous, next, column) {
  return replaceLivingColumn(previous, next, column);
}

function mergeSpinFrame(previous, next, stopped) {
  return livingSpinFrame(previous, next, stopped, createDisplayGrid());
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
    return `CLUTCH TIME+: ${result.free_spins_awarded} tiradas gratis x${result.bonus_multiplier}. Saldo ${result.balance} 🍺 de prueba.`;
  }
  if (result.scenario === "scatter5") {
    return `LOCURA GAZAL: ${result.free_spins_awarded} tiradas gratis x${result.bonus_multiplier}. Saldo ${result.balance} 🍺 de prueba.`;
  }
  if (result.scenario === "bonus") {
    return `CLUTCH TIME+ legacy: ${result.free_spins_awarded} tiradas gratis. Saldo ${result.balance} 🍺 de prueba.`;
  }
  if (Number(result.payout || 0) > 0) {
    return `Premio de ${result.payout} 🍺. Saldo de prueba: ${result.balance} 🍺.`;
  }
  return `Sin premio. Saldo de prueba: ${result.balance} 🍺.`;
}

export default function LeGazalAdminDemoPage({ publicMode = false }) {
  const navigate = useNavigate();
  const timeoutRefs = useRef([]);
  const intervalRef = useRef(null);
  const stoppedColumnsRef = useRef(Array(SLOT_COLUMNS).fill(true));

  const [session, setSession] = useState(createDemoSession);
  const [bet, setBet] = useState(3);
  const [grid, setGrid] = useState(() => createDisplayGrid());
  const [livingFrame, setLivingFrame] = useState(null);
  const [livingRound, setLivingRound] = useState(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [stoppedColumns, setStoppedColumns] = useState(() => Array(SLOT_COLUMNS).fill(true));
  const [result, setResult] = useState(null);
  const [winningCellKeys, setWinningCellKeys] = useState([]);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(getReducedMotionPreference);
  const [bonusIntro, setBonusIntro] = useState(null);
  const [bonusSummary, setBonusSummary] = useState(null);
  const [clutchAnimation, setClutchAnimation] = useState(null);
  const [clutchPlusAnimation, setClutchPlusAnimation] = useState(null);
  const [madnessAnimation, setMadnessAnimation] = useState(null);
  const [coinBurstKey, setCoinBurstKey] = useState(0);
  const [forcedScenario, setForcedScenario] = useState("random");
  const [cashoutSummary, setCashoutSummary] = useState(null);

  const isBusy =
    isSpinning ||
    Boolean(clutchAnimation) ||
    Boolean(clutchPlusAnimation) ||
    Boolean(madnessAnimation);

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

  useEffect(() => {
    preloadLeGazalCharacters();
  }, []);

  const closeClutchAnimation = useCallback(() => {
    setClutchAnimation(null);
  }, []);

  const closeClutchPlusAnimation = useCallback(() => {
    setClutchPlusAnimation(null);
  }, []);

  const closeMadnessAnimation = useCallback(() => {
    setMadnessAnimation(null);
  }, []);

  const finishAnimation = useCallback((spinOutcome, nextResult, previousSession) => {
    clearTimers();
    setGrid(spinOutcome.finalGrid || spinOutcome.grid);
    const allStopped = Array((spinOutcome.finalGrid || spinOutcome.grid)[0].length).fill(true);
    setStoppedColumns(allStopped);
    stoppedColumnsRef.current = allStopped;
    setResult(nextResult);
    setWinningCellKeys(spinOutcome.winningCellKeys);
    setSession(spinOutcome.nextSession);
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
      } else if (nextResult.scenario === "scatter5") {
        setMadnessAnimation({
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

    setLivingFrame(null);
    setResult(null);
    setWinningCellKeys([]);
    setBonusIntro(null);
    setBonusSummary(null);
    setClutchAnimation(null);
    setClutchPlusAnimation(null);
    setMadnessAnimation(null);
    setIsSpinning(true);
    clearTimers();

    const previousSession = session;
    const roundMultiplier = hasFreeSpin ? Number(session.bonus_multiplier || 1) : 1;
    const requestedScenario = forcedScenario;
    const engineScenario = requestedScenario === "random" ? null : requestedScenario;

    const visualOutcome = spinLivingSlot({
      bet: spinBet,
      roundMultiplier,
      forcedOutcome: engineScenario,
      inBonus: hasFreeSpin, boardState: session.board_state,
    });

    setLivingRound(visualOutcome);
    if (forcedScenario !== "random") setForcedScenario("random");

    const betSpent = hasFreeSpin ? 0 : spinBet;
    const freeSpinsAwarded = Number(visualOutcome.freeSpinsAwarded || 0);
    const remainingAfterConsumed = Math.max(
      0,
      Number(session.free_spins_remaining || 0) - (hasFreeSpin ? 1 : 0)
    );
    const freeSpinsRemaining = remainingAfterConsumed + freeSpinsAwarded;
    const bonusMultiplier = freeSpinsAwarded > 0
      ? Math.max(Number(session.bonus_multiplier || 1), Number(visualOutcome.awardedMultiplier || 1))
      : freeSpinsRemaining > 0
        ? Number(session.bonus_multiplier || 1)
        : 1;
    const payout = Number(visualOutcome.amountWon || 0);
    const nextBalance = Math.max(0, Math.round((Number(session.balance || 0) - betSpent + payout) * 100) / 100);

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

    const nextSession = {
      ...session,
      board_state: freeSpinsRemaining > 0 ? visualOutcome.nextBoard || null : null,
      balance: nextBalance,
      free_spins_remaining: freeSpinsRemaining,
      free_spin_bet: freeSpinsRemaining > 0 ? Number(session.free_spin_bet || spinBet) : null,
      bonus_multiplier: bonusMultiplier,
      total_spins: Number(session.total_spins || 0) + 1,
      total_bet: Number(session.total_bet || 0) + betSpent,
      total_payout: Math.round((Number(session.total_payout || 0) + payout) * 100) / 100,
    };
    visualOutcome.nextSession = nextSession;

    setGrid(visualOutcome.grid);
    const allMoving = Array(visualOutcome.grid[0].length).fill(false);
    stoppedColumnsRef.current = allMoving;
    setStoppedColumns(allMoving);

    if (!prefersReducedMotion) {
      intervalRef.current = window.setInterval(() => {
        setGrid((previous) => mergeSpinFrame(previous, visualOutcome.grid, stoppedColumnsRef.current));
      }, 68);
    }

    const baseDelay = prefersReducedMotion ? 0 : 360;
    const stepDelay = prefersReducedMotion ? 36 : 190;

    for (let columnIndex = 0; columnIndex < visualOutcome.grid[0].length; columnIndex += 1) {
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

    const finishDelay = baseDelay + visualOutcome.grid[0].length * stepDelay + (prefersReducedMotion ? 20 : 260);
    queueLivingPlayback({round:visualOutcome,startDelay:finishDelay,reducedMotion:prefersReducedMotion,
      timers:timeoutRefs.current,onFrame:frame=>{
        if(intervalRef.current){window.clearInterval(intervalRef.current);intervalRef.current=null;}
        setLivingFrame(frame);
      },onFinish:()=>finishAnimation(visualOutcome,nextResult,previousSession)});

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
    setWinningCellKeys([]);
    setBet(3);
    setGrid(createDisplayGrid());
    setLivingRound(null);
    setStoppedColumns(Array(SLOT_COLUMNS).fill(true));
    stoppedColumnsRef.current = Array(SLOT_COLUMNS).fill(true);
    setLivingFrame(null);
    setResult(null);
    setBonusIntro(null);
    setBonusSummary(null);
    setClutchAnimation(null);
    setClutchPlusAnimation(null);
    setMadnessAnimation(null);
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
          <span className="le-gazal-demo__badge">{publicMode ? "MODO DIVERSIÓN" : "MODO PRUEBA ADMIN"}</span>
          <h1>{publicMode ? "Partida terminada" : "Prueba terminada"}</h1>
          <p>
            Has terminado con <strong>{Number(cashoutSummary?.transferred || 0)} 🍺 ficticias</strong>.
            No se ha modificado tu Fantasy, tu ahorro ni ninguna tabla de Supabase.
          </p>
          <div className="le-gazal-demo__actions">
            <button type="button" onClick={resetDemo}>↻ {publicMode ? "Jugar otra vez" : "Reiniciar prueba"}</button>
            <button type="button" onClick={() => navigate(publicMode ? "/fantasy" : "/admin/fantasy")}>← {publicMode ? "Volver a Fantasy" : "Volver a Admin Fantasy"}</button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="le-gazal-page le-gazal-demo">
      <div className="le-gazal-demo__toolbar">
        <div>
          <span className="le-gazal-demo__badge">{publicMode ? "MODO DIVERSIÓN" : "MODO PRUEBA ADMIN"}</span>
          <strong>20 🍺 ficticias · no cuentan para Fantasy</strong>
        </div>
        <div className="le-gazal-demo__toolbar-actions">
          {!publicMode ? (
            <label>
              Próxima tirada
              <select value={forcedScenario} onChange={(event) => setForcedScenario(event.target.value)} disabled={isBusy}>
                {SCENARIOS.map((scenario) => (
                  <option key={scenario.value} value={scenario.value}>{scenario.label}</option>
                ))}
              </select>
            </label>
          ) : null}
          {!publicMode && <button type="button" disabled={isBusy} onClick={() => {
            setSession(previous => ({...previous, free_spins_remaining:10, free_spin_bet:3, bonus_multiplier:2,
              board_state:{columns:6, collections:5, levels:{'1-1':2,'2-1':1,'2-4':2,'3-4':1}}}));
            setForcedScenario('high');
          }}>Probar mejora y ampliación</button>}
          <button type="button" onClick={resetDemo} disabled={isBusy}>Reiniciar</button>
          <button type="button" onClick={() => navigate(publicMode ? "/fantasy" : "/admin/fantasy")} disabled={isBusy}>Salir</button>
        </div>
      </div>

      <div className="le-gazal-arena">
        <div className="le-gazal-cabinet">
          <header className="le-gazal-marquee">
            <img src={LE_GAZAL_ASSETS.titleLogo} alt="Le Gazal" className="le-gazal-marquee__title-logo" />
            <p>{publicMode ? "Modo diversión · juega siempre · saldo totalmente ficticio" : "Sandbox Admin · 3, 4 y 5 Scatter animados · saldo totalmente ficticio"}</p>
          </header>

          <div className="le-gazal-cabinet__body">
            <aside className="le-gazal-totem">
              <div className="le-gazal-totem__label">Saldo prueba</div>
              <div className="le-gazal-totem__value">{formatBeers(session.balance)}</div>
              <div className="le-gazal-totem__label">Total Win</div>
              <div className="le-gazal-totem__value">{formatBeers(sessionStats.totalWon)}</div>
              <div className="le-gazal-totem__foot">
                <span>{publicMode ? "Diversión" : "Admin QA"}</span>
                <strong>{bonusState.remaining > 0 ? `Clutch x${bonusState.multiplier}` : publicMode ? "Sin impacto Fantasy" : "Sandbox"}</strong>
              </div>
            </aside>

            <div className="le-gazal-core">
              <section className="le-gazal-machine card">
                <LeGazalGrid
                  grid={grid}
                  living livingRound={livingRound} livingFrame={livingFrame}
                  isSpinning={isSpinning}
                  stoppedColumns={stoppedColumns}
                  winningCellKeys={winningCellKeys}
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
      <LeGazalMadnessAnimation
        open={Boolean(madnessAnimation)}
        freeSpins={Number(madnessAnimation?.freeSpins || DEMO_SCATTER5_FREE_SPINS)}
        multiplier={Number(madnessAnimation?.multiplier || DEMO_SCATTER5_MULTIPLIER)}
        reduceMotion={prefersReducedMotion}
        onComplete={closeMadnessAnimation}
      />
    </section>
  );
}
