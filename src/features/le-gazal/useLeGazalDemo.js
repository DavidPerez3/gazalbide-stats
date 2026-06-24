import { useEffect, useRef, useState } from "react";
import { BONUS_CONFIG } from "./slotConfig";
import { createDisplayGrid, spinSlot } from "./slotEngine";
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

function replaceColumn(previousGrid, nextGrid, columnIndex) {
  return previousGrid.map((row, rowIndex) =>
    row.map((cell, colIndex) => (colIndex === columnIndex ? nextGrid[rowIndex][columnIndex] : cell))
  );
}

function mergeSpinFrame(previousGrid, nextGrid, stoppedColumns) {
  const randomFrame = createDisplayGrid();

  return previousGrid.map((row, rowIndex) =>
    row.map((cell, colIndex) => {
      if (stoppedColumns[colIndex]) {
        return nextGrid[rowIndex][colIndex];
      }

      return randomFrame[rowIndex][colIndex] || cell;
    })
  );
}

export function useLeGazalDemo() {
  const timeoutRefs = useRef([]);
  const intervalRef = useRef(null);
  const stoppedColumnsRef = useRef(Array(SLOT_COLUMNS).fill(false));

  const [bet, setBet] = useState(3);
  const [grid, setGrid] = useState(() => createDisplayGrid());
  const [isSpinning, setIsSpinning] = useState(false);
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
    setGrid(spinOutcome.grid);
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
        totalWon: previous.totalWon + (wasFreeSpin ? spinOutcome.amountWon : 0),
      };

      if (spinOutcome.activatedClutchTime) {
        const config = BONUS_CONFIG[spinOutcome.clutchMode];
        const totalFreeSpins = remainingAfterCurrent + config.freeSpins;

        nextState = {
          mode: spinOutcome.clutchMode,
          remaining: totalFreeSpins,
          multiplier: config.multiplier,
          awarded: previous.awarded + config.freeSpins,
          totalWon: wasFreeSpin ? nextState.totalWon : 0,
        };

        setBonusIntro({
          title: config.title,
          description: config.description,
          freeSpins: config.freeSpins,
          multiplier: config.multiplier,
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
    const spinOutcome = spinSlot({
      bet,
      roundMultiplier: activeMultiplier,
      forcedOutcome,
    });

    setResult(null);
    setBonusIntro(null);
    setBonusSummary(null);
    setIsSpinning(true);
    stoppedColumnsRef.current = Array(SLOT_COLUMNS).fill(false);

    if (!prefersReducedMotion) {
      intervalRef.current = window.setInterval(() => {
        setGrid((previous) => mergeSpinFrame(previous, spinOutcome.grid, stoppedColumnsRef.current));
      }, 90);
    }

    const baseDelay = prefersReducedMotion ? 0 : 220;
    const stepDelay = prefersReducedMotion ? 40 : 160;

    for (let columnIndex = 0; columnIndex < SLOT_COLUMNS; columnIndex += 1) {
      const timeoutId = window.setTimeout(() => {
        stoppedColumnsRef.current[columnIndex] = true;
        setGrid((previous) => replaceColumn(previous, spinOutcome.grid, columnIndex));
      }, baseDelay + columnIndex * stepDelay);

      timeoutRefs.current.push(timeoutId);
    }

    const finishDelay = baseDelay + SLOT_COLUMNS * stepDelay + (prefersReducedMotion ? 20 : 180);
    const finishTimeoutId = window.setTimeout(() => {
      clearTimers();
      applySpinResult(spinOutcome, bonusState.remaining);
    }, finishDelay);

    timeoutRefs.current.push(finishTimeoutId);
  }

  function resetDemo() {
    clearTimers();
    setBet(3);
    setGrid(createDisplayGrid());
    setIsSpinning(false);
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
