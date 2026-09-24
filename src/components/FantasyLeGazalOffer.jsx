import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient.js";
import { CURRENT_SEASON_ID } from "../lib/seasons.js";

export default function FantasyLeGazalOffer() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [gameweek, setGameweek] = useState(null);
  const [economy, setEconomy] = useState(null);
  const [activeSession, setActiveSession] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    const { data: team, error: teamError } = await supabase.from("fantasy_teams")
      .select("id").eq("user_id", user.id).eq("season_id", CURRENT_SEASON_ID).maybeSingle();
    if (teamError) throw teamError;
    if (!team) return;

    const { data: session, error: sessionError } = await supabase.from("le_gazal_sessions")
      .select("id,balance,gameweek_id,status")
      .eq("fantasy_team_id", team.id).eq("status", "active")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (sessionError) throw sessionError;
    setActiveSession(session || null);
    if (session) return;

    const { data: gw, error: gwError } = await supabase.from("gameweeks")
      .select("id,name,deadline,status").eq("season_id", CURRENT_SEASON_ID)
      .order("date", { ascending: false }).order("id", { ascending: false })
      .limit(1).maybeSingle();
    if (gwError) throw gwError;
    setGameweek(gw || null);
    if (!gw) { setEconomy(null); return; }

    const { data: row, error: economyError } = await supabase.from("fantasy_gameweek_economy")
      .select("available_budget,lineup_cost,valid_lineup,finalized_at,locked_at,carry_out,savings_generated,savings_choice")
      .eq("fantasy_team_id", team.id).eq("gameweek_id", gw.id).maybeSingle();
    if (economyError) throw economyError;
    setEconomy(row || null);
  }, [user]);

  useEffect(() => {
    load().catch((err) => { console.error("Error cargando elección Fantasy:", err); setError(err.message); });
  }, [load]);

  useEffect(() => {
    const refresh = () => load().catch((err) => setError(err.message));
    window.addEventListener("fantasy-lineup-changed", refresh);
    return () => window.removeEventListener("fantasy-lineup-changed", refresh);
  }, [load]);

  async function act(rpc) {
    if (!gameweek || busy) return;
    setBusy(true);
    setError("");
    try {
      const { error: rpcError } = await supabase.rpc(rpc, { p_gameweek_id: gameweek.id });
      if (rpcError) throw rpcError;
      if (rpc === "close_fantasy_lineup") {
        window.dispatchEvent(new Event("fantasy-lineup-locked"));
        window.dispatchEvent(new Event("fantasy-lineup-changed"));
      }
      await load();
    } catch (err) {
      setError(err.message || "No se pudo guardar la elección.");
    } finally {
      setBusy(false);
    }
  }

  if (!user || (!activeSession && !economy)) return null;
  const deadlinePassed = gameweek?.deadline && new Date(gameweek.deadline).getTime() <= Date.now();
  const canClose = economy?.valid_lineup && !economy.locked_at && !economy.finalized_at && gameweek?.status === "scheduled";
  const closed = Boolean(economy?.locked_at);
  const canChoose = economy?.valid_lineup && economy.finalized_at &&
    Number(economy.carry_out || 0) > 0 && !economy.savings_choice && (closed || deadlinePassed);
  if (!activeSession && !canClose && !closed && !canChoose && !error) return null;

  return (
    <div className="container">
      <section style={{ margin: "12px auto 0", padding: "12px 14px", borderRadius: 14,
        border: "1px solid rgba(250, 204, 21, 0.35)", background: "rgba(24, 24, 27, 0.94)" }}>
        {error && <p role="alert" style={{ color: "#FCA5A5" }}>{error}</p>}
        {activeSession ? (
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
            <span>Le Gazal en curso · <strong>{Number(activeSession.balance || 0)} 🍺</strong></span>
            <button className="fantasy__button fantasy__button--secondary" type="button" onClick={() => navigate("/fantasy/le-gazal")}>Continuar</button>
          </div>
        ) : canClose ? (
          <div>
            <strong>{deadlinePassed ? "El mercado ya cerró" : "Tu alineación está lista"} para {gameweek.name}.</strong>
            <p style={{ color: "#A1A1AA" }}>
              Te quedan {Math.max(Number(economy.available_budget) - Number(economy.lineup_cost || 0), 0)} 🍺.
              {deadlinePassed
                ? " Activa el ahorro para elegir entre guardarlas o jugar Le Gazal. La alineación ya no se puede modificar."
                : " Ciérrala para elegir entre ahorrar o jugar Le Gazal. Después no podrás cambiar jugadores, entrenador ni capitán."}
            </p>
            <button className="fantasy__button" type="button" disabled={busy} onClick={() => act("close_fantasy_lineup")}>
              {busy ? "Procesando…" : deadlinePassed ? "Activar ahorro" : "Cerrar alineación"}
            </button>
          </div>
        ) : canChoose ? (
          <div>
            <strong>{gameweek.name}: {closed ? "alineación cerrada" : "mercado cerrado"} · {economy.carry_out} 🍺 para ahorrar o jugar</strong>
            <p style={{ color: "#A1A1AA" }}>
              Puedes guardar estas cervezas o destinar una parte a Le Gazal. Si no eliges, se guardarán automáticamente.
              {Number(economy.savings_generated || 0) > Number(economy.carry_out || 0)
                ? ` El ahorro ordinario tiene un máximo de ${economy.carry_out} 🍺 para la próxima jornada.` : ""}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button className="fantasy__button fantasy__button--secondary" type="button" disabled={busy} onClick={() => act("choose_fantasy_savings")}>
                {busy ? "Guardando…" : `Ahorrar ${economy.carry_out} 🍺`}
              </button>
              <button className="fantasy__button" type="button" disabled={busy} onClick={() => navigate("/fantasy/le-gazal")}>Jugar Le Gazal</button>
            </div>
          </div>
        ) : closed ? (
          <strong>Alineación cerrada · {economy?.savings_choice === "save"
            ? `ahorro confirmado (${economy.carry_out} 🍺)`
            : economy?.savings_choice === "play" ? "Le Gazal ya jugado" : "sin cervezas para apostar"}.</strong>
        ) : null}
      </section>
    </div>
  );
}
