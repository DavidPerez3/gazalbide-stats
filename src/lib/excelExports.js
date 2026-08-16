import { supabase } from "./supabaseClient.js";
import { aggregatePlayerRows, formatSeconds, per40, percentage } from "./historyStats.js";

function safeFilePart(value, fallback = "export") {
  const clean = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return clean || fallback;
}

function num(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function percentValue(made, attempted) {
  return Number((percentage(made, attempted) / 100).toFixed(6));
}

function perGame(total, games) {
  return games ? Number((num(total) / games).toFixed(2)) : 0;
}

function per40Value(total, seconds) {
  return Number(per40(total, seconds).toFixed(2));
}

function lineupNames(playerIds, playerMap) {
  return (playerIds || [])
    .map((id) => {
      const player = playerMap.get(Number(id));
      return player ? `#${player.number ?? ""} ${player.name}`.trim() : `ID ${id}`;
    })
    .join(" · ");
}

function addSheet(XLSX, workbook, name, rows, widths = []) {
  const safeRows = rows?.length ? rows : [{ Info: "Sin datos disponibles" }];
  const worksheet = XLSX.utils.json_to_sheet(safeRows);
  if (widths.length) worksheet["!cols"] = widths.map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(workbook, worksheet, name.slice(0, 31));
  return worksheet;
}

function setPercentFormats(sheet, columns) {
  if (!sheet?.["!ref"]) return;
  const range = sheet["!ref"];
  const [, end] = range.split(":");
  const endRow = Number(String(end).match(/\d+/)?.[0] || 1);
  for (const col of columns) {
    for (let row = 2; row <= endRow; row += 1) {
      const cell = sheet[`${col}${row}`];
      if (cell) cell.z = "0.0%";
    }
  }
}

async function xlsx() {
  return import("xlsx");
}

async function loadMatchExportData(matchId) {
  const [matchResult, statsResult, lineupResult] = await Promise.all([
    supabase
      .from("matches")
      .select("id,season,date,opponent,gazal_side,gazal_pts,opp_pts,q_pf,q_pa,result,status,publication_version,published_at")
      .eq("id", matchId)
      .eq("status", "published")
      .single(),
    supabase
      .from("player_match_stats")
      .select(
        "player_id,sort_order,min_seconds,min_str,pts,two_pm,two_pa,three_pm,three_pa,fgm,fga,ftm,fta,oreb,dreb,reb,ast,tov,stl,blk,pf,pfd,pir,eff,plus_minus," +
        "pf_defensive,pf_offensive,pf_technical,pf_unsportsmanlike,pf_disqualifying,pf_technical_cat_1,pf_technical_cat_2,pf_disruptive,pf_flagrant," +
        "player:players!player_match_stats_player_id_fkey(id,name,number)"
      )
      .eq("match_id", matchId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("match_lineup_stats")
      .select("lineup_key,player_ids,stint_count,duration_ms,gazal_pts,opp_pts,plus_minus")
      .eq("match_id", matchId)
      .order("duration_ms", { ascending: false }),
  ]);

  if (matchResult.error) throw matchResult.error;
  if (statsResult.error) throw statsResult.error;
  if (lineupResult.error) throw lineupResult.error;

  return {
    match: matchResult.data,
    stats: statsResult.data || [],
    lineups: lineupResult.data || [],
  };
}

export async function exportMatchExcel(matchId) {
  const { match, stats, lineups } = await loadMatchExportData(matchId);
  const XLSX = await xlsx();
  const workbook = XLSX.utils.book_new();

  const quarterRows = (match.q_pf || []).map((value, index) => ({
    Periodo: index < 4 ? `Q${index + 1}` : `OT${index - 3}`,
    Gazalbide: num(value),
    Rival: num(match.q_pa?.[index]),
    Diferencia: num(value) - num(match.q_pa?.[index]),
  }));

  addSheet(XLSX, workbook, "Resumen", [
    { Campo: "Temporada", Valor: match.season },
    { Campo: "Fecha", Valor: match.date },
    { Campo: "Rival", Valor: match.opponent },
    { Campo: "Condición", Valor: match.gazal_side === "away" ? "Visitante" : "Local" },
    { Campo: "Gazalbide", Valor: num(match.gazal_pts) },
    { Campo: "Rival_pts", Valor: num(match.opp_pts) },
    { Campo: "Resultado", Valor: match.result || "" },
    { Campo: "Versión publicación", Valor: match.publication_version || 1 },
    { Campo: "Publicado", Valor: match.published_at || "" },
  ], [22, 32]);
  addSheet(XLSX, workbook, "Parciales", quarterRows, [12, 14, 14, 14]);

  const playerRows = stats.map((row) => ({
    Dorsal: row.player?.number ?? "",
    Jugador: row.player?.name || `ID ${row.player_id}`,
    MIN: row.min_str || formatSeconds(row.min_seconds),
    PTS: num(row.pts),
    "2PM": num(row.two_pm),
    "2PA": num(row.two_pa),
    "2P%": percentValue(row.two_pm, row.two_pa),
    "3PM": num(row.three_pm),
    "3PA": num(row.three_pa),
    "3P%": percentValue(row.three_pm, row.three_pa),
    FGM: num(row.fgm),
    FGA: num(row.fga),
    "FG%": percentValue(row.fgm, row.fga),
    FTM: num(row.ftm),
    FTA: num(row.fta),
    "FT%": percentValue(row.ftm, row.fta),
    OREB: num(row.oreb),
    DREB: num(row.dreb),
    REB: num(row.reb),
    AST: num(row.ast),
    TOV: num(row.tov),
    ROB: num(row.stl),
    BLK: num(row.blk),
    PF: num(row.pf),
    PFD: num(row.pfd),
    "+/-": num(row.plus_minus),
    PIR: num(row.pir),
    EFF: num(row.eff),
    Técnicas: num(row.pf_technical) + num(row.pf_technical_cat_1) + num(row.pf_technical_cat_2),
    Antideportivas: num(row.pf_unsportsmanlike),
    Disruptivas: num(row.pf_disruptive),
    Flagrantes: num(row.pf_flagrant),
    Descalificantes: num(row.pf_disqualifying),
  }));
  const playersSheet = addSheet(XLSX, workbook, "Jugadores", playerRows, [8, 22, 10, ...Array(30).fill(10)]);
  setPercentFormats(playersSheet, ["G", "J", "M", "P"]);

  const playerMap = new Map(stats.map((row) => [Number(row.player_id), {
    name: row.player?.name || `ID ${row.player_id}`,
    number: row.player?.number ?? "",
  }]));
  const lineupRows = lineups.map((row) => ({
    Quinteto: lineupNames(row.player_ids, playerMap),
    Tramos: num(row.stint_count),
    MIN: formatSeconds(num(row.duration_ms) / 1000),
    PF: num(row.gazal_pts),
    PC: num(row.opp_pts),
    "+/-": num(row.plus_minus),
    "+/- por 40": row.duration_ms > 0
      ? Number((num(row.plus_minus) * 2400000 / num(row.duration_ms)).toFixed(2))
      : 0,
  }));
  addSheet(
    XLSX,
    workbook,
    "Quintetos",
    lineupRows.length ? lineupRows : [{ Info: "Este partido no dispone de stints/quintetos históricos." }],
    [62, 10, 10, 8, 8, 10, 14]
  );

  XLSX.writeFile(
    workbook,
    `gazalbide-partido-${match.date}-${safeFilePart(match.opponent, "rival")}.xlsx`,
    { compression: true }
  );
}

async function loadPublishedMatches(scope) {
  let query = supabase
    .from("matches")
    .select("id,season,date,opponent,gazal_side,gazal_pts,opp_pts,q_pf,q_pa,result,status")
    .eq("status", "published")
    .order("date", { ascending: true });
  if (scope && scope !== "all") query = query.eq("season", scope);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

function aggregateLineups(rows, playerMap) {
  const map = new Map();
  for (const row of rows || []) {
    const ids = (row.player_ids || []).map(Number);
    const key = row.lineup_key || [...ids].sort((a, b) => a - b).join("-");
    const current = map.get(key) || {
      ids,
      stintCount: 0,
      durationMs: 0,
      gazalPts: 0,
      oppPts: 0,
      plusMinus: 0,
      matches: new Set(),
    };
    current.stintCount += num(row.stint_count);
    current.durationMs += num(row.duration_ms);
    current.gazalPts += num(row.gazal_pts);
    current.oppPts += num(row.opp_pts);
    current.plusMinus += num(row.plus_minus);
    current.matches.add(row.match_id);
    map.set(key, current);
  }
  return Array.from(map.values())
    .map((row) => ({
      ...row,
      games: row.matches.size,
      names: lineupNames(row.ids, playerMap),
      plusMinusPer40: row.durationMs > 0 ? row.plusMinus * 2400000 / row.durationMs : 0,
    }))
    .sort((a, b) => b.plusMinus - a.plusMinus || b.durationMs - a.durationMs);
}

function staffRows(payload) {
  const map = new Map();
  const ensure = (id, name, code) => {
    const key = String(id || code || name);
    if (!map.has(key)) {
      map.set(key, { name: name || "Staff", code: code || "", technical: 0, disruptive: 0, flagrant: 0, disqualifying: 0 });
    }
    return map.get(key);
  };
  for (const event of payload?.events || []) {
    const row = ensure(event.staff_id, event.staffName, event.staffCode);
    const kind = String(event.foul_kind || "");
    if (["technical", "technical_cat_1", "technical_cat_2"].includes(kind)) row.technical += 1;
    if (kind === "disruptive") row.disruptive += 1;
    if (kind === "flagrant") row.flagrant += 1;
    if (kind === "disqualifying") row.disqualifying += 1;
  }
  for (const adjustment of payload?.adjustments || []) {
    const row = ensure(adjustment.staff_id, adjustment.staffName, adjustment.staffCode);
    row.technical += num(adjustment.technical);
    row.disqualifying += num(adjustment.disqualifying);
  }
  return Array.from(map.values()).sort((a, b) =>
    (b.technical + b.disruptive + b.flagrant + b.disqualifying) -
    (a.technical + a.disruptive + a.flagrant + a.disqualifying)
  );
}

export async function exportSeasonExcel({
  scope,
  playerRows,
  disciplineAdjustments,
  lineupRows,
  staffPayload,
}) {
  const XLSX = await xlsx();
  const workbook = XLSX.utils.book_new();
  const matches = await loadPublishedMatches(scope);
  const totals = aggregatePlayerRows(playerRows, disciplineAdjustments)
    .sort((a, b) => num(b.pir) - num(a.pir) || num(b.pts) - num(a.pts));

  addSheet(XLSX, workbook, "Partidos", matches.map((match) => ({
    Fecha: match.date,
    Temporada: match.season,
    Rival: match.opponent,
    Condición: match.gazal_side === "away" ? "Visitante" : "Local",
    Gazalbide: num(match.gazal_pts),
    Rival_pts: num(match.opp_pts),
    Diferencia: num(match.gazal_pts) - num(match.opp_pts),
    Resultado: match.result || "",
    Parciales_Gazalbide: (match.q_pf || []).join(" · "),
    Parciales_Rival: (match.q_pa || []).join(" · "),
  })), [12, 13, 24, 12, 12, 12, 12, 12, 28, 28]);

  const totalRows = totals.map((row) => ({
    Dorsal: row.number,
    Jugador: row.name,
    PJ: row.games,
    MIN: formatSeconds(row.min_seconds),
    PTS: num(row.pts),
    REB: num(row.reb),
    AST: num(row.ast),
    ROB: num(row.stl),
    BLK: num(row.blk),
    TOV: num(row.tov),
    PF: num(row.pf),
    PFD: num(row.pfd),
    "+/-": num(row.plus_minus),
    PIR: num(row.pir),
    EFF: num(row.eff),
    "FG%": percentValue(row.fgm, row.fga),
    "2P%": percentValue(row.two_pm, row.two_pa),
    "3P%": percentValue(row.three_pm, row.three_pa),
    "FT%": percentValue(row.ftm, row.fta),
    Técnicas: num(row.technical),
    Antideportivas: num(row.unsportsmanlike),
    Disruptivas: num(row.disruptive),
    Flagrantes: num(row.flagrant),
    Descalificantes: num(row.disqualifying),
  }));
  const totalsSheet = addSheet(XLSX, workbook, "Jugadores totales", totalRows, [8, 22, ...Array(22).fill(10)]);
  setPercentFormats(totalsSheet, ["P", "Q", "R", "S"]);

  const averages = totals.map((row) => ({
    Dorsal: row.number,
    Jugador: row.name,
    PJ: row.games,
    "MIN/PJ": formatSeconds(row.games ? row.min_seconds / row.games : 0),
    "PTS/PJ": perGame(row.pts, row.games),
    "REB/PJ": perGame(row.reb, row.games),
    "AST/PJ": perGame(row.ast, row.games),
    "ROB/PJ": perGame(row.stl, row.games),
    "BLK/PJ": perGame(row.blk, row.games),
    "TOV/PJ": perGame(row.tov, row.games),
    "PF/PJ": perGame(row.pf, row.games),
    "PFD/PJ": perGame(row.pfd, row.games),
    "+/-/PJ": perGame(row.plus_minus, row.games),
    "PIR/PJ": perGame(row.pir, row.games),
    "EFF/PJ": perGame(row.eff, row.games),
    "FG%": percentValue(row.fgm, row.fga),
    "2P%": percentValue(row.two_pm, row.two_pa),
    "3P%": percentValue(row.three_pm, row.three_pa),
    "FT%": percentValue(row.ftm, row.fta),
  }));
  const averagesSheet = addSheet(XLSX, workbook, "Jugadores medias", averages, [8, 22, ...Array(17).fill(11)]);
  setPercentFormats(averagesSheet, ["P", "Q", "R", "S"]);

  addSheet(XLSX, workbook, "Jugadores por 40", totals.map((row) => ({
    Dorsal: row.number,
    Jugador: row.name,
    MIN: formatSeconds(row.min_seconds),
    "PTS/40": per40Value(row.pts, row.min_seconds),
    "REB/40": per40Value(row.reb, row.min_seconds),
    "AST/40": per40Value(row.ast, row.min_seconds),
    "ROB/40": per40Value(row.stl, row.min_seconds),
    "BLK/40": per40Value(row.blk, row.min_seconds),
    "TOV/40": per40Value(row.tov, row.min_seconds),
    "PF/40": per40Value(row.pf, row.min_seconds),
    "PFD/40": per40Value(row.pfd, row.min_seconds),
    "+/-/40": per40Value(row.plus_minus, row.min_seconds),
    "PIR/40": per40Value(row.pir, row.min_seconds),
    "EFF/40": per40Value(row.eff, row.min_seconds),
  })), [8, 22, ...Array(12).fill(11)]);

  addSheet(XLSX, workbook, "Detalle jugador-partido", (playerRows || []).map((row) => ({
    Fecha: row.date,
    Temporada: row.season,
    Rival: row.opponent,
    Dorsal: row.playerNumber,
    Jugador: row.playerName,
    MIN: row.min_str || formatSeconds(row.min_seconds),
    PTS: num(row.pts),
    REB: num(row.reb),
    AST: num(row.ast),
    ROB: num(row.stl),
    BLK: num(row.blk),
    TOV: num(row.tov),
    PF: num(row.pf),
    PFD: num(row.pfd),
    "+/-": num(row.plus_minus),
    PIR: num(row.pir),
    EFF: num(row.eff),
  })), [12, 13, 22, 8, 22, ...Array(12).fill(10)]);

  const playerMap = new Map(totals.map((row) => [Number(row.playerId), { name: row.name, number: row.number }]));
  const lineups = aggregateLineups(lineupRows, playerMap);
  addSheet(XLSX, workbook, "Quintetos", lineups.length ? lineups.map((row) => ({
    Quinteto: row.names,
    PJ: row.games,
    Tramos: row.stintCount,
    MIN: formatSeconds(row.durationMs / 1000),
    PF: row.gazalPts,
    PC: row.oppPts,
    "+/-": row.plusMinus,
    "+/- por 40": Number(row.plusMinusPer40.toFixed(2)),
  })) : [{ Info: "No hay quintetos/stints registrados para este periodo." }], [62, 8, 10, 10, 8, 8, 10, 14]);

  addSheet(XLSX, workbook, "Disciplina staff", staffRows(staffPayload).map((row) => ({
    Staff: row.name,
    Código: row.code,
    Técnicas: row.technical,
    Disruptivas: row.disruptive,
    Flagrantes: row.flagrant,
    Descalificantes: row.disqualifying,
    Total: row.technical + row.disruptive + row.flagrant + row.disqualifying,
  })), [22, 10, 12, 12, 12, 16, 10]);

  XLSX.writeFile(
    workbook,
    `gazalbide-${scope === "all" ? "historico-completo" : `temporada-${safeFilePart(scope)}`}.xlsx`,
    { compression: true }
  );
}

export async function exportLineupsExcel({ scope, lineupRows, playerRows, disciplineAdjustments }) {
  const XLSX = await xlsx();
  const workbook = XLSX.utils.book_new();
  const totals = aggregatePlayerRows(playerRows, disciplineAdjustments);
  const playerMap = new Map(totals.map((row) => [Number(row.playerId), { name: row.name, number: row.number }]));
  const aggregate = aggregateLineups(lineupRows, playerMap);

  addSheet(XLSX, workbook, "Quintetos resumen", aggregate.length ? aggregate.map((row) => ({
    Quinteto: row.names,
    PJ: row.games,
    Tramos: row.stintCount,
    MIN: formatSeconds(row.durationMs / 1000),
    PF: row.gazalPts,
    PC: row.oppPts,
    "+/-": row.plusMinus,
    "+/- por 40": Number(row.plusMinusPer40.toFixed(2)),
  })) : [{ Info: "No hay quintetos/stints registrados para este periodo." }], [62, 8, 10, 10, 8, 8, 10, 14]);

  addSheet(XLSX, workbook, "Quintetos por partido", (lineupRows || []).map((row) => ({
    Fecha: row.date,
    Temporada: row.season,
    Rival: row.opponent,
    Quinteto: lineupNames(row.player_ids, playerMap),
    Tramos: num(row.stint_count),
    MIN: formatSeconds(num(row.duration_ms) / 1000),
    PF: num(row.gazal_pts),
    PC: num(row.opp_pts),
    "+/-": num(row.plus_minus),
    "+/- por 40": row.duration_ms > 0 ? Number((num(row.plus_minus) * 2400000 / num(row.duration_ms)).toFixed(2)) : 0,
  })), [12, 13, 22, 62, 10, 10, 8, 8, 10, 14]);

  XLSX.writeFile(
    workbook,
    `gazalbide-quintetos-${scope === "all" ? "historico" : safeFilePart(scope)}.xlsx`,
    { compression: true }
  );
}
