-- Once Le Gazal has started for a gameweek, its finalized Fantasy economy is
-- immutable. Re-running the old finalizer would restore the pre-allocation
-- savings and could duplicate beers. Keep the original implementation private
-- behind a guarded wrapper.

alter function public.finalize_fantasy_gameweek_economy(bigint)
  rename to finalize_fantasy_gameweek_economy_core;

create or replace function public.finalize_fantasy_gameweek_economy(
  p_gameweek_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_gazal_admin() then
    raise exception 'Admin permissions required';
  end if;

  if exists (
    select 1
    from public.le_gazal_sessions s
    where s.gameweek_id = p_gameweek_id
  ) then
    raise exception 'Fantasy economy cannot be re-finalized after Le Gazal has started';
  end if;

  return public.finalize_fantasy_gameweek_economy_core(p_gameweek_id);
end;
$$;

revoke all on function public.finalize_fantasy_gameweek_economy_core(bigint)
  from public, anon, authenticated;
revoke all on function public.finalize_fantasy_gameweek_economy(bigint)
  from public, anon;
grant execute on function public.finalize_fantasy_gameweek_economy(bigint)
  to authenticated;
