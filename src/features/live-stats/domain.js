// Shared Live Stats domain contract.
// Keep this aligned with supabase/migrations/002_live_stats_core.sql.

export const LIVE_STATS_CONFIG = Object.freeze({
  preferredOrientation: "landscape",
  tracksGazalbidePlayers: true,
  tracksOpponentPlayers: false,
  opponentMode: "aggregate",
  regulationPeriodMs: 10 * 60 * 1000,
  overtimePeriodMs: 5 * 60 * 1000,
});

export const LIVE_EVENT = Object.freeze({
  // Gazalbide shooting
  FT_MADE: "FT_MADE",
  FT_MISSED: "FT_MISSED",
  TWO_MADE: "TWO_MADE",
  TWO_MISSED: "TWO_MISSED",
  THREE_MADE: "THREE_MADE",
  THREE_MISSED: "THREE_MISSED",

  // Gazalbide box score
  OREB: "OREB",
  DREB: "DREB",
  AST: "AST",
  TOV: "TOV",
  STL: "STL",
  BLK: "BLK",
  PF: "PF",
  PFD: "PFD",

  // Gazalbide lineup
  SUB_IN: "SUB_IN",
  SUB_OUT: "SUB_OUT",

  // Opponent: intentionally aggregate only
  OPP_SCORE_1: "OPP_SCORE_1",
  OPP_SCORE_2: "OPP_SCORE_2",
  OPP_SCORE_3: "OPP_SCORE_3",
  OPP_TEAM_FOUL: "OPP_TEAM_FOUL",

  // System
  PERIOD_START: "PERIOD_START",
  PERIOD_END: "PERIOD_END",
  CLOCK_SET: "CLOCK_SET",
});

export const GAZALBIDE_EVENT_TYPES = Object.freeze([
  LIVE_EVENT.FT_MADE,
  LIVE_EVENT.FT_MISSED,
  LIVE_EVENT.TWO_MADE,
  LIVE_EVENT.TWO_MISSED,
  LIVE_EVENT.THREE_MADE,
  LIVE_EVENT.THREE_MISSED,
  LIVE_EVENT.OREB,
  LIVE_EVENT.DREB,
  LIVE_EVENT.AST,
  LIVE_EVENT.TOV,
  LIVE_EVENT.STL,
  LIVE_EVENT.BLK,
  LIVE_EVENT.PF,
  LIVE_EVENT.PFD,
  LIVE_EVENT.SUB_IN,
  LIVE_EVENT.SUB_OUT,
]);

export const OPPONENT_EVENT_TYPES = Object.freeze([
  LIVE_EVENT.OPP_SCORE_1,
  LIVE_EVENT.OPP_SCORE_2,
  LIVE_EVENT.OPP_SCORE_3,
  LIVE_EVENT.OPP_TEAM_FOUL,
]);

export const SYSTEM_EVENT_TYPES = Object.freeze([
  LIVE_EVENT.PERIOD_START,
  LIVE_EVENT.PERIOD_END,
  LIVE_EVENT.CLOCK_SET,
]);

const SCORE_DELTA = Object.freeze({
  [LIVE_EVENT.FT_MADE]: { gazalbide: 1, opponent: 0 },
  [LIVE_EVENT.TWO_MADE]: { gazalbide: 2, opponent: 0 },
  [LIVE_EVENT.THREE_MADE]: { gazalbide: 3, opponent: 0 },
  [LIVE_EVENT.OPP_SCORE_1]: { gazalbide: 0, opponent: 1 },
  [LIVE_EVENT.OPP_SCORE_2]: { gazalbide: 0, opponent: 2 },
  [LIVE_EVENT.OPP_SCORE_3]: { gazalbide: 0, opponent: 3 },
});

const TEAM_FOUL_DELTA = Object.freeze({
  [LIVE_EVENT.PF]: { gazalbide: 1, opponent: 0 },
  [LIVE_EVENT.OPP_TEAM_FOUL]: { gazalbide: 0, opponent: 1 },
});

// Deltas for Gazalbide's individual box score. Opponent events never produce player stats.
export const PLAYER_STAT_DELTA = Object.freeze({
  [LIVE_EVENT.FT_MADE]: { pts: 1, ftm: 1, fta: 1 },
  [LIVE_EVENT.FT_MISSED]: { fta: 1 },
  [LIVE_EVENT.TWO_MADE]: { pts: 2, two_pm: 1, two_pa: 1, fgm: 1, fga: 1 },
  [LIVE_EVENT.TWO_MISSED]: { two_pa: 1, fga: 1 },
  [LIVE_EVENT.THREE_MADE]: { pts: 3, three_pm: 1, three_pa: 1, fgm: 1, fga: 1 },
  [LIVE_EVENT.THREE_MISSED]: { three_pa: 1, fga: 1 },
  [LIVE_EVENT.OREB]: { oreb: 1, reb: 1 },
  [LIVE_EVENT.DREB]: { dreb: 1, reb: 1 },
  [LIVE_EVENT.AST]: { ast: 1 },
  [LIVE_EVENT.TOV]: { tov: 1 },
  [LIVE_EVENT.STL]: { stl: 1 },
  [LIVE_EVENT.BLK]: { blk: 1 },
  [LIVE_EVENT.PF]: { pf: 1 },
  [LIVE_EVENT.PFD]: { pfd: 1 },
});

export function getScoreDelta(eventType) {
  return SCORE_DELTA[eventType] || { gazalbide: 0, opponent: 0 };
}

export function getTeamFoulDelta(eventType) {
  return TEAM_FOUL_DELTA[eventType] || { gazalbide: 0, opponent: 0 };
}

export function getPlayerStatDelta(eventType) {
  return PLAYER_STAT_DELTA[eventType] || null;
}

export function getEventSubject(eventType) {
  if (GAZALBIDE_EVENT_TYPES.includes(eventType)) return "gazalbide";
  if (OPPONENT_EVENT_TYPES.includes(eventType)) return "opponent";
  if (SYSTEM_EVENT_TYPES.includes(eventType)) return "system";
  throw new Error(`Tipo de evento Live Stats desconocido: ${eventType}`);
}

export function eventRequiresGazalbidePlayer(eventType) {
  return getEventSubject(eventType) === "gazalbide";
}

export function isOpponentAggregateEvent(eventType) {
  return getEventSubject(eventType) === "opponent";
}
