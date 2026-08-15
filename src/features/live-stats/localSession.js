const SETUP_KEY = "gazalbide.live.setup.v1";
const EVENTS_KEY = "gazalbide.live.events.v1";
const RUNTIME_KEY = "gazalbide.live.runtime.v1";
const IDENTITY_KEY = "gazalbide.live.identity.v1";
const CLIENT_KEY = "gazalbide.live.client.v1";

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

function getNextSequenceFromEvents(events) {
  const maxSequence = (Array.isArray(events) ? events : []).reduce(
    (max, event) => Math.max(max, Number(event?.client_sequence || 0)),
    0
  );
  return maxSequence + 1;
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
    getNextSequenceFromEvents(events)
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

function normaliseEventsForSave(events, identity) {
  if (!Array.isArray(events)) return [];
  if (!identity) return events;

  let nextClientSequence = Math.max(1, Number(identity.nextClientSequence || 1));

  const normalised = events.map((event) => {
    const belongsToCurrentClient =
      event.match_id === identity.matchId &&
      event.client_id === identity.clientId &&
      Number(event.client_sequence || 0) > 0;

    const clientSequence = belongsToCurrentClient
      ? Number(event.client_sequence)
      : nextClientSequence++;

    const nextEvent = {
      ...event,
      match_id: identity.matchId,
      client_id: identity.clientId,
      client_sequence: clientSequence,
    };

    // Existing callers keep the same event objects in React state. Mutating the
    // object here keeps that in-memory state aligned with the canonical local
    // copy without forcing every event producer to duplicate identity logic.
    Object.assign(event, nextEvent);
    return event;
  });

  const inferredNext = getNextSequenceFromEvents(normalised);
  persistIdentity({
    ...identity,
    nextClientSequence: Math.max(nextClientSequence, inferredNext),
  });

  return normalised;
}

export function saveLiveSetup(setup) {
  const clientId = setup?.clientId || getOrCreateClientId();
  const matchId = setup?.matchId || crypto.randomUUID();
  const enrichedSetup = { ...setup, matchId, clientId };

  localStorage.setItem(SETUP_KEY, JSON.stringify(enrichedSetup));
  localStorage.removeItem(EVENTS_KEY);
  localStorage.removeItem(RUNTIME_KEY);
  persistIdentity({ matchId, clientId, nextClientSequence: 1 });

  return enrichedSetup;
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
  const identity = getLiveSessionIdentity();
  const normalised = normaliseEventsForSave(events, identity);
  localStorage.setItem(EVENTS_KEY, JSON.stringify(normalised));
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
      playedMs,
      savedAt: new Date().toISOString(),
    })
  );
}

export function loadLiveRuntime() {
  const value = readJson(RUNTIME_KEY, null);
  return value && typeof value === "object" ? value : null;
}

export function clearLiveSession() {
  localStorage.removeItem(SETUP_KEY);
  localStorage.removeItem(EVENTS_KEY);
  localStorage.removeItem(RUNTIME_KEY);
  localStorage.removeItem(IDENTITY_KEY);
}
