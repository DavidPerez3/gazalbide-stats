import { supabase } from "./supabaseClient.js";
import { preparePlayerPhoto } from "./playerPhotos.js";

export const STAFF_PHOTO_BUCKET = "staff-photos";

function isExternalUrl(value) {
  return /^(https?:|data:|blob:)/i.test(value);
}

export function resolveStaffPhotoSrc(staff) {
  const raw = String(staff?.photo_url || staff?.photo_path || staff?.image || "").trim();
  if (!raw) return null;
  if (isExternalUrl(raw)) return raw;

  if (/^\/?images\//i.test(raw)) {
    return `${import.meta.env.BASE_URL}${raw.replace(/^\/+/, "")}`;
  }

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
  if (!raw || /^\/?images\//i.test(raw) || isExternalUrl(raw)) return;

  const path = raw
    .replace(new RegExp(`^${STAFF_PHOTO_BUCKET}/`, "i"), "")
    .replace(/^\/+/, "");
  if (!path) return;
  const { error } = await supabase.storage.from(STAFF_PHOTO_BUCKET).remove([path]);
  if (error) throw error;
}
