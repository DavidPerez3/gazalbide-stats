import { createSalamanderRound } from '../src/features/le-gazal/salamanderEngine.js';
const paidSpins = Number(process.argv[2] || 50000);
let state=1729,payout=0,freeSpins=0,hits=0,maxPrize=0,bonuses=0,retriggers=0,maxFreeSequence=0;
const symbols={},paid={base:0,extras:0},free={base:0,extras:0},scatters={scatter:0,scatter4:0,scatter5:0};
const seed=()=>{state=state*16807%2147483647;return state;};
for(let i=0;i<paidSpins;i++){
 let remaining=0,multiplier=1,board=null,sequence=0;
 do{
  const wasFree=remaining>0;
  const r=createSalamanderRound({seed:seed(),bet:1,multiplier:wasFree?multiplier:1,inBonus:wasFree,boardState:board});
  if(wasFree){remaining--;freeSpins++;sequence++;}else hits+=r.amountWon>0;
  payout+=Math.round(r.amountWon*100);maxPrize=Math.max(maxPrize,r.amountWon);
  const bucket=wasFree?free:paid;
  bucket.extras+=Math.round(r.chainBonus*100);
  bucket.base+=Math.round((r.amountWon-r.chainBonus)*100);
  for(const e of r.events)if(e.kind==='collect')symbols[e.symbol]=(symbols[e.symbol]||0)+1;
  if(r.freeSpinsAwarded){remaining+=r.freeSpinsAwarded;multiplier=Math.max(multiplier,r.awardedMultiplier);bonuses++;scatters[r.scenarioId]++;if(wasFree)retriggers++;}
  board=remaining>0?r.nextBoard:null;
 }while(remaining>0);
 maxFreeSequence=Math.max(maxFreeSequence,sequence);
}
// Worst-case retrigger reproduction at the largest board (36 unoccupied cells).
// Each original cell independently has probability .014 of being a shield.
let expectedNewFreeSpins=0;
for(let k=3;k<=36;k++){
 let combinations=1;for(let j=1;j<=k;j++)combinations*= (37-j)/j;
 expectedNewFreeSpins+=combinations*.014**k*.986**(36-k)*(k===3?10:k===4?15:20);
}
// Exercise rare 4/5-shield bonuses directly as well as their natural occurrences.
const bonusSamples=Number(process.argv[3] || 1000),bonusCohorts={};
for(const [shields,spins,startMultiplier] of [[3,10,2],[4,15,3],[5,20,5]]){
 let cents=0,largest=0,longest=0;
 for(let i=0;i<bonusSamples;i++){
  let remaining=spins,multiplier=startMultiplier,board=null,sequence=0,total=0;
  while(remaining>0){
   const r=createSalamanderRound({seed:seed(),bet:1,multiplier,inBonus:true,boardState:board});
   remaining=remaining-1+r.freeSpinsAwarded;multiplier=Math.max(multiplier,r.awardedMultiplier);
   board=r.nextBoard;sequence++;total+=Math.round(r.amountWon*100);
  }
  cents+=total;largest=Math.max(largest,total);longest=Math.max(longest,sequence);
 }
 bonusCohorts[shields]={samples:bonusSamples,meanTotalPayout:cents/100/bonusSamples,largestTotalPayout:largest/100,longestSequence:longest};
}
console.log(JSON.stringify({seed:1729,paidSpins,freeSpins,bonuses,retriggers,scatters,maxFreeSequence,
 totalPayout:payout/100,observedReturn:payout/(paidSpins*100),paidHitRate:hits/paidSpins,maxPrize,
 paid:{base:paid.base/100,extras:paid.extras/100},free:{base:free.base/100,extras:free.extras/100},
 worstCaseExpectedNewFreeSpinsPerFreeSpin:expectedNewFreeSpins,bonusCohorts,symbols},null,2));
