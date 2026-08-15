import { useEffect, useMemo, useState } from "react";
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
  const [economy, setEconomy] = useState(null);
  const [gameweek, setGameweek] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) {
      setEconomy(null);
      setGameweek(null);
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
          }
          return;
        }

        const { data: economyRow, error: economyError } = await supabase
          .from("fantasy_gameweek_economy")
          .select(
            "base_budget, carry_in, available_budget, lineup_cost, valid_lineup, savings_generated, carry_out, finalized_at"
          )
          .eq("fantasy_team_id", team.id)
          .eq("gameweek_id", nextGameweek.id)
          .maybeSingle();

        if (economyError) throw economyError;

        if (!cancelled) {
          setGameweek(nextGameweek);
          setEconomy(economyRow || null);
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
  }, [user]);

  const values = useMemo(() => {
    if (!economy) return null;
    const base = Number(economy.base_budget || 0);
    const carry = Number(economy.carry_in || 0);
    const available = Number(economy.available_budget ?? base + carry);
    const lineupCost =
      economy.lineup_cost == null ? null : Number(economy.lineup_cost);
    return { base, carry, available, lineupCost };
  }, [economy]);

  if (!user || loading || error || !gameweek || !values) return null;

  const isValid = economy.valid_lineup === true;

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
              {values.available} 🍺 disponibles
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
          <span
            style={{
              ...pillStyle,
              border: isValid
                ? "1px solid rgba(74, 222, 128, 0.45)"
                : "1px solid rgba(248, 113, 113, 0.45)",
              color: isValid ? "#86EFAC" : "#FCA5A5",
            }}
          >
            {isValid ? "✓ Alineación válida" : "Alineación no válida"}
          </span>

          <span style={{ fontSize: "0.8rem", color: "#A1A1AA" }}>
            {isValid
              ? values.lineupCost == null
                ? "Puntúa y genera ahorro al cerrar la jornada."
                : `Coste: ${values.lineupCost} 🍺 · puntúa y puede generar ahorro.`
              : "0 puntos · 0 ahorro hasta que la alineación sea válida."}
          </span>
        </div>
      </section>
    </div>
  );
}
