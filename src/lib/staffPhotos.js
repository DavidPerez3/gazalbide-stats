import { supabase } from "./supabaseClient.js";
import { preparePlayerPhoto } from "./playerPhotos.js";

export const STAFF_PHOTO_BUCKET = "staff-photos";

function isExternalUrl(value) {
  return /^(https?:|data:|blob:)/i.test(value);
}

function bundledStaffImageUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const base = String(import.meta.env.BASE_URL || "/");
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;

  // Ruta legacy guardada en BD, por ejemplo /images/coaches/david.png.
  if (/^\/?images\//i.test(raw)) {
    return `${normalizedBase}${raw.replace(/^\/+/, "")}`;
  }

  // El resolver puede recibir de nuevo una URL local que él mismo resolvió
  // previamente (p. ej. /gazalbide-stats/images/coaches/david.png). Debe ser
  // idempotente: no convertirla por error en una ruta de Supabase Storage.
  if (
    raw.startsWith(normalizedBase) &&
    /^images\//i.test(raw.slice(normalizedBase.length))
  ) {
    return raw;
  }

  return null;
}

export function resolveStaffPhotoSrc(staff) {
  const raw = String(staff?.photo_url || staff?.photo_path || staff?.image || "").trim();
  if (!raw) return null;
  if (isExternalUrl(raw)) return raw;

  const bundledUrl = bundledStaffImageUrl(raw);
  if (bundledUrl) return bundledUrl;

  const storagePath = raw
    .replace(new RegExp(`^${STAFF_PHOTO_BUCKET}/`, "i"), "")
    .replace(/^\/+/, "");
  if (!storagePath) return null;

  const { data } = supabase.storage.from(STAFF_PHOTO_BUCKET).getPublicUrl(storagePath);
  return data?.publicUrl || null;
}

export async function uploadStaffPhoto(staffId, file) {
  if (!staffId || !file) return null;
  const prepared = await preparePlayerPhoto(file);
  const path = `${staffId}/profile-${Date.now()}.webp`;
  const { error } = await supabase.storage.from(STAFF_PHOTO_BUCKET).upload(path, prepared, {
    cacheControl: "31536000",
    contentType: "image/webp",
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function removeStaffPhoto(photoPath) {
  const raw = String(photoPath || "").trim();
  if (!raw || bundledStaffImageUrl(raw) || isExternalUrl(raw)) return;

  const path = raw
    .replace(new RegExp(`^${STAFF_PHOTO_BUCKET}/`, "i"), "")
    .replace(/^\/+/, "");
  if (!path) return;
  const { error } = await supabase.storage.from(STAFF_PHOTO_BUCKET).remove([path]);
  if (error) throw error;
}
