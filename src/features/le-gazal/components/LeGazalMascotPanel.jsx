import { useState } from "react";
import { LE_GAZAL_ASSETS } from "../assetPaths";

export default function LeGazalMascotPanel() {
  const [mascotMissing, setMascotMissing] = useState(false);

  if (mascotMissing) {
    return (
      <div className="le-gazal-mascot-figure le-gazal-mascot-figure--missing" aria-hidden="true">
        <span>Falta `Mapache.png`</span>
      </div>
    );
  }

  return (
    <div className="le-gazal-mascot-figure" aria-hidden="true">
      <img
        src={LE_GAZAL_ASSETS.mascot}
        alt=""
        className="le-gazal-mascot-figure__image"
        onError={() => setMascotMissing(true)}
      />
    </div>
  );
}
