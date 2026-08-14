const SETUP_KEY = "gazalbide.live.setup.v1";
const EVENTS_KEY = "gazalbide.live.events.v1";

export function saveLiveSetup(setup) {
  localStorage.setItem(SETUP_KEY, JSON.stringify(setup));
  localStorage.removeItem(EVENTS_KEY);
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

export function clearLiveSession() {
  localStorage.removeItem(SETUP_KEY);
  localStorage.removeItem(EVENTS_KEY);
}
