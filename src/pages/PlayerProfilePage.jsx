import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import Player from "./Player.jsx";
import PlayerPhoto from "../components/PlayerPhoto.jsx";
import PlayerCareerPanel from "../components/PlayerCareerPanel.jsx";
import { useSeason } from "../context/SeasonContext.jsx";
import { getPlayers } from "../lib/data.js";
import "../player-profile.css";

function samePlayerName(candidate, name) {
  return String(candidate?.name || "").trim().toLowerCase() === String(name || "").trim().toLowerCase();
}

export default function PlayerProfilePage() {
  const { name } = useParams();
  const decodedName = decodeURIComponent(name || "");
  const { activeSeasonId, seasons, setActiveSeasonId } = useSeason();
  const [playersBySeason, setPlayersBySeason] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);

    Promise.all(
      seasons.map(async (season) => {
        try {
          const players = await getPlayers(season.id);
          return [season.id, players || []];
        } catch (error) {
          console.error(`Error cargando plantilla ${season.id}:`, error);
          return [season.id, []];
        }
      })
    )
      .then((entries) => {
        if (cancelled) return;
        setPlayersBySeason(Object.fromEntries(entries));
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [decodedName, seasons]);

  const player = useMemo(
    () => (playersBySeason[activeSeasonId] || []).find((candidate) => samePlayerName(candidate, decodedName)) || null,
    [playersBySeason, activeSeasonId, decodedName]
  );

  const availableSeasons = useMemo(
    () => seasons.filter((season) =>
      (playersBySeason[season.id] || []).some((candidate) => samePlayerName(candidate, decodedName))
    ),
    [playersBySeason, seasons, decodedName]
  );

  const identityPlayer = useMemo(() => {
    if (player) return player;
    for (const season of availableSeasons) {
      const found = (playersBySeason[season.id] || []).find((candidate) => samePlayerName(candidate, decodedName));
      if (found) return found;
    }
    return { name: decodedName };
  }, [player, availableSeasons, playersBySeason, decodedName]);

  if (loading) {
    return <section className="card card--p player-profile-status">Cargando perfil…</section>;
  }

  if (loadError) {
    return <section className="card card--p player-profile-status history-error">No se pudo cargar el perfil.</section>;
  }

  if (!player) {
    const firstAvailable = availableSeasons[0] || null;
    return (
      <>
        <section className="card player-profile-unavailable">
          <PlayerPhoto player={identityPlayer} size="profile" />
          <div className="player-profile-unavailable__copy">
            <span className="player-profile-hero__season">Temporada {activeSeasonId}</span>
            <h1>{decodedName}</h1>
            <p className="text-dim">
              {firstAvailable
                ? `${decodedName} no formó parte de Gazalbide en ${activeSeasonId}. Su perfil de temporada no se muestra con estadísticas a cero.`
                : `No hay participación registrada para ${decodedName} en ${activeSeasonId}.`}
            </p>
            {firstAvailable ? (
              <button
                type="button"
                className="player-profile-unavailable__switch"
                onClick={() => setActiveSeasonId(firstAvailable.id)}
              >
                Ver temporada {firstAvailable.label}
              </button>
            ) : null}
          </div>
        </section>
        <PlayerCareerPanel playerId={identityPlayer?.id} playerName={identityPlayer?.name || decodedName} />
      </>
    );
  }

  return (
    <>
      <section className="player-profile-hero card">
        <PlayerPhoto player={player} size="profile" />
        <div className="player-profile-hero__copy">
          <div className="player-profile-hero__season">Temporada {activeSeasonId}</div>
          <h1>
            {player?.number !== undefined && player?.number !== null && player?.number !== "" ? <span>#{player.number} · </span> : null}
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
      <div className="player-season-detail">
        <Player key={`${activeSeasonId}:${decodedName}`} />
      </div>
    </>
  );
}
