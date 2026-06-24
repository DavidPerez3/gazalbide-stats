import { useEffect, useState } from "react";
import { LE_GAZAL_ASSETS } from "../assetPaths";

const COIN_PARTICLES = [
  { left: "8%", delay: "0ms", duration: "1150ms", rotation: "-18deg", scale: 0.72 },
  { left: "18%", delay: "80ms", duration: "1280ms", rotation: "22deg", scale: 0.84 },
  { left: "29%", delay: "30ms", duration: "1080ms", rotation: "-8deg", scale: 0.64 },
  { left: "40%", delay: "140ms", duration: "1360ms", rotation: "18deg", scale: 0.92 },
  { left: "52%", delay: "70ms", duration: "1180ms", rotation: "-14deg", scale: 0.76 },
  { left: "63%", delay: "180ms", duration: "1320ms", rotation: "16deg", scale: 0.86 },
  { left: "74%", delay: "20ms", duration: "1040ms", rotation: "-20deg", scale: 0.62 },
  { left: "86%", delay: "110ms", duration: "1240ms", rotation: "12deg", scale: 0.8 },
];

export default function LeGazalCoinBurst({ burstKey, amountWon, disabled = false }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!burstKey || !amountWon || disabled) {
      return undefined;
    }

    setVisible(true);
    const timeoutId = window.setTimeout(() => setVisible(false), 1650);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [amountWon, burstKey, disabled]);

  if (!visible || !amountWon || disabled) {
    return null;
  }

  return (
    <div className="le-gazal-coin-burst" aria-hidden="true">
      {COIN_PARTICLES.map((particle, index) => (
        <img
          key={`${burstKey}-${index}`}
          src={LE_GAZAL_ASSETS.coins}
          alt=""
          className="le-gazal-coin-burst__coin"
          style={{
            left: particle.left,
            animationDelay: particle.delay,
            animationDuration: particle.duration,
            "--coin-rotate": particle.rotation,
            "--coin-scale": particle.scale,
          }}
        />
      ))}

      <div className="le-gazal-coin-burst__label">+{amountWon}</div>
    </div>
  );
}
