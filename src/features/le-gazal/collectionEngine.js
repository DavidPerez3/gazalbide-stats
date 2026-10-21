import { emptyBonusBoard } from './bonusBoard.js';
import { BONUS_MODES } from './slotTypes.js';
const copy = value => JSON.parse(JSON.stringify(value));
export const COLLECTION_VALUES = { raccoon: { BALL: 1, TROPHY: 2 }, salamander: { HOOP: 1, WHISTLE: 2 } };
// Ties: up, right, down, left. Actors alternate; an idle actor never emits a move.
const DIRECTIONS = [[-1,0],[0,1],[1,0],[0,-1]];
export function collectionTarget(grid, positions, actor, levels = {}) {
  const origin = positions[actor], other = positions[actor === 'raccoon' ? 'salamander' : 'raccoon'];
  let best = null;
  for (const [dr,dc] of DIRECTIONS) {
    const row = origin.row + dr, col = origin.col + dc;
    if (row === other.row && col === other.col) continue;
    const symbol = grid[row]?.[col], value = COLLECTION_VALUES[actor][symbol] || 0;
    const score = value * (1 + (levels[`${row}-${col}`] || 0));
    if (score > (best?.score || 0)) best = { row, col, symbol, value, score };
  }
  return best;
}
export function resolveCollectionRound({ grid: source, refills, bet = 1, multiplier = 1, inBonus = false, boardState }) {
  const grid = copy(source), initial = copy(source), columns = grid[0].length;
  const board = copy(inBonus ? boardState || emptyBonusBoard() : emptyBonusBoard());
  const initialBoard = copy(board), positions = { raccoon:{row:2,col:0}, salamander:{row:2,col:columns-1} };
  const starts = copy(positions), events = [], used = Array(columns).fill(0);
  let amountWon = 0, units = 0;
  const push = (kind,actor,row,col,amount=0,symbol=null) => events.push({ kind,actor,row,col,amount,symbol,
    grid:copy(grid),positions:copy(positions),collected:amountWon,board:copy(board) });
  // The finite reserve (five replacement symbols per column) guarantees termination.
  while (true) {
    let moved = false;
    for (const actor of ['raccoon','salamander']) {
      const target = collectionTarget(grid,positions,actor,inBonus ? board.levels : {});
      if (!target) continue;
      moved = true;
      const {row,col,symbol,value} = target, key = `${row}-${col}`, level = inBonus ? board.levels[key] || 0 : 0;
      positions[actor] = {row,col}; push('move',actor,row,col,0,symbol);
      const previous = Math.floor(units*bet*multiplier);
      units += value*(1+level);
      const amount = Math.floor(units*bet*multiplier)-previous;
      amountWon += amount; grid[row][col] = null; push('collect',actor,row,col,amount,symbol);
      for (let r=row;r>0;r--) grid[r][col] = grid[r-1][col];
      grid[0][col] = refills[used[col]++]?.[col] || null;
      push('cascade',actor,row,col);
      if (inBonus) {
        board.collections++;
        board.levels[key] = Math.min(2,level+1);
        if (level < 2) push('upgrade',actor,row,col);
      }
    }
    if (!moved) break;
  }
  const shields = initial.flat().filter(s => s === 'SHIELD').length;
  const scenarioId = shields >= 5 ? 'scatter5' : shields === 4 ? 'scatter4' : shields === 3 ? 'scatter' : amountWon ? 'small' : 'lose';
  const freeSpinsAwarded = shields >= 5 ? 20 : shields === 4 ? 15 : shields === 3 ? 10 : 0;
  const awardedMultiplier = shields >= 5 ? 5 : shields === 4 ? 3 : shields === 3 ? 2 : 1;
  if (freeSpinsAwarded) {
    for (let r=0;r<5;r++) for (let c=0;c<columns;c++) if (grid[r][c] === 'SHIELD') push('signal','salamander',r,c);
  }
  const unlocked = inBonus ? Math.min(8,6+Math.floor(board.collections/6)) : 6;
  if (unlocked > columns) {
    for (let r=0;r<5;r++) for (let c=columns;c<unlocked;c++) grid[r].push(r%2 ? 'TROPHY' : 'BALL');
    board.columns = unlocked; push('expand','salamander',2,unlocked-1);
  }
  return { patternVersion:4, mode:'living', bonusBoard:inBonus, grid:initial, finalGrid:copy(grid), starts, events,
    amountWon, initialBoard, nextBoard:copy(board), winningCombinations:[], winningCellKeys:[], scenarioId,
    freeSpinsAwarded, awardedMultiplier, activatedClutchTime:freeSpinsAwarded>0,
    clutchMode:shields>=5 ? BONUS_MODES.SCATTER_MADNESS : shields===4 ? BONUS_MODES.SCATTER_PLUS : shields===3 ? BONUS_MODES.SCATTER : BONUS_MODES.NONE,
    message:freeSpinsAwarded ? `${freeSpinsAwarded} tiradas gratis x${awardedMultiplier}.` : amountWon ? `${amountWon} 🍺 recogidas.` : 'Sin símbolos compatibles al lado. Sin premio.' };
}
export function createCollectionRound({seed=1,bet=1,multiplier=1,inBonus=false,boardState,forcedOutcome=null} = {}) {
  let state = seed % 2147483646 + 1;
  const random = () => { state = state*16807%2147483647; return state%10000; };
  const columns = inBonus ? boardState?.columns || 6 : 6;
  const draw = (col,shields) => {
    if (random() < (shields ? 140 : 0)) return 'SHIELD';
    const roll = random(), left = col < columns/2;
    return roll<400 ? left?'BALL':'HOOP' : roll<500 ? left?'TROPHY':'WHISTLE' : roll<9000 ? left?'HOOP':'BALL' : left?'WHISTLE':'TROPHY';
  };
  let grid = Array.from({length:5},()=>Array.from({length:columns},(_,c)=>draw(c,true)));
  let refills = Array.from({length:5},()=>Array.from({length:columns},(_,c)=>draw(c,false)));
  // QA fixtures only: known symbols, still resolved by the exact same rules.
  if (forcedOutcome) {
    grid = Array.from({length:5},()=>Array.from({length:columns},(_,c)=>c<columns/2?'HOOP':'BALL'));
    refills = copy(grid);
    if (['small','medium','high'].includes(forcedOutcome)) grid[2][1] = forcedOutcome === 'small' ? 'BALL' : 'TROPHY';
    if (forcedOutcome === 'high') { grid[1][0]='TROPHY';grid[3][0]='BALL';grid[2][columns-2]='WHISTLE'; }
    const n = {scatter:3,scatter4:4,scatter5:5}[forcedOutcome] || 0;
    for(let c=0;c<n;c++) grid[4][c]='SHIELD';
  }
  return resolveCollectionRound({grid,refills,bet,multiplier,inBonus,boardState});
}
export function createCollectionDisplayGrid() {
  return Array.from({length:5},()=>Array.from({length:6},()=>['BALL','HOOP','TROPHY','WHISTLE'][Math.floor(Math.random()*4)]));
}
