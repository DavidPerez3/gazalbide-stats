import { supabase } from "../../lib/supabaseClient.js";
import {
  loadLiveEvents,
  loadLiveRuntime,
  loadLiveSetup,
} from "./localSession.js";
import { queueLiveSessionSync } from "./supabaseSync.js";

function runtimeGameState(setup, runtime) {
  if (!setup || !runtime) return null;
  const players = Object.fromEntries(
    (setup.roster || []).map((player) => [
      String(player.id),
      {
        playedMs: Math.max(
          0,
          Number(
            runtime.playedMs?.[String(player.id)] ??
            runtime.playedMs?.[player.id] ??
            0
          )
        ),
      },
    ])
  );

  return {
    period: Number(runtime.period || 1),
    clockMs: Math.max(0, Number(runtime.clockMs || 0)),
    clockRunning: Boolean(runtime.clockRunning),
    players,
  };
}

export async function flushLiveForPublication() {
  const setup = loadLiveSetup();
  const runtime = loadLiveRuntime();
  if (!setup || !runtime) {
    throw new Error("No hay una sesión Live completa para sincronizar.");
  }

  const result = await queueLiveSessionSync({
    setup,
    events: loadLiveEvents(),
    gameState: runtimeGameState(setup, runtime),
  });

  if (!result?.ok) {
    throw new Error(
      result?.offline
        ? "No hay conexión. La publicación necesita sincronizar el Live con Supabase."
        : "No se pudo sincronizar el Live antes de publicar."
    );
  }
  return result;
}

export async function getRemoteLiveSourceToken(matchId) {
  const { data, error } = await supabase.rpc("live_match_source_token", {
    p_match_id: matchId,
  });
  if (error) throw error;
  if (!data) throw new Error("Supabase no devolvió una huella válida del Live.");
  return data;
}

export async function publishLiveReview(publicationDraft) {
  if (!publicationDraft?.matchId) {
    throw new Error("Falta el partido que se quiere publicar.");
  }

  await flushLiveForPublication();
  const sourceToken = await getRemoteLiveSourceToken(publicationDraft.matchId);

  const { data, error } = await supabase.rpc("publish_live_match", {
    p_match_id: publicationDraft.matchId,
    p_expected_source_token: sourceToken,
    p_publication: publicationDraft,
  });
  if (error) throw error;
  return data;
}

export async function listPublishedLiveMatches(seasonId) {
  const { data, error } = await supabase
    .from("matches")
    .select(
      "id,season,date,opponent,gazal_side,status,publication_version,published_at,gazal_pts,opp_pts"
    )
    .eq("season", seasonId)
    .eq("status", "published")
    .gt("publication_version", 0)
    .order("date", { ascending: false })
    .order("published_at", { ascending: false })
    .limit(8);

  if (error) throw error;
  return data || [];
}

export async function reopenPublishedLiveMatch(matchId) {
  const { data, error } = await supabase.rpc("reopen_published_match", {
    p_match_id: matchId,
  });
  if (error) throw error;
  return data;
}
