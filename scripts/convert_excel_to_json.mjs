import fs from "fs";
import path from "path";
import xlsx from "xlsx";

/* ========= RUTAS Y PREPARACIÓN ========= */

// Carpeta con los Excel
const inputDir = process.argv[2] || "./excels";

// Salidas EXACTAMENTE como las tenías
const outputMatches = "./public/data/matches.json";
const outputPlayers = "./public/data/players.json";
const outputStatsDir = "./public/data/player_stats";
const outputFantasyPlayers = "./public/data/fantasy_players.json";

if (!fs.existsSync("./public/data")) {
  fs.mkdirSync("./public/data", { recursive: true });
}
if (!fs.existsSync(outputStatsDir)) {
  fs.mkdirSync(outputStatsDir, { recursive: true });
}

/* ========= HELPERS GENERALES ========= */

const toAscii = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const titleCase = (s) =>
  String(s || "")
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

const normalizeHeader = (h) => {
  const raw = String(h || "").trim();
  const lower = raw.toLowerCase();

  // 👇 Caso especial: la columna "+/-" del Excel
  if (lower.includes("+/-")) {
    return "plus_minus";
  }

  return lower.replace(/\s+/g, "_").replace(/[^\w_]/g, "");
};

/**
 * Convierte minutos del Excel a:
 *  - min: segundos totales (como en tus JSON)
 *  - min_str: "MM:SS"
 */
function parseMinutes(v) {
  if (v == null || v === "") {
    return { min: 0, min_str: "00:00" };
  }

  if (typeof v === "number" && Number.isFinite(v)) {
    // Si es muy grande, asumimos que ya son segundos
    const secs = v > 360 ? Math.round(v) : Math.round(v * 60);
    const mm = Math.floor(secs / 60);
    const ss = secs % 60;
    return {
      min: secs,
      min_str: `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`,
    };
  }

  const raw = String(v).trim();

  // Formato "MM:SS" o "HH:MM"
  const m = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const mm = Number(m[1]);
    const ss = Number(m[2]);
    const secs = mm * 60 + ss;
    return {
      min: secs,
      min_str: `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`,
    };
  }

  // Número parseable
  const num = Number(raw.replace(",", "."));
  if (Number.isFinite(num)) {
    const secs = num > 360 ? Math.round(num) : Math.round(num * 60);
    const mm = Math.floor(secs / 60);
    const ss = secs % 60;
    return {
      min: secs,
      min_str: `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`,
    };
  }

  return { min: 0, min_str: "00:00" };
}

/* ========= PARSEO DEL NOMBRE DEL ARCHIVO =========
   Soporta:
   - stats_gazal_a_vs_oponente_hh_mm_dd-mm-yy.xls
   - stats_oponente_vs_gazal_a_dd-mm-yy.xls
*/
function parseFilenameMeta(filename) {
  const base = path.basename(filename, path.extname(filename)); // sin .xls/.xlsx
  const asciiBase = toAscii(base);

  // 1) fecha dd-mm-yy en cualquier parte
  const mDate = asciiBase.match(/(\d{2})-(\d{2})-(\d{2})/);
  const dateISO = mDate ? `20${mDate[3]}-${mDate[2]}-${mDate[1]}` : null;

  // 2) separar por “vs”
  const split = base.split(/[_-]vs[_-]?/i);
  let left = null;
  let right = null;
  if (split.length >= 2) {
    left = split[0].replace(/^stats[_-]?/i, "").trim();
    right = split[1].trim();
  }

  // 3) limpiar sufijos de hora/fecha del lado derecho
  const cleanTeamSlug = (s) => {
    if (!s) return "";
    return s
      .replace(/_\d{1,2}_\d{2}_\d{2}-\d{2}-\d{2}$/i, "") // _hh_mm_dd-mm-yy
      .replace(/_\d{2}-\d{2}-\d{2}$/i, "") // _dd-mm-yy
      .replace(/^\s+|\s+$/g, "");
  };

  left = cleanTeamSlug(left);
  right = cleanTeamSlug(right);

  // 4) decide nuestro equipo vs rival (nuestro contiene “gazal”)
  const isGazal = (s) => /gazal/.test(toAscii(s || ""));
  let oppSlug = null;

  if (isGazal(left) && !isGazal(right)) {
    oppSlug = right;
  } else if (!isGazal(left) && isGazal(right)) {
    oppSlug = left;
  } else if (isGazal(left) && isGazal(right)) {
    oppSlug = right; // raro, pero nos quedamos con el de la derecha como rival
  } else {
    // ninguno contiene “gazal”: por defecto rival = lado derecho
    oppSlug = right || left || "desconocido";
  }

  const opponent = titleCase(oppSlug || "Desconocido");

  // 5) id del partido
  const slugOpp = opponent.toLowerCase().replace(/\s+/g, "-");
  const matchId = dateISO
    ? `${dateISO}-vs-${slugOpp || "desconocido"}`
    : base
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

  return { dateISO, opponent, matchId };
}

