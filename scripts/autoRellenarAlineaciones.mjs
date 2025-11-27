// scripts/autoRellenarAlineaciones.mjs
// Uso: node autoRellenarAlineaciones.mjs <gameweekId>

import { createClient } from "@supabase/supabase-js";
import fs from "fs";

// ⚠️ Usa la misma config que en comprobarPrecios.js
// Si cambias la URL o la key allí, cámbialas aquí también
const supabase = createClient(
  "https://xsqjkasrcxbyrdyxevyu.supabase.co",
  "sb_publishable_Sybd0sqb4WazvZ9M4HYEaQ_zOHxO2am"
);

// --- Parámetro de jornada ---
const argGw = process.argv[2];
if (!argGw) {
  console.error("Uso: node autoRellenarAlineaciones.mjs <gameweekId>");
  process.exit(1);
}
const GW = Number(argGw);
if (Number.isNaN(GW)) {
  console.error("El gameweekId debe ser numérico");
  process.exit(1);
}

console.log(`🔁 Auto-rellenando alineaciones vacías para la jornada ${GW}...`);

// --- Cargar precios desde fantasy_players.json ---
const fantasyPlayers = JSON.parse(
  fs.readFileSync("../public/data/fantasy_players.json", "utf8")
);

// dorsal (number) -> precio
const priceByNumber = new Map(
  fantasyPlayers.map((p) => [
    Number(p.number ?? p.dorsal),
    Number(p.price ?? 0),
  ])
);

function isAllEmpty(players) {
  return (
    Array.isArray(players) &&
    players.length === 5 &&
    players.every(
      (v) => v === "-1" || v === -1 || v === null || v === undefined
    )
  );
}

function isValidFullLineup(players) {
  return (
    Array.isArray(players) &&
    players.length === 5 &&
    players.every(
      (v) => v !== "-1" && v !== -1 && v !== null && v !== undefined
    )
  );
}

function getLineupCost(players) {
  if (!Array.isArray(players)) return 0;
  const nums = players
    .map((x) => Number(x))
    .filter((n) => !Number.isNaN(n) && n >= 0);

  return nums.reduce(
    (sum, n) => sum + (priceByNumber.get(n) || 0),
    0
  );
}

async function main() {
  // 1) Cargar equipos para saber presupuesto
  const { data: teams, error: teamError } = await supabase
    .from("fantasy_teams")
    .select("id, cervezas");

  if (teamError) {
    console.error("Error cargando equipos fantasy:", teamError);
    process.exit(1);
  }

  const budgetByTeam = new Map(
    (teams || []).map((t) => [t.id, t.cervezas ?? 0])
  );

  // 2) Cargar alineaciones de esta jornada
  const { data: lineups, error: lineupError } = await supabase
    .from("fantasy_lineups")
    .select("id, fantasy_team_id, gameweek_id, players")
    .eq("gameweek_id", GW);

  if (lineupError) {
    console.error(
      "Error cargando alineaciones de la jornada:",
      lineupError
    );
    process.exit(1);
  }

  if (!lineups || lineups.length === 0) {
    console.log("No hay alineaciones para esta jornada. Nada que hacer.");
    process.exit(0);
  }

  let updated = 0;

  for (const lineup of lineups) {
    const teamId = lineup.fantasy_team_id;
    const budget = budgetByTeam.get(teamId) ?? 0;

    const rawPlayers = Array.isArray(lineup.players)
      ? lineup.players
      : [];

    // 1) Si NO está completamente vacía, no tocamos nada
    if (!isAllEmpty(rawPlayers)) {
      continue;
    }

    // 2) Buscar alineación inmediatamente anterior de este equipo
    const { data: prevLineup, error: prevError } = await supabase
      .from("fantasy_lineups")
      .select("players, captain_number, coach_code, gameweek_id")
      .eq("fantasy_team_id", teamId)
      .lt("gameweek_id", GW)
      .order("gameweek_id", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (prevError) {
      console.error(
        `Error buscando alineación anterior para equipo ${teamId}:`,
        prevError
      );
      continue;
    }

    if (!prevLineup) {
      // Nunca tuvo alineación previa
      continue;
    }

    const prevPlayers = Array.isArray(prevLineup.players)
      ? prevLineup.players
      : [];

    // Si la anterior también era todo -1, no auto-rellenamos
    if (isAllEmpty(prevPlayers)) {
      continue;
    }

    // Aseguramos que la alineación anterior era un quinteto completo válido
    if (!isValidFullLineup(prevPlayers)) {
      continue;
    }

    // 3) Comprobar coste con precios actuales
    const cost = getLineupCost(prevPlayers);

    if (cost > budget) {
      console.log(
        `Equipo ${teamId}: quinteto anterior se pasa de presupuesto (${cost} > ${budget}), no se copia.`
      );
      continue;
    }

    // 4) Actualizar la alineación actual copiando la anterior
    const { error: updateError } = await supabase
      .from("fantasy_lineups")
      .update({
        players: prevPlayers,
        captain_number: prevLineup.captain_number,
        coach_code: prevLineup.coach_code,
      })
      .eq("id", lineup.id);

    if (updateError) {
      console.error(
        `Error actualizando alineación de equipo ${teamId} en jornada ${GW}:`,
        updateError
      );
      continue;
    }

    updated++;
    console.log(
      `✅ Equipo ${teamId}: alineación de jornada ${GW} rellenada desde jornada ${prevLineup.gameweek_id} (coste ${cost}/${budget}).`
    );
  }

  console.log(
    `\n🏁 Proceso terminado. Alineaciones auto-rellenadas: ${updated}.`
  );
}

main().catch((err) => {
  console.error("Error inesperado en el script:", err);
  process.exit(1);
});
