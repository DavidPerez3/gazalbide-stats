-- Real Fantasy Le Gazal uses the same rarity tiers as the demo.
-- Per 10,000 paid spins: 35 three-scatter, 10 four-scatter, 1 five-scatter, 4 bonus.
-- Keep the server authoritative for bets and payouts.
alter table public.le_gazal_spins drop constraint if exists le_gazal_spins_scenario_check;
alter table public.le_gazal_spins add constraint le_gazal_spins_scenario_check
  check (scenario in ('lose','small','medium','high','wild','scatter','scatter4','scatter5','bonus'));

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

  -- 10,000 weighted outcomes: large scatters are genuinely rare.
  v_r := random() * 10000;
  if v_r < 6000 then
    v_scenario := 'lose'; v_base_multiplier := 0;
  elsif v_r < 8800 then
    v_scenario := 'small'; v_base_multiplier := 1;
  elsif v_r < 9650 then
    v_scenario := 'medium'; v_base_multiplier := 2;
  elsif v_r < 9850 then
    v_scenario := 'high'; v_base_multiplier := 4;
  elsif v_r < 9950 then
    v_scenario := 'wild'; v_base_multiplier := 2;
  elsif v_r < 9985 then
    v_scenario := 'scatter'; v_base_multiplier := 0;
  elsif v_r < 9995 then
    v_scenario := 'scatter4'; v_base_multiplier := 0;
  elsif v_r < 9996 then
    v_scenario := 'scatter5'; v_base_multiplier := 0;
  else
    v_scenario := 'bonus'; v_base_multiplier := 0;
  end if;

  v_payout := floor(
    v_reference_bet * v_base_multiplier * v_round_multiplier
  )::integer;

  if v_scenario = 'scatter' then
    v_free_awarded := 10;
    v_remaining := v_remaining + 10;
    v_next_bonus := greatest(v_next_bonus, 2);
    v_next_free_bet := v_reference_bet;
  elsif v_scenario = 'scatter4' then
    v_free_awarded := 15;
    v_remaining := v_remaining + 15;
    v_next_bonus := greatest(v_next_bonus, 3);
    v_next_free_bet := v_reference_bet;
  elsif v_scenario = 'scatter5' then
    v_free_awarded := 20;
    v_remaining := v_remaining + 20;
    v_next_bonus := greatest(v_next_bonus, 5);
    v_next_free_bet := v_reference_bet;
  elsif v_scenario = 'bonus' then
    v_free_awarded := 5;
    v_remaining := v_remaining + 5;
    v_next_bonus := greatest(v_next_bonus, 3);
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
