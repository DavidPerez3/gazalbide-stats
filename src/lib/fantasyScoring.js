// src/lib/fantasyScoring.js

// Legacy fallback kept so historical pages/results remain reproducible even if a
// trait-config fetch ever fails. Current seasons should pass traitConfig loaded
// from Supabase.
function normalizeName(name) {
  return name
    ?.toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeNumberKey(value) {
  const n = Number(value);
  return Number.isNaN(n) ? String(value ?? "") : String(n);
}

const LEGACY_PLAYER_TRAITS = {
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

const LEGACY_COACH_TRAITS = {
  david: ["S", "A"],
  gorka: ["V", "C"],
  unai: ["J", "L"],
};

const LEGACY_TRAITS = {
  A: {
    code: "A",
    label: "Alcohólico",
    activation_type: "coach_match",
    multiplier: 1.5,
    required_count: 1,
  },
  L: {
    code: "L",
    label: "Ludópata",
    activation_type: "coach_match",
    multiplier: 1.5,
    required_count: 1,
  },
  S: {
    code: "S",
    label: "Sexólogo",
    activation_type: "coach_match",
    multiplier: 1.5,
    required_count: 1,
  },
  V: {
    code: "V",
    label: "Vieja guardia",
    activation_type: "coach_match",
    multiplier: 1.5,
    required_count: 1,
  },
  J: {
    code: "J",
    label: "Joven promesa",
    activation_type: "coach_match",
    multiplier: 1.5,
    required_count: 1,
  },
  C: {
    code: "C",
    label: "Boost Covela",
    activation_type: "coach_match",
    multiplier: 2,
    required_count: 1,
  },
  P: {
    code: "P",
    label: "Primos",
    activation_type: "lineup_count",
    multiplier: 1.5,
    required_count: 2,
  },
};

function getPlayerTraits(num, row, traitConfig) {
  if (traitConfig?.playerTraitsByNumber) {
    return traitConfig.playerTraitsByNumber[normalizeNumberKey(num)] || [];
  }
  return LEGACY_PLAYER_TRAITS[normalizeName(row?.name)] || [];
}

function getCoachTraits(coachCode, traitConfig) {
  if (traitConfig?.coachTraitsByCode) {
    return traitConfig.coachTraitsByCode[coachCode] || [];
  }
  return LEGACY_COACH_TRAITS[coachCode] || [];
}

function getTraitDefinition(code, traitConfig) {
  const configured = traitConfig?.traits?.[code];
  if (configured) {
    return {
      code,
      label: configured.label || code,
      activation_type: configured.activation_type || "coach_match",
      multiplier: Number(configured.multiplier ?? 1),
      required_count: Number(configured.required_count ?? 1),
    };
  }
  return (
    LEGACY_TRAITS[code] || {
      code,
      label: code,
      activation_type: "coach_match",
      multiplier: 1,
      required_count: 1,
    }
  );
}

function buildSynergyContext(playersNums, statsMap, coachCode, traitConfig) {
  const coachTraitSet = new Set(getCoachTraits(coachCode, traitConfig));
  const traitCounts = new Map();

  for (const num of playersNums) {
    const row = statsMap.get(num);
    if (!row) continue;
    const traits = getPlayerTraits(num, row, traitConfig);
    for (const trait of traits) {
      traitCounts.set(trait, (traitCounts.get(trait) || 0) + 1);
    }
  }

  return {
    coachTraitSet,
    traitCounts,
    statsMap,
    traitConfig,
  };
}

function computePlayerSynergies(num, ctx) {
  const row = ctx.statsMap.get(num);
  if (!row) return { factor: 1, synergies: [] };

  const traits = getPlayerTraits(num, row, ctx.traitConfig);
  let factor = 1;
  const synergies = [];

  for (const code of traits) {
    const definition = getTraitDefinition(code, ctx.traitConfig);
    let active = false;

    if (definition.activation_type === "lineup_count") {
      active = (ctx.traitCounts.get(code) || 0) >= definition.required_count;
    } else {
      active = ctx.coachTraitSet.has(code);
    }

    if (!active) continue;

    factor *= definition.multiplier;
    synergies.push(`x${definition.multiplier.toFixed(1)} ${definition.label}`);
  }

  return { factor, synergies };
}

export function isStructurallyValidLineup({
  playersNums,
  captainNumber = null,
  coachCode = null,
}) {
  if (!Array.isArray(playersNums) || playersNums.length !== 5) return false;

  const normalizedPlayers = playersNums.map((value) => Number(value));
  if (normalizedPlayers.some((value) => Number.isNaN(value) || value < 0)) {
    return false;
  }

  if (new Set(normalizedPlayers).size !== 5) return false;
  if (captainNumber == null || Number.isNaN(Number(captainNumber))) return false;
  if (!normalizedPlayers.includes(Number(captainNumber))) return false;
  if (!coachCode || !String(coachCode).trim()) return false;

  return true;
}

export function computeLineupBreakdown({
  playersNums,
  statsMap,
  captainNumber = null,
  coachCode = null,
  traitConfig = null,
}) {
  if (
    !isStructurallyValidLineup({
      playersNums,
      captainNumber,
      coachCode,
    })
  ) {
    return { totalPoints: 0, baseTotal: 0, bonusTotal: 0, players: [] };
  }

  const ctx = buildSynergyContext(playersNums, statsMap, coachCode, traitConfig);
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

    const finalScore = pirBase * captainMult * synergyFactor;
    const synergiesText = [...synergyList];
    if (isCaptain) synergiesText.unshift("x2 CAP");

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

  return {
    totalPoints,
    baseTotal,
    bonusTotal: totalPoints - baseTotal,
    players,
  };
}

export function computeLineupPoints({
  playersNums,
  statsMap,
  captainNumber = null,
  coachCode = null,
  traitConfig = null,
}) {
  return computeLineupBreakdown({
    playersNums,
    statsMap,
    captainNumber,
    coachCode,
    traitConfig,
  }).totalPoints;
}
