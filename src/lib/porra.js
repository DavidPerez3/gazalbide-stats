import { supabase } from "./supabaseClient";

export const PORRA_CURRENT_SEASON = "2026-2027";

export function isPorraDeadlinePassed(round) {
  return !round?.deadline_at || Date.now() >= new Date(round.deadline_at).getTime();
}

export function formatPorraDeadline(value) {
  if (!value) return "Sin deadline";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export async function fetchPorraRounds(season = PORRA_CURRENT_SEASON) {
  const { data, error } = await supabase
    .from("porra_rounds")
    .select("*")
    .eq("season", season)
    .order("round_number", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function fetchPorraQuestions(roundId) {
  if (!roundId) return [];
  const { data, error } = await supabase
    .from("porra_questions")
    .select("*")
    .eq("round_id", roundId)
    .order("position", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function fetchPorraResults(questionIds) {
  if (!questionIds?.length) return [];
  const { data, error } = await supabase
    .from("porra_question_results")
    .select("*")
    .in("question_id", questionIds);
  if (error) throw error;
  return data || [];
}

export async function fetchMyPorraPrediction(roundId, userId) {
  if (!roundId || !userId) return null;
  const { data, error } = await supabase
    .from("porra_predictions")
    .select("*")
    .eq("round_id", roundId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function savePorraPrediction({ roundId, userId, answers }) {
  const payload = {
    round_id: roundId,
    user_id: userId,
    answers,
    total_points: null,
    score_breakdown: null,
    submitted_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("porra_predictions")
    .upsert(payload, { onConflict: "round_id,user_id" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function fetchPorraStandings(season = PORRA_CURRENT_SEASON) {
  const rounds = await fetchPorraRounds(season);
  const scoredRounds = rounds.filter((round) => round.status === "scored");
  if (!scoredRounds.length) return [];

  const roundIds = scoredRounds.map((round) => round.id);
  const { data: predictions, error } = await supabase
    .from("porra_predictions")
    .select("*")
    .in("round_id", roundIds);
  if (error) throw error;

  const userIds = [...new Set((predictions || []).map((row) => row.user_id))];
  const profilesById = new Map();
  if (userIds.length) {
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, username, email")
      .in("id", userIds);
    if (profilesError) throw profilesError;
    for (const profile of profiles || []) profilesById.set(profile.id, profile);
  }

  const roundWinners = new Map();
  for (const round of scoredRounds) {
    const rows = (predictions || []).filter((row) => row.round_id === round.id);
    if (!rows.length) continue;
    const max = Math.max(...rows.map((row) => Number(row.total_points || 0)));
    roundWinners.set(round.id, new Set(rows.filter((row) => Number(row.total_points || 0) === max).map((row) => row.user_id)));
  }

  const standings = new Map();
  for (const row of predictions || []) {
    const profile = profilesById.get(row.user_id);
    const entry = standings.get(row.user_id) || {
      userId: row.user_id,
      username: profile?.username || profile?.email?.split("@")[0] || "Gazal",
      points: 0,
      rounds: 0,
      wins: 0,
    };
    entry.points += Number(row.total_points || 0);
    entry.rounds += 1;
    if (roundWinners.get(row.round_id)?.has(row.user_id)) entry.wins += 1;
    standings.set(row.user_id, entry);
  }

  return [...standings.values()]
    .sort((a, b) => b.points - a.points || b.wins - a.wins || a.username.localeCompare(b.username, "es"))
    .map((entry, index) => ({ ...entry, position: index + 1 }));
}

export async function fetchPorraHistoryForUser(userId, season = PORRA_CURRENT_SEASON) {
  if (!userId) return [];
  const rounds = await fetchPorraRounds(season);
  if (!rounds.length) return [];
  const { data, error } = await supabase
    .from("porra_predictions")
    .select("*")
    .eq("user_id", userId)
    .in("round_id", rounds.map((round) => round.id));
  if (error) throw error;
  const byRound = new Map((data || []).map((row) => [row.round_id, row]));
  return rounds
    .filter((round) => round.status === "scored")
    .map((round) => ({ round, prediction: byRound.get(round.id) || null }));
}
