import { getPlayersFromSupabase } from "../../lib/statsRepository.js";

const SETUP_KEY = "gazalbide.live.setup.v1";
const EVENTS_KEY = "gazalbide.live.events.v1";
const RUNTIME_KEY = "gazalbide.live.runtime.v1";
const SYNC_PENDING_KEY = "gazalbide.live.sync-pending.v1";

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function normaliseName(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normaliseNumber(value) {
  return String(value ?? "").trim().replace(/^#/, "");
}

function numericPlayerId(value) {
  if (value == null || value === "") return null;
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function findCanonicalPlayer(player, canonical) {
  const jersey = normaliseNumber(player?.number ?? player?.jersey_number);
  const name = normaliseName(player?.name ?? player?.player_name);

  const exact = canonical.filter(
    (candidate) =>
      normaliseNumber(candidate.number) === jersey &&
      normaliseName(candidate.name) === name
  );
  if (exact.length === 1) return exact[0];

  const byJersey = canonical.filter(
    (candidate) => normaliseNumber(candidate.number) === jersey
  );
  if (byJersey.length === 1) return byJersey[0];

  const byName = canonical.filter(
    (candidate) => normaliseName(candidate.name) === name
  );
  if (byName.length === 1) return byName[0];

  return null;
}

function remapEvent(event, idMap) {
  if (!event || typeof event !== "object") return event;
  const playerId = event.player_id == null
    ? null
    : idMap.get(String(event.player_id)) || event.player_id;
  const relatedPlayerId = event.related_player_id == null
    ? null
    : idMap.get(String(event.related_player_id)) || event.related_player_id;
  return {
    ...event,
    player_id: playerId,
    related_player_id: relatedPlayerId,
  };
}

function remapRuntime(runtime, idMap) {
  if (!runtime || typeof runtime !== "object") return runtime;
  const playedMs = Object.fromEntries(
    Object.entries(runtime.playedMs || {}).map(([id, value]) => [
      idMap.get(String(id)) || id,
      value,
    ])
  );
  return { ...runtime, playedMs };
}

export async function repairLocalLiveRosterIds(setupInput = null) {
  const persisted = readJson(SETUP_KEY, setupInput);
  const setup = persisted && typeof persisted === "object" ? persisted : setupInput;
  if (!setup?.seasonId || !Array.isArray(setup.roster) || setup.roster.length === 0) {
    return { changed: false, setup };
  }

  const unresolved = setup.roster.filter(
    (player) =>
      numericPlayerId(player?.databaseId) == null ||
      numericPlayerId(player?.id) == null
  );
  if (!unresolved.length) return { changed: false, setup };

  const canonical = await getPlayersFromSupabase(setup.seasonId);
  if (!Array.isArray(canonical) || canonical.length === 0) {
    throw new Error("No se puede reparar el Live: la plantilla canónica de Supabase está vacía.");
  }

  const idMap = new Map();
  const nextRoster = setup.roster.map((player) => {
    const currentDatabaseId = numericPlayerId(player?.databaseId);
    const currentLocalId = numericPlayerId(player?.id);
    if (currentDatabaseId != null && currentLocalId != null) {
      return { ...player, databaseId: currentDatabaseId, id: String(currentLocalId) };
    }

    const match = findCanonicalPlayer(player, canonical);
    if (!match?.id) {
      throw new Error(
        `No se puede reparar el Live: no se ha encontrado en Supabase a ${player?.name || "un jugador"} (#${player?.number || "?"}).`
      );
    }

    const canonicalId = String(match.id);
    idMap.set(String(player.id), canonicalId);
    if (player.databaseId != null) idMap.set(String(player.databaseId), canonicalId);

    return {
      ...player,
      id: canonicalId,
      databaseId: Number(match.id),
      number: String(match.number ?? player.number ?? ""),
      name: match.name || player.name,
    };
  });

  if (!idMap.size) return { changed: false, setup };

  const nextSetup = {
    ...setup,
    roster: nextRoster,
    starterIds: (setup.starterIds || []).map(
      (id) => idMap.get(String(id)) || String(id)
    ),
    rosterIdsRepairedAt: new Date().toISOString(),
  };

  const events = readJson(EVENTS_KEY, []);
  const runtime = readJson(RUNTIME_KEY, null);
  localStorage.setItem(SETUP_KEY, JSON.stringify(nextSetup));
  if (Array.isArray(events)) {
    localStorage.setItem(
      EVENTS_KEY,
      JSON.stringify(events.map((event) => remapEvent(event, idMap)))
    );
  }
  if (runtime) {
    localStorage.setItem(RUNTIME_KEY, JSON.stringify(remapRuntime(runtime, idMap)));
  }
  localStorage.setItem(SYNC_PENDING_KEY, "1");

  return { changed: true, setup: nextSetup, mappedPlayers: idMap.size };
}
