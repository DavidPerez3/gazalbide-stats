-- Server-side deadline finalization; early closes and Le Gazal balances are immutable.
create schema if not exists gazalbide_internal;
revoke all on schema gazalbide_internal from public, anon, authenticated;

create or replace function gazalbide_internal.finalize_fantasy_deadline(
  p_gameweek_id bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
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
  select *
    into v_gameweek
  from public.gameweeks
  where id = p_gameweek_id;

  if not found then
    raise exception 'Gameweek % not found', p_gameweek_id;
  end if;

  if v_gameweek.deadline is null or v_gameweek.deadline > now() then
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

  -- Match manual close lock order: lineup first, then economy. Re-read after waits.
  perform 1 from public.fantasy_lineups
  where gameweek_id = v_gameweek.id order by id for update;

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
    order by e.fantasy_team_id
    for update of e
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
      and cardinality(v_row.players) = 5
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
      locked_at = case when v_valid then v_gameweek.deadline else null end,
      savings_choice = case when v_valid then 'save' else null end,
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



-- Preserve the existing admin RPC contract; scheduler never impersonates a user.
create or replace function public.finalize_fantasy_gameweek_economy_core(p_gameweek_id bigint)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_gazal_admin() then
    raise exception 'Admin permissions required';
  end if;
  return gazalbide_internal.finalize_fantasy_deadline(p_gameweek_id);
end;
$$;

create or replace function gazalbide_internal.auto_close_fantasy_lineups(p_enabled_after timestamptz)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_id bigint; v_count integer := 0;
begin
  if not pg_try_advisory_xact_lock(70194001) then return 0; end if;
  for v_id in
    select gw.id from public.gameweeks gw
    where gw.deadline >= p_enabled_after and gw.deadline <= now()
      and gw.status in ('scheduled', 'live', 'scored')
      and exists (select 1 from public.fantasy_gameweek_economy e
        where e.gameweek_id = gw.id and e.finalized_at is null)
    order by gw.deadline, gw.id
  loop
    perform gazalbide_internal.finalize_fantasy_deadline(v_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function gazalbide_internal.finalize_fantasy_deadline(bigint) from public, anon, authenticated;
revoke all on function gazalbide_internal.auto_close_fantasy_lineups(timestamptz) from public, anon, authenticated;

-- Only deadlines from installation onward: do not rewrite historical competitions.
select cron.schedule('fantasy-deadline-autoclose', '* * * * *',
  format('select gazalbide_internal.auto_close_fantasy_lineups(%L::timestamptz);', now()));
