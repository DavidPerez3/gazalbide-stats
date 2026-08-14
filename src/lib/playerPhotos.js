import { supabase } from "./supabaseClient.js";

export const PLAYER_PHOTO_BUCKET = "player-photos";
export const PLAYER_PHOTO_PIXELS = 512;

function isExternalUrl(value) {
  return /^(https?:|data:|blob:)/i.test(value);
}

export function resolvePlayerPhotoSrc(player) {
  const raw = String(
    player?.photo_url || player?.photo_path || player?.image || ""
  ).trim();

  if (!raw) return null;
  if (isExternalUrl(raw)) return raw;

  // Legacy 2025-2026 images already shipped with the PWA.
  if (/^\/?images\//i.test(raw)) {
    return `${import.meta.env.BASE_URL}${raw.replace(/^\/+/, "")}`;
  }

  const storagePath = raw
    .replace(new RegExp(`^${PLAYER_PHOTO_BUCKET}/`, "i"), "")
    .replace(/^\/+/, "");

  if (!storagePath) return null;

  const { data } = supabase.storage
    .from(PLAYER_PHOTO_BUCKET)
    .getPublicUrl(storagePath);

  return data?.publicUrl || null;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("No se ha podido leer la imagen seleccionada."));
    };
    image.src = objectUrl;
  });
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("No se ha podido preparar la foto."));
      },
      "image/webp",
      0.86
    );
  });
}

/**
 * Normalises every uploaded profile photo to a centred 512x512 WebP.
 * This keeps Storage predictable and prevents cards from depending on
 * arbitrary camera/image dimensions.
 */
export async function preparePlayerPhoto(file) {
  if (!file) return null;
  if (!String(file.type || "").startsWith("image/")) {
    throw new Error("Selecciona un archivo de imagen.");
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new Error("La imagen no puede superar 12 MB.");
  }

  const image = await loadImage(file);
  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
  const sx = Math.max(0, (image.naturalWidth - sourceSize) / 2);
  const sy = Math.max(0, (image.naturalHeight - sourceSize) / 2);

  const canvas = document.createElement("canvas");
  canvas.width = PLAYER_PHOTO_PIXELS;
  canvas.height = PLAYER_PHOTO_PIXELS;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("El navegador no permite procesar la imagen.");

  context.drawImage(
    image,
    sx,
    sy,
    sourceSize,
    sourceSize,
    0,
    0,
    PLAYER_PHOTO_PIXELS,
    PLAYER_PHOTO_PIXELS
  );

  const blob = await canvasToBlob(canvas);
  return new File([blob], "profile.webp", { type: "image/webp" });
}

export async function uploadPlayerPhoto(playerId, file) {
  if (!playerId || !file) return null;

  const prepared = await preparePlayerPhoto(file);
  const path = `${playerId}/profile.webp`;

  const { error } = await supabase.storage
    .from(PLAYER_PHOTO_BUCKET)
    .upload(path, prepared, {
      cacheControl: "3600",
      contentType: "image/webp",
      upsert: true,
    });

  if (error) throw error;
  return path;
}

export async function removePlayerPhoto(photoPath) {
  const raw = String(photoPath || "").trim();
  if (!raw || /^\/?images\//i.test(raw) || isExternalUrl(raw)) return;

  const path = raw
    .replace(new RegExp(`^${PLAYER_PHOTO_BUCKET}/`, "i"), "")
    .replace(/^\/+/, "");

  if (!path) return;
  const { error } = await supabase.storage.from(PLAYER_PHOTO_BUCKET).remove([path]);
  if (error) throw error;
}
