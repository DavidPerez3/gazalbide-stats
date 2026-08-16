import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { selectBestLineup } from "../lib/liveCenter.js";
import BestLineupCard from "./BestLineupCard.jsx";

export default function PublishedBestLineup({ matchId }) {
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!matchId) return undefined;
    let cancelled = false;

    (async () => {
      try {
        const [lineupResult, rosterResult] = await Promise.all([
          supabase
            .from("match_lineup_stats")
            .select("lineup_key,player_ids,stint_count,duration_ms,gazal_pts,opp_pts,plus_minus")
            .eq("match_id", matchId),
          supabase
            .from("game_roster")
            .select("player_id,jersey_number,player_name")
            .eq("match_id", matchId)
            .eq("is_active", true),
        ]);
        if (lineupResult.error) throw lineupResult.error;
        if (rosterResult.error) throw rosterResult.error;

        const lineups = (lineupResult.data || []).map((row) => ({
          lineupKey: row.lineup_key,
          lineupIds: (row.player_ids || []).map(String),
          stints: Number(row.stint_count || 0),
          durationMs: Number(row.duration_ms || 0),
          gazalbidePts: Number(row.gazal_pts || 0),
          opponentPts: Number(row.opp_pts || 0),
          plusMinus: Number(row.plus_minus || 0),
        }));
        const bestLineup = selectBestLineup(lineups);
        const players = (rosterResult.data || []).map((row) => ({
          id: String(row.player_id),
          number: String(row.jersey_number),
          name: row.player_name,
        }));
        if (!cancelled) setResult(bestLineup ? { bestLineup, players } : null);
      } catch (error) {
        console.warn("No se pudo cargar el mejor quinteto del partido:", error);
        if (!cancelled) setResult(null);
      }
    })();

    return () => { cancelled = true; };
  }, [matchId]);

  if (!result) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <BestLineupCard lineup={result.bestLineup} players={result.players} />
    </div>
  );
}
