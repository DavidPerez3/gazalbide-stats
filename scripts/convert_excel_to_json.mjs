import fs from "fs";
import path from "path";
import xlsx from "xlsx";

const inputDir = process.argv[2] || "./excels";
const outputMatches = "./public/data/matches.json";
const outputPlayers = "./public/data/players.json";
const outputStatsDir = "./public/data/player_stats";

if (!fs.existsSync(outputStatsDir)) fs.mkdirSync(outputStatsDir, { recursive: true });

/* ====================== Utils ======================= */
const toAscii = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const titleCase = (s) =>
  String(s || "")
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ");

function normalizeHeader(header) {
  return String(header || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function guessDateFromFilename(filename) {
  const match = filename.match(/(\d{2})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [_, dd, mm, yy] = match;
  return `20${yy}-${mm}-${dd}`;
}

function readSheetAsObjects(file, sheetName) {
  const wb = xlsx.readFile(file);
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  const rows = xlsx.utils.sheet_to_json(ws, { defval: null });
  return rows.map((row) => {
    const out = {};
    for (const k in row) out[normalizeHeader(k)] = row[k];
    return out;
  });
}

/* ====== Parse estricto de Team Stats: PF/PA + parciales ====== */
// Convierte celdas a número SOLO si son numéricas puras (o "25,0").
// Ignora horas "17:01", textos, símbolos, etc.
function cellToNumberStrict(v) {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const raw = String(v).trim();
  if (/^\d{1,2}:\d{2}$/.test(raw)) return null; // hora tipo 17:01 -> ignorar
  const cleaned = raw.replace(",", ".").replace(/[^0-9.\-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === "." || cleaned === "-.") return null;
  if (!/^\-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Lee "Team Stats" (nombre exacto o aproximación) y devuelve:
 * { pf, pa, q_pf:[q1..q4], q_pa:[q1..q4] }
 * - Detecta fila de cabecera con Q1..Q4..Total
 * - Toma SOLO las primeras filas válidas que empiecen por "gazal" y "visit"
 * - Rechaza celdas con textos/horas (p. ej., "visitante (17:01)")
 */
// Sustituye COMPLETA esta función por esta versión
function readTeamStats(file) {
  const wb = xlsx.readFile(file);

  // Localiza "Team Stats" (exacto o aproximado)
  let sheetName =
    wb.SheetNames.find((n) => toAscii(n).trim() === "team stats") ||
    wb.SheetNames.find((n) => toAscii(n).replace(/\s+/g, "").includes("teamstats"));
  if (!sheetName) return null;

  const ws = wb.Sheets[sheetName];
  const table = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });

  // Helpers estrictos
  const isTime = (v) => typeof v === "string" && /^\s*\d{1,2}:\d{2}\s*$/.test(v);
  const toNum = (v) => {
    if (v == null) return null;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    const s = String(v).trim().replace(",", ".");
    if (isTime(s)) return null;             // 17:01 -> fuera
    if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
    return Number(s);
  };
  const validQuarter = (n) => typeof n === "number" && n >= 0 && n <= 60;   // rango razonable
  const validTotal   = (n) => typeof n === "number" && n >= 0 && n <= 200;

  // 1) Detectar fila de cabecera con Q1..Q4..Total
  let headerRowIdx = -1, idxQ1=-1, idxQ2=-1, idxQ3=-1, idxQ4=-1, idxTot=-1;
  for (let i = 0; i < Math.min(table.length, 15); i++) {
    const labels = (table[i] || []).map((c) => toAscii(String(c || "")).replace(/\s+/g, ""));
    const iQ1 = labels.indexOf("q1"), iQ2 = labels.indexOf("q2"),
          iQ3 = labels.indexOf("q3"), iQ4 = labels.indexOf("q4"),
          iTot = labels.indexOf("total");
    if (iQ1 !== -1 && iQ2 !== -1 && iQ3 !== -1 && iQ4 !== -1 && iTot !== -1) {
      headerRowIdx = i;
      idxQ1=iQ1; idxQ2=iQ2; idxQ3=iQ3; idxQ4=iQ4; idxTot=iTot;
      break;
    }
  }
  if (headerRowIdx === -1) return null;

  // 2) Recoger CANDIDATOS: filas con 5 números válidos tras la cabecera
  const candidates = [];
  for (let i = headerRowIdx + 1; i < table.length; i++) {
    const row = table[i] || [];
    const nameRaw = String(row[0] ?? "");
    const name = toAscii(nameRaw).trim();

    const q1 = toNum(row[idxQ1]);
    const q2 = toNum(row[idxQ2]);
    const q3 = toNum(row[idxQ3]);
    const q4 = toNum(row[idxQ4]);
    const tot = toNum(row[idxTot]);

    const ok = [q1,q2,q3,q4].every(validQuarter) && validTotal(tot);
    if (!ok) continue;

    candidates.push({ name, q: [q1,q2,q3,q4], tot });
    if (candidates.length >= 4) break; // nos bastan los primeros pares
  }

  if (candidates.length === 0) return null;

  // 3) Elegir nuestro equipo y el rival:
  //    - si hay uno que contiene "gazal" -> es nuestro
  //    - el otro (primero distinto) -> rival
  let our = candidates.find(c => c.name.includes("gazal")) || candidates[0];
  let opp = candidates.find(c => c !== our) || null;

  const pf = our?.tot ?? null;
  const q_pf = our?.q ?? [null,null,null,null];
  const pa = opp?.tot ?? null;
  const q_pa = opp?.q ?? [null,null,null,null];

  return { pf, pa, q_pf, q_pa };
}



/* ===================== Main ===================== */
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

    // 1) Datos por jugador (Gazal A Stats)
    const gazalSheetName = "Gazal A Stats";
    const gazalRows = readSheetAsObjects(fullPath, gazalSheetName);
    if (!gazalRows.length) continue;

    // 2) Meta desde el nombre del fichero
    const base = path.basename(file, path.extname(file));
    const dateISO = guessDateFromFilename(file);

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
      : base.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

    // 3) PF fallback sumando PTS de jugadores
    const pfFallback = gazalRows.reduce((acc, r) => acc + (Number(r.pts) || 0), 0);

    // 4) Team Stats (sobrescribe solo si tiene valores válidos)
    let pf = pfFallback;
    let pa = undefined;
    let q_pf = [null, null, null, null];
    let q_pa = [null, null, null, null];

    const ts = readTeamStats(fullPath);
    if (ts) {
      if (typeof ts.pf === "number" && ts.pf > 0) pf = ts.pf;
      if (typeof ts.pa === "number" && ts.pa > 0) pa = ts.pa;
      if (Array.isArray(ts.q_pf) && ts.q_pf.some((n) => Number(n) > 0)) q_pf = ts.q_pf;
      if (Array.isArray(ts.q_pa) && ts.q_pa.some((n) => Number(n) > 0)) q_pa = ts.q_pa;
    }

    matches.push({
      id: matchId,
      date: dateISO || "Desconocida",
      opponent,
      file,
      sheet: gazalSheetName,
      gazal_pts: pf,
      opp_pts: typeof pa === "number" ? pa : undefined,
      q_pf: Array.isArray(q_pf) ? q_pf : undefined,
      q_pa: Array.isArray(q_pa) ? q_pa : undefined,
      result:
        typeof pa === "number"
          ? pf > pa
            ? "W"
            : pf < pa
            ? "L"
            : "D"
          : undefined,
    });

    // 5) Stats por jugador → JSON por partido
    const playersClean = gazalRows.map((p) => ({
      number: p.n || p.no || p.num || p.dorsal || null,
      name: p.jugador || p.player || "",
      min: p.min || 0,
      min_str: p.min_str || null,
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
      plus_minus: p["+/-"] ?? p.plus_minus ?? p.__1 ?? 0,
    }));

    fs.writeFileSync(
      path.join(outputStatsDir, `${matchId}.json`),
      JSON.stringify(playersClean, null, 2)
    );

    // 6) Listado global de jugadores (orden por dorsal)
    for (const p of playersClean) {
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
    JSON.stringify(
      Array.from(playersMap.values()).sort(
        (a, b) => (a.number ?? 0) - (b.number ?? 0)
      ),
      null,
      2
    )
  );

  console.log(`✅ OK: ${files.length} archivo(s) procesados.`);
  console.log("- " + outputMatches);
  console.log("- " + outputPlayers);
  console.log("- " + outputStatsDir + "/*.json");
}

main().catch((err) => console.error("❌ Error:", err));
