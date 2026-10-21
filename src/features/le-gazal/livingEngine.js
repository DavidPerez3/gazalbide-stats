const STOCK = ['TEN','J','Q','K','A','WHISTLE','TROPHY'];
const copy = value => JSON.parse(JSON.stringify(value));
export function createLivingRound({scenario,seed=0,bet=1,multiplier=1}) {
  const row = 1 + seed % 2;
  const positions = {raccoon:{row,col:0},salamander:{row:4-row,col:5}};
  const starts=copy(positions);
  const grid=Array.from({length:5},(_,r)=>Array.from({length:6},(_,c)=>STOCK[(r*2+c+seed)%7]));
  const initial=copy(grid),events=[];
  let amountWon=0;
  const push=(kind,actor,r,c,amount=0)=>events.push({kind,actor,row:r,col:c,amount,grid:copy(grid),positions:copy(positions),collected:amountWon});
  const count={small:1,medium:2,high:4,wild:2}[scenario] || 0;
  const turns={raccoon:0,salamander:0};
  for(let i=0;i<count;i++){
    const actor=(i+seed)%2===0?'raccoon':'salamander';
    const assistant=actor==='raccoon'?'salamander':'raccoon';
    const turn=turns[actor]++;
    const r=actor==='raccoon'?row+turn:4-row-turn;
    const c=actor==='raccoon'?1:4;
    grid[r][c]=actor==='raccoon'?'BALL':'HOOP';push('transform',assistant,r,c);
    positions[actor]={row:r,col:c};push('move',actor,r,c);
    const amount=Math.floor((i+1)*bet*multiplier)-Math.floor(i*bet*multiplier);
    amountWon+=amount;grid[r][c]=null;push('collect',actor,r,c,amount);
    for(let j=r;j>0;j--)grid[j][c]=grid[j-1][c];
    grid[0][c]=STOCK[(seed+i+3)%7];push('cascade',actor,r,c);
  }
  if(['scatter','scatter4','scatter5','bonus'].includes(scenario)){
    const n=scenario==='scatter5'?5:scenario==='scatter4'?4:3;
    const symbol=scenario==='bonus'?'BONUS_BALL':'SHIELD';
    for(let i=0;i<n;i++){
      const r=(seed+i*2)%5,c=(seed+i)%6;initial[r][c]=symbol;grid[r][c]=symbol;
    }
    for(let i=0;i<n;i++)push('signal','salamander',(seed+i*2)%5,(seed+i)%6);
  } else if(count===0){
    positions.raccoon={row,col:1};push('scout','raccoon',row,1);
    positions.salamander={row:4-row,col:4};push('scout','salamander',4-row,4);
  }
  return {patternVersion:2,mode:'living',grid:initial,finalGrid:copy(grid),starts,events,amountWon,winningCombinations:[],winningCellKeys:[]};
}

export const LIVING_DURATIONS = {transform:320,move:420,collect:260,cascade:300,signal:350,scout:350};
// All timers belong to the caller, so unmount/reset cancels the complete sequence.
export function queueLivingPlayback({round,startDelay=0,reducedMotion=false,timers,onFrame,onFinish}) {
  if(!round?.events?.length || reducedMotion){
    timers.push(window.setTimeout(()=>{onFrame(round?.events?.length ? {...round.events.at(-1),playing:false} : null);onFinish();},startDelay));return;
  }
  let delay=startDelay;
  round.events.forEach((event,index)=>{
    timers.push(window.setTimeout(()=>onFrame({...event,index,playing:true}),delay));
    delay+=LIVING_DURATIONS[event.kind] || 300;
  });
  timers.push(window.setTimeout(()=>{onFrame({...round.events.at(-1),playing:false});onFinish();},delay));
}
