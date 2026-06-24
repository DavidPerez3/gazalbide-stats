import {
  BONUS_CONFIG,
  DEFAULT_DISPLAY_SYMBOLS,
  LE_GAZAL_PAYTABLE,
  RANDOM_SCENARIO_WEIGHTS,
  SAFE_ROW_PATTERNS,
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

function createBaseGrid(rng) {
  return Array.from({ length: SLOT_ROWS }, () => {
    const pattern = rng.pick(SAFE_ROW_PATTERNS);
    return [...pattern];
  });
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
  const grid = createBaseGrid(rng);

  if (scenarioId === "small") {
    const row = rng.int(SLOT_ROWS);
    const symbolId = rng.pick(["TEN", "J", "Q", "K", "A"]);
    placeCells(
      grid,
      [
        { row, col: 0 },
        { row, col: 1 },
        { row, col: 2 },
      ],
      symbolId
    );
    return grid;
  }

  if (scenarioId === "medium") {
    const row = rng.int(SLOT_ROWS);
    const symbolId = rng.pick(["BALL", "HOOP", "WHISTLE"]);
    placeCells(
      grid,
      [
        { row, col: 0 },
        { row, col: 1 },
        { row, col: 2 },
        { row, col: 3 },
      ],
      symbolId
    );
    return grid;
  }

  if (scenarioId === "high") {
    const row = rng.int(SLOT_ROWS);
    placeCells(
      grid,
      [
        { row, col: 0 },
        { row, col: 1 },
        { row, col: 3 },
        { row, col: 4 },
        { row, col: 5 },
      ],
      "TROPHY"
    );
    grid[row][2] = SPECIAL_SYMBOLS.WILD;
    return grid;
  }

  if (scenarioId === "wild") {
    const row = rng.int(SLOT_ROWS);
    placeCells(
      grid,
      [
        { row, col: 0 },
        { row, col: 2 },
        { row, col: 3 },
      ],
      "JERSEY88"
    );
    grid[row][1] = SPECIAL_SYMBOLS.WILD;
    return grid;
  }

  if (scenarioId === "scatter") {
    const used = new Set();
    const cells = randomOpenCells(rng, 3, used);
    for (const cell of cells) {
      grid[cell.row][cell.col] = SPECIAL_SYMBOLS.SCATTER;
      used.add(cell.key);
    }
    return grid;
  }

  if (scenarioId === "bonus") {
    const used = new Set();
    const cells = randomOpenCells(rng, 3, used);
    for (const cell of cells) {
      grid[cell.row][cell.col] = SPECIAL_SYMBOLS.BONUS;
      used.add(cell.key);
    }
    return grid;
  }

  return grid;
}

function evaluateRow(rowSymbols, rowIndex, bet, roundMultiplier) {
  const cells = [];
  let candidateSymbol = null;

  for (let col = 0; col < SLOT_COLUMNS; col += 1) {
    const symbolId = rowSymbols[col];

    if (symbolId === SPECIAL_SYMBOLS.SCATTER || symbolId === SPECIAL_SYMBOLS.BONUS) {
      break;
    }

    if (candidateSymbol === null) {
      if (symbolId === SPECIAL_SYMBOLS.WILD) {
        cells.push({ row: rowIndex, col });
        continue;
      }

      candidateSymbol = symbolId;
      cells.push({ row: rowIndex, col });
      continue;
    }

    if (symbolId === candidateSymbol || symbolId === SPECIAL_SYMBOLS.WILD) {
      cells.push({ row: rowIndex, col });
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
  const wildBoost = 1 + wildCount * 0.15;
  const totalMultiplier = roundValue(baseMultiplier * wildBoost * roundMultiplier);
  const amountWon = roundValue(bet * totalMultiplier);

  return {
    id: `${rowIndex}-${candidateSymbol}-${cells.length}`,
    symbolId: candidateSymbol,
    symbolLabel: getSymbolDefinition(candidateSymbol).label,
    row: rowIndex,
    matchCount: cells.length,
    cells,
    usedWild: wildCount > 0,
    amountWon,
    multiplier: totalMultiplier,
  };
}

function evaluateGrid(grid, bet, roundMultiplier) {
  const winningCombinations = [];
  const winningCellKeys = new Set();
  let scatterCount = 0;
  let bonusCount = 0;

  for (let row = 0; row < SLOT_ROWS; row += 1) {
    const result = evaluateRow(grid[row], row, bet, roundMultiplier);
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
  } else if (scatterCount >= 3) {
    clutchMode = BONUS_MODES.SCATTER;
  }

  if (clutchMode !== BONUS_MODES.NONE) {
    freeSpinsAwarded = BONUS_CONFIG[clutchMode].freeSpins;
    awardedMultiplier = BONUS_CONFIG[clutchMode].multiplier;
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
    return "Tres scatters activan CLUTCH TIME con tres tiradas gratis.";
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
