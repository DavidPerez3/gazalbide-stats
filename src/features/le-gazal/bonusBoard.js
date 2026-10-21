// Levels belong to the floor, not falling symbols. Only free spins retain them.
const STOCK = ['TEN', 'J', 'Q', 'K', 'A', 'WHISTLE', 'TROPHY'];
const copy = value => JSON.parse(JSON.stringify(value));
export const emptyBonusBoard = () => ({ columns: 6, collections: 0, levels: {} });

export function createBonusRound({ scenario, seed = 0, bet = 1, multiplier = 1, boardState }) {
  const board = copy(boardState || emptyBonusBoard());
  const columns = board.columns;
  const row = 1 + seed % 2;
  const positions = { raccoon: { row, col: 0 }, salamander: { row: 4 - row, col: columns - 1 } };
  const starts = copy(positions);
  const grid = Array.from({ length: 5 }, (_, r) => Array.from({ length: columns }, (_, c) => STOCK[(r * 2 + c + seed) % 7]));
  const initial = copy(grid), initialBoard = copy(board), events = [];
  let amountWon = 0, units = 0;
  const push = (kind, actor, r, c, amount = 0) => events.push({ kind, actor, row: r, col: c, amount,
    grid: copy(grid), positions: copy(positions), collected: amountWon, board: copy(board) });
  const baseCount = { small: 1, medium: 2, high: 4, wild: 2 }[scenario] || 0;
  // Each unlocked column supplies one extra pickup on a winning free spin.
  const count = baseCount ? baseCount + columns - 6 : 0;
  const turns = { raccoon: 0, salamander: 0 };
  for (let i = 0; i < count; i++) {
    const actor = (i + seed) % 2 === 0 ? 'raccoon' : 'salamander';
    const assistant = actor === 'raccoon' ? 'salamander' : 'raccoon';
    const turn = turns[actor]++;
    const r = actor === 'raccoon' ? row + turn : 4 - row - turn;
    const c = actor === 'raccoon' ? 1 : columns - 2;
    const key = `${r}-${c}`, level = board.levels[key] || 0;
    grid[r][c] = actor === 'raccoon' ? 'BALL' : 'HOOP'; push('transform', assistant, r, c);
    positions[actor] = { row: r, col: c }; push('move', actor, r, c);
    const previous = Math.floor(units * bet * multiplier);
    units += 1 + level;
    const amount = Math.floor(units * bet * multiplier) - previous;
    amountWon += amount; grid[r][c] = null; push('collect', actor, r, c, amount);
    for (let j = r; j > 0; j--) grid[j][c] = grid[j - 1][c];
    grid[0][c] = STOCK[(seed + i + 3) % 7]; push('cascade', actor, r, c);
    board.collections++;
    board.levels[key] = Math.min(2, level + 1);
    push('upgrade', assistant, r, c);
  }
  if (['scatter', 'scatter4', 'scatter5', 'bonus'].includes(scenario)) {
    const n = scenario === 'scatter5' ? 5 : scenario === 'scatter4' ? 4 : 3;
    const symbol = scenario === 'bonus' ? 'BONUS_BALL' : 'SHIELD';
    for (let i = 0; i < n; i++) {
      const r = (seed + i * 2) % 5, c = (seed + i) % columns;
      initial[r][c] = symbol; grid[r][c] = symbol;
    }
    for (let i = 0; i < n; i++) push('signal', 'salamander', (seed + i * 2) % 5, (seed + i) % columns);
  } else if (!count) {
    positions.raccoon = { row, col: 1 }; push('scout', 'raccoon', row, 1);
    positions.salamander = { row: 4 - row, col: columns - 2 }; push('scout', 'salamander', 4 - row, columns - 2);
  }
  const unlocked = Math.min(8, 6 + Math.floor(board.collections / 6));
  if (unlocked > columns) {
    for (let r = 0; r < 5; r++) for (let c = columns; c < unlocked; c++) grid[r].push(STOCK[(r * 2 + c + seed) % 7]);
    board.columns = unlocked;
    push('expand', 'salamander', 2, unlocked - 1);
  }
  return { patternVersion: 3, mode: 'living', bonusBoard: true, grid: initial, finalGrid: copy(grid),
    starts, events, amountWon, initialBoard, nextBoard: copy(board), winningCombinations: [], winningCellKeys: [] };
}

// Reel staging must match the incoming board after expansion or a bonus reset.
export function replaceLivingColumn(previous, next, column) {
  return next.map((row, r) => row.map((cell, c) => c === column ? cell : previous[r]?.[c] || cell));
}
export function livingSpinFrame(previous, next, stopped, randomFrame) {
  return next.map((row, r) => row.map((cell, c) => stopped[c] ? cell : randomFrame[r % randomFrame.length][c % randomFrame[0].length] || previous[r]?.[c] || cell));
}
