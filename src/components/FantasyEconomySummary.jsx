import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient.js";
import { CURRENT_SEASON_ID } from "../lib/seasons.js";

const cardStyle = {
  margin: "12px auto 0",
  padding: "12px 14px",
  borderRadius: 14,
  border: "1px solid rgba(250, 204, 21, 0.35)",
  background: "rgba(24, 24, 27, 0.94)",
  boxShadow: "0 8px 24px rgba(0, 0, 0, 0.2)",
};

const rowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px 14px",
  alignItems: "center",
  justifyContent: "space-between",
};

const pillStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "5px 9px",
  borderRadius: 999,
  background: "rgba(255, 255, 255, 0.06)",
  whiteSpace: "nowrap",
};

export default function FantasyEconomySummary() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [economy, setEconomy] = useState(null);
  const [gameweek, setGameweek] = useState(null);
  const [lineup, setLineup] = useState(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const refresh = () => setRevision((current) => current + 1);
    window.addEventListener("fantasy-lineup-changed", refresh);
    return () => window.removeEventListener("fantasy-lineup-changed", refresh);
  }, []);

  useEffect(() => {
    if (!user) {
      setEconomy(null);
      setGameweek(null);
      setLineup(null);
      setError(null);
      return;
    }

    let cancelled = false;

    async function loadEconomy() {
      setLoading(true);
      setError(null);

      try {
        const { data: team, error: teamError } = await supabase
          .from("fantasy_teams")
          .select("id")
          .eq("user_id", user.id)
          .eq("season_id", CURRENT_SEASON_ID)
          .maybeSingle();

        if (teamError) throw teamError;
        if (!team) {
          if (!cancelled) {
            setEconomy(null);
            setGameweek(null);
            setLineup(null);
          }
          return;
        }

        const nowIso = new Date().toISOString();
        const { data: nextGameweek, error: gameweekError } = await supabase
          .from("gameweeks")
          .select("id, name, base_budget, deadline")
          .eq("season_id", CURRENT_SEASON_ID)
          .eq("status", "scheduled")
          .gt("deadline", nowIso)
          .order("deadline", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (gameweekError) throw gameweekError;
        if (!nextGameweek) {
          if (!cancelled) {
            setEconomy(null);
            setGameweek(null);
            setLineup(null);
          }
          return;
        }

        const [{ data: economyRow, error: economyError }, { data: lineupRow, error: lineupError }] = await Promise.all([
          supabase.from("fantasy_gameweek_economy")
            .select("base_budget, carry_in, available_budget, lineup_cost, valid_lineup, savings_generated, carry_out, finalized_at")
            .eq("fantasy_team_id", team.id)
            .eq("gameweek_id", nextGameweek.id)
            .maybeSingle(),
          supabase.from("fantasy_lineups")
            .select("players,captain_number,coach_code")
            .eq("fantasy_team_id", team.id)
            .eq("gameweek_id", nextGameweek.id)
            .maybeSingle(),
        ]);

        if (economyError) throw economyError;
        if (lineupError) throw lineupError;

        if (!cancelled) {
          setGameweek(nextGameweek);
          setEconomy(economyRow || null);
          setLineup(lineupRow || null);
        }
      } catch (err) {
        console.error("Error cargando resumen de economía Fantasy:", err);
        if (!cancelled) setError(err.message || "No se pudo cargar el presupuesto");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadEconomy();

    return () => {
      cancelled = true;
    };
  }, [user, pathname, revision]);

  const values = useMemo(() => {
    if (!economy) return null;
    const base = Number(economy.base_budget || 0);
    const carry = Number(economy.carry_in || 0);
    const available = Number(economy.available_budget ?? base + carry);
    const lineupCost =
      economy.lineup_cost == null ? null : Number(economy.lineup_cost);
    const remaining = Math.max(available - (lineupCost ?? 0), 0);
    return { base, carry, available, lineupCost, remaining };
  }, [economy]);

  if (!user || loading || error || !gameweek || !values) return null;

  const isValid = economy.valid_lineup === true;
  const selectedPlayers = (lineup?.players || []).filter((number) =>
    number != null && Number.isFinite(Number(number)) && Number(number) >= 0
  );
  const playerNumbers = selectedPlayers.map(Number);
  const checks = [
    { label: `Jugadores ${selectedPlayers.length}/5`, done: selectedPlayers.length === 5 && new Set(playerNumbers).size === 5 },
    { label: "Entrenador", done: Boolean(lineup?.coach_code) },
    { label: "Capitán", done: lineup?.captain_number != null && playerNumbers.includes(Number(lineup.captain_number)) },
    { label: "Presupuesto", done: values.lineupCost == null || values.lineupCost <= values.available },
  ];

  return (
    <div className="container" aria-label="Resumen de presupuesto Fantasy">
      <section style={cardStyle}>
        <div style={rowStyle}>
          <div>
            <div
              style={{
                fontSize: "0.72rem",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#A1A1AA",
                marginBottom: 3,
              }}
            >
              Economía Fantasy · {gameweek.name || "próxima jornada"}
            </div>
            <strong style={{ color: "#FAFAFA", fontSize: "1rem" }}>
              {values.remaining} 🍺 libres
            </strong>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <span style={pillStyle} title="Presupuesto base fijado para esta jornada">
              Base <strong>{values.base} 🍺</strong>
            </span>
            <span
              style={pillStyle}
              title="Saldo que llega de la jornada inmediatamente anterior"
            >
              Arrastre <strong>+{values.carry} 🍺</strong>
            </span>
            <span
              style={{
                ...pillStyle,
                border: "1px solid rgba(250, 204, 21, 0.45)",
              }}
              title="Presupuesto base más saldo arrastrado"
            >
              Total <strong>{values.available} 🍺</strong>
            </span>
            <span style={pillStyle} title="Coste de los jugadores elegidos hasta ahora">
              Fichajes <strong>−{values.lineupCost ?? 0} 🍺</strong>
            </span>
          </div>
        </div>

        <div
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <div style={{ width: "100%" }}>
            <strong style={{ color: isValid ? "#86EFAC" : "#FAFAFA", fontSize: "0.85rem" }}>
              {isValid ? "✓ Alineación lista" : "Para que puntúe tu alineación:"}
            </strong>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
              {checks.map(({ label, done }) => (
                <span key={label} style={{ ...pillStyle,
                  border: `1px solid ${done ? "rgba(74, 222, 128, 0.45)" : "rgba(248, 113, 113, 0.45)"}`,
                  color: done ? "#86EFAC" : "#FCA5A5" }}>
                  {done ? "✓" : "○"} {label}
                </span>
              ))}
            </div>
            {!isValid && checks.every(({ done }) => done) && (
              <p style={{ fontSize: "0.8rem", color: "#FCA5A5", margin: "8px 0 0" }}>
                Revisa que los jugadores y sus precios sigan vigentes en el mercado.
              </p>
            )}
            <p style={{ fontSize: "0.8rem", color: "#A1A1AA", margin: "8px 0 0" }}>
              {isValid ? "Puntúa y puede generar ahorro al cerrar la jornada." : "0 puntos · 0 ahorro hasta completar los requisitos."}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
