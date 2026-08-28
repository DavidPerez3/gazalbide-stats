import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { LE_GAZAL_ASSETS } from "../assetPaths";
import "../leGazalMadness.css";

const SHOCKS = Array.from({ length: 30 }, (_, index) => index);
const CONFETTI = Array.from({ length: 42 }, (_, index) => index);

export default function LeGazalMadnessAnimation({
  open,
  freeSpins = 20,
  multiplier = 5,
  reduceMotion = false,
  onComplete,
}) {
  const finishedRef = useRef(false);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onComplete?.();
  }, [onComplete]);

  useEffect(() => {
    if (!open) return undefined;
    finishedRef.current = false;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    if (!reduceMotion && typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate([60, 35, 90, 40, 150, 55, 220]);
    }

    const timer = window.setTimeout(finish, reduceMotion ? 2200 : 7200);
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, reduceMotion, finish]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`le-gazal-madness ${reduceMotion ? "le-gazal-madness--reduced" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={`LOCURA GAZAL. Cinco scatters. ${freeSpins} tiradas gratis y multiplicador ${multiplier}.`}
    >
      <div className="le-gazal-madness__void" />
      <div className="le-gazal-madness__tunnel" />
      <div className="le-gazal-madness__alarm">5 SCATTERS</div>

      <div className="le-gazal-madness__shocks" aria-hidden="true">
        {SHOCKS.map((shock) => (
          <span key={shock} style={{ "--shock-index": shock, "--shock-angle": `${shock * 12}deg` }} />
        ))}
      </div>

      <div className="le-gazal-madness__characters" aria-hidden="true">
        <img src={LE_GAZAL_ASSETS.characters.polEntrance} alt="" className="le-gazal-madness__pose le-gazal-madness__pose--pol-run" draggable="false" />
        <img src={LE_GAZAL_ASSETS.characters.pelosPoint} alt="" className="le-gazal-madness__pose le-gazal-madness__pose--pelos-point" draggable="false" />
        <img src={LE_GAZAL_ASSETS.characters.polClutch} alt="" className="le-gazal-madness__pose le-gazal-madness__pose--pol-horns" draggable="false" />
        <img src={LE_GAZAL_ASSETS.characters.pelosPower} alt="" className="le-gazal-madness__pose le-gazal-madness__pose--pelos-power" draggable="false" />
        <img src={LE_GAZAL_ASSETS.characters.duoClutch} alt="" className="le-gazal-madness__pose le-gazal-madness__pose--duo-tease" draggable="false" />
        <img src={LE_GAZAL_ASSETS.characters.duoMadness} alt="" className="le-gazal-madness__pose le-gazal-madness__pose--duo-final" draggable="false" />
      </div>

      <div className="le-gazal-madness__impact" />

      <div className="le-gazal-madness__confetti" aria-hidden="true">
        {CONFETTI.map((piece) => (
          <span
            key={piece}
            style={{
              "--piece-index": piece,
              "--piece-x": `${(piece * 47) % 100}%`,
              "--piece-drift": `${((piece * 29) % 31) - 15}vw`,
              "--piece-color": `hsl(${(piece * 43) % 360} 95% 60%)`,
            }}
          />
        ))}
      </div>

      <div className="le-gazal-madness__copy" aria-live="assertive">
        <span className="le-gazal-madness__eyebrow">PREMIO MÁXIMO</span>
        <strong className="le-gazal-madness__title">LOCURA GAZAL</strong>
        <span className="le-gazal-madness__reward">{freeSpins} TIRADAS GRATIS · MULTI x{multiplier}</span>
        <span className="le-gazal-madness__features">CALDEROS · JACKPOT · MODO LOCURA</span>
      </div>

      <button type="button" className="le-gazal-madness__skip" onClick={finish}>SALTAR</button>
    </div>,
    document.body
  );
}
