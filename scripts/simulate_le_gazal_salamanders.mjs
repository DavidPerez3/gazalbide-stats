import { createSalamanderRound } from '../src/features/le-gazal/salamanderEngine.js';
const paidSpins = Number(process.argv[2] || 50000);
let state=1729,payout=0,freeSpins=0,hits=0,maxPrize=0,bonuses=0;
const symbols={};
const seed=()=>{state=state*16807%2147483647;return state;};
for(let i=0;i<paidSpins;i++){
 let remaining=0,multiplier=1,board=null;
 do{
  const wasFree=remaining>0;
  const r=createSalamanderRound({seed:seed(),bet:1,multiplier:wasFree?multiplier:1,inBonus:wasFree,boardState:board});
  if(wasFree){remaining--;freeSpins++;}else hits+=r.amountWon>0;
  payout+=Math.round(r.amountWon*100);maxPrize=Math.max(maxPrize,r.amountWon);
  for(const e of r.events)if(e.kind==='collect')symbols[e.symbol]=(symbols[e.symbol]||0)+1;
  if(r.freeSpinsAwarded){remaining+=r.freeSpinsAwarded;multiplier=Math.max(multiplier,r.awardedMultiplier);bonuses++;}
  board=remaining>0?r.nextBoard:null;
 }while(remaining>0);
}
console.log(JSON.stringify({seed:1729,paidSpins,freeSpins,bonuses,totalPayout:payout/100,observedReturn:payout/(paidSpins*100),paidHitRate:hits/paidSpins,maxPrize,symbols},null,2));
