import LeGazalClutchAnimation from './LeGazalClutchAnimation';
import LeGazalClutchPlusAnimation from './LeGazalClutchPlusAnimation';
import LeGazalMadnessAnimation from './LeGazalMadnessAnimation';
import LeGazalBonusModal from './LeGazalBonusModal';
export default function LeGazalScatterCelebration({modal,onClose,reduceMotion}){
 if(!modal)return null;
 const Component=({scatter:LeGazalClutchAnimation,scatter4:LeGazalClutchPlusAnimation,scatter5:LeGazalMadnessAnimation})[modal.scenario];
 return Component ? <Component open freeSpins={modal.freeSpins} multiplier={modal.multiplier} reduceMotion={reduceMotion} onComplete={onClose}/> : <LeGazalBonusModal modal={modal} onClose={onClose}/>;
}
