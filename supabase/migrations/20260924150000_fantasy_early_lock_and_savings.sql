-- Players may voluntarily close a valid lineup before the deadline. This
-- freezes its price and savings, allowing Le Gazal immediately. Other teams
-- remain editable until the deadline and are finalized by the existing flow.
alter table public.fantasy_gameweek_economy
  add column if not exists locked_at timestamptz,
  add column if not exists savings_choice text
    check (savings_choice in ('save', 'play'));

-- RLS blocks direct client writes to a closed lineup. Keep historical rows
-- without economy state editable under their existing deadline policy.
create policy fantasy_lineups_no_insert_when_locked
  on public.fantasy_lineups as restrictive for insert to authenticated
  with check (not exists (
    select 1 from public.fantasy_gameweek_economy e
    where e.fantasy_team_id = fantasy_lineups.fantasy_team_id
      and e.gameweek_id = fantasy_lineups.gameweek_id
      and e.locked_at is not null
  ));
create policy fantasy_lineups_no_update_when_locked
  on public.fantasy_lineups as restrictive for update to authenticated
  using (not exists (
    select 1 from public.fantasy_gameweek_economy e
    where e.fantasy_team_id = fantasy_lineups.fantasy_team_id
      and e.gameweek_id = fantasy_lineups.gameweek_id
      and e.locked_at is not null
  ))
  with check (not exists (
    select 1 from public.fantasy_gameweek_economy e
    where e.fantasy_team_id = fantasy_lineups.fantasy_team_id
      and e.gameweek_id = fantasy_lineups.gameweek_id
      and e.locked_at is not null
  ));
create policy fantasy_lineups_no_delete_when_locked
  on public.fantasy_lineups as restrictive for delete to authenticated
  using (not exists (
    select 1 from public.fantasy_gameweek_economy e
    where e.fantasy_team_id = fantasy_lineups.fantasy_team_id
      and e.gameweek_id = fantasy_lineups.gameweek_id
      and e.locked_at is not null
  ));

-- Recheck after waiting on a concurrent UPDATE's row lock as well.
create or replace function public.prevent_closed_fantasy_lineup_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.fantasy_gameweek_economy e
    where e.fantasy_team_id = old.fantasy_team_id
      and e.gameweek_id = old.gameweek_id
      and e.locked_at is not null
  ) then
    raise exception 'This Fantasy lineup is closed';
  end if;
  return new;
end;
$$;
revoke all on function public.prevent_closed_fantasy_lineup_update() from public, anon, authenticated;
create trigger prevent_closed_fantasy_lineup_update
  before update on public.fantasy_lineups for each row
  execute function public.prevent_closed_fantasy_lineup_update();

