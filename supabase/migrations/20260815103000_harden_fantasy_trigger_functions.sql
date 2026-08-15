-- Harden legacy Fantasy trigger functions captured in the production baseline.
-- Trigger execution continues to work, but direct RPC execution is removed.

alter function public.create_empty_lineups_for_new_gameweek()
  set search_path = public;

alter function public.create_empty_lineups_for_new_team()
  set search_path = public;

alter function public.handle_new_user()
  set search_path = public;

revoke execute on function public.create_empty_lineups_for_new_gameweek() from public, anon, authenticated;
revoke execute on function public.create_empty_lineups_for_new_team() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
