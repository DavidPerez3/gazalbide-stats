import { supabase } from "./supabaseClient.js";
import { removeStaffPhoto, resolveStaffPhotoSrc, uploadStaffPhoto } from "./staffPhotos.js";

function baseCode(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "staff";
}

async function uniqueCode(name) {
  const base = baseCode(name);
  const { data, error } = await supabase
    .from("staff_members")
    .select("code")
    .like("code", `${base}%`);
  if (error) throw error;
  const used = new Set((data || []).map((row) => row.code));
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

export async function getAdminSeasonStaff(seasonId) {
  const { data, error } = await supabase
    .from("season_staff")
    .select("season_id,role,active,fantasy_enabled,sort_order,staff:staff_members(id,code,name,photo_path)")
    .eq("season_id", seasonId)
    .order("active", { ascending: false })
    .order("sort_order", { ascending: true });
  if (error) throw error;

  return (data || []).map((row) => ({
    id: row.staff?.id,
    code: row.staff?.code || "",
    name: row.staff?.name || "",
    photo_path: row.staff?.photo_path || null,
    photo_url: resolveStaffPhotoSrc(row.staff),
    role: row.role || "coach",
    active: row.active !== false,
    fantasy_enabled: row.fantasy_enabled !== false,
    sort_order: row.sort_order ?? 0,
  }));
}

export async function getReusableStaff(seasonId) {
  const [{ data: allStaff, error: staffError }, { data: memberships, error: membershipError }] =
    await Promise.all([
      supabase.from("staff_members").select("id,code,name,photo_path").order("name"),
      supabase.from("season_staff").select("staff_id").eq("season_id", seasonId),
    ]);
  if (staffError) throw staffError;
  if (membershipError) throw membershipError;

  const inSeason = new Set((memberships || []).map((row) => String(row.staff_id)));
  return (allStaff || [])
    .filter((row) => !inSeason.has(String(row.id)))
    .map((row) => ({ ...row, photo_url: resolveStaffPhotoSrc(row) }));
}

async function savePhoto(staffId, file, previousPhotoPath = null) {
  if (!file) return null;
  const photoPath = await uploadStaffPhoto(staffId, file);
  const { error } = await supabase
    .from("staff_members")
    .update({ photo_path: photoPath, updated_at: new Date().toISOString() })
    .eq("id", staffId);
  if (error) throw error;

  if (previousPhotoPath && previousPhotoPath !== photoPath) {
    try {
      await removeStaffPhoto(previousPhotoPath);
    } catch (cleanupError) {
      console.warn("No se pudo eliminar la foto anterior del staff:", cleanupError);
    }
  }
  return photoPath;
}

export async function addSeasonStaff({
  seasonId,
  name,
  reuseStaffId = null,
  photoFile = null,
  fantasyEnabled = true,
}) {
  const cleanName = String(name || "").trim();
  if (!reuseStaffId && !cleanName) throw new Error("El nombre es obligatorio.");

  let staffId = reuseStaffId;
  let created = false;
  if (!staffId) {
    const code = await uniqueCode(cleanName);
    const { data, error } = await supabase
      .from("staff_members")
      .insert({ code, name: cleanName })
      .select("id")
      .single();
    if (error) throw error;
    staffId = data.id;
    created = true;
  }

  const { data: existing } = await supabase
    .from("season_staff")
    .select("staff_id")
    .eq("season_id", seasonId)
    .eq("staff_id", staffId)
    .maybeSingle();
  if (existing) throw new Error("Ese miembro del staff ya está en la temporada actual.");

  const { count, error: countError } = await supabase
    .from("season_staff")
    .select("staff_id", { count: "exact", head: true })
    .eq("season_id", seasonId);
  if (countError) throw countError;

  const { error: membershipError } = await supabase.from("season_staff").insert({
    season_id: seasonId,
    staff_id: staffId,
    role: "coach",
    active: true,
    fantasy_enabled: Boolean(fantasyEnabled),
    sort_order: count || 0,
  });
  if (membershipError) {
    if (created) await supabase.from("staff_members").delete().eq("id", staffId);
    throw membershipError;
  }

  if (photoFile) await savePhoto(staffId, photoFile);
  return staffId;
}

export async function updateSeasonStaff({
  seasonId,
  staffId,
  name,
  active,
  fantasyEnabled,
  photoFile = null,
  removePhoto = false,
  previousPhotoPath = null,
}) {
  const cleanName = String(name || "").trim();
  if (!cleanName) throw new Error("El nombre es obligatorio.");

  const { error: staffError } = await supabase
    .from("staff_members")
    .update({ name: cleanName, updated_at: new Date().toISOString() })
    .eq("id", staffId);
  if (staffError) throw staffError;

  const { error: membershipError } = await supabase
    .from("season_staff")
    .update({
      active: Boolean(active),
      fantasy_enabled: Boolean(fantasyEnabled),
      updated_at: new Date().toISOString(),
    })
    .eq("season_id", seasonId)
    .eq("staff_id", staffId);
  if (membershipError) throw membershipError;

  if (removePhoto) {
    await removeStaffPhoto(previousPhotoPath);
    const { error } = await supabase
      .from("staff_members")
      .update({ photo_path: null, updated_at: new Date().toISOString() })
      .eq("id", staffId);
    if (error) throw error;
  } else if (photoFile) {
    await savePhoto(staffId, photoFile, previousPhotoPath);
  }
}
