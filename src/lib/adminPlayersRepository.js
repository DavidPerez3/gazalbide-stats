import { supabase } from "./supabaseClient.js";
import { removePlayerPhoto, uploadPlayerPhoto } from "./playerPhotos.js";

function sortOrderForJersey(value) {
  const number = Number.parseInt(String(value || "").trim(), 10);
  return Number.isFinite(number) ? number : 999;
}

export function isStatsSchemaMissing(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    message.includes("season_players") && message.includes("not") && message.includes("find")
  );
}

export async function getAdminSeasonRoster(seasonId) {
  const { data, error } = await supabase
    .from("season_players")
    .select("season_id,jersey_number,active,sort_order,player:players(id,name,number,photo_path)")
    .eq("season_id", seasonId)
    .order("active", { ascending: false })
    .order("sort_order", { ascending: true });

  if (error) throw error;

  return (data || []).map((row) => ({
    season_id: row.season_id,
    id: row.player?.id,
    name: row.player?.name || "",
    number: row.jersey_number,
    legacy_number: row.player?.number || null,
    photo_path: row.player?.photo_path || null,
    active: row.active !== false,
    sort_order: row.sort_order ?? 0,
  }));
}

export async function getReusablePlayers(seasonId) {
  const [{ data: players, error: playersError }, { data: memberships, error: membershipsError }] =
    await Promise.all([
      supabase.from("players").select("id,name,number,photo_path").order("name"),
      supabase.from("season_players").select("player_id").eq("season_id", seasonId),
    ]);

  if (playersError) throw playersError;
  if (membershipsError) throw membershipsError;

  const alreadyInSeason = new Set((memberships || []).map((row) => String(row.player_id)));
  return (players || [])
    .filter((player) => !alreadyInSeason.has(String(player.id)))
    .map((player) => ({
      id: player.id,
      name: player.name,
      number: player.number,
      photo_path: player.photo_path || null,
    }));
}

async function savePhoto(playerId, file) {
  if (!file) return null;
  const photoPath = await uploadPlayerPhoto(playerId, file);
  const { error } = await supabase
    .from("players")
    .update({ photo_path: photoPath, updated_at: new Date().toISOString() })
    .eq("id", playerId);
  if (error) throw error;
  return photoPath;
}

export async function addSeasonPlayer({
  seasonId,
  name,
  jerseyNumber,
  reusePlayerId = null,
  photoFile = null,
}) {
  const cleanName = String(name || "").trim();
  const cleanJersey = String(jerseyNumber || "").trim();
  if (!cleanJersey) throw new Error("El dorsal es obligatorio.");
  if (!reusePlayerId && !cleanName) throw new Error("El nombre es obligatorio.");

  let playerId = reusePlayerId;
  let createdPlayer = false;

  if (!playerId) {
    const { data, error } = await supabase
      .from("players")
      .insert({
        number: cleanJersey,
        name: cleanName,
        active: true,
        sort_order: sortOrderForJersey(cleanJersey),
      })
      .select("id")
      .single();
    if (error) throw error;
    playerId = data.id;
    createdPlayer = true;
  }

  const { error: membershipError } = await supabase.from("season_players").insert({
    season_id: seasonId,
    player_id: playerId,
    jersey_number: cleanJersey,
    active: true,
    sort_order: sortOrderForJersey(cleanJersey),
  });

  if (membershipError) {
    if (createdPlayer) {
      await supabase.from("players").delete().eq("id", playerId);
    }
    throw membershipError;
  }

  if (photoFile) await savePhoto(playerId, photoFile);
  return playerId;
}

export async function updateSeasonPlayer({
  seasonId,
  playerId,
  name,
  jerseyNumber,
  photoFile = null,
  removePhoto = false,
  previousPhotoPath = null,
}) {
  const cleanName = String(name || "").trim();
  const cleanJersey = String(jerseyNumber || "").trim();
  if (!cleanName) throw new Error("El nombre es obligatorio.");
  if (!cleanJersey) throw new Error("El dorsal es obligatorio.");

  const { error: playerError } = await supabase
    .from("players")
    .update({ name: cleanName, updated_at: new Date().toISOString() })
    .eq("id", playerId);
  if (playerError) throw playerError;

  const { error: membershipError } = await supabase
    .from("season_players")
    .update({
      jersey_number: cleanJersey,
      sort_order: sortOrderForJersey(cleanJersey),
      updated_at: new Date().toISOString(),
    })
    .eq("season_id", seasonId)
    .eq("player_id", playerId);
  if (membershipError) throw membershipError;

  if (removePhoto) {
    await removePlayerPhoto(previousPhotoPath);
    const { error } = await supabase
      .from("players")
      .update({ photo_path: null, updated_at: new Date().toISOString() })
      .eq("id", playerId);
    if (error) throw error;
  } else if (photoFile) {
    await savePhoto(playerId, photoFile);
  }
}

export async function setSeasonPlayerActive(seasonId, playerId, active) {
  const { error } = await supabase
    .from("season_players")
    .update({
      active: Boolean(active),
      updated_at: new Date().toISOString(),
    })
    .eq("season_id", seasonId)
    .eq("player_id", playerId);
  if (error) throw error;
}
