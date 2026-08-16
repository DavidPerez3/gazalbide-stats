import { supabase } from "../../lib/supabaseClient.js";
import { LIVE_STATS_CONFIG } from "./domain.js";

let syncQueue = Promise.resolve({ ok: true });
let syncStatus = {
  phase: typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "idle",
  lastSyncedAt: null,
  error: null,
};
const syncListeners = new Set();
const fantasyPrepByMatch = new Map();
const FANTASY_PREP_RETRY_MS = 30_000;

function publishSyncStatus(patch) {
  syncStatus = { ...syncStatus, ...patch };
  for (const listener of syncListeners) listener(syncStatus);
}

export function getLiveSyncStatus() {
  return { ...syncStatus };
}

export function subscribeLiveSyncStatus(listener) {
  syncListeners.add(listener);
  listener({ ...syncStatus });
  return () => syncListeners.delete(listener);
}

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

function controlToken(setup) {
  return setup?.controlToken || null;
}

function rosterRows(setup) {
  const starterIds = new Set((setup.starterIds || []).map(String));
  return (setup.roster || []).map((player, index) => {
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
      control_token: controlToken(setup),
    };
  });
}

function playedTimeRows(setup, gameState) {
  if (!gameState?.players) return [];

  return rosterRows(setup).map((row) => {
    const localPlayer = (setup.roster || []).find(
      (player) => String(databasePlayerId(player)) === String(row.player_id)
    );
    const statePlayer = localPlayer ? gameState.players?.[String(localPlayer.id)] : null;

    return {
      ...row,
      played_ms: Math.max(0, Math.round(Number(statePlayer?.playedMs || 0))),
      updated_at: new Date().toISOString(),
    };
  });
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
    control_token: controlToken(setup),
    updated_at: new Date().toISOString(),
  };
}

async function currentUserId() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.user?.id || null;
}

async function maybePrepareFantasyLive(setup) {
  if (!setup?.matchId || isOffline()) return null;

  const current = fantasyPrepByMatch.get(setup.matchId);
  const now = Date.now();
  if (current?.ready) return current.result || null;
  if (current?.lastAttempt && now - current.lastAttempt < FANTASY_PREP_RETRY_MS) {
    return current.result || null;
  }

  fantasyPrepByMatch.set(setup.matchId, {
    ...(current || {}),
    lastAttempt: now,
  });

  try {
    const { data, error } = await supabase.rpc("prepare_live_fantasy_gameweek", {
      p_match_id: setup.matchId,
    });
    if (error) throw error;

    const ready = Boolean(data?.linked && data?.finalized);
    fantasyPrepByMatch.set(setup.matchId, {
      ready,
      result: data || null,
      lastAttempt: now,
    });
    return data || null;
  } catch (error) {
    // Fantasy Live is auxiliary to the scorer. A configuration problem must not
    // prevent the match itself from continuing local-first.
    console.warn("No se pudo preparar Fantasy Live; Live Stats continúa:", error);
    fantasyPrepByMatch.set(setup.matchId, {
      ready: false,
      result: null,
      lastAttempt: now,
    });
    return null;
  }
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

  await maybePrepareFantasyLive(setup);
}

export async function ensureRemoteLiveSession(setup) {
  if (isOffline()) return { ok: false, offline: true };
  await ensureRemoteMatch(setup);
  return { ok: true };
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
    created_by: event.created_by ?? userId,
    control_token: controlToken(setup),
    updated_at: new Date().toISOString(),
  }));
}

