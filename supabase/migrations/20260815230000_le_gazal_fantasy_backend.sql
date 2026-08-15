-- Integrate Le Gazal with the real Fantasy economy.
--
-- Paid-spin probabilities (server authoritative):
--   lose 47%, small 28% (x1), medium 13% (x2), high 5% (x4),
--   wild 3% (x2), scatter 3% (2 free spins x1.5), bonus 1%
--   (3 free spins x2).
-- Monte Carlo validation gives roughly 92-93% RTP, so saving remains the
-- mathematically preferable option while Le Gazal retains real risk/reward.

alter table public.fantasy_season_settings
  add column if not exists max_le_gazal_carry integer not null default 30;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fantasy_season_settings_max_le_gazal_carry_check'
      and conrelid = 'public.fantasy_season_settings'::regclass
  ) then
    alter table public.fantasy_season_settings
      add constraint fantasy_season_settings_max_le_gazal_carry_check
      check (max_le_gazal_carry >= max_carry);
  end if;
end
$$;

alter table public.fantasy_economy_ledger
  drop constraint if exists fantasy_economy_ledger_entry_type_check;

alter table public.fantasy_economy_ledger
  add constraint fantasy_economy_ledger_entry_type_check
  check (
    entry_type in (
      'base_budget',
      'carry_in',
      'savings',
      'savings_cap',
      'le_gazal_allocation',
      'le_gazal_bet',
      'le_gazal_payout',
      'le_gazal_cashout',
      'prize',
      'loss',
      'admin_adjustment'
    )
  );

create table if not exists public.le_gazal_sessions (
  id uuid primary key default gen_random_uuid(),
  fantasy_team_id uuid not null references public.fantasy_teams(id) on delete cascade,
  gameweek_id bigint not null references public.gameweeks(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'cashed_out')),
  starting_balance integer not null check (starting_balance > 0),
  balance integer not null check (balance >= 0),
  free_spins_remaining integer not null default 0
    check (free_spins_remaining >= 0),
  free_spin_bet integer
    check (free_spin_bet is null or free_spin_bet in (1, 3, 5, 10)),
  bonus_multiplier numeric(4, 2) not null default 1
    check (bonus_multiplier >= 1),
  total_spins integer not null default 0 check (total_spins >= 0),
  total_bet integer not null default 0 check (total_bet >= 0),
  total_payout integer not null default 0 check (total_payout >= 0),
  cashout_amount integer check (cashout_amount is null or cashout_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cashed_out_at timestamptz,
  unique (fantasy_team_id, gameweek_id)
);

create index if not exists le_gazal_sessions_gameweek_status_idx
  on public.le_gazal_sessions(gameweek_id, status);

create table if not exists public.le_gazal_spins (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.le_gazal_sessions(id) on delete cascade,
  spin_number integer not null check (spin_number > 0),
  scenario text not null
    check (scenario in ('lose', 'small', 'medium', 'high', 'wild', 'scatter', 'bonus')),
  bet integer not null check (bet in (1, 3, 5, 10)),
  bet_spent integer not null check (bet_spent >= 0),
  payout integer not null check (payout >= 0),
  round_multiplier numeric(4, 2) not null default 1
    check (round_multiplier >= 1),
  was_free_spin boolean not null default false,
  free_spins_awarded integer not null default 0
    check (free_spins_awarded >= 0),
  balance_before integer not null check (balance_before >= 0),
  balance_after integer not null check (balance_after >= 0),
  created_at timestamptz not null default now(),
  unique (session_id, spin_number)
);

create index if not exists le_gazal_spins_session_created_idx
  on public.le_gazal_spins(session_id, created_at desc);

alter table public.le_gazal_sessions enable row level security;
alter table public.le_gazal_spins enable row level security;

revoke all on public.le_gazal_sessions from anon;
revoke all on public.le_gazal_spins from anon;
revoke insert, update, delete on public.le_gazal_sessions from authenticated;
revoke insert, update, delete on public.le_gazal_spins from authenticated;
grant select on public.le_gazal_sessions to authenticated;
grant select on public.le_gazal_spins to authenticated;

