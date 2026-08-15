-- Auto-save unfinished Le Gazal sessions when the next Fantasy gameweek is
-- created, then transfer the finalized carry into that new gameweek.
--
-- Savings without Le Gazal remain capped by max_carry (default 20). A played
-- Le Gazal session can raise the final carry up to max_le_gazal_carry (default
-- 30), giving a bounded upside without allowing runaway 160-200 beer budgets.

create or replace function public.create_fantasy_economy_for_new_gameweek()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous_gameweek_id bigint;
  v_previous_deadline timestamptz;
  v_max_next_carry integer := 30;
begin
  if auth.uid() is null or not public.is_gazal_admin() then
    raise exception 'Admin permissions required';
  end if;

  if new.status = 'scheduled'
     and new.deadline > now()
     and exists (
       select 1
       from public.gameweeks gw
       where gw.id <> new.id
         and gw.season_id = new.season_id
         and gw.status = 'scheduled'
         and gw.deadline > now()
     ) then
    raise exception 'Another Fantasy gameweek is already open for season %', new.season_id;
  end if;

  select gw.id, gw.deadline
    into v_previous_gameweek_id, v_previous_deadline
  from public.gameweeks gw
  where gw.season_id = new.season_id
    and gw.id <> new.id
    and (
      gw.date < new.date
      or (gw.date = new.date and gw.id < new.id)
    )
  order by gw.date desc, gw.id desc
  limit 1;

  -- Do not re-finalize an already finalized gameweek: once a user has allocated
  -- savings to Le Gazal, recomputing carry_out would duplicate that money.
  if v_previous_gameweek_id is not null
     and v_previous_deadline <= now()
     and exists (
       select 1
       from public.fantasy_gameweek_economy e
       where e.gameweek_id = v_previous_gameweek_id
         and e.finalized_at is null
     ) then
    perform public.finalize_fantasy_gameweek_economy(v_previous_gameweek_id);
  end if;

  -- If someone opened Le Gazal and did not explicitly withdraw, the balance is
  -- automatically saved before the new gameweek inherits its carry.
  if v_previous_gameweek_id is not null then
    perform public.auto_cashout_le_gazal_sessions(v_previous_gameweek_id);
  end if;

  select coalesce(fss.max_le_gazal_carry, 30)
    into v_max_next_carry
  from public.fantasy_season_settings fss
  where fss.season_id = new.season_id;

  v_max_next_carry := coalesce(v_max_next_carry, 30);

  insert into public.fantasy_gameweek_economy (
    fantasy_team_id,
    gameweek_id,
    base_budget,
    carry_in
  )
  select
    ft.id,
    new.id,
    new.base_budget,
    least(
      case
        when prev_e.finalized_at is not null and prev_e.valid_lineup
          then prev_e.carry_out
        else 0
      end,
      v_max_next_carry
    )
  from public.fantasy_teams ft
  left join public.fantasy_gameweek_economy prev_e
    on prev_e.fantasy_team_id = ft.id
   and prev_e.gameweek_id = v_previous_gameweek_id
  where ft.season_id = new.season_id
  on conflict (fantasy_team_id, gameweek_id) do nothing;

  insert into public.fantasy_economy_ledger (
    fantasy_team_id,
    gameweek_id,
    entry_type,
    event_key,
    amount,
    metadata,
    created_by
  )
  select
    e.fantasy_team_id,
    e.gameweek_id,
    'base_budget',
    'base_budget',
    e.base_budget,
    jsonb_build_object('source', 'gameweek_snapshot'),
    auth.uid()
  from public.fantasy_gameweek_economy e
  where e.gameweek_id = new.id
  on conflict (fantasy_team_id, gameweek_id, event_key) do nothing;

  insert into public.fantasy_economy_ledger (
    fantasy_team_id,
    gameweek_id,
    entry_type,
    event_key,
    amount,
    metadata,
    created_by
  )
  select
    e.fantasy_team_id,
    e.gameweek_id,
    'carry_in',
    'carry_in',
    e.carry_in,
    jsonb_build_object(
      'source', 'previous_gameweek',
      'previous_gameweek_id', v_previous_gameweek_id
    ),
    auth.uid()
  from public.fantasy_gameweek_economy e
  where e.gameweek_id = new.id
  on conflict (fantasy_team_id, gameweek_id, event_key) do nothing;

  update public.fantasy_teams ft
  set cervezas = e.available_budget
  from public.fantasy_gameweek_economy e
  where e.fantasy_team_id = ft.id
    and e.gameweek_id = new.id
    and ft.season_id = new.season_id;

  return new;
end;
$$;

revoke all on function public.create_fantasy_economy_for_new_gameweek()
  from public, anon, authenticated;
