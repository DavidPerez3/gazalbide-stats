import { useMemo, useState } from "react";
import { resolvePlayerPhotoSrc } from "../lib/playerPhotos.js";
import "../player-photos.css";

const SIZE_CLASS = {
  fantasy: "player-photo--fantasy",
  live: "player-photo--live",
  card: "player-photo--card",
  profile: "player-photo--profile",
};

function initialsFor(player) {
  const name = String(player?.name || "").trim();
  if (!name) return "?";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default function PlayerPhoto({
  player,
  size = "card",
  className = "",
  decorative = false,
}) {
  const src = useMemo(() => resolvePlayerPhotoSrc(player), [player]);
  const [failed, setFailed] = useState(false);
  const sizeClass = SIZE_CLASS[size] || SIZE_CLASS.card;
  const classes = `player-photo ${sizeClass}${className ? ` ${className}` : ""}`;

  if (!src || failed) {
    return (
      <div
        className={`${classes} player-photo--placeholder`}
        aria-label={decorative ? undefined : `Sin foto de ${player?.name || "jugador"}`}
        aria-hidden={decorative ? "true" : undefined}
      >
        <span>{initialsFor(player)}</span>
      </div>
    );
  }

  return (
    <div className={classes}>
      <img
        src={src}
        alt={decorative ? "" : player?.name || "Jugador"}
        onError={() => setFailed(true)}
        draggable="false"
      />
    </div>
  );
}
