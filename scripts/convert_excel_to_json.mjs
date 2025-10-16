import fs from "fs";
import path from "path";
import xlsx from "xlsx";

const inputDir = process.argv[2] || "./excels";
const outputMatches = "./public/data/matches.json";
const outputPlayers = "./public/data/players.json";
const outputStatsDir = "./public/data/player_stats";

if (!fs.existsSync(outputStatsDir)) fs.mkdirSync(outputStatsDir, { recursive: true });

// Convierte texto a formato Title Case (Anboto Jatetxea)
const titleCase = (s) =>
  String(s || "")
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ");

// Intenta extraer fecha ISO desde el nombre del archivo
function guessDateFromFilename(filename) {
  const match = filename.match(/(\d{2})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [_, dd, mm, yy] = match;
  return `20${yy}-${mm}-${dd}`;
}

// Normaliza cabeceras de las columnas del Excel
function normalizeHeader(header) {
  return header
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function readSheet(file, sheetName) {
  const workbook = xlsx.readFile(file);
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];

  const data = xlsx.utils.sheet_to_json(sheet, { defval: null });
  return data;
}

// Función principal
async function main() {
  const files = fs
    .readdirSync(inputDir)
    .filter((f) => f.endsWith(".xls") || f.endsWith(".xlsx"));

  if (!files.length) {
    console.log("⚠️ No hay archivos Excel para procesar.");
    return;
  }

  const matches = [];
  const playersMap = new Map();

  for (const file of files) {
    const fullPath = path.join(inputDir, file);
    const sheetName = "Gazal A Stats";
    const rows = readSheet(fullPath, sheetName);
    if (!rows.length) continue;

    // === NUEVO BLOQUE PARA ID, FECHA Y RIVAL ===
    const base = path.basename(file, path.extname(file));
    const dateISO = guessDateFromFilename(file);

    // Extrae rival después de "vs" y antes de la parte horaria/fecha
    let opponent = null;
    const vsMatch = base.match(
      /vs[_-]?([a-z0-9_-]+?)(?:_\d{1,2}_\d{2}_\d{2}-\d{2}-\d{2})?$/i
    );
    if (vsMatch) {
      opponent = vsMatch[1]
        .replace(/[_-]+/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
    }
    if (!opponent) opponent = "Desconocido";
    opponent = titleCase(opponent);

    const matchId = dateISO
      ? `${dateISO}-vs-${opponent.toLowerCase().replace(/\s+/g, "-")}`
      : base
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "");

    matches.push({
      id: matchId,
      date: dateISO || "Desconocida",
      opponent,
      file,
      sheet: sheetName,
    });

    // === Procesar filas del Excel ===
    const normalized = rows.map((row) => {
      const obj = {};
      for (const key in row) {
        const nk = normalizeHeader(key);
        obj[nk] = row[key];
      }
      return obj;
    });

    // Filtramos columnas relevantes y convertimos a JSON
    const clean = normalized.map((p) => ({
      number: p.n || p.no || p.num || p.dorsal || null,
      name: p.jugador || p.player || "",
      min: p.min || 0,
      pts: p.pts || 0,
      two_pm: p["2pm"] || 0,
      two_pa: p["2pa"] || 0,
      three_pm: p["3pm"] || 0,
      three_pa: p["3pa"] || 0,
      fgm: p.fgm || 0,
      fga: p.fga || 0,
      ftm: p.ftm || 0,
      fta: p.fta || 0,
      oreb: p.oreb || 0,
      dreb: p.dreb || 0,
      reb: p.reb || 0,
      ast: p.ast || 0,
      tov: p.tov || 0,
      stl: p.stl || 0,
      blk: p.blk || 0,
      pf: p.pf || 0,
      pfd: p.pfd || 0,
      pir: p.pir || 0,
      eff: p.eff || 0,
      plus_minus: p["__1"] || p["+/-"] || 0, // algunos excels lo nombran así
    }));

    // Guardamos JSON del partido
    const outFile = path.join(outputStatsDir, `${matchId}.json`);
    fs.writeFileSync(outFile, JSON.stringify(clean, null, 2));

    // Añadimos jugadores al listado global
    for (const p of clean) {
      if (!p.name) continue;
      const key = p.name.toLowerCase();
      if (!playersMap.has(key)) {
        playersMap.set(key, { number: p.number, name: p.name });
      }
    }
  }

  fs.writeFileSync(outputMatches, JSON.stringify(matches, null, 2));
  fs.writeFileSync(
    outputPlayers,
    JSON.stringify(Array.from(playersMap.values()), null, 2)
  );

  console.log(`✅ OK: ${files.length} archivo(s) procesados.`);
  console.log("- " + outputMatches);
  console.log("- " + outputPlayers);
  console.log("- " + outputStatsDir + "/*.json");
}

main().catch((err) => console.error("❌ Error:", err));
