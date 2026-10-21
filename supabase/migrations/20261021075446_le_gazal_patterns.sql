-- Store the exact board with each future spin; payouts and outcome weights remain unchanged.
create schema if not exists gazalbide_internal;
revoke all on schema gazalbide_internal from public, anon, authenticated;
alter table public.le_gazal_spins add column if not exists visual_result jsonb;
create or replace function gazalbide_internal.le_gazal_paylines()
returns jsonb language sql immutable security invoker set search_path = '' as $paths$
select $json$[
  {
    "id": 1,
    "label": "Horizontal 1",
    "rows": [
      0,
      0,
      0,
      0,
      0,
      0
    ]
  },
  {
    "id": 2,
    "label": "Horizontal 2",
    "rows": [
      1,
      1,
      1,
      1,
      1,
      1
    ]
  },
  {
    "id": 3,
    "label": "Horizontal 3",
    "rows": [
      2,
      2,
      2,
      2,
      2,
      2
    ]
  },
  {
    "id": 4,
    "label": "Horizontal 4",
    "rows": [
      3,
      3,
      3,
      3,
      3,
      3
    ]
  },
  {
    "id": 5,
    "label": "Horizontal 5",
    "rows": [
      4,
      4,
      4,
      4,
      4,
      4
    ]
  },
  {
    "id": 6,
    "label": "Diagonal descendente",
    "rows": [
      0,
      1,
      2,
      3,
      4,
      3
    ]
  },
  {
    "id": 7,
    "label": "Diagonal ascendente",
    "rows": [
      4,
      3,
      2,
      1,
      0,
      1
    ]
  },
  {
    "id": 8,
    "label": "Diagonal baja",
    "rows": [
      1,
      2,
      3,
      4,
      3,
      2
    ]
  },
  {
    "id": 9,
    "label": "Diagonal alta",
    "rows": [
      3,
      2,
      1,
      0,
      1,
      2
    ]
  },
  {
    "id": 10,
    "label": "V abierta",
    "rows": [
      0,
      2,
      4,
      4,
      2,
      0
    ]
  },
  {
    "id": 11,
    "label": "V invertida",
    "rows": [
      4,
      2,
      0,
      0,
      2,
      4
    ]
  },
  {
    "id": 12,
    "label": "V corta",
    "rows": [
      1,
      3,
      4,
      4,
      3,
      1
    ]
  },
  {
    "id": 13,
    "label": "V corta invertida",
    "rows": [
      3,
      1,
      0,
      0,
      1,
      3
    ]
  },
  {
    "id": 14,
    "label": "Zigzag superior",
    "rows": [
      0,
      1,
      0,
      1,
      0,
      1
    ]
  },
  {
    "id": 15,
    "label": "Zigzag superior inverso",
    "rows": [
      1,
      0,
      1,
      0,
      1,
      0
    ]
  },
  {
    "id": 16,
    "label": "Zigzag medio alto",
    "rows": [
      1,
      2,
      1,
      2,
      1,
      2
    ]
  },
  {
    "id": 17,
    "label": "Zigzag medio inverso",
    "rows": [
      2,
      1,
      2,
      1,
      2,
      1
    ]
  },
  {
    "id": 18,
    "label": "Zigzag medio bajo",
    "rows": [
      2,
      3,
      2,
      3,
      2,
      3
    ]
  },
  {
    "id": 19,
    "label": "Zigzag bajo inverso",
    "rows": [
      3,
      2,
      3,
      2,
      3,
      2
    ]
  },
  {
    "id": 20,
    "label": "Zigzag inferior",
    "rows": [
      4,
      3,
      4,
      3,
      4,
      3
    ]
  }
]
$json$::jsonb;
$paths$;

