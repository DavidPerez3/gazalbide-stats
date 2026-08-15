import { supabase } from "../../lib/supabaseClient.js";
import { LIVE_STATS_CONFIG } from "./domain.js";

let syncQueue = Promise.resolve({ ok: true });

function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function databasePlayerId(player) {
  const value = player?.databaseId ?? player?.id;
  if (value == null || String(value).startsWith("num:")) return null;
  return value;
}

function rosterRows(setup) {
  const starterIds = new Set((setup.starterIds || []).map(String));
  const rows = (setup.roster || []).map((player, index) => {
    const playerId = databasePlayerId(player);
    if (playerId == null) {
      throw new Error(`No se puede sincronizar ${player?.name || "un jugador"}: falta player_id de Supabase.`);
    }

    return {
      match_id: setup.matchId,
      player_id: playerId,
      jersey_number: String(player.number ?? player.jersey_number ?? ""),
      player_name: player.name ?? player.player_name ?? "",
      sort_order: index,
      is_starter: starterIds.has(String(player.id)),
      is_active: true,
    };
  });

  return rows;
}

function liveStateRow(setup, gameState) {
  if (!gameState) return null;
  return {
    match_id: setup.matchId,
    period: Number(gameState.period || 1),
    clock_ms: Math.max(0, Math.round(Number(gameState.clockMs || 0))),
    clock_running: Boolean(gameState.clockRunning),
    period_duration_ms: LIVE_STATS_CONFIG.regulationPeriodMs,
    overtime_duration_ms: LIVE_STATS_CONFIG.overtimePeriodMs,
    updated_at: new Date().toISOString(),
  };
}

async function currentUserId() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.user?.id || null;
}

async function ensureRemoteMatch(setup) {
  if (!setup?.matchId) throw new Error("La sesión Live no tiene matchId persistente.");

  const match = {
    id: setup.matchId,
    season: setup.seasonId,
    date: setup.matchDate,
    opponent: setup.opponent || "Rival",
    gazal_side: setup.gazalSide || "home",
    status: "live",
  };

  // Do nothing when the match already exists. This makes retries safe and,
  // importantly, prevents a future published match from being reset to live.
  const { error: matchError } = await supabase
    .from("matches")
    .upsert(match, { onConflict: "id", ignoreDuplicates: true });
  if (matchError) throw matchError;

  const rows = rosterRows(setup);
  if (rows.length > 0) {
    const { error: rosterError } = await supabase
      .from("game_roster")
      .upsert(rows, { onConflict: "match_id,player_id" });
    if (rosterError) throw rosterError;
  }
}

function eventRows(setup, events, userId) {
  return (events || []).map((event) => ({
    id: event.id,
    match_id: event.match_id || setup.matchId,
    client_id: event.client_id || setup.clientId,
    client_sequence: Number(event.client_sequence),
    client_created_at: event.client_created_at,
    period: Number(event.period),
    clock_ms: Math.max(0, Math.round(Number(event.clock_ms || 0))),
    subject: event.subject,
    event_type: event.event_type,
    player_id: event.player_id ?? null,
    related_player_id: event.related_player_id ?? null,
    staff_id: event.staff_id ?? null,
    foul_kind: event.foul_kind ?? null,
    action_group_id: event.action_group_id ?? null,
    is_void: Boolean(event.is_void),
    voided_at: event.voided_at ?? null,
    void_reason: event.void_reason ?? null,
    metadata: event.metadata || {},
    created_by: userId,
    updated_at: new Date().toISOString(),
  }));
}

async function pushEvents(setup, events) {
  if (!events?.length) return 0;
  const userId = await currentUserId();
  const rows = eventRows(setup, events, userId);

  // The database has UNIQUE(match_id, client_id, client_sequence). Retrying the
  // same local history therefore updates the same logical events instead of
  // duplicating them. This also propagates a later is_void=true from Undo.
  const { error } = await supabase
    .from("game_events")
    .upsert(rows, { onConflict: "match_id,client_id,client_sequence" });
  if (error) throw error;
  return rows.length;
}

async function pushLiveState(setup, gameState) {
  const row = liveStateRow(setup, gameState);
  if (!row) return;

  const { error } = await supabase
    .from("live_game_state")
    .upsert(row, { onConflict: "match_id" });
  if (error) throw error;
}

async function syncSession(snapshot) {
  if (isOffline()) return { ok: false, offline: true };

  await ensureRemoteMatch(snapshot.setup);
  const syncedEvents = await pushEvents(snapshot.setup, snapshot.events);
  await pushLiveState(snapshot.setup, snapshot.gameState);
  return { ok: true, syncedEvents };
}

async function syncState(snapshot) {
  if (isOffline()) return { ok: false, offline: true };

  await ensureRemoteMatch(snapshot.setup);
  await pushLiveState(snapshot.setup, snapshot.gameState);
  return { ok: true };
}

function enqueue(task) {
  syncQueue = syncQueue
    .catch(() => ({ ok: false }))
    .then(task)
    .catch((error) => {
      console.warn("Live Stats seguirá en local; sincronización pendiente:", error);
      return { ok: false, error };
    });
  return syncQueue;
}

export function queueLiveSessionSync({ setup, events, gameState }) {
  const snapshot = {
    setup: clone(setup),
    events: clone(events || []),
    gameState: clone(gameState),
  };
  return enqueue(() => syncSession(snapshot));
}

export function queueLiveStateSync({ setup, gameState }) {
  const snapshot = {
    setup: clone(setup),
    gameState: clone(gameState),
  };
  return enqueue(() => syncState(snapshot));
}
