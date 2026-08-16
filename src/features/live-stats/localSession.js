import {
  queueLiveSessionSync,
  queueLiveStateSync,
} from "./supabaseSync.js";

const SETUP_KEY = "gazalbide.live.setup.v1";
const EVENTS_KEY = "gazalbide.live.events.v1";
const RUNTIME_KEY = "gazalbide.live.runtime.v1";
const IDENTITY_KEY = "gazalbide.live.identity.v1";
const CLIENT_KEY = "gazalbide.live.client.v1";
const SYNC_PENDING_KEY = "gazalbide.live.sync-pending.v1";
const REMOTE_RUNTIME_INTERVAL_MS = 5000;

let lastRemoteRuntimeSyncAt = 0;

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function getOrCreateClientId() {
  const existing = localStorage.getItem(CLIENT_KEY);
  if (existing) return existing;

  const clientId = crypto.randomUUID();
  localStorage.setItem(CLIENT_KEY, clientId);
  return clientId;
}

function getNextSequenceFromEvents(events, clientId = null) {
  const maxSequence = (Array.isArray(events) ? events : []).reduce((max, event) => {
    if (clientId && event?.client_id && event.client_id !== clientId) return max;
    return Math.max(max, Number(event?.client_sequence || 0));
  }, 0);
  return maxSequence + 1;
}

function eventSyncVersion(events) {
  const list = Array.isArray(events) ? events : [];
  const maxSequence = list.reduce(
    (max, event) => Math.max(max, Number(event?.server_sequence || event?.client_sequence || 0)),
    0
  );
  const voidCount = list.filter((event) => event?.is_void).length;
  return `${list.length}:${maxSequence}:${voidCount}`;
}

function markSyncPending() {
  localStorage.setItem(SYNC_PENDING_KEY, "1");
}

function clearSyncPendingIfCurrent(version) {
  const current = readJson(EVENTS_KEY, []);
  if (eventSyncVersion(current) === version) {
    localStorage.removeItem(SYNC_PENDING_KEY);
  }
}

function hasSyncPending() {
  return localStorage.getItem(SYNC_PENDING_KEY) === "1";
}

function persistIdentity(identity) {
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
}

function ensureLiveSessionIdentity(setup) {
  if (!setup) return null;

  const events = readJson(EVENTS_KEY, []);
  const stored = readJson(IDENTITY_KEY, null);
  const matchId = stored?.matchId || setup.matchId || crypto.randomUUID();
  const clientId = stored?.clientId || setup.clientId || getOrCreateClientId();
  const nextClientSequence = Math.max(
    1,
    Number(stored?.nextClientSequence || 1),
    getNextSequenceFromEvents(events, clientId)
  );

  const identity = { matchId, clientId, nextClientSequence };
  persistIdentity(identity);

  if (setup.matchId !== matchId || setup.clientId !== clientId) {
    localStorage.setItem(
      SETUP_KEY,
      JSON.stringify({ ...setup, matchId, clientId })
    );
  }

  return identity;
}

function migrateStoredEvents(events, identity) {
  if (!Array.isArray(events)) return [];
  if (!identity) return events;

  return events.map((event, index) => ({
    ...event,
    match_id: event.match_id || identity.matchId,
    client_id: event.client_id || identity.clientId,
    client_sequence: Number(event.client_sequence || index + 1),
  }));
}

function preserveRemovedEventsAsVoided(events) {
  const incoming = Array.isArray(events) ? events : [];
  const previous = readJson(EVENTS_KEY, []);
  if (!Array.isArray(previous) || previous.length === 0) return incoming;

  const incomingIds = new Set(incoming.map((event) => event?.id).filter(Boolean));
  const removed = previous
    .filter((event) => event?.id && !incomingIds.has(event.id))
    .map((event) => event.is_void
      ? event
      : {
          ...event,
          is_void: true,
          voided_at: new Date().toISOString(),
          void_reason: "undo",
        });

  return [...incoming, ...removed];
}

