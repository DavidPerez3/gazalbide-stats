import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import {
  listPublicLiveMatches,
  loadLiveCenterSnapshot,
  subscribeLiveCenter,
} from "../lib/liveCenter.js";
import { loadFantasyLive } from "../lib/fantasyLive.js";
import "../fantasy-live-preview.css";

export default function FantasyLivePreview() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [match, setMatch] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    let unsubscribe = null;

    async function refresh(matchId = null) {
      try {
        let id = matchId;
        if (!id) {
          const liveMatches = await listPublicLiveMatches();
          id = liveMatches[0]?.id || null;
        }
        if (!id) {
          if (!cancelled) {
            setData(null);
            setMatch(null);
          }
          return;
        }

        const snapshot = await loadLiveCenterSnapshot(id);
        if (!snapshot || snapshot.match.status !== "live") {
          if (!cancelled) {
            setData(null);
            setMatch(null);
          }
          return;
        }
        const fantasy = await loadFantasyLive(snapshot, user.id);
        if (cancelled) return;
        setMatch(snapshot.match);
        setData(fantasy?.available ? fantasy : null);

        if (!unsubscribe) {
          unsubscribe = subscribeLiveCenter(id, () => {
            window.clearTimeout(timerRef.current);
            timerRef.current = window.setTimeout(() => void refresh(id), 150);
          });
        }
      } catch (error) {
        console.warn("Preview Fantasy Live no disponible:", error);
        if (!cancelled) setData(null);
      }
    }

    void refresh();
    return () => {
      cancelled = true;
      window.clearTimeout(timerRef.current);
      unsubscribe?.();
    };
  }, [user]);

  if (!data || !match) return null;
  const top = (data.rows || []).slice(0, 3);

  return (
    <section className="fantasy-live-preview">
      <div className="fantasy-live-preview__heading">
        <div>
          <span><i /> FANTASY LIVE · PROVISIONAL</span>
          <strong>Gazalbide vs {match.opponent}</strong>
        </div>
        <Link to={`/live/${match.id}`}>Abrir Live Center →</Link>
      </div>

      {data.myTeam ? (
        <div className="fantasy-live-preview__mine">
          <span>Tu equipo</span>
          <strong>#{data.myTeam.position} · {Number(data.myTeam.gameweekPoints || 0).toFixed(1)} pts jornada</strong>
        </div>
      ) : null}

      <div className="fantasy-live-preview__podium">
        {top.length ? top.map((row) => (
          <div key={row.teamId} className={row.userId === user.id ? "is-me" : ""}>
            <b>#{row.position}</b>
            <span>{row.teamName}</span>
            <strong>{Number(row.totalPoints || 0).toFixed(1)}</strong>
          </div>
        )) : <span className="text-dim">Todavía no hay equipos puntuando.</span>}
      </div>
    </section>
  );
}