/* ========= UTILIDADES DE LECTURA ========= */

function readSheetAsObjects(filePath, sheetName) {
  const wb = xlsx.readFile(filePath);
  let name = sheetName;
  if (!wb.Sheets[name]) {
    // fallback: buscar por nombre parecido
    const found = wb.SheetNames.find(
      (n) => toAscii(n).replace(/\s+/g, "") === toAscii(sheetName).replace(/\s+/g, "")
    );
    if (found) name = found;
  }
  const ws = wb.Sheets[name];
  if (!ws) return { rows: [], sheetName: null };

  const rawRows = xlsx.utils.sheet_to_json(ws, { defval: null });
  const rows = rawRows.map((row) => {
    const out = {};
    for (const k in row) {
      out[normalizeHeader(k)] = row[k];
    }
    return out;
  });

  return { rows, sheetName: name };
}

/**
 * Lee la hoja "Team Stats" para PF/PA y parciales por cuarto.
 */
function readTeamStats(filePath) {
  const wb = xlsx.readFile(filePath);

  let sheetName =
    wb.SheetNames.find((n) => toAscii(n).trim() === "team stats") ||
    wb.SheetNames.find((n) =>
      toAscii(n).replace(/\s+/g, "").includes("teamstats")
    );

  if (!sheetName) return null;

  const ws = wb.Sheets[sheetName];
  const table = xlsx.utils.sheet_to_json(ws, {
    header: 1,
    defval: null,
    raw: true,
  });

  const validQuarter = (n) => typeof n === "number" && n >= 0 && n <= 60;
  const validTotal = (n) => typeof n === "number" && n >= 0 && n <= 200;

  // 1) localizar cabecera con Q1..Q4..Total
  let headerRowIdx = -1;
  let idxQ1 = -1,
    idxQ2 = -1,
    idxQ3 = -1,
    idxQ4 = -1,
    idxTot = -1;

  for (let i = 0; i < Math.min(table.length, 15); i++) {
    const labels = (table[i] || []).map((c) =>
      toAscii(String(c || "")).replace(/\s+/g, "")
    );
    const iQ1 = labels.indexOf("q1");
    const iQ2 = labels.indexOf("q2");
    const iQ3 = labels.indexOf("q3");
    const iQ4 = labels.indexOf("q4");
    const iTot = labels.indexOf("total");
    if (iQ1 !== -1 && iQ2 !== -1 && iQ3 !== -1 && iQ4 !== -1 && iTot !== -1) {
      headerRowIdx = i;
      idxQ1 = iQ1;
      idxQ2 = iQ2;
      idxQ3 = iQ3;
      idxQ4 = iQ4;
      idxTot = iTot;
      break;
    }
  }

  if (headerRowIdx === -1) return null;

  const cellToNumberStrict = (v) => {
    if (v == null) return null;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    const raw = String(v).trim();
    if (/^\d{1,2}:\d{2}$/.test(raw)) return null;
    const num = Number(raw.replace(",", "."));
    return Number.isFinite(num) ? num : null;
  };

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

    const ok =
      [q1, q2, q3, q4].every(validQuarter) && validTotal(tot);
    if (!ok) continue;

    candidates.push({ name, q: [q1, q2, q3, q4], tot });
    if (candidates.length >= 2) break;
  }

  if (candidates.length === 0) return null;

  // 3) decidir quién es quién
  const gazalIdx = candidates.findIndex((c) => c.name.includes("gazal"));
  let our = null,
    opp = null;
  if (gazalIdx !== -1) {
    our = candidates[gazalIdx];
    opp = candidates.find((c, i) => i !== gazalIdx) || null;
  } else {
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

  // Ordenamos por fecha para que pirs vayan cronológicos
  const fileEntries = files
    .map((file) => ({ file, ...parseFilenameMeta(file) }))
    .sort((a, b) => {
      if (a.dateISO && b.dateISO) return a.dateISO.localeCompare(b.dateISO);
      if (a.dateISO) return -1;
      if (b.dateISO) return 1;
      return a.file.localeCompare(b.file);
    });

  const matches = [];
  const playersMap = new Map(); // name (lower) -> { number, name }
  const fantasyAgg = new Map(); // key -> { number, name, pirSum, gamesPlayed, pirs: [] }

  for (const { file, dateISO, opponent, matchId } of fileEntries) {
    const fullPath = path.join(inputDir, file);

    // 1) Hoja de jugadores (Gazal A)
    const wb = xlsx.readFile(fullPath);
    let gazalSheetName = wb.SheetNames.find(
      (n) => toAscii(n).trim() === "gazal a stats"
    );
    if (!gazalSheetName) {
      gazalSheetName = wb.SheetNames.find((n) => {
        const s = toAscii(n);
        return s.includes("gazal") && s.includes("stats");
      });
    }
    if (!gazalSheetName) {
      gazalSheetName = wb.SheetNames[0];
    }

    const { rows } = readSheetAsObjects(fullPath, gazalSheetName);

    // 2) Parsear filas de jugadores
    const playersClean = rows
      .map((row) => {
        const p = row;

        const numberRaw =
          p.n || p.no || p.num || p.dorsal || p.numero || null;
        const name =
          p.jugador || p.player || p.name || p.nombre || "";

        const minsCell =
          p.minutos || p.min || p.mins || p.min_tot || p.mintot || null;
        const { min, min_str } = parseMinutes(minsCell);

        const pts = Number(p.pts || p.puntos || 0) || 0;

        const two_pm =
          Number(p["2pm"] ?? p._2pm ?? p.d2m ?? 0) || 0;
        const two_pa =
          Number(p["2pa"] ?? p._2pa ?? p.d2a ?? 0) || 0;
        const three_pm =
          Number(p["3pm"] ?? p._3pm ?? p.t3m ?? 0) || 0;
        const three_pa =
          Number(p["3pa"] ?? p._3pa ?? p.t3a ?? 0) || 0;

        const fgm = Number(p.fgm || 0) || 0;
        const fga = Number(p.fga || 0) || 0;
        const ftm = Number(p.ftm || 0) || 0;
        const fta = Number(p.fta || 0) || 0;
        const oreb = Number(p.oreb || 0) || 0;
        const dreb = Number(p.dreb || 0) || 0;
        const reb = Number(p.reb || 0) || 0;
        const ast = Number(p.ast || 0) || 0;
        const tov = Number(p.tov || 0) || 0;
        const stl = Number(p.stl || 0) || 0;
        const blk = Number(p.blk || 0) || 0;
        const pf = Number(p.pf || 0) || 0;
        const pfd = Number(p.pfd || 0) || 0;
        const pir = Number(p.pir || 0) || 0;
        const eff = Number(p.eff || 0) || 0;
        const plus_minus = Number(p.plus_minus || 0) || 0;

        return {
          number: numberRaw != null ? String(numberRaw) : null,
          name,
          min,
          min_str,
          pts,
          two_pm,
          two_pa,
          three_pm,
          three_pa,
          fgm,
          fga,
          ftm,
          fta,
          oreb,
          dreb,
          reb,
          ast,
          tov,
          stl,
          blk,
          pf,
          pfd,
          pir,
          eff,
          plus_minus,
        };
      })
      .filter((p) => p.name && (p.min > 0 || p.pts !== 0 || p.pir !== 0));

    // 3) Guardar per-partido en public/data/player_stats/<id>.json
    const statsOutPath = path.join(outputStatsDir, `${matchId}.json`);
    fs.writeFileSync(statsOutPath, JSON.stringify(playersClean, null, 2));

    // 4) PF/PA y parciales
    let pf = playersClean.reduce((sum, p) => sum + (p.pts || 0), 0);
    let pa = null;
    let q_pf = [];
    let q_pa = [];

    const ts = readTeamStats(fullPath);
    if (ts) {
      if (typeof ts.pf === "number" && ts.pf > 0) pf = ts.pf;
      if (typeof ts.pa === "number" && ts.pa > 0) pa = ts.pa;
      if (Array.isArray(ts.q_pf) && ts.q_pf.some((n) => Number(n) > 0)) {
        q_pf = ts.q_pf;
      }
      if (Array.isArray(ts.q_pa) && ts.q_pa.some((n) => Number(n) > 0)) {
        q_pa = ts.q_pa;
      }
    }

    // 5) matches.json
    matches.push({
      id: matchId,
      date: dateISO,
      opponent,
      file: path.basename(file),
      sheet: gazalSheetName,
      gazal_pts: pf,
      opp_pts: pa,
      q_pf,
      q_pa,
      result:
        typeof pa === "number"
          ? pf > pa
            ? "W"
            : pf < pa
            ? "L"
            : "D"
          : null,
    });

    // 6) players.json (solo número/nombre)
    for (const p of playersClean) {
      const key = p.name.toLowerCase();
      if (!playersMap.has(key)) {
        playersMap.set(key, {
          number: p.number != null ? String(p.number) : "",
          name: p.name,
        });
      }
    }

    // 7) fantasy_agg (para fantasy_players.json)
    for (const p of playersClean) {
      if (!p.name) continue;
      const key =
        p.number != null && p.number !== ""
          ? `num_${String(p.number)}`
          : `name_${p.name.toLowerCase()}`;

      let agg = fantasyAgg.get(key);
      if (!agg) {
        agg = {
          number: p.number != null ? String(p.number) : "",
          name: p.name,
          gamesPlayed: 0,
          pirSum: 0,
          pirs: [],
        };
      }

      const pirVal = Number(p.pir) || 0;
      agg.gamesPlayed += 1;
      agg.pirSum += pirVal;
      agg.pirs.push(pirVal);

      fantasyAgg.set(key, agg);
    }
  }

  // === matches.json ===
  fs.writeFileSync(outputMatches, JSON.stringify(matches, null, 2));

  // === players.json === (igual formato que el tuyo)
  const playersArr = Array.from(playersMap.values()).sort((a, b) => {
    const na = a.number === "" ? 999 : Number(a.number);
    const nb = b.number === "" ? 999 : Number(b.number);
    return na - nb;
  });

  fs.writeFileSync(outputPlayers, JSON.stringify(playersArr, null, 2));

  // === fantasy_players.json ===
  const fantasyPlayers = Array.from(fantasyAgg.values())
    .map((p) => {
      const pirAvg =
        p.gamesPlayed > 0 ? p.pirSum / p.gamesPlayed : 0;
      const pirForPrice = Math.max(pirAvg, 0); // nunca usamos PIR negativo para precio

      // Fórmula de precio (cervezas)
      const BASE = 8;
      const FACTOR = 1.2;
      const MIN_PRICE = 8;

      const rawPrice = BASE + pirForPrice * FACTOR;
      const price = Math.max(MIN_PRICE, Math.round(rawPrice));

      const last3_pir = (p.pirs || []).slice(-3);

      // 👇 AÑADIMOS RUTA DE IMAGEN SIEMPRE EN BASE A DORSAL + NOMBRE
      let image = null;
      if (p.number) {
        const rawNum = String(p.number).trim();
        // dorsal "0" → "00", resto igual pero relleno a 2 cifras por seguridad
        const numForFile =
          rawNum === "0" ? "00" : rawNum.padStart(2, "0");

        const safeName = String(p.name || "")
          .trim()
          .replace(/\s+/g, "_");

        image = `/images/players/${numForFile}_${safeName}.png`;
      }

      return {
        number: p.number,
        name: p.name,
        gamesPlayed: p.gamesPlayed,
        pir_avg: Number(pirAvg.toFixed(2)),
        last3_pir,
        price,
        image,
      };
    })
    .sort((a, b) => {
      const na = a.number === "" ? 999 : Number(a.number);
      const nb = b.number === "" ? 999 : Number(b.number);
      return na - nb;
    });

  fs.writeFileSync(
    outputFantasyPlayers,
    JSON.stringify(fantasyPlayers, null, 2)
  );

  console.log(`✅ OK: ${fileEntries.length} archivo(s) procesados.`);
  console.log("- " + outputMatches);
  console.log("- " + outputPlayers);
  console.log("- " + outputStatsDir + "/*.json");
  console.log("- " + outputFantasyPlayers);
}

/* ========= RUN ========= */

main().catch((err) => console.error("❌ Error:", err));
