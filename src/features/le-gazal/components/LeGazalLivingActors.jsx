import { LE_GAZAL_ASSETS } from '../assetPaths';
const NAMES={raccoon:'Mapache',salamander:'Salamandra'};
export default function LeGazalLivingActors({geometry,round,frame,reduceMotion}){
 const positions=frame?.positions || round?.starts || {raccoon:{row:2,col:0},salamander:{row:2,col:5}};
 const active=frame?.playing;
 const styleFor=({row,col})=>{
  const center=geometry?.centers[`${row}-${col}`];
  return {left:`${center?center[0]/geometry.width*100:(col+.5)/6*100}%`,top:`${center?center[1]/geometry.height*100:(row+.5)/5*100}%`};
 };
 return <div className={`le-gazal-living ${reduceMotion?'le-gazal-living--still':''}`} aria-hidden="true">
  {Object.entries(positions).map(([id,position])=><div key={id} style={styleFor(position)}
    className={`le-gazal-living__actor le-gazal-living__actor--${id} ${active && frame.actor===id ? `le-gazal-living__actor--${frame.kind}`:''}`}>
    <img src={id==='raccoon'?LE_GAZAL_ASSETS.mascot:LE_GAZAL_ASSETS.salamander} alt="" draggable="false"/>
    <span>{NAMES[id]}</span>
  </div>)}
  {active && ['transform','collect','signal'].includes(frame.kind) && <div key={frame.index} style={styleFor(frame)}
   className={`le-gazal-living__effect le-gazal-living__effect--${frame.kind}`}>{frame.kind==='collect'?`+${frame.amount} 🍺`:'✦'}</div>}
 </div>;
}
export function livingMessage(frame,round){
 if(!round)return 'El mapache y la salamandra preparan la pista.';
 if(!frame?.playing)return `Jugada resuelta · ${round.amountWon || 0} 🍺 recogidas.`;
 const who=NAMES[frame.actor];
 return ({transform:`${who} activa una casilla.`,move:`${who} va a recoger el símbolo.`,collect:`${who} recoge ${frame.amount} 🍺.`,cascade:'Los símbolos caen y rellenan el hueco.',signal:'La salamandra activa los símbolos especiales.',scout:`${who} explora la pista.`})[frame.kind];
}
