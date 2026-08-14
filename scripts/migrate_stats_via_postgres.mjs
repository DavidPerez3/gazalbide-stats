import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(rootDir, "public", "data");
const statsDir = path.join(dataDir, "player_stats");

const databaseUrl = process.env.SUPABASE_DB_URL;
const season = process.env.STATS_SEASON || "2025-26";

if (!databaseUrl) {
  console.error("Falta SUPABASE_DB_URL.");
  process.exit(1);
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function loadLegacyData() {
  const players = await readJson(path.join(dataDir, "players.json"));
  const matches = await readJson(path.join(dataDir, "matches.json"));
  const statFiles = (await fs.readdir(statsDir)).filter((name) => name.endsWith(".json"));

  const discoveredPlayers = new Map(
    players.map((player, index) => [String(player.number), { ...player, sortOrder: index }])
  );
  const statsByMatch = new Map();

  for (const filename of statFiles) {
    const matchId = path.basename(filename, ".json");
    const rows = await readJson(path.join(statsDir, filename));
    statsByMatch.set(matchId, rows);

    for (const row of rows) {
      const number = String(row.number);
      if (!discoveredPlayers.has(number)) {
        discoveredPlayers.set(number, {
          number,
          name: row.name || `#${number}`,
          sortOrder: discoveredPlayers.size,
        });
      }
    }
  }

  return { players: [...discoveredPlayers.values()], matches, statsByMatch };
}

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function main() {
  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  const { players, matches, statsByMatch } = await loadLegacyData();
  const knownMatches = new Set(matches.map((match) => match.id));

  let importedStats = 0;
  await client.connect();

  try {
    await client.query("begin");

    const playerIdByNumber = new Map();
    for (const [index, player] of players.entries()) {
      const result = await client.query(
        `insert into public.players (number, name, active, sort_order, updated_at)
         values ($1, $2, true, $3, now())
         on conflict (number) do update set
           name = excluded.name,
           active = excluded.active,
           sort_order = excluded.sort_order,
           updated_at = now()
         returning id`,
        [String(player.number), player.name, Number.isInteger(player.sortOrder) ? player.sortOrder : index]
      );
      playerIdByNumber.set(String(player.number), result.rows[0].id);
    }

    for (const match of matches) {
      await client.query(
        `insert into public.matches
          (id, season, date, opponent, source_file, source_sheet, gazal_pts, opp_pts, q_pf, q_pa, result, status, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'published',now())
         on conflict (id) do update set
           season = excluded.season,
           date = excluded.date,
           opponent = excluded.opponent,
           source_file = excluded.source_file,
           source_sheet = excluded.source_sheet,
           gazal_pts = excluded.gazal_pts,
           opp_pts = excluded.opp_pts,
           q_pf = excluded.q_pf,
           q_pa = excluded.q_pa,
           result = excluded.result,
           status = 'published',
           updated_at = now()`,
        [
          match.id,
          season,
          match.date,
          match.opponent,
          match.file || null,
          match.sheet || null,
          num(match.gazal_pts),
          num(match.opp_pts),
          Array.isArray(match.q_pf) ? match.q_pf.map(num) : [],
          Array.isArray(match.q_pa) ? match.q_pa.map(num) : [],
          match.result || null,
        ]
      );
    }

    for (const [matchId, rows] of statsByMatch.entries()) {
      if (!knownMatches.has(matchId)) {
        console.warn(`⚠️ Se omite ${matchId}: no existe en matches.json`);
        continue;
      }

      for (const [sortOrder, row] of rows.entries()) {
        const playerId = playerIdByNumber.get(String(row.number));
        if (!playerId) throw new Error(`No existe player_id para dorsal ${row.number}`);

        await client.query(
          `insert into public.player_match_stats
            (match_id, player_id, sort_order, min_seconds, min_str, pts,
             two_pm, two_pa, three_pm, three_pa, fgm, fga, ftm, fta,
             oreb, dreb, reb, ast, tov, stl, blk, pf, pfd, pir, eff, plus_minus, updated_at)
           values
            ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,now())
           on conflict (match_id, player_id) do update set
             sort_order = excluded.sort_order,
             min_seconds = excluded.min_seconds,
             min_str = excluded.min_str,
             pts = excluded.pts,
             two_pm = excluded.two_pm,
             two_pa = excluded.two_pa,
             three_pm = excluded.three_pm,
             three_pa = excluded.three_pa,
             fgm = excluded.fgm,
             fga = excluded.fga,
             ftm = excluded.ftm,
             fta = excluded.fta,
             oreb = excluded.oreb,
             dreb = excluded.dreb,
             reb = excluded.reb,
             ast = excluded.ast,
             tov = excluded.tov,
             stl = excluded.stl,
             blk = excluded.blk,
             pf = excluded.pf,
             pfd = excluded.pfd,
             pir = excluded.pir,
             eff = excluded.eff,
             plus_minus = excluded.plus_minus,
             updated_at = now()`,
          [
            matchId,
            playerId,
            sortOrder,
            num(row.min),
            row.min_str || "00:00",
            num(row.pts),
            num(row.two_pm),
            num(row.two_pa),
            num(row.three_pm),
            num(row.three_pa),
            num(row.fgm),
            num(row.fga),
            num(row.ftm),
            num(row.fta),
            num(row.oreb),
            num(row.dreb),
            num(row.reb),
            num(row.ast),
            num(row.tov),
            num(row.stl),
            num(row.blk),
            num(row.pf),
            num(row.pfd),
            num(row.pir),
            num(row.eff),
            num(row.plus_minus),
          ]
        );
        importedStats++;
      }
    }

    const counts = await Promise.all([
      client.query("select count(*)::int as count from public.players"),
      client.query("select count(*)::int as count from public.matches"),
      client.query("select count(*)::int as count from public.player_match_stats"),
    ]);

    await client.query("commit");

    console.log("✅ Migración histórica completada");
    console.log(`JSON -> jugadores detectados: ${players.length}`);
    console.log(`JSON -> partidos detectados: ${matches.length}`);
    console.log(`JSON -> filas stats importadas: ${importedStats}`);
    console.log(`Supabase -> players: ${counts[0].rows[0].count}`);
    console.log(`Supabase -> matches: ${counts[1].rows[0].count}`);
    console.log(`Supabase -> player_match_stats: ${counts[2].rows[0].count}`);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("❌ Migración fallida:", error);
  process.exit(1);
});
