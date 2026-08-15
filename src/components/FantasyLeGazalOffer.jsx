import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient.js";
import { CURRENT_SEASON_ID } from "../lib/seasons.js";

export default function FantasyLeGazalOffer() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [offer, setOffer] = useState(null);
  const [activeSession, setActiveSession] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function load() {
      try {
        const { data: team, error: teamError } = await supabase
          .from("fantasy_teams")
          .select("id")
          .eq("user_id", user.id)
          .eq("season_id", CURRENT_SEASON_ID)
          .maybeSingle();
        if (teamError || !team) return;

        const { data: session, error: sessionError } = await supabase
          .from("le_gazal_sessions")
          .select("id, balance, gameweek_id, status")
          .eq("fantasy_team_id", team.id)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (sessionError) throw sessionError;

        if (session) {
          if (!cancelled) setActiveSession(session);
          return;
        }

        const { data: gameweek, error: gwError } = await supabase
          .from("gameweeks")
          .select("id, name, deadline")
          .eq("season_id", CURRENT_SEASON_ID)
          .order("date", { ascending: false })
          .order("id", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (gwError || !gameweek) return;

        const { data: existingSession } = await supabase
          .from("le_gazal_sessions")
          .select("status")
          .eq("fantasy_team_id", team.id)
          .eq("gameweek_id", gameweek.id)
          .maybeSingle();
        if (existingSession) return;

        const { data: economy, error: economyError } = await supabase
          .from("fantasy_gameweek_economy")
          .select("carry_out, valid_lineup, finalized_at")
          .eq("fantasy_team_id", team.id)
          .eq("gameweek_id", gameweek.id)
          .maybeSingle();
        if (economyError) throw economyError;

        const deadlinePassed = gameweek.deadline && new Date(gameweek.deadline).getTime() <= Date.now();
        if (
          economy?.valid_lineup === true &&
          economy?.finalized_at &&
          Number(economy.carry_out || 0) > 0 &&
          deadlinePassed &&
          !cancelled
        ) {
          setOffer({
            amount: Number(economy.carry_out),
            name: gameweek.name || `Jornada ${gameweek.id}`,
          });
        }
      } catch (error) {
        console.error("Error cargando oferta de Le Gazal:", error);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (dismissed) return null;
  if (!activeSession && !offer) return null;

  return (
    <div className="container">
      <section
        style={{
          margin: "12px auto 0",
          padding: "12px 14px",
          borderRadius: 14,
          border: "1px solid rgba(250, 204, 21, 0.35)",
          background: "rgba(24, 24, 27, 0.94)",
        }}
      >
        {activeSession ? (
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
            <span>Le Gazal en curso · <strong>{Number(activeSession.balance || 0)} 🍺</strong></span>
            <button type="button" onClick={() => navigate("/fantasy/le-gazal")}>Continuar</button>
          </div>
        ) : (
          <div>
            <strong>{offer.name}: te sobran {offer.amount} 🍺</strong>
            <p style={{ margin: "6px 0 10px", color: "#A1A1AA" }}>
              Si no haces nada se ahorran automáticamente. También puedes destinar una parte a Le Gazal.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button type="button" onClick={() => setDismissed(true)}>Ahorrar</button>
              <button type="button" onClick={() => navigate("/fantasy/le-gazal")}>Jugar Le Gazal</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
