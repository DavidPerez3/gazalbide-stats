export const PLAYER_SUM_KEYS = [
  "min_seconds", "pts", "two_pm", "two_pa", "three_pm", "three_pa", "fgm", "fga", "ftm", "fta",
  "oreb", "dreb", "reb", "ast", "tov", "stl", "blk", "pf", "pfd", "pir", "eff", "plus_minus",
  "pf_defensive", "pf_offensive", "pf_technical", "pf_unsportsmanlike", "pf_disqualifying",
  "pf_technical_cat_1", "pf_technical_cat_2", "pf_disruptive", "pf_flagrant",
];

export function formatSeconds(value) {
  const seconds = Math.max(0, Math.round(Number(value || 0)));
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function percentage(made, attempted) {
  const att = Number(attempted || 0);
  return att > 0 ? (Number(made || 0) / att) * 100 : 0;
}

export function per40(total, minSeconds) {
  const seconds = Number(minSeconds || 0);
  return seconds > 0 ? (Number(total || 0) / seconds) * 2400 : 0;
}

function emptyAggregate(row) {
  const base = {
    playerId: Number(row.playerId ?? row.player_id),
    name: row.playerName || row.player?.name || "Jugador",
    number: row.playerNumber ?? row.player?.number ?? "",
    photoPath: row.photoPath || row.player?.photo_path || null,
    games: 0,
    seasons: new Set(),
    technical: 0,
    unsportsmanlike: 0,
    disqualifying: 0,
    disruptive: 0,
    flagrant: 0,
  };
  for (const key of PLAYER_SUM_KEYS) base[key] = 0;
  return base;
}

export function aggregatePlayerRows(rows, adjustments = []) {
  const map = new Map();
  for (const row of rows || []) {
    const playerId = Number(row.playerId ?? row.player_id);
    if (!Number.isFinite(playerId)) continue;
    const current = map.get(playerId) || emptyAggregate(row);
    current.games += 1;
    if (row.season) current.seasons.add(row.season);
    current.name = row.playerName || current.name;
    current.number = row.playerNumber ?? current.number;
    current.photoPath = row.photoPath || current.photoPath;
    for (const key of PLAYER_SUM_KEYS) current[key] += Number(row[key] || 0);
    current.technical += Number(row.pf_technical || 0)
      + Number(row.pf_technical_cat_1 || 0)
      + Number(row.pf_technical_cat_2 || 0);
    current.unsportsmanlike += Number(row.pf_unsportsmanlike || 0);
    current.disqualifying += Number(row.pf_disqualifying || 0);
    current.disruptive += Number(row.pf_disruptive || 0);
    current.flagrant += Number(row.pf_flagrant || 0);
    map.set(playerId, current);
  }

  for (const adjustment of adjustments || []) {
    const playerId = Number(adjustment.player_id);
    if (!Number.isFinite(playerId)) continue;
    const current = map.get(playerId) || emptyAggregate({
      playerId,
      playerName: adjustment.player?.name,
      playerNumber: adjustment.player?.number,
    });
    if (adjustment.season_id) current.seasons.add(adjustment.season_id);
    current.technical += Number(adjustment.technical || 0);
    current.unsportsmanlike += Number(adjustment.unsportsmanlike || 0);
    current.disqualifying += Number(adjustment.disqualifying || 0);
    current.disruptive += Number(adjustment.disruptive || 0);
    current.flagrant += Number(adjustment.flagrant || 0);
    map.set(playerId, current);
  }

  return Array.from(map.values()).map((row) => ({
    ...row,
    seasons: Array.from(row.seasons).sort(),
  }));
}

export function aggregateBySeason(rows, adjustments = []) {
  const seasons = new Map();
  const seasonIds = new Set([
    ...(rows || []).map((row) => row.season).filter(Boolean),
    ...(adjustments || []).map((row) => row.season_id).filter(Boolean),
  ]);

  for (const seasonId of seasonIds) {
    seasons.set(
      seasonId,
      aggregatePlayerRows(
        (rows || []).filter((row) => row.season === seasonId),
        (adjustments || []).filter((row) => row.season_id === seasonId)
      )
    );
  }
  return seasons;
}

export function playerSeasonSummary(rows) {
  const games = rows.length;
  const totals = Object.fromEntries(PLAYER_SUM_KEYS.map((key) => [key, 0]));
  for (const row of rows) {
    for (const key of PLAYER_SUM_KEYS) totals[key] += Number(row[key] || 0);
  }
  return {
    games,
    ...totals,
    min_avg: games ? totals.min_seconds / games : 0,
    pts_avg: games ? totals.pts / games : 0,
    reb_avg: games ? totals.reb / games : 0,
    ast_avg: games ? totals.ast / games : 0,
    pir_avg: games ? totals.pir / games : 0,
    eff_avg: games ? totals.eff / games : 0,
    fg_pct: percentage(totals.fgm, totals.fga),
    two_pct: percentage(totals.two_pm, totals.two_pa),
    three_pct: percentage(totals.three_pm, totals.three_pa),
    ft_pct: percentage(totals.ftm, totals.fta),
  };
}

export function bestGame(rows, key) {
  if (!rows?.length) return null;
  return rows.reduce((best, row) => {
    if (!best || Number(row[key] || 0) > Number(best[key] || 0)) return row;
    if (Number(row[key] || 0) === Number(best[key] || 0) && String(row.date || "") > String(best.date || "")) return row;
    return best;
  }, null);
}