async function pushEvents(setup, events) {
  if (!events?.length) return 0;
  const userId = await currentUserId();
  const rows = eventRows(setup, events, userId);

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

async function pushPlayedTime(setup, gameState) {
  const rows = playedTimeRows(setup, gameState);
  if (rows.length === 0) return;

  const { error } = await supabase
    .from("game_roster")
    .upsert(rows, { onConflict: "match_id,player_id" });
  if (error) throw error;
}

async function syncSession(snapshot) {
  if (isOffline()) {
    publishSyncStatus({ phase: "offline", error: null });
    return { ok: false, offline: true };
  }

  await ensureRemoteMatch(snapshot.setup);
  const syncedEvents = await pushEvents(snapshot.setup, snapshot.events);
  await pushLiveState(snapshot.setup, snapshot.gameState);
  await pushPlayedTime(snapshot.setup, snapshot.gameState);
  return { ok: true, syncedEvents };
}

async function syncState(snapshot) {
  if (isOffline()) {
    publishSyncStatus({ phase: "offline", error: null });
    return { ok: false, offline: true };
  }

  await ensureRemoteMatch(snapshot.setup);
  await pushLiveState(snapshot.setup, snapshot.gameState);
  await pushPlayedTime(snapshot.setup, snapshot.gameState);
  return { ok: true };
}

function enqueue(task) {
  syncQueue = syncQueue
    .catch(() => ({ ok: false }))
    .then(async () => {
      if (isOffline()) {
        publishSyncStatus({ phase: "offline", error: null });
      } else {
        publishSyncStatus({ phase: "saving", error: null });
      }
      const result = await task();
      if (result?.ok) {
        publishSyncStatus({
          phase: "synced",
          lastSyncedAt: new Date().toISOString(),
          error: null,
        });
      } else if (result?.offline) {
        publishSyncStatus({ phase: "offline", error: null });
      }
      return result;
    })
    .catch((error) => {
      console.warn("Live Stats seguirá en local; sincronización pendiente:", error);
      publishSyncStatus({ phase: isOffline() ? "offline" : "pending", error });
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

export async function listRecoverableLiveSessions(seasonId) {
  if (isOffline()) return [];

  const { data, error } = await supabase
    .from("matches")
    .select("id,season,date,opponent,gazal_side,status,created_at,updated_at")
    .eq("season", seasonId)
    .eq("status", "live")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

function normaliseRemoteEvent(event) {
  return {
    ...event,
    player_id: event.player_id == null ? null : String(event.player_id),
    related_player_id:
      event.related_player_id == null ? null : String(event.related_player_id),
  };
}

export async function loadRemoteLiveSession(matchId) {
  if (!matchId) throw new Error("Falta el partido Live que se quiere recuperar.");
  if (isOffline()) throw new Error("No hay conexión para recuperar el partido desde Supabase.");

  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select("id,season,date,opponent,gazal_side,status,created_at,updated_at")
    .eq("id", matchId)
    .eq("status", "live")
    .single();
  if (matchError) throw matchError;

  const [rosterResult, stateResult, eventsResult] = await Promise.all([
    supabase
      .from("game_roster")
      .select("match_id,player_id,jersey_number,player_name,sort_order,is_starter,is_active,played_ms")
      .eq("match_id", matchId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("live_game_state")
      .select("match_id,period,clock_ms,clock_running,period_duration_ms,overtime_duration_ms,updated_at")
      .eq("match_id", matchId)
      .maybeSingle(),
    supabase
      .from("game_events")
      .select("id,match_id,server_sequence,client_id,client_sequence,client_created_at,period,clock_ms,subject,event_type,player_id,related_player_id,staff_id,foul_kind,action_group_id,is_void,voided_at,void_reason,metadata,created_by,created_at,updated_at")
      .eq("match_id", matchId)
      .order("server_sequence", { ascending: true }),
  ]);

  if (rosterResult.error) throw rosterResult.error;
  if (stateResult.error) throw stateResult.error;
  if (eventsResult.error) throw eventsResult.error;

  const rosterRowsRemote = rosterResult.data || [];
  if (rosterRowsRemote.length < 5) {
    throw new Error("El partido remoto no tiene una convocatoria Live válida.");
  }

  const starterIds = rosterRowsRemote
    .filter((row) => row.is_starter)
    .map((row) => String(row.player_id));
  if (starterIds.length !== 5) {
    throw new Error("El partido remoto no tiene exactamente cinco titulares guardados.");
  }

  const remoteEvents = eventsResult.data || [];
  const remoteClientIds = [
    ...new Set(remoteEvents.map((event) => event.client_id).filter(Boolean)),
  ];
  if (remoteClientIds.length > 1) {
    throw new Error(
      "Este Live contiene eventos de varios clientes. No se recuperará automáticamente hasta implementar reconciliación multi-dispositivo."
    );
  }

  const roster = rosterRowsRemote.map((row) => ({
    id: String(row.player_id),
    databaseId: row.player_id,
    number: String(row.jersey_number),
    name: row.player_name,
  }));

  const playedMs = Object.fromEntries(
    rosterRowsRemote.map((row) => [
      String(row.player_id),
      Math.max(0, Number(row.played_ms || 0)),
    ])
  );

  const remoteState = stateResult.data;
  const period = Number(remoteState?.period || 1);
  const clockMs = Number.isFinite(remoteState?.clock_ms)
    ? remoteState.clock_ms
    : period <= 4
      ? LIVE_STATS_CONFIG.regulationPeriodMs
      : LIVE_STATS_CONFIG.overtimePeriodMs;

  return {
    setup: {
      matchId: match.id,
      seasonId: match.season,
      opponent: match.opponent,
      matchDate: match.date,
      gazalSide: match.gazal_side || "home",
      roster,
      starterIds,
      createdAt: match.created_at,
      recoveredAt: new Date().toISOString(),
    },
    resumeClientId: remoteClientIds[0] || null,
    events: remoteEvents.map(normaliseRemoteEvent),
    runtime: {
      period,
      clockMs: Math.max(0, Number(clockMs || 0)),
      clockRunning: false,
      playedMs,
      savedAt: remoteState?.updated_at || new Date().toISOString(),
      recoveredFromSupabase: true,
    },
  };
}
