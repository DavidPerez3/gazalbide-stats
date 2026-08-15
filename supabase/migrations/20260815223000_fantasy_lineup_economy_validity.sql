-- Keep Fantasy scoring eligibility in sync with the authoritative per-gameweek
-- economy. This is intentionally scoped through economy rows, so legacy seasons
-- without economy state keep their historical behaviour unchanged.

create or replace function public.revalidate_fantasy_lineup_economy(
  p_lineup_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lineup public.fantasy_lineups%rowtype;
  v_gameweek public.gameweeks%rowtype;
  v_available_budget integer;
  v_matched_players integer := 0;
  v_distinct_players integer := 0;
  v_priced_players integer := 0;
  v_lineup_cost integer := 0;
  v_has_captain boolean := false;
  v_has_coach boolean := false;
  v_valid boolean := false;
begin
  select *
    into v_lineup
  from public.fantasy_lineups
  where id = p_lineup_id;

  if not found then
    return;
  end if;

  select *
    into v_gameweek
  from public.gameweeks
  where id = v_lineup.gameweek_id;

  if not found then
    return;
  end if;

  select e.available_budget
    into v_available_budget
  from public.fantasy_gameweek_economy e
  where e.fantasy_team_id = v_lineup.fantasy_team_id
    and e.gameweek_id = v_lineup.gameweek_id;

  -- Historical seasons do not have economy rows and must retain their legacy
  -- scoring behaviour.
  if not found then
    return;
  end if;

  select
    count(sp.player_id),
    count(distinct sp.player_id),
    count(fgp.player_id),
    coalesce(sum(fgp.price), 0)
  into
    v_matched_players,
    v_distinct_players,
    v_priced_players,
    v_lineup_cost
  from unnest(v_lineup.players) as pick(raw_number)
  left join public.season_players sp
    on sp.season_id = v_gameweek.season_id
   and sp.active = true
   and pick.raw_number ~ '^[0-9]+$'
   and sp.jersey_number ~ '^[0-9]+$'
   and sp.jersey_number::integer = pick.raw_number::integer
  left join public.fantasy_gameweek_prices fgp
    on fgp.gameweek_id = v_gameweek.id
   and fgp.player_id = sp.player_id;

  v_has_captain :=
    v_lineup.captain_number is not null
    and exists (
      select 1
      from unnest(v_lineup.players) as captain_pick(raw_number)
      where captain_pick.raw_number ~ '^[0-9]+$'
        and captain_pick.raw_number::integer = v_lineup.captain_number::integer
    );

  v_has_coach :=
    v_lineup.coach_code is not null
    and exists (
      select 1
      from public.season_staff ss
      join public.staff_members sm on sm.id = ss.staff_id
      where ss.season_id = v_gameweek.season_id
        and ss.active = true
        and ss.fantasy_enabled = true
        and sm.code = v_lineup.coach_code
    );

  v_valid :=
    v_matched_players = 5
    and v_distinct_players = 5
    and v_priced_players = 5
    and v_has_captain
    and v_has_coach
    and v_lineup_cost <= v_available_budget;

  update public.fantasy_gameweek_economy
  set lineup_cost = v_lineup_cost,
      valid_lineup = v_valid,
      updated_at = now()
  where fantasy_team_id = v_lineup.fantasy_team_id
    and gameweek_id = v_lineup.gameweek_id;
end;
$$;

revoke all on function public.revalidate_fantasy_lineup_economy(uuid)
  from public, anon, authenticated;

create or replace function public.sync_fantasy_lineup_economy_validity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update public.fantasy_gameweek_economy
    set lineup_cost = null,
        valid_lineup = false,
        updated_at = now()
    where fantasy_team_id = old.fantasy_team_id
      and gameweek_id = old.gameweek_id;
    return old;
  end if;

  perform public.revalidate_fantasy_lineup_economy(new.id);
  return new;
end;
$$;

revoke all on function public.sync_fantasy_lineup_economy_validity()
  from public, anon, authenticated;

drop trigger if exists fantasy_lineup_economy_validity
  on public.fantasy_lineups;
create trigger fantasy_lineup_economy_validity
after insert or update of
  players,
  captain_number,
  coach_code,
  fantasy_team_id,
  gameweek_id
or delete
on public.fantasy_lineups
for each row
execute function public.sync_fantasy_lineup_economy_validity();

-- Existing gameweek triggers first snapshot prices, then copy/create lineups, then
-- create economy rows. The zz_ prefix makes this validation run after those
-- current AFTER INSERT triggers so copied lineups are checked against the new
-- price snapshot and budget.
create or replace function public.validate_fantasy_economy_after_gameweek()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lineup_id uuid;
begin
  for v_lineup_id in
    select fl.id
    from public.fantasy_lineups fl
    where fl.gameweek_id = new.id
  loop
    perform public.revalidate_fantasy_lineup_economy(v_lineup_id);
  end loop;

  return new;
end;
$$;

revoke all on function public.validate_fantasy_economy_after_gameweek()
  from public, anon, authenticated;

drop trigger if exists zz_fantasy_validate_economy_after_gameweek
  on public.gameweeks;
create trigger zz_fantasy_validate_economy_after_gameweek
after insert on public.gameweeks
for each row
execute function public.validate_fantasy_economy_after_gameweek();

-- Safe backfill for any economy rows that already exist when this migration is
-- applied. Legacy lineups without economy rows are not touched.
do $$
declare
  v_lineup_id uuid;
begin
  for v_lineup_id in
    select fl.id
    from public.fantasy_lineups fl
    join public.fantasy_gameweek_economy e
      on e.fantasy_team_id = fl.fantasy_team_id
     and e.gameweek_id = fl.gameweek_id
  loop
    perform public.revalidate_fantasy_lineup_economy(v_lineup_id);
  end loop;
end
$$;