create or replace function gazalbide_internal.le_gazal_visual(p_scenario text,p_seed uuid,p_payout integer)
returns jsonb language plpgsql immutable security invoker set search_path = '' as $$
declare
  v_paths jsonb := gazalbide_internal.le_gazal_paylines();
  v_grid text[][] := array_fill(''::text,array[5,6]);
  v_pool text[]; v_symbol text; v_length integer; v_path jsonb; v_ids integer[];
  v_index integer := get_byte(decode(md5(p_seed::text),'hex'),0) % 20;
  v_shift integer := get_byte(decode(md5(p_seed::text),'hex'),1) % 9;
  v_dual boolean := p_scenario='high' and get_byte(decode(md5(p_seed::text),'hex'),2)%2=0;
  v_combinations jsonb := '[]'; v_keys jsonb := '[]'; v_cells jsonb;
  r integer; c integer; i integer; v_count integer; v_special text;
begin
  v_symbol := case p_scenario when 'small' then 'TEN' when 'medium' then 'HOOP' when 'wild' then 'JERSEY88' else 'TROPHY' end;
  if v_dual then v_symbol := 'BALL'; end if;
  v_pool := array_remove(array['TEN','J','Q','K','A','BALL','HOOP','WHISTLE','JERSEY88','TROPHY'],v_symbol);
  for r in 0..4 loop for c in 0..5 loop
    v_grid[r+1][c+1] := v_pool[(c+r*2+v_shift)%9+1];
  end loop; end loop;
  if p_scenario in ('small','medium','high','wild') then
    v_length := case when p_scenario='small' then 3 when p_scenario='high' and not v_dual then 6 else 4 end;
    v_ids := case when v_dual then array[5,6] else array[v_index] end;
    foreach i in array v_ids loop
      v_path := v_paths->i; v_cells := '[]';
      for c in 0..v_length-1 loop
        r := (v_path->'rows'->>c)::integer;
        v_grid[r+1][c+1] := case when not v_dual and ((p_scenario='high' and c=2) or (p_scenario='wild' and c=1)) then 'JERSEY_WILD' else v_symbol end;
        v_cells := v_cells || jsonb_build_array(jsonb_build_object('row',r,'col',c));
        v_keys := v_keys || jsonb_build_array(r::text||'-'||c::text);
      end loop;
      v_combinations := v_combinations || jsonb_build_array(jsonb_build_object(
        'id','line-'||(i+1)::text,'lineId',i+1,'lineLabel',v_path->>'label',
        'symbolId',v_symbol,'matchCount',v_length,'cells',v_cells,
        'usedWild',not v_dual and p_scenario in ('high','wild'),
        'amountWon',p_payout / cardinality(v_ids)));
    end loop;
  elsif p_scenario in ('scatter','scatter4','scatter5','bonus') then
    v_count := case p_scenario when 'scatter5' then 5 when 'scatter4' then 4 else 3 end;
    v_special := case when p_scenario='bonus' then 'BONUS_BALL' else 'SHIELD' end;
    for i in select n from generate_series(0,29) n order by md5(p_seed::text||':'||n::text) limit v_count loop
      r := i/6; c := i%6; v_grid[r+1][c+1] := v_special;
      v_keys := v_keys || jsonb_build_array(r::text||'-'||c::text);
    end loop;
  elsif p_scenario <> 'lose' then raise exception 'Unknown Le Gazal scenario';
  end if;
  return jsonb_build_object('patternVersion',1,'grid',to_jsonb(v_grid),'winningCombinations',v_combinations,
    'winningCellKeys',v_keys,'paylineCount',20);
end;
$$;
revoke all on function gazalbide_internal.le_gazal_paylines() from public, anon, authenticated;
revoke all on function gazalbide_internal.le_gazal_visual(text,uuid,integer) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.le_gazal_spin(p_session_id uuid, p_bet integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_visual jsonb;
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

  v_visual := gazalbide_internal.le_gazal_visual(v_scenario, v_spin_id, v_payout);

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
    balance_after,
    visual_result
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
    v_balance_after,
    v_visual
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
    'visual_result', v_visual,
    'spin_number', v_spin_number
  );
end;
$function$

