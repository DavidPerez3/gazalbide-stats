import { emptyBonusBoard } from './bonusBoard.js';
import { BONUS_MODES } from './slotTypes.js';
const copy = value => JSON.parse(JSON.stringify(value));
export const SALAMANDER_VALUES = { yellow: { BALL: 1 }, pink: { WHISTLE: 1 }, blue: { SHOE: 1 }, green: { HOOP: 1 } };
export const CHAIN_MILESTONES = [{count:5,extra:0.3},{count:10,extra:0.9},{count:15,extra:1.8}];
// Direction ties: up, right, down, left. Actors alternate complete routes.
const DIRECTIONS = [[-1,0],[0,1],[1,0],[0,-1]];
// Bounded deterministic depth-first search: length first, then total floor value.
// The shared 4096-node budget keeps pathological monochrome boards responsive.
export function salamanderRoute(grid, positions, actor, levels = {}) {
  const origin = positions[actor], columns = grid[0].length;
  const occupied = new Set(Object.values(positions).map(p => p.row*columns+p.col));
  const visited = new Set(), path = [];
  let best = [], bestScore = 0, nodes = 0;
  const visit = (row,col,score) => {
    for (const [dr,dc] of DIRECTIONS) {
      if (nodes >= 4096) return;
      const r=row+dr,c=col+dc,id=r*columns+c;
      if (r<0 || r>=5 || c<0 || c>=columns || occupied.has(id) || visited.has(id)) continue;
      const symbol=grid[r][c], value=SALAMANDER_VALUES[actor][symbol] || 0;
      if (!value) continue;
      nodes++; visited.add(id);
      const cellScore=value*(1+(levels[`${r}-${c}`] || 0));
      path.push({row:r,col:c,symbol,value,score:cellScore});
      const total=score+cellScore;
      if (path.length>best.length || (path.length===best.length && total>bestScore)) {best=[...path];bestScore=total;}
      visit(r,c,total);path.pop();visited.delete(id);
    }
  };
  visit(origin.row,origin.col,0);
  return best;
}
export function salamanderTarget(grid,positions,actor,levels={}) {
  return salamanderRoute(grid,positions,actor,levels)[0] || null;
}
export function settleSalamanderColumns(grid,positions,columns,refills,used) {
  for(const column of columns){
    // One continuous column: actors are skipped, never used as a gravity barrier.
    const freeRows=Array.from({length:5},(_,r)=>r).filter(r=>!Object.values(positions).some(p=>p.row===r && p.col===column));
    const symbols=freeRows.map(r=>grid[r][column]).filter(s=>s!==null);
    const missing=freeRows.length-symbols.length;
    for(let n=0;n<missing;n++) symbols.unshift(refills[used[column]++]?.[column] || null);
    freeRows.forEach((r,i)=>{grid[r][column]=symbols[i];});
  }
}
export function resolveSalamanderRound({ grid: source, refills, bet = 1, multiplier = 1, inBonus = false, boardState, positions: initialPositions }) {
  const grid = copy(source), columns = grid[0].length;
  const board = copy(inBonus ? boardState || emptyBonusBoard() : emptyBonusBoard());
  const initialBoard = copy(board), positions = copy(initialPositions || { yellow:{row:0,col:0}, pink:{row:0,col:columns-1}, blue:{row:4,col:0}, green:{row:4,col:columns-1} });
  if (Object.keys(positions).sort().join(',') !== 'blue,green,pink,yellow' ||
      new Set(Object.values(positions).map(p=>`${p.row}-${p.col}`)).size!==4 ||
      Object.values(positions).some(p=>!Number.isInteger(p.row)||!Number.isInteger(p.col)||p.row<0||p.row>=5||p.col<0||p.col>=columns)) throw new Error('Invalid salamander positions');
  for(const {row,col} of Object.values(positions)) grid[row][col]=null;
  const initial=copy(grid);
  const starts = copy(positions), events = [], used = Array(columns).fill(0);
  let amountWon = 0, units = 0, chainCount = 0, chainBonus = 0;
  const push = (kind,actor,row,col,amount=0,symbol=null) => events.push({ kind,actor,row,col,amount,symbol,
    grid:copy(grid),positions:copy(positions),collected:amountWon,board:copy(board),chainCount,chainBonus });
  // The finite reserve (five replacement symbols per column) guarantees termination.
  while (true) {
    let moved = false;
    for (const actor of ['yellow','pink','blue','green']) {
      const route = salamanderRoute(grid,positions,actor,inBonus ? board.levels : {});
      if (!route.length) continue;
      moved = true;
      const affected = [positions[actor].col];
      for (const target of route) {
        const {row,col,symbol,value} = target, key = `${row}-${col}`, level = inBonus ? board.levels[key] || 0 : 0;
        if (!affected.includes(col)) affected.push(col);
        grid[row][col]=null;
        positions[actor] = {row,col}; push('move',actor,row,col,0,symbol);
        const previous = Math.floor(units*bet*multiplier*5+0.000001);
        units += value*(1+level);
        const amount = (Math.floor(units*bet*multiplier*5+0.000001)-previous)/100;
        chainCount++;
        amountWon = Math.round((amountWon+amount)*100)/100; grid[row][col] = null; push('collect',actor,row,col,amount,symbol);
        const milestone = CHAIN_MILESTONES.find(m => m.count === chainCount);
        if (milestone) {
          // One shared chain per spin. Extras never inherit floor/scatter multipliers.
          const extra = Math.round(milestone.extra * bet * 100)/100;
          chainBonus = Math.round((chainBonus+extra)*100)/100;
          amountWon = Math.round((amountWon+extra)*100)/100;
          push('chain',actor,row,col,extra);
        }
        if (inBonus) {
          board.collections++;
          board.levels[key] = Math.min(2,level+1);
          if (level < 2) push('upgrade',actor,row,col);
        }
      }
      settleSalamanderColumns(grid,positions,affected,refills,used);
      push('cascade',actor,positions[actor].row,positions[actor].col);
      events.at(-1).columns=affected;
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
  return { patternVersion:8, mode:'living', payoutUnit:0.05, chainCount, chainBonus, chainBet:bet, bonusBoard:inBonus, grid:initial, finalGrid:copy(grid), starts, events,
    amountWon, reserveExhausted:grid.some((row,r)=>row.some((s,c)=>s===null && !Object.values(positions).some(p=>p.row===r && p.col===c))), initialBoard, nextBoard:copy(board), winningCombinations:[], winningCellKeys:[], scenarioId,
    freeSpinsAwarded, awardedMultiplier, activatedClutchTime:freeSpinsAwarded>0,
    clutchMode:shields>=5 ? BONUS_MODES.SCATTER_MADNESS : shields===4 ? BONUS_MODES.SCATTER_PLUS : shields===3 ? BONUS_MODES.SCATTER : BONUS_MODES.NONE,
    message:freeSpinsAwarded ? `${freeSpinsAwarded} tiradas gratis x${awardedMultiplier}.` : amountWon ? `${amountWon} 🍺 recogidas.` : 'Sin símbolos compatibles al lado. Sin premio.' };
}
export function createSalamanderRound({seed=1,bet=1,multiplier=1,inBonus=false,boardState,forcedOutcome=null} = {}) {
  // Admin-only reproducible chain fixture; public play never supplies forcedOutcome.
  if (forcedOutcome === 'chain') { seed = 187; forcedOutcome = null; }
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
  const available=Array.from({length:5*columns},(_,i)=>i);
  const positions=Object.fromEntries(['yellow','pink','blue','green'].map(actor=>{
    const [id]=available.splice(random()%available.length,1);return [actor,{row:Math.floor(id/columns),col:id%columns}];
  }));
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
  return resolveSalamanderRound({grid,refills,bet,multiplier,inBonus,boardState,positions:forcedOutcome ? undefined : positions});
}
export function createSalamanderDisplayGrid() {
  return Array.from({length:5},(_,r)=>Array.from({length:6},(_,c)=>(r===0||r===4)&&(c===0||c===5) ? null : ['BALL','WHISTLE','SHOE','HOOP'][Math.floor(Math.random()*4)]));
}