drop policy if exists "le_gazal_sessions_own_read"
  on public.le_gazal_sessions;
create policy "le_gazal_sessions_own_read"
  on public.le_gazal_sessions
  for select to authenticated
  using (
    exists (
      select 1
      from public.fantasy_teams ft
      where ft.id = le_gazal_sessions.fantasy_team_id
        and ft.user_id = (select auth.uid())
    )
    or (select public.is_gazal_admin())
  );

drop policy if exists "le_gazal_spins_own_read"
  on public.le_gazal_spins;
create policy "le_gazal_spins_own_read"
  on public.le_gazal_spins
  for select to authenticated
  using (
    exists (
      select 1
      from public.le_gazal_sessions s
      join public.fantasy_teams ft on ft.id = s.fantasy_team_id
      where s.id = le_gazal_spins.session_id
        and (
          ft.user_id = (select auth.uid())
          or (select public.is_gazal_admin())
        )
    )
  );

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

  if v_row.deadline > now() then
    raise exception 'Le Gazal only opens after the Fantasy deadline';
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

create or replace function public.le_gazal_spin(
  p_session_id uuid,
  p_bet integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_session public.le_gazal_sessions%rowtype;
  v_owner uuid;
  v_spin_id uuid := gen_random_uuid();
  v_r numeric;
  v_scenario text;
  v_base_multiplier integer := 0;
  v_round_multiplier numeric(4, 2) := 1;
  v_was_free boolean := false;
  v_reference_bet integer;
  v_bet_spent integer := 0;
  v_payout integer := 0;
  v_balance_before integer;
  v_balance_after integer;
  v_remaining integer;
  v_free_awarded integer := 0;
  v_next_bonus numeric(4, 2);
  v_next_free_bet integer;
  v_spin_number integer;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_session
  from public.le_gazal_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'Le Gazal session not found';
  end if;

  select ft.user_id
  into v_owner
  from public.fantasy_teams ft
  where ft.id = v_session.fantasy_team_id;

  if v_owner is distinct from v_uid then
    raise exception 'Le Gazal session not found';
  end if;

  if v_session.status <> 'active' then
    raise exception 'Le Gazal session is closed';
  end if;

  v_balance_before := v_session.balance;
  v_remaining := v_session.free_spins_remaining;
  v_next_bonus := v_session.bonus_multiplier;
  v_next_free_bet := v_session.free_spin_bet;

  if v_session.free_spins_remaining > 0 then
    v_was_free := true;
    v_reference_bet := v_session.free_spin_bet;

    if v_reference_bet is null then
      raise exception 'Invalid free-spin state';
    end if;

    v_round_multiplier := v_session.bonus_multiplier;
    v_remaining := v_session.free_spins_remaining - 1;
  else
    if p_bet not in (1, 3, 5, 10) then
      raise exception 'Bet must be 1, 3, 5 or 10';
    end if;

    if p_bet > v_session.balance then
      raise exception 'Insufficient Le Gazal balance';
    end if;

    v_reference_bet := p_bet;
    v_bet_spent := p_bet;
  end if;

  v_r := random() * 100;

  if v_r < 47 then
    v_scenario := 'lose';
    v_base_multiplier := 0;
  elsif v_r < 75 then
    v_scenario := 'small';
    v_base_multiplier := 1;
  elsif v_r < 88 then
    v_scenario := 'medium';
    v_base_multiplier := 2;
  elsif v_r < 93 then
    v_scenario := 'high';
    v_base_multiplier := 4;
  elsif v_r < 96 then
    v_scenario := 'wild';
    v_base_multiplier := 2;
  elsif v_r < 99 then
    v_scenario := 'scatter';
    v_base_multiplier := 0;
  else
    v_scenario := 'bonus';
    v_base_multiplier := 0;
  end if;

  v_payout := floor(
    v_reference_bet * v_base_multiplier * v_round_multiplier
  )::integer;

  if v_scenario = 'scatter' then
    v_free_awarded := 2;
    v_remaining := v_remaining + 2;
    v_next_bonus := greatest(v_next_bonus, 1.5);
    v_next_free_bet := v_reference_bet;
  elsif v_scenario = 'bonus' then
    v_free_awarded := 3;
    v_remaining := v_remaining + 3;
    v_next_bonus := greatest(v_next_bonus, 2);
    v_next_free_bet := v_reference_bet;
  elsif v_remaining = 0 then
    v_next_bonus := 1;
    v_next_free_bet := null;
  end if;

  v_balance_after := v_session.balance - v_bet_spent + v_payout;
  v_spin_number := v_session.total_spins + 1;

  update public.le_gazal_sessions
  set balance = v_balance_after,
      free_spins_remaining = v_remaining,
      free_spin_bet = v_next_free_bet,
      bonus_multiplier = v_next_bonus,
      total_spins = v_spin_number,
      total_bet = total_bet + v_bet_spent,
      total_payout = total_payout + v_payout,
      updated_at = now()
  where id = p_session_id;

  insert into public.le_gazal_spins (
    id,
    session_id,
    spin_number,
    scenario,
    bet,
    bet_spent,
    payout,
    round_multiplier,
    was_free_spin,
    free_spins_awarded,
    balance_before,
    balance_after
  )
  values (
    v_spin_id,
    p_session_id,
    v_spin_number,
    v_scenario,
    v_reference_bet,
    v_bet_spent,
    v_payout,
    v_round_multiplier,
    v_was_free,
    v_free_awarded,
    v_balance_before,
    v_balance_after
  );

  if v_bet_spent > 0 then
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
      v_session.fantasy_team_id,
      v_session.gameweek_id,
      'le_gazal_bet',
      'le_gazal_bet:' || v_spin_id::text,
      -v_bet_spent,
      jsonb_build_object(
        'session_id', p_session_id,
        'spin_id', v_spin_id,
        'scenario', v_scenario
      ),
      v_uid
    );
  end if;

  if v_payout > 0 then
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
      v_session.fantasy_team_id,
      v_session.gameweek_id,
      'le_gazal_payout',
      'le_gazal_payout:' || v_spin_id::text,
      v_payout,
      jsonb_build_object(
        'session_id', p_session_id,
        'spin_id', v_spin_id,
        'scenario', v_scenario,
        'free_spin', v_was_free
      ),
      v_uid
    );
  end if;

  return jsonb_build_object(
    'spin_id', v_spin_id,
    'session_id', p_session_id,
    'scenario', v_scenario,
    'bet', v_reference_bet,
    'bet_spent', v_bet_spent,
    'payout', v_payout,
    'round_multiplier', v_round_multiplier,
    'was_free_spin', v_was_free,
    'free_spins_awarded', v_free_awarded,
    'free_spins_remaining', v_remaining,
    'bonus_multiplier', v_next_bonus,
    'balance', v_balance_after,
    'spin_number', v_spin_number
  );
