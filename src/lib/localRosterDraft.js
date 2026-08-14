import { preparePlayerPhoto } from "./playerPhotos.js";

const STORAGE_KEY = "gazalbide.rosterDraft.2026-2027";

function readRaw() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRaw(players) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(players));
  window.dispatchEvent(new CustomEvent("gazalbide:roster-draft-changed"));
  return players;
}

function jerseySort(value) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) ? parsed : 999;
}

function sortRoster(players) {
  return [...players].sort((a, b) => {
    const byNumber = jerseySort(a.number) - jerseySort(b.number);
    if (byNumber !== 0) return byNumber;
    return String(a.name || "").localeCompare(String(b.name || ""), "es");
  });
}

function assertUniqueJersey(players, jersey, ignoreId = null) {
  const clean = String(jersey || "").trim();
  if (!clean) throw new Error("El dorsal es obligatorio.");
  const duplicate = players.some(
    (player) => String(player.id) !== String(ignoreId) && String(player.number) === clean
  );
  if (duplicate) {
    const error = new Error("Ese dorsal ya está asignado a otro jugador en esta temporada.");
    error.code = "23505";
    throw error;
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("No se ha podido guardar la foto localmente."));
    reader.readAsDataURL(file);
  });
}

async function photoDataUrlFromFile(file) {
  if (!file) return null;
  const prepared = await preparePlayerPhoto(file);
  return fileToDataUrl(prepared);
}

export function getLocalRosterDraft({ includeInactive = true } = {}) {
  const players = readRaw().map((player) => ({ ...player, source: "local-draft" }));
  return sortRoster(includeInactive ? players : players.filter((player) => player.active !== false));
}

export function hasLocalRosterDraft() {
  return readRaw().length > 0;
}

export async function addLocalRosterDraftPlayer({ name, jerseyNumber, historicalPlayer = null, photoFile = null }) {
  const players = readRaw();
  const cleanName = String(name || historicalPlayer?.name || "").trim();
  const cleanJersey = String(jerseyNumber || "").trim();
  if (!cleanName) throw new Error("El nombre es obligatorio.");
  assertUniqueJersey(players, cleanJersey);

  const uploadedPhoto = await photoDataUrlFromFile(photoFile);
  const photo = uploadedPhoto || historicalPlayer?.photo_path || historicalPlayer?.image || null;
  const id = `draft:${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`}`;

  players.push({
    id,
    name: cleanName,
    number: cleanJersey,
    active: true,
    photo_path: photo,
    historical_name: historicalPlayer?.name || null,
    historical_number: historicalPlayer?.number ?? null,
    pending_sync: true,
    created_at: new Date().toISOString(),
  });

  writeRaw(sortRoster(players));
  return id;
}

export async function updateLocalRosterDraftPlayer({ playerId, name, jerseyNumber, photoFile = null, removePhoto = false }) {
  const players = readRaw();
  const index = players.findIndex((player) => String(player.id) === String(playerId));
  if (index < 0) throw new Error("No se ha encontrado el jugador del borrador local.");

  const cleanName = String(name || "").trim();
  const cleanJersey = String(jerseyNumber || "").trim();
  if (!cleanName) throw new Error("El nombre es obligatorio.");
  assertUniqueJersey(players, cleanJersey, playerId);

  let photoPath = players[index].photo_path || null;
  if (removePhoto) photoPath = null;
  if (photoFile) photoPath = await photoDataUrlFromFile(photoFile);

  players[index] = {
    ...players[index],
    name: cleanName,
    number: cleanJersey,
    photo_path: photoPath,
    pending_sync: true,
    updated_at: new Date().toISOString(),
  };
  writeRaw(sortRoster(players));
}

export function setLocalRosterDraftPlayerActive(playerId, active) {
  const players = readRaw();
  const index = players.findIndex((player) => String(player.id) === String(playerId));
  if (index < 0) throw new Error("No se ha encontrado el jugador del borrador local.");
  players[index] = {
    ...players[index],
    active: Boolean(active),
    pending_sync: true,
    updated_at: new Date().toISOString(),
  };
  writeRaw(players);
}

export function clearLocalRosterDraft() {
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent("gazalbide:roster-draft-changed"));
}

export async function localDraftPhotoToFile(photoPath) {
  if (!String(photoPath || "").startsWith("data:image/")) return null;
  const response = await fetch(photoPath);
  const blob = await response.blob();
  return new File([blob], "profile.webp", { type: blob.type || "image/webp" });
}