function normaliseEventsForSave(events, identity) {
  if (!Array.isArray(events)) return [];
  if (!identity) return events;

  let nextClientSequence = Math.max(
    1,
    Number(identity.nextClientSequence || 1),
    getNextSequenceFromEvents(events, identity.clientId)
  );

  const normalised = events.map((event) => {
    const hasPersistentIdentity =
      event.match_id === identity.matchId &&
      Boolean(event.client_id) &&
      Number(event.client_sequence || 0) > 0;

    const nextEvent = hasPersistentIdentity
      ? { ...event }
      : {
          ...event,
          match_id: identity.matchId,
          client_id: identity.clientId,
          client_sequence: nextClientSequence++,
        };

    Object.assign(event, nextEvent);
    return event;
  });

  const inferredNext = getNextSequenceFromEvents(normalised, identity.clientId);
  persistIdentity({
    ...identity,
    nextClientSequence: Math.max(nextClientSequence, inferredNext),
  });

  return normalised;
}

function queuePendingEvents(setup, events, gameState = null) {
  if (!setup) return Promise.resolve({ ok: false, skipped: true });
  const version = eventSyncVersion(events);
  markSyncPending();

  return queueLiveSessionSync({ setup, events, gameState }).then((result) => {
    if (result?.ok) clearSyncPendingIfCurrent(version);
    return result;
  });
}

function runtimeToGameState(setup, runtime) {
  if (!setup || !runtime) return null;
  const players = Object.fromEntries(
    (setup.roster || []).map((player) => [
      String(player.id),
      {
        playedMs: Math.max(
          0,
          Number(runtime.playedMs?.[String(player.id)] ?? runtime.playedMs?.[player.id] ?? 0)
        ),
      },
    ])
  );

  return {
    period: Number(runtime.period || 1),
    clockMs: Math.max(0, Number(runtime.clockMs || 0)),
    clockRunning: Boolean(runtime.clockRunning),
    players,
  };
}

export function saveLiveSetup(setup) {
  const clientId = setup?.clientId || getOrCreateClientId();
  const matchId = setup?.matchId || crypto.randomUUID();
  const enrichedSetup = { ...setup, matchId, clientId };

  localStorage.setItem(SETUP_KEY, JSON.stringify(enrichedSetup));
  localStorage.removeItem(EVENTS_KEY);
  localStorage.removeItem(RUNTIME_KEY);
  localStorage.removeItem(SYNC_PENDING_KEY);
  persistIdentity({ matchId, clientId, nextClientSequence: 1 });

  void queuePendingEvents(enrichedSetup, []);
  return enrichedSetup;
}

export function restoreLiveSessionFromRemote(snapshot) {
  if (!snapshot?.setup?.matchId) {
    throw new Error("La sesión remota no contiene un matchId válido.");
  }

  const clientId = snapshot.resumeClientId || getOrCreateClientId();
  const setup = {
    ...snapshot.setup,
    clientId,
    recoveredAt: new Date().toISOString(),
  };
  const events = Array.isArray(snapshot.events) ? snapshot.events : [];
  const runtime = snapshot.runtime && typeof snapshot.runtime === "object"
    ? { ...snapshot.runtime, clockRunning: false }
    : null;

  localStorage.setItem(SETUP_KEY, JSON.stringify(setup));
  localStorage.setItem(EVENTS_KEY, JSON.stringify(events));
  if (runtime) localStorage.setItem(RUNTIME_KEY, JSON.stringify(runtime));
  else localStorage.removeItem(RUNTIME_KEY);
  localStorage.removeItem(SYNC_PENDING_KEY);

  persistIdentity({
    matchId: setup.matchId,
    clientId,
    nextClientSequence: getNextSequenceFromEvents(events, clientId),
  });
  lastRemoteRuntimeSyncAt = Date.now();

  return setup;
}

