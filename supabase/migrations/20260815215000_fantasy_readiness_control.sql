-- Gazalbide Stats: validated admin control for Fantasy season readiness.
-- market_ready means the season is allowed to create new Fantasy gameweeks.
-- It does not create a gameweek or open a deadline by itself.

-- SECURITY INVOKER relies on the existing admin RLS policy on
-- fantasy_season_settings. Grant only the table privilege the RPC needs;
-- non-admin authenticated users are still rejected by RLS and the explicit check.
grant update on public.fantasy_season_settings to authenticated;

create or replace function public.set_fantasy_market_ready(
  p_season_id text,
  p_ready boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  active_roster_count integer := 0;
  priced_roster_count integer := 0;
  fantasy_staff_count integer := 0;
  enabled_trait_count integer := 0;
begin
  if auth.uid() is null or not public.is_gazal_admin() then
    raise exception 'Admin permissions required';
  end if;

  if not exists (
    select 1
    from public.fantasy_season_settings
    where season_id = p_season_id
  ) then
    raise exception 'Fantasy settings not found for season %', p_season_id;
  end if;

  select count(*) into active_roster_count
  from public.season_players sp
  where sp.season_id = p_season_id
    and sp.active = true;

  select count(*) into priced_roster_count
  from public.season_players sp
  join public.fantasy_player_market fm
    on fm.season_id = sp.season_id
   and fm.player_id = sp.player_id
   and fm.enabled = true
  where sp.season_id = p_season_id
    and sp.active = true;

  select count(*) into fantasy_staff_count
  from public.season_staff ss
  where ss.season_id = p_season_id
    and ss.active = true
    and ss.fantasy_enabled = true;

  select count(*) into enabled_trait_count
  from public.fantasy_traits ft
  where ft.season_id = p_season_id
    and ft.enabled = true;

  if p_ready then
    if active_roster_count = 0 then
      raise exception 'No hay jugadores activos en la plantilla Fantasy de %.', p_season_id;
    end if;

    if priced_roster_count <> active_roster_count then
      raise exception 'Precios incompletos en %: % jugadores activos, % con precio.',
        p_season_id, active_roster_count, priced_roster_count;
    end if;

    if fantasy_staff_count = 0 then
      raise exception 'No hay ningún entrenador habilitado para Fantasy en %.', p_season_id;
    end if;

    if enabled_trait_count = 0 then
      raise exception 'No hay rasgos Fantasy habilitados para %.', p_season_id;
    end if;
  end if;

  update public.fantasy_season_settings
  set market_ready = p_ready,
      updated_at = now()
  where season_id = p_season_id;

  return jsonb_build_object(
    'season_id', p_season_id,
    'market_ready', p_ready,
    'active_players', active_roster_count,
    'priced_players', priced_roster_count,
    'fantasy_staff', fantasy_staff_count,
    'enabled_traits', enabled_trait_count
  );
end;
$$;

revoke all on function public.set_fantasy_market_ready(text, boolean) from public, anon;
grant execute on function public.set_fantasy_market_ready(text, boolean) to authenticated;

comment on function public.set_fantasy_market_ready(text, boolean) is
  'Admin-only readiness toggle. Enabling requires an active roster, complete prices, at least one Fantasy staff member and enabled trait definitions.';
