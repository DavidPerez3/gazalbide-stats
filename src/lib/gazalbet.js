import { supabase } from "./supabaseClient";

export const STAKES = [5, 10, 20];

export function formatCredits(value) {
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(Number(value || 0));
}

export function formatDeadline(value) {
  if (!value) return "Sin cierre";
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export async function fetchGazalBetData(userId) {
  const { data: gameweeks, error: gameweeksError } = await supabase.from("gameweeks").select("*").order("date", { ascending: false });
  if (gameweeksError) throw gameweeksError;
  const now = Date.now();
  const upcoming = [...(gameweeks || [])].filter((item) => new Date(item.deadline).getTime() > now).sort((a, b) => new Date(a.date) - new Date(b.date))[0];
  const current = upcoming || gameweeks?.[0] || null;
  if (current) {
    const { error } = await supabase.rpc("ensure_gazalbet_markets", { p_gameweek_id: current.id });
    if (error) throw error;
  }
  const [{ data: markets, error: marketsError }, { data: bets, error: betsError }, { data: wallet, error: walletError }] = await Promise.all([
    current ? supabase.from("gazalbet_markets").select("*").eq("gameweek_id", current.id).order("generated_at") : Promise.resolve({ data: [], error: null }),
    supabase.from("gazalbet_bets").select("*, gazalbet_markets(title)").eq("user_id", userId).order("placed_at", { ascending: false }),
    supabase.from("gazalbet_wallets").select("*").eq("user_id", userId).maybeSingle(),
  ]);
  if (marketsError) throw marketsError;
  if (betsError) throw betsError;
  if (walletError) throw walletError;
  return { gameweek: current, markets: markets || [], bets: bets || [], wallet };
}

export async function placeGazalBet({ marketId, selectionKey, stake }) {
  const { data, error } = await supabase.rpc("place_gazalbet_bet", { p_market_id: marketId, p_selection_key: selectionKey, p_stake: stake });
  if (error) throw error;
  return data;
}

export async function fetchGazalBetRanking() {
  const { data: wallets, error } = await supabase.from("gazalbet_wallets").select("*").order("balance", { ascending: false });
  if (error) throw error;
  const ids = (wallets || []).map((item) => item.user_id);
  if (!ids.length) return [];
  const { data: profiles, error: profilesError } = await supabase.from("profiles").select("id,username,email").in("id", ids);
  if (profilesError) throw profilesError;
  const names = new Map((profiles || []).map((profile) => [profile.id, profile.username || profile.email?.split("@")[0] || "Gazal"]));
  return (wallets || []).map((wallet, index) => ({ ...wallet, position: index + 1, username: names.get(wallet.user_id) || "Gazal" }));
}

export async function fetchGazalBetAdmin() {
  const { data, error } = await supabase.from("gazalbet_markets").select("*, gameweeks(name,opponent,date,deadline), gazalbet_bets(id,status,stake,payout)").order("generated_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function voidGazalBetMarket(marketId) {
  const { error } = await supabase.rpc("admin_void_gazalbet_market", { p_market_id: marketId });
  if (error) throw error;
}