export function loadLiveSetup() {
  const setup = readJson(SETUP_KEY, null);
  if (!setup || typeof setup !== "object") return null;

  const identity = ensureLiveSessionIdentity(setup);
  return {
    ...setup,
    matchId: identity.matchId,
    clientId: identity.clientId,
  };
}

export function getLiveSessionIdentity() {
  const setup = readJson(SETUP_KEY, null);
  return ensureLiveSessionIdentity(setup);
}

export function allocateLiveEventIdentity() {
  const identity = getLiveSessionIdentity();
  if (!identity) {
    throw new Error("No hay una sesión Live preparada para registrar eventos.");
  }

  const eventIdentity = {
    matchId: identity.matchId,
    clientId: identity.clientId,
    clientSequence: identity.nextClientSequence,
  };

  persistIdentity({
    ...identity,
    nextClientSequence: identity.nextClientSequence + 1,
  });

  return eventIdentity;
}

export function saveLiveEvents(events) {
  const setup = loadLiveSetup();
  const identity = ensureLiveSessionIdentity(setup);
  const withVoids = preserveRemovedEventsAsVoided(events);
  const normalised = normaliseEventsForSave(withVoids, identity);

  localStorage.setItem(EVENTS_KEY, JSON.stringify(normalised));
  void queuePendingEvents(setup, normalised);
  return normalised;
}

export function loadLiveEvents() {
  const value = readJson(EVENTS_KEY, []);
  if (!Array.isArray(value)) return [];

  const setup = readJson(SETUP_KEY, null);
  const identity = ensureLiveSessionIdentity(setup);
  const migrated = migrateStoredEvents(value, identity);

  if (identity && JSON.stringify(migrated) !== JSON.stringify(value)) {
    localStorage.setItem(EVENTS_KEY, JSON.stringify(migrated));
    markSyncPending();
  }

  return migrated;
}

export function saveLiveRuntime(state) {
  if (!state) return;
  const playedMs = Object.fromEntries(
    Object.entries(state.players || {}).map(([id, player]) => [id, Math.max(0, Number(player.playedMs || 0))])
  );
  localStorage.setItem(
    RUNTIME_KEY,
    JSON.stringify({
      period: state.period,
      clockMs: state.clockMs,
      clockRunning: Boolean(state.clockRunning),
      playedMs,
      savedAt: new Date().toISOString(),
    })
  );

  const setup = loadLiveSetup();
  if (!setup) return;

  const now = Date.now();
  const shouldCheckpoint =
    !state.clockRunning || now - lastRemoteRuntimeSyncAt >= REMOTE_RUNTIME_INTERVAL_MS;
  if (!shouldCheckpoint) return;

  lastRemoteRuntimeSyncAt = now;
  if (hasSyncPending()) {
    const pendingEvents = readJson(EVENTS_KEY, []);
    void queuePendingEvents(setup, pendingEvents, state);
  } else {
    void queueLiveStateSync({ setup, gameState: state });
  }
}

export function loadLiveRuntime() {
  const value = readJson(RUNTIME_KEY, null);
  return value && typeof value === "object" ? value : null;
}

export function retryPendingLiveSync() {
  if (!hasSyncPending()) return Promise.resolve({ ok: true, skipped: true });

  const setup = loadLiveSetup();
  if (!setup) return Promise.resolve({ ok: false, skipped: true });

  const events = readJson(EVENTS_KEY, []);
  const runtime = loadLiveRuntime();
  const gameState = runtimeToGameState(setup, runtime);
  lastRemoteRuntimeSyncAt = Date.now();
  return queuePendingEvents(setup, events, gameState);
}

export function clearLiveSession() {
  localStorage.removeItem(SETUP_KEY);
  localStorage.removeItem(EVENTS_KEY);
  localStorage.removeItem(RUNTIME_KEY);
  localStorage.removeItem(IDENTITY_KEY);
  localStorage.removeItem(SYNC_PENDING_KEY);
}