create or replace function public.close_fantasy_lineup(p_gameweek_id bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_lineup public.fantasy_lineups%rowtype;
  v_economy public.fantasy_gameweek_economy%rowtype;
  v_gw public.gameweeks%rowtype;
  v_max_carry integer;
  v_savings integer;
  v_carry integer;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select l.* into v_lineup
  from public.fantasy_lineups l
  join public.fantasy_teams ft on ft.id = l.fantasy_team_id
  where ft.user_id = v_uid and l.gameweek_id = p_gameweek_id
  for update of l;
  if not found then raise exception 'No lineup found for this gameweek'; end if;

  select * into v_gw from public.gameweeks where id = p_gameweek_id;
  if v_gw.status <> 'scheduled' then
    raise exception 'This Fantasy gameweek is no longer scheduled';
  end if;

  select * into v_economy from public.fantasy_gameweek_economy
  where fantasy_team_id = v_lineup.fantasy_team_id and gameweek_id = p_gameweek_id
  for update;
  if not found then raise exception 'Fantasy economy not found'; end if;
  if v_economy.locked_at is not null then
    return jsonb_build_object('locked_at', v_economy.locked_at, 'carry_out', v_economy.carry_out);
  end if;
  if v_economy.finalized_at is not null then raise exception 'Economy already finalized'; end if;

  perform public.revalidate_fantasy_lineup_economy(v_lineup.id);
  select * into v_economy from public.fantasy_gameweek_economy
  where fantasy_team_id = v_lineup.fantasy_team_id and gameweek_id = p_gameweek_id;
  if not v_economy.valid_lineup or v_economy.lineup_cost is null then
    raise exception 'Complete five distinct players, captain and coach within budget';
  end if;

  select coalesce(s.max_carry, 20) into v_max_carry
  from public.fantasy_season_settings s where s.season_id = v_gw.season_id;
  v_max_carry := coalesce(v_max_carry, 20);
  v_savings := greatest(v_economy.available_budget - v_economy.lineup_cost, 0);
  v_carry := least(v_savings, v_max_carry);

  update public.fantasy_gameweek_economy
  set locked_at = now(), finalized_at = now(),
      savings_generated = v_savings, carry_out = v_carry, updated_at = now()
  where fantasy_team_id = v_lineup.fantasy_team_id and gameweek_id = p_gameweek_id;

  insert into public.fantasy_economy_ledger
    (fantasy_team_id, gameweek_id, entry_type, event_key, amount, metadata, created_by)
  values (v_lineup.fantasy_team_id, p_gameweek_id, 'savings', 'savings', v_carry,
    jsonb_build_object('valid_lineup', true, 'available_budget', v_economy.available_budget,
      'lineup_cost', v_economy.lineup_cost, 'raw_savings', v_savings, 'carry_out', v_carry), v_uid)
  on conflict (fantasy_team_id, gameweek_id, event_key) do nothing;

  if v_savings > v_carry then
    insert into public.fantasy_economy_ledger
      (fantasy_team_id, gameweek_id, entry_type, event_key, amount, metadata, created_by)
    values (v_lineup.fantasy_team_id, p_gameweek_id, 'savings_cap', 'savings_cap',
      -(v_savings - v_carry), jsonb_build_object('max_carry', v_max_carry, 'raw_savings', v_savings), v_uid)
    on conflict (fantasy_team_id, gameweek_id, event_key) do nothing;
  end if;

  return jsonb_build_object('locked_at', now(), 'carry_out', v_carry,
    'savings_generated', v_savings);
end;
$$;
revoke all on function public.close_fantasy_lineup(bigint) from public, anon;
grant execute on function public.close_fantasy_lineup(bigint) to authenticated;

create or replace function public.choose_fantasy_savings(p_gameweek_id bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_row public.fantasy_gameweek_economy%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select e.* into v_row from public.fantasy_gameweek_economy e
  join public.fantasy_teams ft on ft.id = e.fantasy_team_id
  where ft.user_id = v_uid and e.gameweek_id = p_gameweek_id
  for update of e;
  if not found or not v_row.valid_lineup or v_row.finalized_at is null then
    raise exception 'A finalized valid lineup is required';
  end if;
  if v_row.savings_choice = 'play' or exists (
    select 1 from public.le_gazal_sessions s
    where s.fantasy_team_id = v_row.fantasy_team_id and s.gameweek_id = p_gameweek_id
  ) then
    raise exception 'Le Gazal has already started';
  end if;
  update public.fantasy_gameweek_economy
  set savings_choice = 'save', updated_at = now()
  where fantasy_team_id = v_row.fantasy_team_id and gameweek_id = p_gameweek_id;
  return jsonb_build_object('choice', 'save', 'carry_out', v_row.carry_out);
end;
$$;
revoke all on function public.choose_fantasy_savings(bigint) from public, anon;
grant execute on function public.choose_fantasy_savings(bigint) to authenticated;

-- Already closed lineups are finalized. At the deadline only finalize the
-- remaining teams, without resetting early Le Gazal allocations and prizes.
create or replace function public.finalize_fantasy_gameweek_economy_core(
  p_gameweek_id bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_gameweek public.gameweeks%rowtype;
  v_max_carry integer := 20;
  v_row record;
  v_matched_players integer;
  v_distinct_players integer;
  v_priced_players integer;
  v_lineup_cost integer;
  v_has_captain boolean;
  v_has_coach boolean;
  v_valid boolean;
  v_savings integer;
  v_carry_out integer;
  v_finalized_count integer := 0;
  v_invalid_count integer := 0;
begin
  if auth.uid() is null or not public.is_gazal_admin() then
    raise exception 'Admin permissions required';
  end if;

  select *
    into v_gameweek
  from public.gameweeks
  where id = p_gameweek_id;

  if not found then
    raise exception 'Gameweek % not found', p_gameweek_id;
  end if;

  if v_gameweek.deadline > now() then
    raise exception 'Cannot finalize Fantasy economy before the gameweek deadline';
  end if;

  select coalesce(fss.max_carry, 20)
    into v_max_carry
  from public.fantasy_season_settings fss
  where fss.season_id = v_gameweek.season_id;

  v_max_carry := coalesce(v_max_carry, 20);

  insert into public.fantasy_gameweek_economy (
    fantasy_team_id,
    gameweek_id,
    base_budget,
    carry_in
  )
  select
    ft.id,
    v_gameweek.id,
    v_gameweek.base_budget,
    0
  from public.fantasy_teams ft
  where ft.season_id = v_gameweek.season_id
  on conflict (fantasy_team_id, gameweek_id) do nothing;

  for v_row in
    select
      e.fantasy_team_id,
      e.base_budget,
      e.carry_in,
      e.available_budget,
      fl.id as lineup_id,
      fl.players,
      fl.captain_number,
      fl.coach_code
    from public.fantasy_gameweek_economy e
    left join public.fantasy_lineups fl
      on fl.fantasy_team_id = e.fantasy_team_id
     and fl.gameweek_id = e.gameweek_id
    where e.gameweek_id = v_gameweek.id
      and e.finalized_at is null
  loop
    v_matched_players := 0;
    v_distinct_players := 0;
    v_priced_players := 0;
    v_lineup_cost := 0;
    v_has_captain := false;
    v_has_coach := false;

    if v_row.lineup_id is not null then
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
      from unnest(v_row.players) as pick(raw_number)
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
        v_row.captain_number is not null
        and exists (
          select 1
          from unnest(v_row.players) as captain_pick(raw_number)
          where captain_pick.raw_number ~ '^[0-9]+$'
            and captain_pick.raw_number::integer = v_row.captain_number::integer
        );

      v_has_coach :=
        v_row.coach_code is not null
        and exists (
          select 1
          from public.season_staff ss
          join public.staff_members sm on sm.id = ss.staff_id
          where ss.season_id = v_gameweek.season_id
            and ss.active = true
            and ss.fantasy_enabled = true
            and sm.code = v_row.coach_code
        );
    end if;

    v_valid :=
      v_row.lineup_id is not null
      and v_matched_players = 5
      and v_distinct_players = 5
      and v_priced_players = 5
      and v_has_captain
      and v_has_coach
      and v_lineup_cost <= v_row.available_budget;

    if v_valid then
      v_savings := greatest(v_row.available_budget - v_lineup_cost, 0);
      v_carry_out := least(v_savings, v_max_carry);
      v_finalized_count := v_finalized_count + 1;
    else
      v_lineup_cost := case
        when v_row.lineup_id is null then null
        else v_lineup_cost
      end;
      v_savings := 0;
      v_carry_out := 0;
      v_invalid_count := v_invalid_count + 1;
    end if;

    update public.fantasy_gameweek_economy
    set
      lineup_cost = v_lineup_cost,
      valid_lineup = v_valid,
      savings_generated = v_savings,
      carry_out = v_carry_out,
      finalized_at = now(),
      updated_at = now()
    where fantasy_team_id = v_row.fantasy_team_id
      and gameweek_id = v_gameweek.id;

    insert into public.fantasy_economy_ledger (
      fantasy_team_id,
      gameweek_id,
      entry_type,
      event_key,
      amount,
      metadata,
      created_by
    )
    values (
      v_row.fantasy_team_id,
      v_gameweek.id,
      'base_budget',
      'base_budget',
      v_row.base_budget,
      jsonb_build_object('source', 'gameweek_snapshot'),
      auth.uid()
    )
    on conflict (fantasy_team_id, gameweek_id, event_key)
    do update set
      amount = excluded.amount,
      metadata = excluded.metadata;

    insert into public.fantasy_economy_ledger (
      fantasy_team_id,
      gameweek_id,
      entry_type,
      event_key,
      amount,
      metadata,
      created_by
    )
    values (
      v_row.fantasy_team_id,
      v_gameweek.id,
      'carry_in',
      'carry_in',
      v_row.carry_in,
      jsonb_build_object('source', 'previous_gameweek'),
      auth.uid()
    )
    on conflict (fantasy_team_id, gameweek_id, event_key)
    do update set
      amount = excluded.amount,
      metadata = excluded.metadata;

    insert into public.fantasy_economy_ledger (
      fantasy_team_id,
      gameweek_id,
      entry_type,
      event_key,
      amount,
      metadata,
      created_by
    )
    values (
      v_row.fantasy_team_id,
      v_gameweek.id,
      'savings',
      'savings',
      v_carry_out,
      jsonb_build_object(
        'valid_lineup', v_valid,
        'available_budget', v_row.available_budget,
        'lineup_cost', v_lineup_cost,
        'raw_savings', v_savings,
        'carry_out', v_carry_out
      ),
      auth.uid()
    )
    on conflict (fantasy_team_id, gameweek_id, event_key)
    do update set
      amount = excluded.amount,
      metadata = excluded.metadata;

    if v_savings > v_carry_out then
      insert into public.fantasy_economy_ledger (
        fantasy_team_id,
        gameweek_id,
        entry_type,
        event_key,
        amount,
        metadata,
        created_by
      )
      values (
        v_row.fantasy_team_id,
        v_gameweek.id,
        'savings_cap',
        'savings_cap',
        -(v_savings - v_carry_out),
        jsonb_build_object(
          'max_carry', v_max_carry,
          'raw_savings', v_savings
        ),
        auth.uid()
      )
      on conflict (fantasy_team_id, gameweek_id, event_key)
      do update set
        amount = excluded.amount,
        metadata = excluded.metadata;
    else
      delete from public.fantasy_economy_ledger
      where fantasy_team_id = v_row.fantasy_team_id
        and gameweek_id = v_gameweek.id
        and event_key = 'savings_cap';
    end if;
  end loop;

  return jsonb_build_object(
    'gameweek_id', v_gameweek.id,
    'season_id', v_gameweek.season_id,
    'valid_lineups', v_finalized_count,
    'invalid_lineups', v_invalid_count,
    'max_carry', v_max_carry
  );
end;
$$;


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

  return public.finalize_fantasy_gameweek_economy_core(p_gameweek_id);
end;
$$;


create or replace function public.open_le_gazal_session(
  p_gameweek_id bigint,
  p_amount integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row record;
  v_amount integer;
  v_existing public.le_gazal_sessions%rowtype;
  v_session public.le_gazal_sessions%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select
    e.fantasy_team_id,
    e.gameweek_id,
    e.carry_out,
    e.valid_lineup,
    e.finalized_at,
    e.locked_at,
    e.savings_choice,
    gw.season_id,
    gw.date,
    gw.deadline
  into v_row
  from public.fantasy_gameweek_economy e
  join public.fantasy_teams ft on ft.id = e.fantasy_team_id
  join public.gameweeks gw on gw.id = e.gameweek_id
  where e.gameweek_id = p_gameweek_id
    and ft.user_id = v_uid
  for update of e;

  if not found then
    raise exception 'Fantasy economy not found for this gameweek';
  end if;

  if v_row.deadline > now() and v_row.locked_at is null then
    raise exception 'Close your valid lineup before opening Le Gazal';
  end if;

  if v_row.savings_choice = 'save' then
    raise exception 'Savings have already been confirmed for this gameweek';
  end if;

  if v_row.finalized_at is null then
    raise exception 'Fantasy economy must be finalized first';
  end if;

  if not v_row.valid_lineup then
    raise exception 'Only a valid lineup can generate Le Gazal balance';
  end if;

  if exists (
    select 1
    from public.gameweeks next_gw
    where next_gw.season_id = v_row.season_id
      and next_gw.id <> p_gameweek_id
      and (
        next_gw.date > v_row.date
        or (next_gw.date = v_row.date and next_gw.id > p_gameweek_id)
      )
  ) then
    raise exception 'Le Gazal is already closed because the next gameweek exists';
  end if;

  select *
  into v_existing
  from public.le_gazal_sessions
  where fantasy_team_id = v_row.fantasy_team_id
    and gameweek_id = p_gameweek_id;

  if found then
    if v_existing.status = 'active' then
      return to_jsonb(v_existing);
    end if;
    raise exception 'Le Gazal session has already been cashed out';
  end if;

  v_amount := coalesce(p_amount, v_row.carry_out);

  if v_amount is null or v_amount <= 0 then
    raise exception 'No saved beers available for Le Gazal';
  end if;

  if v_amount > v_row.carry_out then
    raise exception 'Cannot allocate more than the saved balance';
  end if;

  insert into public.le_gazal_sessions (
    fantasy_team_id,
    gameweek_id,
    starting_balance,
    balance
  )
  values (
    v_row.fantasy_team_id,
    p_gameweek_id,
    v_amount,
    v_amount
  )
  returning * into v_session;

  update public.fantasy_gameweek_economy
  set carry_out = carry_out - v_amount,
      savings_choice = 'play',
      updated_at = now()
  where fantasy_team_id = v_row.fantasy_team_id
    and gameweek_id = p_gameweek_id;

  insert into public.fantasy_economy_ledger (
    fantasy_team_id,
    gameweek_id,
    entry_type,
    event_key,
    amount,
    metadata,
    created_by
  )
  values (
    v_row.fantasy_team_id,
    p_gameweek_id,
    'le_gazal_allocation',
    'le_gazal_allocation:' || v_session.id::text,
    -v_amount,
    jsonb_build_object(
      'session_id', v_session.id,
      'allocated', v_amount
    ),
    v_uid
  )
  on conflict (fantasy_team_id, gameweek_id, event_key) do nothing;

  return to_jsonb(v_session);
end;
$$;
