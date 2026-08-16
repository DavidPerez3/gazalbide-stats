import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Player from "./Player.jsx";
import PlayerPhoto from "../components/PlayerPhoto.jsx";
import PlayerCareerPanel from "../components/PlayerCareerPanel.jsx";
import { useSeason } from "../context/SeasonContext.jsx";
import { getPlayers } from "../lib/data.js";
import "../player-profile.css";

export default function PlayerProfilePage() {
  const { name } = useParams();
  const decodedName = decodeURIComponent(name || "");
  const { activeSeasonId } = useSeason();
  const [player, setPlayer] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getPlayers(activeSeasonId)
      .then((players) => {
        if (cancelled) return;
        const found = (players || []).find(
          (candidate) =>
            String(candidate.name || "").trim().toLowerCase() ===
            decodedName.trim().toLowerCase()
        );
        setPlayer(found || { name: decodedName });
      })
      .catch(() => {
        if (!cancelled) setPlayer({ name: decodedName });
      });

    return () => {
      cancelled = true;
    };
  }, [decodedName, activeSeasonId]);

  return (
    <>
      <section className="player-profile-hero card">
        <PlayerPhoto player={player || { name: decodedName }} size="profile" />
        <div className="player-profile-hero__copy">
          <div className="player-profile-hero__season">Temporada {activeSeasonId}</div>
          <h1>
            {player?.number ? <span>#{player.number} · </span> : null}
            {player?.name || decodedName}
          </h1>
          <p className="text-dim">
            {player?.photo_path
              ? "Perfil, temporada activa y carrera histórica del jugador."
              : "Perfil, temporada activa y carrera histórica · foto opcional."}
          </p>
        </div>
      </section>
      <PlayerCareerPanel playerId={player?.id} playerName={player?.name || decodedName} />
      <Player key={`${activeSeasonId}:${decodedName}`} />
    </>
  );
}
