import { createSalamanderRound } from './salamanderEngine';
import PAYLINES from "./paylines.json";
import {
  BONUS_CONFIG,
  DEFAULT_DISPLAY_SYMBOLS,
  LE_GAZAL_PAYTABLE,
  RANDOM_SCENARIO_WEIGHTS,
  getSymbolDefinition,
} from "./slotConfig";
import { BONUS_MODES, SLOT_COLUMNS, SLOT_ROWS, SPECIAL_SYMBOLS } from "./slotTypes";

function roundValue(value) {
  return Math.round(value * 100) / 100;
}

function createRng(randomSource = Math.random) {
  return {
    next() {
      return randomSource();
    },
    int(max) {
      return Math.floor(randomSource() * max);
    },
    pick(items) {
      return items[this.int(items.length)];
    },
  };
}

function createBaseGrid(rng, excluded) {
  const pool = ["TEN","J","Q","K","A","BALL","HOOP","WHISTLE","JERSEY88","TROPHY"].filter(s => s !== excluded);
  const shift = rng.int(pool.length);
  return Array.from({length: SLOT_ROWS}, (_, row) => Array.from({length: SLOT_COLUMNS}, (_, col) => pool[(col + row * 2 + shift) % pool.length]));
}

function cloneGrid(grid) {
  return grid.map((row) => [...row]);
}

function placeCells(grid, cells, symbolId) {
  for (const cell of cells) {
    grid[cell.row][cell.col] = symbolId;
  }
}

function randomOpenCells(rng, count, forbiddenKeys = new Set()) {
  const allCells = [];

  for (let row = 0; row < SLOT_ROWS; row += 1) {
    for (let col = 0; col < SLOT_COLUMNS; col += 1) {
      const key = `${row}-${col}`;
      if (!forbiddenKeys.has(key)) {
        allCells.push({ row, col, key });
      }
    }
  }

  const cells = [];
  while (cells.length < count && allCells.length > 0) {
    const index = rng.int(allCells.length);
    const [picked] = allCells.splice(index, 1);
    cells.push(picked);
  }

  return cells;
}

function buildScenarioGrid(scenarioId, rng) {
  const symbol = scenarioId === "small" ? rng.pick(["TEN","J","Q","K","A"]) : scenarioId === "medium" ? "HOOP" : scenarioId === "wild" ? "JERSEY88" : "TROPHY";
  const dual = scenarioId === "high" && rng.next() < .5;
  const winner = dual ? "BALL" : symbol;
  const grid = createBaseGrid(rng, winner);
  const length = scenarioId === "small" ? 3 : scenarioId === "high" && !dual ? 6 : 4;
  if (["small","medium","high","wild"].includes(scenarioId)) {
    const paths = dual ? [PAYLINES[5],PAYLINES[6]] : [rng.pick(PAYLINES)];
    for (const path of paths) {
      for(let col=0;col<length;col++) grid[path.rows[col]][col] = winner;
      if (!dual && ["high","wild"].includes(scenarioId)) {
        const col = scenarioId === "high" ? 2 : 1;
        grid[path.rows[col]][col] = SPECIAL_SYMBOLS.WILD;
      }
    }
  }
  if (["scatter","scatter4","scatter5","bonus"].includes(scenarioId)) {
    const count = scenarioId === "scatter5" ? 5 : scenarioId === "scatter4" ? 4 : 3;
    placeCells(grid, randomOpenCells(rng,count), scenarioId === "bonus" ? SPECIAL_SYMBOLS.BONUS : SPECIAL_SYMBOLS.SCATTER);
  }
  return grid;
}

function evaluateLine(grid, path, bet, roundMultiplier) {
  const rowSymbols = path.rows.map((row, col) => grid[row][col]);
  const cells = [];
  let candidateSymbol = null;

  for (let col = 0; col < SLOT_COLUMNS; col += 1) {
    const symbolId = rowSymbols[col];

    if (symbolId === SPECIAL_SYMBOLS.SCATTER || symbolId === SPECIAL_SYMBOLS.BONUS) {
      break;
    }

    if (candidateSymbol === null) {
      if (symbolId === SPECIAL_SYMBOLS.WILD) {
        cells.push({ row: path.rows[col], col });
        continue;
      }

      candidateSymbol = symbolId;
      cells.push({ row: path.rows[col], col });
      continue;
    }

    if (symbolId === candidateSymbol || symbolId === SPECIAL_SYMBOLS.WILD) {
      cells.push({ row: path.rows[col], col });
      continue;
    }

    break;
  }

  if (!candidateSymbol || cells.length < 3) {
    return null;
  }

  const payoutTable = LE_GAZAL_PAYTABLE[candidateSymbol];
  if (!payoutTable) {
    return null;
  }

  const baseMultiplier = payoutTable[cells.length];
  if (!baseMultiplier) {
    return null;
  }

  const wildCount = cells.filter((cell) => rowSymbols[cell.col] === SPECIAL_SYMBOLS.WILD).length;
  const wildBoost = 1;
  const totalMultiplier = roundValue(baseMultiplier * wildBoost * roundMultiplier);
  const amountWon = roundValue(bet * totalMultiplier);

  return {
    id: `${path.id}-${candidateSymbol}-${cells.length}`,
    symbolId: candidateSymbol,
    symbolLabel: getSymbolDefinition(candidateSymbol).label,
    lineId: path.id,
    lineLabel: path.label,
    matchCount: cells.length,
    cells,
    usedWild: wildCount > 0,
    amountWon,
    multiplier: totalMultiplier,
  };
}

