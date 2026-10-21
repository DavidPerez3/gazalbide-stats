import { LE_GAZAL_ASSETS } from "./assetPaths";
import { BONUS_MODES, SPECIAL_SYMBOLS } from "./slotTypes";

export const LE_GAZAL_COPY = {
  title: "LE GAZAL",
  subtitle: "Modo demo - Cervezas virtuales ilimitadas",
  disclaimer: "Modo demo - Cervezas virtuales ilimitadas - Sin valor economico real.",
};

export const LE_GAZAL_SYMBOLS = [
  {
    id: "TEN",
    label: "10",
    shortLabel: "10",
    family: "card",
    tone: "neutral",
    assetPath: LE_GAZAL_ASSETS.ten,
  },
  {
    id: "J",
    label: "J",
    shortLabel: "J",
    family: "card",
    tone: "neutral",
    assetPath: LE_GAZAL_ASSETS.j,
  },
  {
    id: "Q",
    label: "Q",
    shortLabel: "Q",
    family: "card",
    tone: "neutral",
    assetPath: LE_GAZAL_ASSETS.q,
  },
  {
    id: "K",
    label: "K",
    shortLabel: "K",
    family: "card",
    tone: "neutral",
    assetPath: LE_GAZAL_ASSETS.k,
  },
  {
    id: "A",
    label: "A",
    shortLabel: "A",
    family: "card",
    tone: "neutral",
    assetPath: LE_GAZAL_ASSETS.a,
  },
  {
    id: "BALL",
    label: "Balon",
    shortLabel: "BAL",
    family: "sport",
    tone: "orange",
    assetPath: LE_GAZAL_ASSETS.ball,
  },
  {
    id: "HOOP",
    label: "Canasta",
    shortLabel: "CAN",
    family: "sport",
    tone: "orange",
    assetPath: LE_GAZAL_ASSETS.hoop,
  },
  {
    id: "WHISTLE",
    label: "Silbato",
    shortLabel: "SIL",
    family: "sport",
    tone: "gold",
    assetPath: LE_GAZAL_ASSETS.whistle,
  },
  {
    id: "JERSEY88",
    label: "Camiseta 88",
    shortLabel: "88",
    family: "premium",
    tone: "gold",
    assetPath: LE_GAZAL_ASSETS.jersey,
  },
  {
    id: SPECIAL_SYMBOLS.WILD,
    label: "Camiseta 88",
    shortLabel: "WLD",
    family: "special",
    tone: "wild",
    tag: "WILD",
    assetPath: LE_GAZAL_ASSETS.jersey,
  },
  {
    id: "TROPHY",
    label: "Trofeo",
    shortLabel: "TOP",
    family: "premium",
    tone: "gold",
    assetPath: LE_GAZAL_ASSETS.trophy,
  },
  {
    id: SPECIAL_SYMBOLS.SCATTER,
    label: "Escudo Gazalbide",
    shortLabel: "SCT",
    family: "special",
    tone: "shield",
    tag: "SCATTER",
    assetPath: LE_GAZAL_ASSETS.shield,
  },
  {
    id: SPECIAL_SYMBOLS.BONUS,
    label: "Bonus",
    shortLabel: "BNS",
    family: "special",
    tone: "bonus",
    tag: "BONUS",
    assetPath: LE_GAZAL_ASSETS.bonus,
  },
];

// Same line-length multipliers as the authoritative Fantasy tiers.
export const LE_GAZAL_PAYTABLE = Object.fromEntries(
  ["TEN","J","Q","K","A","BALL","HOOP","WHISTLE","JERSEY88","TROPHY"]
    .map(symbol => [symbol, {3: 1, 4: 2, 5: 3, 6: 4}])
);

export const BONUS_CONFIG = {
  [BONUS_MODES.SCATTER]: {
    mode: BONUS_MODES.SCATTER,
    title: "CLUTCH TIME",
    description: "Diez tiradas gratis con multiplicador x2.",
    freeSpins: 10,
    multiplier: 2,
  },
  [BONUS_MODES.SCATTER_PLUS]: {
    mode: BONUS_MODES.SCATTER_PLUS,
    title: "CLUTCH TIME+",
    description: "Quince tiradas gratis con multiplicador x3.",
    freeSpins: 15,
    multiplier: 3,
  },
  [BONUS_MODES.SCATTER_MADNESS]: {
    mode: BONUS_MODES.SCATTER_MADNESS,
    title: "LOCURA GAZAL",
    description: "Veinte tiradas gratis con multiplicador x5.",
    freeSpins: 20,
    multiplier: 5,
  },
  [BONUS_MODES.BONUS]: {
    mode: BONUS_MODES.BONUS,
    title: "CLUTCH TIME+",
    description: "Cinco tiradas gratis con multiplicador x3.",
    freeSpins: 5,
    multiplier: 3,
  },
};

export const RANDOM_SCENARIO_WEIGHTS = [
  { id: "lose", weight: 6000 },
  { id: "small", weight: 2800 },
  { id: "medium", weight: 850 },
  { id: "high", weight: 200 },
  { id: "wild", weight: 100 },
  { id: "scatter", weight: 35 },
  { id: "scatter4", weight: 10 },
  { id: "scatter5", weight: 1 },
  { id: "bonus", weight: 4 },
];

export const SAFE_ROW_PATTERNS = [
  ["TEN", "J", "Q", "K", "A", "BALL"],
  ["J", "Q", "K", "A", "BALL", "HOOP"],
  ["Q", "K", "A", "BALL", "HOOP", "WHISTLE"],
  ["K", "A", "BALL", "HOOP", "WHISTLE", "JERSEY88"],
  ["A", "BALL", "HOOP", "WHISTLE", "JERSEY88", "TROPHY"],
  ["TROPHY", "JERSEY88", "WHISTLE", "HOOP", "BALL", "A"],
];

export const DEFAULT_DISPLAY_SYMBOLS = LE_GAZAL_SYMBOLS
  .filter((symbol) => symbol.id !== SPECIAL_SYMBOLS.WILD)
  .map((symbol) => symbol.id);

export function getSymbolDefinition(symbolId) {
  return LE_GAZAL_SYMBOLS.find((symbol) => symbol.id === symbolId) || LE_GAZAL_SYMBOLS[0];
}
