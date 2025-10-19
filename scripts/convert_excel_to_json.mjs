import fs from "fs";
import path from "path";
import xlsx from "xlsx";

/* ========= RUTAS Y PREPARACIÓN ========= */
const inputDir = process.argv[2] || "./excels";
const outputMatches = "./public/data/matches.json";
const outputPlayers = "./public/data/players.json";
const outputStatsDir = "./public/data/player_stats";

if (!fs.existsSync(outputStatsDir)) fs.mkdirSync(outputStatsDir, { recursive: true });

/* ========= HELPERS GENERALES ========= */
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

/** Lee una hoja “estilo jugadores” y normaliza cabeceras */
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

/** Convierte celdas a número solo si son numéricas puras (ignora “17:01”, texto, etc.) */
function cellToNumberStrict(v) {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const raw = String(v).trim();
  if (/^\d{1,2}:\d{2}$/.test(raw)) return null; // hora tipo 17:01
  const cleaned = raw.replace(",", ".").replace(/[^0-9.\-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === "." || cleaned === "-.") return null;
  if (!/^\-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/* ========= PARSEO DEL NOMBRE DEL ARCHIVO =========
   Soporta:
   - stats_gazal_a_vs_oponente_hh_mm_dd-mm-yy.xls
   - stats_oponente_vs_gazal_a_dd-mm-yy.xls
*/
function parseFilenameMeta(filename) {
  const base = path.basename(filename, path.extname(filename)); // sin .xls/.xlsx
  const ascii = toAscii(base);

  // 1) fecha dd-mm-yy en cualquier parte
  const mDate = ascii.match(/(\d{2})-(\d{2})-(\d{2})/);
  const dateISO = mDate ? `20${mDate[3]}-${mDate[2]}-${mDate[1]}` : null;

  // 2) separar por “vs”
  const split = base.split(/[_-]vs[_-]?/i);
  let left = null, right = null;
  if (split.length >= 2) {
    left = split[0].replace(/^stats[_-]?/i, "").trim();
    right = split[1].trim();
  }

  // 3) limpiar sufijos de hora/fecha del lado derecho
  const cleanTeamSlug = (s) => {
    if (!s) return "";
    return s
      .replace(/_\d{1,2}_\d{2}_\d{2}-\d{2}-\d{2}$/i, "") // _hh_mm_dd-mm-yy
      .replace(/_\d{2}-\d{2}-\d{2}$/i, "")               // _dd-mm-yy
      .replace(/[-_]+/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
  };

  left = cleanTeamSlug(left);
  right = cleanTeamSlug(right);

  // 4) decide nuestro equipo vs rival (nuestro contiene “gazal”)
  const isGazal = (s) => /gazal/.test(toAscii(s));
  let opp = null;

  if (isGazal(left) && !isGazal(right)) {
    opp = right;
  } else if (!isGazal(left) && isGazal(right)) {
    opp = left;
  } else if (isGazal(left) && isGazal(right)) {
    opp = right; // raro, pero nos quedamos con el de la derecha como rival
  } else {
    // ninguno contiene “gazal”: por defecto el rival es el lado derecho
    opp = right || left || "Desconocido";
  }

  const opponent = opp ? titleCase(opp) : "Desconocido";

  // 5) id del partido
  const slugOpp = opponent.toLowerCase().replace(/\s+/g, "-");
  const matchId = dateISO
    ? `${dateISO}-vs-${slugOpp || "desconocido"}`
    : base.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

  return { dateISO, opponent, matchId };
}

/* ========= LECTURA “TEAM STATS” (PF/PA + parciales) =========
   - Localiza la fila de cabecera con Q1..Q4..Total
   - Selecciona las PRIMERAS dos filas con 5 números válidos (Q1-4 + Total)
   - De esas dos, si una contiene “gazal” → esa es nuestra; la otra, rival
   - Ignora celdas con formato hora y números fuera de rango razonable
*/
function readTeamStats(file) {
  const wb = xlsx.readFile(file);
  let sheetName =
    wb.SheetNames.find((n) => toAscii(n).trim() === "team stats") ||
    wb.SheetNames.find((n) => toAscii(n).replace(/\s+/g, "").includes("teamstats"));
  if (!sheetName) return null;

  const ws = wb.Sheets[sheetName];
  const table = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });

  const validQuarter = (n) => typeof n === "number" && n >= 0 && n <= 60;
  const validTotal = (n) => typeof n === "number" && n >= 0 && n <= 200;

  // 1) localizar cabecera con Q1..Q4..Total
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

  // 2) recolectar candidatos (primeras dos filas numéricas válidas)
  const candidates = [];
  for (let i = headerRowIdx + 1; i < table.length; i++) {
    const row = table[i] || [];
    const nameRaw = String(row[0] ?? "");
    const name = toAscii(nameRaw).trim();

    const q1 = cellToNumberStrict(row[idxQ1]);
    const q2 = cellToNumberStrict(row[idxQ2]);
    const q3 = cellToNumberStrict(row[idxQ3]);
    const q4 = cellToNumberStrict(row[idxQ4]);
    const tot = cellToNumberStrict(row[idxTot]);

    const ok = [q1, q2, q3, q4].every(validQuarter) && validTotal(tot);
    if (!ok) continue;

    candidates.push({ name, q: [q1, q2, q3, q4], tot });
    if (candidates.length >= 2) break; // nos bastan dos filas (nuestro + rival)
  }

  if (candidates.length === 0) return null;

  // 3) decidir quién es quién
  const gazalIdx = candidates.findIndex((c) => c.name.includes("gazal"));
  let our = null, opp = null;
  if (gazalIdx !== -1) {
    our = candidates[gazalIdx];
    opp = candidates.find((c, i) => i !== gazalIdx) || null;
  } else {
    // si ninguna contiene “gazal”: tomamos la 1ª como nuestra y la 2ª como rival
    our = candidates[0];
    opp = candidates[1] || null;
  }

  const pf = our?.tot ?? null;
  const q_pf = our?.q ?? [null, null, null, null];
  const pa = opp?.tot ?? null;
  const q_pa = opp?.q ?? [null, null, null, null];

  return { pf, pa, q_pf, q_pa };
}

/* ========= PROCESO PRINCIPAL ========= */
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

    // 1) Hoja de jugadores (suele ser “Gazal A Stats”; dejamos fallback flexible)
    let gazalSheetName = "Gazal A Stats";
    let gazalRows = readSheetAsObjects(fullPath, gazalSheetName);
    if (!gazalRows.length) {
      // fallback: busca una hoja que contenga “gazal” y “stats”
      const wb = xlsx.readFile(fullPath);
      const guess = wb.SheetNames.find((n) => {
        const s = toAscii(n);
        return s.includes("gazal") && s.includes("stats");
      });
      if (guess) {
        gazalSheetName = guess;
        gazalRows = readSheetAsObjects(fullPath, gazalSheetName);
      }
    }
    if (!gazalRows.length) continue;

    // 2) Meta desde el nombre de archivo (fecha + rival + id)
    const { dateISO, opponent, matchId } = parseFilenameMeta(file);

    // 3) PF fallback (sumando PTS por jugador)
    const pfFallback = gazalRows.reduce((acc, r) => acc + (Number(r.pts) || 0), 0);

    // 4) Leer Team Stats: PF/PA + Q1..Q4 (si existen)
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

    // 5) Guardar metadata del partido
    matches.push({
      id: matchId,
      date: dateISO || "Desconocida",
      opponent,
      file: path.basename(file),
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

    // 6) Guardar JSON del partido (stats por jugador)
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

    // 7) Acumular listado global de jugadores (clave por nombre)
    for (const p of playersClean) {
      if (!p.name) continue;
      const key = p.name.toLowerCase();
      if (!playersMap.has(key)) {
        playersMap.set(key, { number: p.number, name: p.name });
      }
    }
  }

  // matches.json
  fs.writeFileSync(outputMatches, JSON.stringify(matches, null, 2));

  // players.json (ordenado por dorsal si existe)
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

/* ========= RUN ========= */
main().catch((err) => console.error("❌ Error:", err));
