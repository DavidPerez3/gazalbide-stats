import { replaceLivingColumn, livingSpinFrame } from './bonusBoard';
import { queueLivingPlayback } from "./livingEngine";
import { useEffect, useRef, useState } from "react";
import { BONUS_CONFIG } from "./slotConfig";
import { createDisplayGrid, spinLivingSlot } from "./slotEngine";
import { BONUS_MODES, SLOT_COLUMNS } from "./slotTypes";

const INITIAL_BONUS_STATE = {
  mode: BONUS_MODES.NONE,
  remaining: 0,
  multiplier: 1,
  awarded: 0,
  totalWon: 0,
};

function getReducedMotionPreference() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function replaceColumn(previous, next, column) {
  return replaceLivingColumn(previous, next, column);
}

function mergeSpinFrame(previous, next, stopped) {
  return livingSpinFrame(previous, next, stopped, createDisplayGrid());
}

export function useLeGazalDemo() {
  const timeoutRefs = useRef([]);
  const intervalRef = useRef(null);
  const stoppedColumnsRef = useRef(Array(SLOT_COLUMNS).fill(true));

  const [bet, setBet] = useState(3);
  const [grid, setGrid] = useState(() => createDisplayGrid());
  const [livingFrame, setLivingFrame] = useState(null);
  const [livingRound, setLivingRound] = useState(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [stoppedColumns, setStoppedColumns] = useState(() => Array(SLOT_COLUMNS).fill(true));
  const [result, setResult] = useState(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(getReducedMotionPreference);
  const [bonusIntro, setBonusIntro] = useState(null);
  const [bonusSummary, setBonusSummary] = useState(null);
  const [coinBurstKey, setCoinBurstKey] = useState(0);
  const [sessionStats, setSessionStats] = useState({
    spins: 0,
    totalBet: 0,
    totalWon: 0,
    net: 0,
    bestWin: 0,
    lastResult: "Todavia no has girado.",
  });
  const [bonusState, setBonusState] = useState(INITIAL_BONUS_STATE);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setPrefersReducedMotion(media.matches);

    sync();
    media.addEventListener("change", sync);

    return () => {
      media.removeEventListener("change", sync);
    };
  }, []);

  useEffect(() => {
    return () => {
      for (const timeoutId of timeoutRefs.current) {
        window.clearTimeout(timeoutId);
      }

      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
      }
    };
  }, []);

  function clearTimers() {
    for (const timeoutId of timeoutRefs.current) {
      window.clearTimeout(timeoutId);
    }

    timeoutRefs.current = [];

    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  function applySpinResult(spinOutcome, currentBonusRemaining) {
    setGrid(spinOutcome.finalGrid || spinOutcome.grid);
    setStoppedColumns(Array((spinOutcome.finalGrid || spinOutcome.grid)[0].length).fill(true));
    setIsSpinning(false);
    setResult(spinOutcome);
    if (spinOutcome.amountWon > 0) {
      setCoinBurstKey((previous) => previous + 1);
    }

    const isFreeSpin = currentBonusRemaining > 0;
    const betSpent = isFreeSpin ? 0 : bet;

    setSessionStats((previous) => {
      const totalBet = previous.totalBet + betSpent;
      const totalWon = previous.totalWon + spinOutcome.amountWon;

      return {
        spins: previous.spins + 1,
        totalBet,
        totalWon,
        net: Math.round((totalWon - totalBet) * 100) / 100,
        bestWin: Math.max(previous.bestWin, spinOutcome.amountWon),
        lastResult: spinOutcome.message,
      };
    });

    setBonusState((previous) => {
      const wasFreeSpin = previous.remaining > 0;
      const remainingAfterCurrent = wasFreeSpin ? Math.max(previous.remaining - 1, 0) : 0;

      let nextState = {
        ...previous,
        remaining: remainingAfterCurrent,
        board: spinOutcome.nextBoard || null,
        totalWon: previous.totalWon + (wasFreeSpin ? spinOutcome.amountWon : 0),
      };

      if (spinOutcome.activatedClutchTime) {
        const config = BONUS_CONFIG[spinOutcome.clutchMode];
        const totalFreeSpins = remainingAfterCurrent + config.freeSpins;

        nextState = {
          board: spinOutcome.nextBoard || null,
          mode: spinOutcome.clutchMode,
          remaining: totalFreeSpins,
          multiplier: Math.max(previous.multiplier, config.multiplier),
          awarded: previous.awarded + config.freeSpins,
          totalWon: wasFreeSpin ? nextState.totalWon : 0,
        };

        setBonusIntro({
          title: config.title,
          description: config.description,
          freeSpins: config.freeSpins,
          multiplier: Math.max(previous.multiplier, config.multiplier),
        });
      }

      if (
        wasFreeSpin &&
        remainingAfterCurrent === 0 &&
        spinOutcome.activatedClutchTime === false &&
        previous.mode !== BONUS_MODES.NONE
      ) {
        setBonusSummary({
          title: previous.mode === BONUS_MODES.BONUS ? "Resumen CLUTCH TIME+" : "Resumen CLUTCH TIME",
          totalWon: nextState.totalWon,
          spins: previous.awarded,
          multiplier: previous.multiplier,
        });

        return INITIAL_BONUS_STATE;
      }

      return nextState;
    });
  }

  function spin(forcedOutcome = null) {
    if (isSpinning) {
      return;
    }

    clearTimers();

    const activeMultiplier = bonusState.remaining > 0 ? bonusState.multiplier : 1;
    const spinOutcome = spinLivingSlot({
      bet,
      roundMultiplier: activeMultiplier,
      forcedOutcome,
      inBonus: bonusState.remaining > 0, boardState: bonusState.board,
    });

    setLivingRound(spinOutcome);
    setLivingFrame(null);
    setResult(null);
    setBonusIntro(null);
    setBonusSummary(null);
    setIsSpinning(true);
    setGrid(spinOutcome.grid);
    stoppedColumnsRef.current = Array(spinOutcome.grid[0].length).fill(false);
    setStoppedColumns(Array(spinOutcome.grid[0].length).fill(false));

    if (!prefersReducedMotion) {
      intervalRef.current = window.setInterval(() => {
        setGrid((previous) => mergeSpinFrame(previous, spinOutcome.grid, stoppedColumnsRef.current));
      }, 68);
    }

    const baseDelay = prefersReducedMotion ? 0 : 360;
    const stepDelay = prefersReducedMotion ? 36 : 190;

    for (let columnIndex = 0; columnIndex < spinOutcome.grid[0].length; columnIndex += 1) {
      const timeoutId = window.setTimeout(() => {
        stoppedColumnsRef.current[columnIndex] = true;
        setStoppedColumns((previous) => {
          const next = [...previous];
          next[columnIndex] = true;
          return next;
        });
        setGrid((previous) => replaceColumn(previous, spinOutcome.grid, columnIndex));
      }, baseDelay + columnIndex * stepDelay);

      timeoutRefs.current.push(timeoutId);
    }

    const finishDelay = baseDelay + spinOutcome.grid[0].length * stepDelay + (prefersReducedMotion ? 20 : 260);
    queueLivingPlayback({round:spinOutcome,startDelay:finishDelay,reducedMotion:prefersReducedMotion,
      timers:timeoutRefs.current,onFrame:frame=>{
        if(intervalRef.current){window.clearInterval(intervalRef.current);intervalRef.current=null;}
        setLivingFrame(frame);
      },onFinish:()=>{clearTimers();applySpinResult(spinOutcome,bonusState.remaining);}});

  }

  function resetDemo() {
    clearTimers();
    setBet(3);
    setGrid(createDisplayGrid());
    setLivingRound(null);
    setIsSpinning(false);
    setStoppedColumns(Array(SLOT_COLUMNS).fill(true));
    stoppedColumnsRef.current = Array(SLOT_COLUMNS).fill(true);
    setLivingFrame(null);
    setResult(null);
    setRulesOpen(false);
    setBonusIntro(null);
    setBonusSummary(null);
    setCoinBurstKey(0);
    setBonusState(INITIAL_BONUS_STATE);
    setSessionStats({
      spins: 0,
      totalBet: 0,
      totalWon: 0,
      net: 0,
      bestWin: 0,
      lastResult: "Demo reiniciada.",
    });
  }

  return {
    livingFrame,
    livingRound,
    bet,
    setBet,
    bonusIntro,
    bonusState,
    bonusSummary,
    coinBurstKey,
    closeBonusIntro: () => setBonusIntro(null),
    closeBonusSummary: () => setBonusSummary(null),
    grid,
    isSpinning,
    stoppedColumns,
    openRules: () => setRulesOpen(true),
    prefersReducedMotion,
    result,
    resetDemo,
    rulesOpen,
    sessionStats,
    closeRules: () => setRulesOpen(false),
    spin,
  };
}
