-- Trigger-only helper: it must not be callable through PostgREST RPC.
revoke all on function public.set_fantasy_live_stats_file()
  from public, anon, authenticated;
