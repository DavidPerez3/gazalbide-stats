import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  listPublicLiveMatches,
  loadLiveCenterSnapshot,
  subscribeLiveCenter,
} from "../lib/liveCenter.js";
import "../public-live-banner.css";

function periodLabel(period) {
  const value = Number(period || 1);
  return value <= 4 ? `Q${value}` : `OT${value - 4}`;
}

export default function PublicLiveBanner() {
  const [snapshot, setSnapshot] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = null;
    let timer = null;

    async function load() {
      try {
        const matches = await listPublicLiveMatches();
        if (cancelled || !matches.length) {
          if (!cancelled) setSnapshot(null);
          return;
        }
        const matchId = matches[0].id;
        const next = await loadLiveCenterSnapshot(matchId);
        if (cancelled) return;
        setSnapshot(next);
        unsubscribe?.();
        unsubscribe = subscribeLiveCenter(matchId, () => {
          window.clearTimeout(timer);
          timer = window.setTimeout(async () => {
            try {
              const updated = await loadLiveCenterSnapshot(matchId);
              if (!cancelled) setSnapshot(updated?.match?.status === "live" ? updated : null);
            } catch {
              // Banner no bloqueante.
            }
          }, 120);
        });
      } catch {
        if (!cancelled) setSnapshot(null);
      }
    }

    void load();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      unsubscribe?.();
    };
  }, []);

  if (!snapshot || snapshot.match.status !== "live") return null;

  return (
    <Link to={`/live/${snapshot.match.id}`} className="public-live-banner card card--p">
      <div>
        <span className="public-live-banner__status"><i /> EN DIRECTO</span>
        <strong>Gazalbide vs {snapshot.match.opponent}</strong>
        <small>{periodLabel(snapshot.clock.period)} · Sigue estadísticas y Fantasy Live</small>
      </div>
      <div className="public-live-banner__score">
        <b>{snapshot.score.gazalbide}–{snapshot.score.opponent}</b>
        <span>Abrir Live Center →</span>
      </div>
    </Link>
  );
}
