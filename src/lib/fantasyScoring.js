// src/lib/fantasyScoring.js

// ---------------------------------------------------------
// Normalización de nombres (para mapear a rasgos/atributos)
// ---------------------------------------------------------
function normalizeName(name) {
  return name
    ?.toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quitar tildes
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// ---------------------------------------------------------
// Rasgos de jugadores (A, L, S, V, J, C, P)
// ---------------------------------------------------------
//
// OJO: estas claves deben parecerse a los nombres que salen
// en los JSON de stats. Si en tus JSON sale "Iker J." o
// "Iker Garcia", igual te interesa ajustar las claves.
//
// De momento lo dejamos a nivel "nombre base", puedes ir
// afinando según veas en consola.
//
const PLAYER_TRAITS = {
  "iker": ["J", "S"],
  "josu": ["S", "L"],
  "imanol": ["S", "L"],
  "kusky": ["S", "A"],
  "ibon": ["A", "V"],
  "lucho": ["A", "J"],
  "aimar": ["S", "A"],
  "aingeru": ["V", "P"],
  "julen": ["V", "P"],
  "dirito power": ["V", "A"],
  "cobela": ["C", "A"],
  "inaki": ["V", "L"],
  "iñaki": ["V", "L"], // por si acaso
  "jorge": ["A", "V"],
  "oier": ["J", "A"],
};

// ---------------------------------------------------------
// Rasgos de entrenadores
// ---------------------------------------------------------
//
// David: S A
// Gorka: V C
// Unai:  J L
//
const COACH_TRAITS = {
  david: ["S", "A"],
  gorka: ["V", "C"],
  unai: ["J", "L"],
};

// ---------------------------------------------------------
// Multiplicadores de sinergias
// ---------------------------------------------------------
//
// DEFAULT: A, L, S, V, J cuando las activa el entrenador.
// C:      boost especial para Cobela cuando Gorka está.
// P:      PRIMOS (Julen + Aingeru en pista a la vez).
//
const TRAIT_MULTIPLIERS = {
  DEFAULT: 1.1,
  C: 1.5,
  P: 1.2,
};

// ---------------------------------------------------------
// Construir contexto de sinergias para un quinteto
// ---------------------------------------------------------
//
// playersNums: array de dorsales del quinteto
// statsMap: Map<number, rowStats> (rowStats con .pir, .name, etc.)
// coachCode: "david" | "gorka" | "unai" | null
//
function buildSynergyContext(playersNums, statsMap, coachCode) {
  const coachTraits = COACH_TRAITS[coachCode] || [];
  const coachTraitSet = new Set(coachTraits);

  // ¿Hay "primos" activos? (P en ambos jugadores: Aingeru + Julen)
  let primosCount = 0;

  for (const num of playersNums) {
    const row = statsMap.get(num);
    if (!row) continue;
    const traits = PLAYER_TRAITS[normalizeName(row.name)] || [];
    if (traits.includes("P")) primosCount += 1;
  }

  const hasPrimosActive = primosCount >= 2;

  return {
    coachTraitSet,
    hasPrimosActive,
    statsMap,
  };
}

// ---------------------------------------------------------
// Aplicar sinergias a un jugador concreto
// ---------------------------------------------------------
function applySynergiesToPlayer(num, baseScore, ctx) {
  const row = ctx.statsMap.get(num);
  if (!row) return baseScore;

  const traits = PLAYER_TRAITS[normalizeName(row.name)] || [];
  let factor = 1;

  for (const t of traits) {
    if (t === "P") {
      // PRIMOS: sólo si hay al menos 2 P en pista (Julen + Aingeru)
      if (ctx.hasPrimosActive) {
        factor *= TRAIT_MULTIPLIERS.P;
      }
    } else if (t === "C") {
      // C: boost sólo para Cobela cuando el entrenador tiene C (Gorka)
      if (ctx.coachTraitSet.has("C")) {
        factor *= TRAIT_MULTIPLIERS.C;
      }
    } else {
      // A, L, S, V, J: sólo si el entrenador tiene esa letra
      if (ctx.coachTraitSet.has(t)) {
        factor *= TRAIT_MULTIPLIERS.DEFAULT;
      }
    }
  }

  return baseScore * factor;
}

// ---------------------------------------------------------
// Cálculo final de puntos de un quinteto en una jornada
// ---------------------------------------------------------
//
// playersNums: array de dorsales del quinteto
// statsMap: Map<number, rowStats> (rowStats.pir y rowStats.name)
// captainNumber: dorsal del capitán (puede ser null)
// coachCode: "david" | "gorka" | "unai" | null
//
export function computeLineupPoints({
  playersNums,
  statsMap,
  captainNumber = null,
  coachCode = null,
}) {
  if (!Array.isArray(playersNums) || playersNums.length === 0) return 0;

  const ctx = buildSynergyContext(playersNums, statsMap, coachCode);

  let total = 0;

  for (const num of playersNums) {
    const row = statsMap.get(num);
    const pir = typeof row?.pir === "number" ? row.pir : 0;

    // Capitán: doble puntuación base
    let score = pir;
    if (captainNumber != null && Number(captainNumber) === Number(num)) {
      score *= 2;
    }

    // Aplicar sinergias (entrenador + primos + rasgos)
    score = applySynergiesToPlayer(num, score, ctx);

    total += score;
  }

  return total;
}
