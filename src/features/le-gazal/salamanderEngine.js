import { emptyBonusBoard } from './bonusBoard.js';
import { BONUS_MODES } from './slotTypes.js';
const copy = value => JSON.parse(JSON.stringify(value));
export const SALAMANDER_VALUES = { yellow: { BALL: 1 }, pink: { WHISTLE: 1 }, blue: { SHOE: 1 }, green: { HOOP: 1 } };
// Ties: up, right, down, left. Actors alternate; an idle actor never emits a move.
const DIRECTIONS = [[-1,0],[0,1],[1,0],[0,-1]];
export function salamanderTarget(grid, positions, actor, levels = {}) {
  const origin = positions[actor];
  let best = null;
  for (const [dr,dc] of DIRECTIONS) {
    const row = origin.row + dr, col = origin.col + dc;
    if (Object.entries(positions).some(([id,p]) => id !== actor && p.row === row && p.col === col)) continue;
    const symbol = grid[row]?.[col], value = SALAMANDER_VALUES[actor][symbol] || 0;
    const score = value * (1 + (levels[`${row}-${col}`] || 0));
    if (score > (best?.score || 0)) best = { row, col, symbol, value, score };
  }
  return best;
}
export function resolveSalamanderRound({ grid: source, refills, bet = 1, multiplier = 1, inBonus = false, boardState }) {
  const grid = copy(source), initial = copy(source), columns = grid[0].length;
  const board = copy(inBonus ? boardState || emptyBonusBoard() : emptyBonusBoard());
  const initialBoard = copy(board), positions = { yellow:{row:0,col:0}, pink:{row:0,col:columns-1}, blue:{row:4,col:0}, green:{row:4,col:columns-1} };
  const starts = copy(positions), events = [], used = Array(columns).fill(0);
  let amountWon = 0, units = 0;
  const push = (kind,actor,row,col,amount=0,symbol=null) => events.push({ kind,actor,row,col,amount,symbol,
    grid:copy(grid),positions:copy(positions),collected:amountWon,board:copy(board) });
  // The finite reserve (five replacement symbols per column) guarantees termination.
  while (true) {
    let moved = false;
    for (const actor of ['yellow','pink','blue','green']) {
      const target = salamanderTarget(grid,positions,actor,inBonus ? board.levels : {});
      if (!target) continue;
      moved = true;
      const {row,col,symbol,value} = target, key = `${row}-${col}`, level = inBonus ? board.levels[key] || 0 : 0;
      positions[actor] = {row,col}; push('move',actor,row,col,0,symbol);
      const previous = Math.floor(units*bet*multiplier*10+0.000001);
      units += value*(1+level);
      const amount = (Math.floor(units*bet*multiplier*10+0.000001)-previous)/100;
      amountWon = Math.round((amountWon+amount)*100)/100; grid[row][col] = null; push('collect',actor,row,col,amount,symbol);
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
    for (let r=0;r<5;r++) for (let c=0;c<columns;c++) if (grid[r][c] === 'SHIELD') push('signal','yellow',r,c);
  }
  const unlocked = inBonus ? Math.min(8,6+Math.floor(board.collections/6)) : 6;
  if (unlocked > columns) {
    for (let r=0;r<5;r++) for (let c=columns;c<unlocked;c++) grid[r].push(['BALL','WHISTLE','SHOE','HOOP'][(r+c)%4]);
    board.columns = unlocked; push('expand','green',2,unlocked-1);
  }
  return { patternVersion:5, mode:'living', payoutUnit:0.1, bonusBoard:inBonus, grid:initial, finalGrid:copy(grid), starts, events,
    amountWon, initialBoard, nextBoard:copy(board), winningCombinations:[], winningCellKeys:[], scenarioId,
    freeSpinsAwarded, awardedMultiplier, activatedClutchTime:freeSpinsAwarded>0,
    clutchMode:shields>=5 ? BONUS_MODES.SCATTER_MADNESS : shields===4 ? BONUS_MODES.SCATTER_PLUS : shields===3 ? BONUS_MODES.SCATTER : BONUS_MODES.NONE,
    message:freeSpinsAwarded ? `${freeSpinsAwarded} tiradas gratis x${awardedMultiplier}.` : amountWon ? `${amountWon} 🍺 recogidas.` : 'Sin símbolos compatibles al lado. Sin premio.' };
}
export function createSalamanderRound({seed=1,bet=1,multiplier=1,inBonus=false,boardState,forcedOutcome=null} = {}) {
  let state = seed % 2147483646 + 1;
  const random = () => { state = state*16807%2147483647; return state%10000; };
  const columns = inBonus ? boardState?.columns || 6 : 6;
  const symbols = ['BALL','WHISTLE','SHOE','HOOP'];
  const draw = shields => {
    if (random() < (shields ? 140 : 0)) return 'SHIELD';
    return symbols[random()%4];
  };
  let grid = Array.from({length:5},()=>Array.from({length:columns},()=>draw(true)));
  let refills = Array.from({length:5},()=>Array.from({length:columns},()=>draw(false)));
  if (forcedOutcome) {
    grid = Array.from({length:5},(_,r)=>Array.from({length:columns},(_,c)=>symbols[(r+c)%4]));
    refills = Array.from({length:5},()=>Array(columns).fill(null));
    // Block each starting corner with another color, for reproducible QA only.
    grid[0][1]='HOOP';grid[1][0]='HOOP';
    grid[0][columns-2]='SHOE';grid[1][columns-1]='SHOE';
    grid[3][0]='BALL';grid[4][1]='BALL';
    grid[3][columns-1]='WHISTLE';grid[4][columns-2]='WHISTLE';
    if (['small','medium','high'].includes(forcedOutcome)) grid[0][1]='BALL';
    if (forcedOutcome==='medium') grid[1][1]='BALL';
    if (forcedOutcome==='high') {grid[0][columns-2]='WHISTLE';grid[4][1]='SHOE';grid[4][columns-2]='HOOP';}
    const n={scatter:3,scatter4:4,scatter5:5}[forcedOutcome]||0;
    for(let c=0;c<n;c++) grid[2][c]='SHIELD';
  }
  return resolveSalamanderRound({grid,refills,bet,multiplier,inBonus,boardState});
}
export function createSalamanderDisplayGrid() {
  return Array.from({length:5},()=>Array.from({length:6},()=>['BALL','WHISTLE','SHOE','HOOP'][Math.floor(Math.random()*4)]));
}
