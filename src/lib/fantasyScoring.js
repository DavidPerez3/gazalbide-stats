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
const PLAYER_TRAITS = {
  iker: ["J", "S"],
  josu: ["S", "L"],
  imanol: ["S", "L"],
  kusky: ["S", "A"],
  ibon: ["A", "V"],
  lucho: ["A", "J"],
  aimar: ["S", "A"],
  aingeru: ["V", "P"],
  julen: ["V", "P"],
  aguirre: ["V", "A"],
  covela: ["C", "A"],
  inaki: ["V", "L"],
  jorge: ["A", "V"],
  oier: ["J", "A"],
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
// C:      boost especial para Covela cuando Gorka está.
// P:      PRIMOS (Julen + Aingeru en pista a la vez).
//
const TRAIT_MULTIPLIERS = {
  DEFAULT: 1.5,
  C: 2,
  P: 1.5,
};

// Para textos de breakdown (por si quieres mostrarlos bonitos)
const TRAIT_LABELS = {
  A: "Alcohólico",
  L: "Ludópata",
  S: "Sexólogo",
  V: "Vieja guardia",
  J: "Joven promesa",
  C: "Boost Covela",
  P: "Primos",
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
// Aplicar sinergias a un jugador y devolver DETALLE
// ---------------------------------------------------------
function computePlayerSynergies(num, ctx) {
  const row = ctx.statsMap.get(num);
  if (!row) {
    return {
      factor: 1,
      synergies: [],
    };
  }

  const traits = PLAYER_TRAITS[normalizeName(row.name)] || [];
  let factor = 1;
  const synergies = [];

  for (const t of traits) {
    if (t === "P") {
      // PRIMOS: sólo si hay al menos 2 P en pista (Julen + Aingeru)
      if (ctx.hasPrimosActive) {
        factor *= TRAIT_MULTIPLIERS.P;
        synergies.push(
          `x${TRAIT_MULTIPLIERS.P.toFixed(1)} ${TRAIT_LABELS.P || "PRIMOS"}`
        );
      }
    } else if (t === "C") {
      // C: boost sólo para Covela cuando el entrenador tiene C (Gorka)
      if (ctx.coachTraitSet.has("C")) {
        factor *= TRAIT_MULTIPLIERS.C;
        synergies.push(
          `x${TRAIT_MULTIPLIERS.C.toFixed(1)} ${
            TRAIT_LABELS.C || "C"
          }`
        );
      }
    } else {
      // A, L, S, V, J: sólo si el entrenador tiene esa letra
      if (ctx.coachTraitSet.has(t)) {
        factor *= TRAIT_MULTIPLIERS.DEFAULT;
        synergies.push(
          `x${TRAIT_MULTIPLIERS.DEFAULT.toFixed(1)} ${
            TRAIT_LABELS[t] || t
          }`
        );
      }
    }
  }

  return { factor, synergies };
}

// ---------------------------------------------------------
// Cálculo con BREAKDOWN completo del quinteto
// ---------------------------------------------------------
//
// Devuelve:
// {
//   totalPoints,
//   baseTotal,
//   bonusTotal,
//   players: [
//     {
//       number,
//       name,
//       pirBase,
//       isCaptain,
//       captainMult,
//       synergyFactor,
//       synergies: [ 'x2.0 CAP', 'x1.1 Vieja guardia', ... ],
//       finalScore,
//     },
//     ...
//   ]
// }
//
export function computeLineupBreakdown({
  playersNums,
  statsMap,
  captainNumber = null,
  coachCode = null,
}) {
  if (!Array.isArray(playersNums) || playersNums.length === 0) {
    return {
      totalPoints: 0,
      baseTotal: 0,
      bonusTotal: 0,
      players: [],
    };
  }

  const ctx = buildSynergyContext(playersNums, statsMap, coachCode);

  let baseTotal = 0;
  let totalPoints = 0;

  const players = [];

  for (const num of playersNums) {
    const row = statsMap.get(num) || {};
    const name = row.name || `#${num}`;
    const pirBase =
      typeof row.pir === "number" && !Number.isNaN(row.pir) ? row.pir : 0;

    const isCaptain =
      captainNumber != null && Number(captainNumber) === Number(num);
    const captainMult = isCaptain ? 2 : 1;

    const { factor: synergyFactor, synergies: synergyList } =
      computePlayerSynergies(num, ctx);

    let finalScore = pirBase * captainMult * synergyFactor;

    const synergiesText = [...synergyList];
    if (isCaptain) {
      synergiesText.unshift("x2 CAP");
    }

    baseTotal += pirBase;
    totalPoints += finalScore;

    players.push({
      number: num,
      name,
      pirBase,
      isCaptain,
      captainMult,
      synergyFactor,
      synergies: synergiesText,
      finalScore,
    });
  }

  const bonusTotal = totalPoints - baseTotal;

  return {
    totalPoints,
    baseTotal,
    bonusTotal,
    players,
  };
}

// ---------------------------------------------------------
// Cálculo rápido de puntos totales (para ranking)
// ---------------------------------------------------------
//
// Wrapper que usa el breakdown pero sólo devuelve el total.
// Mantiene la misma firma que antes.
// ---------------------------------------------------------
export function computeLineupPoints({
  playersNums,
  statsMap,
  captainNumber = null,
  coachCode = null,
}) {
  const { totalPoints } = computeLineupBreakdown({
    playersNums,
    statsMap,
    captainNumber,
    coachCode,
  });
  return totalPoints;
}
