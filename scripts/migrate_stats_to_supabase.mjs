import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(rootDir, "public", "data");
const statsDir = path.join(dataDir, "player_stats");

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const season = process.env.STATS_SEASON || "2025-26";

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY. " +
      "La migración requiere la service role key y nunca debe ejecutarse desde el navegador."
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function loadLegacyData() {
  const [players, matches, statFiles] = await Promise.all([
    readJson(path.join(dataDir, "players.json")),
    readJson(path.join(dataDir, "matches.json")),
    fs.readdir(statsDir),
  ]);

  const statsByMatch = new Map();
  const discoveredPlayers = new Map(
    players.map((player, index) => [String(player.number), { ...player, sort_order: index }])
  );

  for (const filename of statFiles.filter((name) => name.endsWith(".json"))) {
    const matchId = path.basename(filename, ".json");
    const rows = await readJson(path.join(statsDir, filename));
    statsByMatch.set(matchId, rows);

    for (const row of rows) {
      const number = String(row.number);
      if (!discoveredPlayers.has(number)) {
        discoveredPlayers.set(number, {
          number,
          name: row.name || `#${number}`,
          sort_order: discoveredPlayers.size,
        });
      }
    }
  }

  return {
    players: [...discoveredPlayers.values()],
    matches,
    statsByMatch,
  };
}

function mapMatch(match) {
  return {
    id: match.id,
    season,
    date: match.date,
    opponent: match.opponent,
    source_file: match.file || null,
    source_sheet: match.sheet || null,
    gazal_pts: Number(match.gazal_pts || 0),
    opp_pts: Number(match.opp_pts || 0),
    q_pf: Array.isArray(match.q_pf) ? match.q_pf.map(Number) : [],
    q_pa: Array.isArray(match.q_pa) ? match.q_pa.map(Number) : [],
    result: match.result || null,
    status: "published",
    updated_at: new Date().toISOString(),
  };
}

function mapStat(matchId, row, playerId, sortOrder) {
  return {
    match_id: matchId,
    player_id: playerId,
    sort_order: sortOrder,
    min_seconds: Number(row.min || 0),
    min_str: row.min_str || "00:00",
    pts: Number(row.pts || 0),
    two_pm: Number(row.two_pm || 0),
    two_pa: Number(row.two_pa || 0),
    three_pm: Number(row.three_pm || 0),
    three_pa: Number(row.three_pa || 0),
    fgm: Number(row.fgm || 0),
    fga: Number(row.fga || 0),
    ftm: Number(row.ftm || 0),
    fta: Number(row.fta || 0),
    oreb: Number(row.oreb || 0),
    dreb: Number(row.dreb || 0),
    reb: Number(row.reb || 0),
    ast: Number(row.ast || 0),
    tov: Number(row.tov || 0),
    stl: Number(row.stl || 0),
    blk: Number(row.blk || 0),
    pf: Number(row.pf || 0),
    pfd: Number(row.pfd || 0),
    pir: Number(row.pir || 0),
    eff: Number(row.eff || 0),
    plus_minus: Number(row.plus_minus || 0),
    updated_at: new Date().toISOString(),
  };
}

async function upsertPlayers(players) {
  const payload = players.map((player, index) => ({
    number: String(player.number),
    name: player.name,
    sort_order: Number.isInteger(player.sort_order) ? player.sort_order : index,
    active: true,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("players")
    .upsert(payload, { onConflict: "number" });

  if (error) throw new Error(`Error migrando players: ${error.message}`);

  const { data, error: readError } = await supabase
    .from("players")
    .select("id, number");

  if (readError) throw new Error(`Error leyendo players: ${readError.message}`);

  return new Map((data || []).map((player) => [String(player.number), player.id]));
}

async function upsertMatches(matches) {
  const { error } = await supabase
    .from("matches")
    .upsert(matches.map(mapMatch), { onConflict: "id" });

  if (error) throw new Error(`Error migrando matches: ${error.message}`);
}

async function upsertStats(matches, statsByMatch, playerIdByNumber) {
  const knownMatchIds = new Set(matches.map((match) => match.id));
  const payload = [];

  for (const [matchId, rows] of statsByMatch.entries()) {
    if (!knownMatchIds.has(matchId)) {
      console.warn(`⚠️  Se omite ${matchId}: no existe en matches.json.`);
      continue;
    }

    rows.forEach((row, index) => {
      const playerId = playerIdByNumber.get(String(row.number));
      if (!playerId) {
        throw new Error(
          `No se encontró player_id para el dorsal ${row.number} (${row.name || "sin nombre"}).`
        );
      }
      payload.push(mapStat(matchId, row, playerId, index));
    });
  }

  const chunkSize = 500;
  for (let offset = 0; offset < payload.length; offset += chunkSize) {
    const chunk = payload.slice(offset, offset + chunkSize);
    const { error } = await supabase
      .from("player_match_stats")
      .upsert(chunk, { onConflict: "match_id,player_id" });

    if (error) {
      throw new Error(
        `Error migrando player_match_stats (${offset}-${offset + chunk.length}): ${error.message}`
      );
    }
  }

  return payload.length;
}

async function main() {
  console.log("🏀 Preparando migración de estadísticas de Gazalbide...");
  const { players, matches, statsByMatch } = await loadLegacyData();

  console.log(`Jugadores detectados: ${players.length}`);
  console.log(`Partidos detectados: ${matches.length}`);
  console.log(`Ficheros de estadísticas: ${statsByMatch.size}`);

  const playerIdByNumber = await upsertPlayers(players);
  await upsertMatches(matches);
  const statsCount = await upsertStats(matches, statsByMatch, playerIdByNumber);

  console.log("✅ Migración terminada.");
  console.log(`   players: ${players.length}`);
  console.log(`   matches: ${matches.length}`);
  console.log(`   player_match_stats: ${statsCount}`);
  console.log(
    "Los JSON originales siguen intactos; puedes volver a ejecutar este script de forma idempotente."
  );
}

main().catch((error) => {
  console.error("❌ Migración cancelada:", error);
  process.exit(1);
});
