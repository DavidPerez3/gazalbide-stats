const SETUP_KEY = "gazalbide.live.setup.v1";
const EVENTS_KEY = "gazalbide.live.events.v1";
const RUNTIME_KEY = "gazalbide.live.runtime.v1";

export function saveLiveSetup(setup) {
  localStorage.setItem(SETUP_KEY, JSON.stringify(setup));
  localStorage.removeItem(EVENTS_KEY);
  localStorage.removeItem(RUNTIME_KEY);
}

export function loadLiveSetup() {
  try {
    return JSON.parse(localStorage.getItem(SETUP_KEY) || "null");
  } catch {
    return null;
  }
}

export function saveLiveEvents(events) {
  localStorage.setItem(EVENTS_KEY, JSON.stringify(events));
}

export function loadLiveEvents() {
  try {
    const value = JSON.parse(localStorage.getItem(EVENTS_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
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
  try {
    const value = JSON.parse(localStorage.getItem(RUNTIME_KEY) || "null");
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

export function clearLiveSession() {
  localStorage.removeItem(SETUP_KEY);
  localStorage.removeItem(EVENTS_KEY);
  localStorage.removeItem(RUNTIME_KEY);
}