end;
$$;

create or replace function public.settle_le_gazal_session(
  p_session_id uuid,
  p_actor uuid,
  p_auto boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.le_gazal_sessions%rowtype;
  v_current_carry integer;
  v_max_carry integer := 30;
  v_total integer;
  v_new_carry integer;
  v_session_transfer integer;
  v_discarded integer;
  v_season text;
begin
  select *
  into v_session
  from public.le_gazal_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'Le Gazal session not found';
  end if;

  if v_session.status = 'cashed_out' then
    return to_jsonb(v_session);
  end if;

  select gw.season_id
  into v_season
  from public.gameweeks gw
  where gw.id = v_session.gameweek_id;

  select coalesce(fss.max_le_gazal_carry, 30)
  into v_max_carry
  from public.fantasy_season_settings fss
  where fss.season_id = v_season;

  v_max_carry := coalesce(v_max_carry, 30);

  select e.carry_out
  into v_current_carry
  from public.fantasy_gameweek_economy e
  where e.fantasy_team_id = v_session.fantasy_team_id
    and e.gameweek_id = v_session.gameweek_id
  for update;

  if not found then
    raise exception 'Fantasy economy not found';
  end if;

  v_total := v_current_carry + v_session.balance;
  v_new_carry := least(v_total, v_max_carry);
  v_session_transfer := greatest(v_new_carry - v_current_carry, 0);
  v_discarded := greatest(v_total - v_new_carry, 0);

  update public.fantasy_gameweek_economy
  set carry_out = v_new_carry,
      updated_at = now()
  where fantasy_team_id = v_session.fantasy_team_id
    and gameweek_id = v_session.gameweek_id;

  update public.le_gazal_sessions
  set status = 'cashed_out',
      cashout_amount = v_session_transfer,
      free_spins_remaining = 0,
      free_spin_bet = null,
      bonus_multiplier = 1,
      cashed_out_at = now(),
      updated_at = now()
  where id = p_session_id
  returning * into v_session;

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
    v_session.fantasy_team_id,
    v_session.gameweek_id,
    'le_gazal_cashout',
    'le_gazal_cashout:' || p_session_id::text,
    v_session_transfer,
    jsonb_build_object(
      'session_id', p_session_id,
      'automatic', p_auto,
      'balance_before_cashout', v_session.balance,
      'carry_after', v_new_carry
    ),
    p_actor
  )
  on conflict (fantasy_team_id, gameweek_id, event_key) do nothing;

  if v_discarded > 0 then
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
      v_session.fantasy_team_id,
      v_session.gameweek_id,
      'loss',
      'le_gazal_cap:' || p_session_id::text,
      -v_discarded,
      jsonb_build_object(
        'session_id', p_session_id,
        'reason', 'max_le_gazal_carry',
        'max_carry', v_max_carry
      ),
      p_actor
    )
    on conflict (fantasy_team_id, gameweek_id, event_key) do nothing;
  end if;

  return jsonb_build_object(
    'session_id', p_session_id,
    'status', 'cashed_out',
    'session_balance', v_session.balance,
    'transferred', v_session_transfer,
    'discarded', v_discarded,
    'carry_out', v_new_carry,
    'max_le_gazal_carry', v_max_carry,
    'automatic', p_auto
  );
