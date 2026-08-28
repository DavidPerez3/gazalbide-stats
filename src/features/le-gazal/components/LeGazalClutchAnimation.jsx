import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { LE_GAZAL_ASSETS } from "../assetPaths";
import "../leGazalBonusAnimation.css";
import "../leGazalClutchMobileFix.css";
import "../leGazalScatterSequences.css";

const SPARKS = Array.from({ length: 18 }, (_, index) => index);

export default function LeGazalClutchAnimation({
  open,
  freeSpins = 10,
  multiplier = 1,
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
      navigator.vibrate([35, 30, 85]);
    }

    const timer = window.setTimeout(finish, reduceMotion ? 1500 : 3900);
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, reduceMotion, finish]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`le-gazal-clutch ${reduceMotion ? "le-gazal-clutch--reduced" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={`CLUTCH TIME. ${freeSpins} tiradas gratis.`}
    >
      <div className="le-gazal-clutch__blackout" />
      <div className="le-gazal-clutch__burst" />
      <div className="le-gazal-clutch__flash" />

      <div className="le-gazal-clutch__sparks" aria-hidden="true">
        {SPARKS.map((spark) => (
          <span key={spark} style={{ "--spark-index": spark }} />
        ))}
      </div>

      <div className="le-gazal-clutch__character-stage" aria-hidden="true">
        <img
          src={LE_GAZAL_ASSETS.characters.polEntrance}
          alt=""
          className="le-gazal-clutch__pol le-gazal-clutch__pol--entrance"
          draggable="false"
        />
        <img
          src={LE_GAZAL_ASSETS.characters.polIdle}
          alt=""
          className="le-gazal-clutch__pol le-gazal-clutch__pol--idle"
          draggable="false"
        />
        <img
          src={LE_GAZAL_ASSETS.characters.polClutch}
          alt=""
          className="le-gazal-clutch__pol le-gazal-clutch__pol--clutch"
          draggable="false"
        />
      </div>

      <div className="le-gazal-clutch__copy" aria-live="assertive">
        <span className="le-gazal-clutch__eyebrow">3 SCATTERS</span>
        <strong className="le-gazal-clutch__title">CLUTCH TIME</strong>
        <span className="le-gazal-clutch__reward">{freeSpins} TIRADAS GRATIS</span>
        <span className="le-gazal-clutch__multi">MULTI x{multiplier}</span>
      </div>

      <button type="button" className="le-gazal-clutch__skip" onClick={finish}>
        SALTAR
      </button>
    </div>,
    document.body
  );
}