export function evaluateGrid(grid, bet, roundMultiplier = 1) {
  const winningCombinations = [];
  const winningCellKeys = new Set();
  let scatterCount = 0;
  let bonusCount = 0;

  for (const path of PAYLINES) {
    const result = evaluateLine(grid, path, bet, roundMultiplier);
    if (result) {
      winningCombinations.push(result);
      for (const cell of result.cells) {
        winningCellKeys.add(`${cell.row}-${cell.col}`);
      }
    }
  }

  for (let row = 0; row < SLOT_ROWS; row += 1) {
    for (let col = 0; col < SLOT_COLUMNS; col += 1) {
      if (grid[row][col] === SPECIAL_SYMBOLS.SCATTER) {
        scatterCount += 1;
      }
      if (grid[row][col] === SPECIAL_SYMBOLS.BONUS) {
        bonusCount += 1;
      }
    }
  }

  let clutchMode = BONUS_MODES.NONE;
  let freeSpinsAwarded = 0;
  let awardedMultiplier = 1;

  if (bonusCount >= 3) {
    clutchMode = BONUS_MODES.BONUS;
  } else if (scatterCount >= 5) {
    clutchMode = BONUS_MODES.SCATTER_MADNESS;
  } else if (scatterCount >= 4) {
    clutchMode = BONUS_MODES.SCATTER_PLUS;
  } else if (scatterCount >= 3) {
    clutchMode = BONUS_MODES.SCATTER;
  }

  if (clutchMode !== BONUS_MODES.NONE) {
    freeSpinsAwarded = BONUS_CONFIG[clutchMode].freeSpins;
    awardedMultiplier = BONUS_CONFIG[clutchMode].multiplier;
    const symbol = clutchMode === BONUS_MODES.BONUS ? SPECIAL_SYMBOLS.BONUS : SPECIAL_SYMBOLS.SCATTER;
    for (let row = 0; row < SLOT_ROWS; row += 1) {
      for (let col = 0; col < SLOT_COLUMNS; col += 1) {
        if (grid[row][col] === symbol) winningCellKeys.add(`${row}-${col}`);
      }
    }
  }

  const amountWon = roundValue(
    winningCombinations.reduce((sum, combination) => sum + combination.amountWon, 0)
  );
  const totalMultiplier = roundValue(
    winningCombinations.reduce((sum, combination) => sum + combination.multiplier, 0)
  );

  return {
    grid,
    winningCombinations,
    winningCellKeys: [...winningCellKeys],
    amountWon,
    multiplier: totalMultiplier,
    scatterCount,
    bonusCount,
    clutchMode,
    activatedClutchTime: clutchMode !== BONUS_MODES.NONE,
    freeSpinsAwarded,
    awardedMultiplier,
  };
}

function buildResultMessage(result) {
  if (result.clutchMode === BONUS_MODES.BONUS) {
    return "Tres bonus activan CLUTCH TIME+ con cinco tiradas gratis.";
  }

  if (result.clutchMode === BONUS_MODES.SCATTER) {
    return "Tres scatters activan CLUTCH TIME con diez tiradas gratis.";
  }

  if (result.clutchMode === BONUS_MODES.SCATTER_PLUS) {
    return "Cuatro scatters activan CLUTCH TIME+ con quince tiradas gratis.";
  }

  if (result.clutchMode === BONUS_MODES.SCATTER_MADNESS) {
    return "Cinco scatters activan LOCURA GAZAL con veinte tiradas gratis.";
  }

  if (result.amountWon > 0) {
    return `Premio de ${result.amountWon} cervezas virtuales en esta jugada.`;
  }

  return "Jugada sin premio. El pabellon pide otra bola.";
}

function pickScenario(rng) {
  const totalWeight = RANDOM_SCENARIO_WEIGHTS.reduce((sum, item) => sum + item.weight, 0);
  let threshold = rng.next() * totalWeight;

  for (const item of RANDOM_SCENARIO_WEIGHTS) {
    threshold -= item.weight;
    if (threshold <= 0) {
      return item.id;
    }
  }

  return "lose";
}

export function createDisplayGrid(randomSource = Math.random) {
  const rng = createRng(randomSource);
  const grid = Array.from({ length: SLOT_ROWS }, () =>
    Array.from({ length: SLOT_COLUMNS }, () => rng.pick(DEFAULT_DISPLAY_SYMBOLS))
  );

  return grid;
}

export function spinSlot({
  bet,
  roundMultiplier = 1,
  forcedOutcome = null,
  randomSource = Math.random,
} = {}) {
  const rng = createRng(randomSource);
  const scenarioId = forcedOutcome || pickScenario(rng);
  const grid = buildScenarioGrid(scenarioId, rng);
  const evaluated = evaluateGrid(cloneGrid(grid), bet, roundMultiplier);

  return {
    ...evaluated,
    scenarioId,
    message: buildResultMessage(evaluated),
  };
}

// Preserve the legacy evaluator for historical boards and its regression tests.
export function spinLivingSlot(options = {}) {
  return createSalamanderRound({seed:Math.floor((options.randomSource || Math.random)()*2147483646),
    bet:options.bet, multiplier:options.roundMultiplier || 1,inBonus:options.inBonus,
    boardState:options.boardState,forcedOutcome:options.forcedOutcome});
}
