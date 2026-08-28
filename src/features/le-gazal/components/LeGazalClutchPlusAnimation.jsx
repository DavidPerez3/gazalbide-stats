import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { LE_GAZAL_ASSETS } from "../assetPaths";
import "../leGazalClutchPlus.css";
import "../leGazalClutchMobileFix.css";
import "../leGazalScatterSequences.css";

const SPARKS = Array.from({ length: 24 }, (_, index) => index);
const CAULDRONS = [2, 3, 5];

export default function LeGazalClutchPlusAnimation({
  open,
  freeSpins = 15,
  multiplier = 3,
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
      navigator.vibrate([45, 35, 100, 55, 140]);
    }

    const timer = window.setTimeout(finish, reduceMotion ? 1800 : 5200);
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, reduceMotion, finish]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`le-gazal-clutch-plus ${reduceMotion ? "le-gazal-clutch-plus--reduced" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={`CLUTCH TIME PLUS. ${freeSpins} tiradas gratis, calderos multi y jackpot multi.`}
    >
      <div className="le-gazal-clutch-plus__blackout" />
      <div className="le-gazal-clutch-plus__rings" />
      <div className="le-gazal-clutch-plus__flash le-gazal-clutch-plus__flash--one" />
      <div className="le-gazal-clutch-plus__flash le-gazal-clutch-plus__flash--two" />

      <div className="le-gazal-clutch-plus__sparks" aria-hidden="true">
        {SPARKS.map((spark) => (
          <span key={spark} style={{ "--spark-index": spark }} />
        ))}
      </div>

      <div className="le-gazal-clutch-plus__characters" aria-hidden="true">
        <img
          src={LE_GAZAL_ASSETS.characters.polEntrance}
          alt=""
          className="le-gazal-clutch-plus__character le-gazal-clutch-plus__character--pol-entry"
          draggable="false"
        />
        <img
          src={LE_GAZAL_ASSETS.characters.pelosPoint}
          alt=""
          className="le-gazal-clutch-plus__character le-gazal-clutch-plus__character--pelos-entry"
          draggable="false"
        />
        <img
          src={LE_GAZAL_ASSETS.characters.pelosPower}
          alt=""
          className="le-gazal-clutch-plus__character le-gazal-clutch-plus__character--pelos-power"
          draggable="false"
        />
        <img
          src={LE_GAZAL_ASSETS.characters.duoClutch}
          alt=""
          className="le-gazal-clutch-plus__character le-gazal-clutch-plus__character--duo"
          draggable="false"
        />
      </div>

      <div className="le-gazal-clutch-plus__cauldrons" aria-hidden="true">
        {CAULDRONS.map((value, index) => (
          <div key={value} className="le-gazal-clutch-plus__cauldron" style={{ "--cauldron-index": index }}>
            <span className="le-gazal-clutch-plus__cauldron-bubble" />
            <strong>x{value}</strong>
          </div>
        ))}
      </div>

      <div className="le-gazal-clutch-plus__jackpot" aria-hidden="true">
        <span>JACKPOT MULTI</span>
        <strong>x{multiplier}</strong>
      </div>

      <div className="le-gazal-clutch-plus__copy" aria-live="assertive">
        <span className="le-gazal-clutch-plus__eyebrow">4 SCATTERS</span>
        <strong className="le-gazal-clutch-plus__title">CLUTCH TIME+</strong>
        <span className="le-gazal-clutch-plus__reward">{freeSpins} TIRADAS GRATIS</span>
        <span className="le-gazal-clutch-plus__features">CALDEROS MULTI · JACKPOT MULTI</span>
      </div>

      <button type="button" className="le-gazal-clutch-plus__skip" onClick={finish}>
        SALTAR
      </button>
    </div>,
    document.body
  );
}