end;
$$;

create or replace function public.cashout_le_gazal_session(
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select ft.user_id
  into v_owner
  from public.le_gazal_sessions s
  join public.fantasy_teams ft on ft.id = s.fantasy_team_id
  where s.id = p_session_id;

  if not found or v_owner is distinct from v_uid then
    raise exception 'Le Gazal session not found';
  end if;

  return public.settle_le_gazal_session(p_session_id, v_uid, false);
end;
$$;

create or replace function public.auto_cashout_le_gazal_sessions(
  p_gameweek_id bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
begin
  for v_session_id in
    select id
    from public.le_gazal_sessions
    where gameweek_id = p_gameweek_id
      and status = 'active'
    order by created_at
  loop
    perform public.settle_le_gazal_session(v_session_id, null, true);
  end loop;
end;
$$;

revoke all on function public.open_le_gazal_session(bigint, integer)
  from public, anon;
revoke all on function public.le_gazal_spin(uuid, integer)
  from public, anon;
revoke all on function public.cashout_le_gazal_session(uuid)
  from public, anon;
revoke all on function public.settle_le_gazal_session(uuid, uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.auto_cashout_le_gazal_sessions(bigint)
  from public, anon, authenticated;

grant execute on function public.open_le_gazal_session(bigint, integer)
  to authenticated;
grant execute on function public.le_gazal_spin(uuid, integer)
  to authenticated;
grant execute on function public.cashout_le_gazal_session(uuid)
  to authenticated;

comment on table public.le_gazal_sessions is
  'Server-authoritative Le Gazal balance allocated only from finalized savings of a valid Fantasy lineup.';
comment on table public.le_gazal_spins is
  'Immutable audit trail of server-generated Le Gazal outcomes. Clients cannot insert or edit spins.';
comment on column public.fantasy_season_settings.max_le_gazal_carry is
  'Maximum total carry allowed into the next Fantasy gameweek after Le Gazal cashout. Current default 30 keeps the effective 80-base budget <= 110.';
