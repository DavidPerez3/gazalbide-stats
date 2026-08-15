-- Keep the economy finalizer callable only by authenticated users.
-- The function also performs its own Gazalbide admin check, but revoking PUBLIC
-- execution avoids exposing it as an unnecessary anonymous RPC surface.

revoke all on function public.finalize_fantasy_gameweek_economy(bigint)
  from public, anon;

grant execute on function public.finalize_fantasy_gameweek_economy(bigint)
  to authenticated;
