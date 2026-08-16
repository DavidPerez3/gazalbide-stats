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
  // No usamos un embed PostgREST season_staff -> staff_members. En producción
  // existe una relación que PostgREST puede resolver como ambigua según su
  // schema cache; dos consultas explícitas son más robustas y dejan claro qué
  // FK estamos usando.
  const { data: memberships, error: membershipError } = await supabase
    .from("season_staff")
    .select("season_id,staff_id,role,active,fantasy_enabled,sort_order")
    .eq("season_id", seasonId)
    .order("active", { ascending: false })
    .order("sort_order", { ascending: true });
  if (membershipError) throw membershipError;
  if (!memberships?.length) return [];

  const staffIds = [...new Set(memberships.map((row) => row.staff_id).filter(Boolean))];
  const { data: staffRows, error: staffError } = await supabase
    .from("staff_members")
    .select("id,code,name,photo_path")
    .in("id", staffIds);
  if (staffError) throw staffError;

  const staffMap = new Map((staffRows || []).map((row) => [String(row.id), row]));
  return memberships
    .map((row) => {
      const member = staffMap.get(String(row.staff_id));
      if (!member) return null;
      return {
        id: member.id,
        code: member.code || "",
        name: member.name || "",
        photo_path: member.photo_path || null,
        photo_url: resolveStaffPhotoSrc(member),
        role: row.role || "coach",
        active: row.active !== false,
        fantasy_enabled: row.fantasy_enabled !== false,
        sort_order: row.sort_order ?? 0,
      };
    })
    .filter(Boolean);
}

export async function getReusableStaff(seasonId) {
  // "Reutilizar histórico" debe mostrar únicamente personas que hayan formado
  // parte de otra temporada y que todavía no estén dadas de alta en la actual.
  const [{ data: historicalMemberships, error: historicalError }, { data: currentMemberships, error: currentError }] =
    await Promise.all([
      supabase
        .from("season_staff")
        .select("season_id,staff_id")
        .neq("season_id", seasonId),
      supabase
        .from("season_staff")
        .select("staff_id")
        .eq("season_id", seasonId),
    ]);
  if (historicalError) throw historicalError;
  if (currentError) throw currentError;

  const currentIds = new Set((currentMemberships || []).map((row) => String(row.staff_id)));
  const historicalByStaff = new Map();
  for (const row of historicalMemberships || []) {
    if (!row.staff_id || currentIds.has(String(row.staff_id))) continue;
    const entry = historicalByStaff.get(String(row.staff_id)) || {
      staffId: row.staff_id,
      seasons: [],
    };
    if (row.season_id && !entry.seasons.includes(row.season_id)) entry.seasons.push(row.season_id);
    historicalByStaff.set(String(row.staff_id), entry);
  }

  const staffIds = Array.from(historicalByStaff.values()).map((row) => row.staffId);
  if (!staffIds.length) return [];

  const { data: allStaff, error: staffError } = await supabase
    .from("staff_members")
    .select("id,code,name,photo_path")
    .in("id", staffIds)
    .order("name");
  if (staffError) throw staffError;

  return (allStaff || []).map((row) => ({
    ...row,
    seasons: historicalByStaff.get(String(row.id))?.seasons?.sort() || [],
    photo_url: resolveStaffPhotoSrc(row),
  }));
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
