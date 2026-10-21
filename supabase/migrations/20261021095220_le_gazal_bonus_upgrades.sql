-- Retain progress only during free spins. Existing sessions start with a fresh floor.
alter table public.le_gazal_sessions add column board_state jsonb;
alter table public.le_gazal_sessions add constraint le_gazal_board_state_object
  check (board_state is null or jsonb_typeof(board_state) = 'object');

create or replace function gazalbide_internal.le_gazal_bonus_living(
  p_scenario text, p_seed integer, p_bet integer, p_multiplier numeric, p_board jsonb
) returns jsonb language plpgsql immutable security invoker set search_path = '' as $$
declare
  b jsonb := coalesce(p_board, '{"columns":6,"collections":0,"levels":{}}'::jsonb);
  initial_board jsonb := b;
  cols integer := (b->>'columns')::integer;
  base_row integer := 1 + p_seed % 2;
  positions jsonb;
  starts jsonb;
  g text[][];
  initial_grid text[][];
  events jsonb := '[]';
  r integer; c integer; i integer; j integer; n integer;
  base_count integer := case p_scenario when 'small' then 1 when 'medium' then 2 when 'high' then 4 when 'wild' then 2 else 0 end;
  pickups integer;
  raccoon_turn integer := 0; salamander_turn integer := 0; turn_no integer;
  actor text; assistant text; cell_key text; lvl integer;
  units integer := 0; won integer := 0; amount integer;
  unlocked integer; sym text;
  stock text[] := array['TEN','J','Q','K','A','WHISTLE','TROPHY'];
begin
  if cols not between 6 and 8 or (b->>'collections')::integer < 0 then raise exception 'Invalid bonus board'; end if;
  positions := jsonb_build_object('raccoon',jsonb_build_object('row',base_row,'col',0),
    'salamander',jsonb_build_object('row',4-base_row,'col',cols-1));
  starts := positions;
  g := array_fill(''::text,array[5,cols]);
  for r in 0..4 loop for c in 0..cols-1 loop g[r+1][c+1] := stock[(r*2+c+p_seed)%7+1]; end loop; end loop;
  initial_grid := g;
  pickups := case when base_count > 0 then base_count+cols-6 else 0 end;
  if pickups > 0 then for i in 0..pickups-1 loop
    if (i+p_seed)%2=0 then
      actor := 'raccoon'; assistant := 'salamander'; turn_no := raccoon_turn; raccoon_turn := raccoon_turn+1;
      r := base_row+turn_no; c := 1;
    else
      actor := 'salamander'; assistant := 'raccoon'; turn_no := salamander_turn; salamander_turn := salamander_turn+1;
      r := 4-base_row-turn_no; c := cols-2;
    end if;
    cell_key := r||'-'||c; lvl := coalesce((b->'levels'->>cell_key)::integer,0);
    if lvl not between 0 and 2 then raise exception 'Invalid tile level'; end if;
    g[r+1][c+1] := case actor when 'raccoon' then 'BALL' else 'HOOP' end;
    events := events || jsonb_build_array(gazalbide_internal.le_gazal_event('transform',assistant,r,c,0,g,positions,won)||jsonb_build_object('board',b));
    positions := jsonb_set(positions,array[actor],jsonb_build_object('row',r,'col',c));
    events := events || jsonb_build_array(gazalbide_internal.le_gazal_event('move',actor,r,c,0,g,positions,won)||jsonb_build_object('board',b));
    amount := floor((units+1+lvl)*p_bet*p_multiplier)::integer-floor(units*p_bet*p_multiplier)::integer;
    units := units+1+lvl; won := won+amount; g[r+1][c+1] := null;
    events := events || jsonb_build_array(gazalbide_internal.le_gazal_event('collect',actor,r,c,amount,g,positions,won)||jsonb_build_object('board',b));
    for j in reverse r..1 loop g[j+1][c+1] := g[j][c+1]; end loop;
    g[1][c+1] := stock[(p_seed+i+3)%7+1];
    events := events || jsonb_build_array(gazalbide_internal.le_gazal_event('cascade',actor,r,c,0,g,positions,won)||jsonb_build_object('board',b));
    b := jsonb_set(b,'{collections}',to_jsonb((b->>'collections')::integer+1));
    b := jsonb_set(b,array['levels',cell_key],to_jsonb(least(2,lvl+1)));
    events := events || jsonb_build_array(gazalbide_internal.le_gazal_event('upgrade',assistant,r,c,0,g,positions,won)||jsonb_build_object('board',b));
  end loop; end if;
  if p_scenario in ('scatter','scatter4','scatter5','bonus') then
    n := case p_scenario when 'scatter5' then 5 when 'scatter4' then 4 else 3 end;
    sym := case p_scenario when 'bonus' then 'BONUS_BALL' else 'SHIELD' end;
    for i in 0..n-1 loop
      r := (p_seed+i*2)%5; c := (p_seed+i)%cols;
      initial_grid[r+1][c+1] := sym; g[r+1][c+1] := sym;
    end loop;
    for i in 0..n-1 loop
      events := events || jsonb_build_array(gazalbide_internal.le_gazal_event('signal','salamander',(p_seed+i*2)%5,(p_seed+i)%cols,0,g,positions,won)||jsonb_build_object('board',b));
    end loop;
  elsif pickups=0 then
    positions := jsonb_set(positions,'{raccoon}',jsonb_build_object('row',base_row,'col',1));
    events := events || jsonb_build_array(gazalbide_internal.le_gazal_event('scout','raccoon',base_row,1,0,g,positions,won)||jsonb_build_object('board',b));
    positions := jsonb_set(positions,'{salamander}',jsonb_build_object('row',4-base_row,'col',cols-2));
    events := events || jsonb_build_array(gazalbide_internal.le_gazal_event('scout','salamander',4-base_row,cols-2,0,g,positions,won)||jsonb_build_object('board',b));
  end if;
  unlocked := least(8,6+(b->>'collections')::integer/6);
  if unlocked > cols then
    -- Rebuild a rectangular array while retaining every original cell.
    declare expanded text[][] := array_fill(''::text,array[5,unlocked]);
    begin
      for r in 0..4 loop for c in 0..unlocked-1 loop
        expanded[r+1][c+1] := case when c<cols then g[r+1][c+1] else stock[(r*2+c+p_seed)%7+1] end;
      end loop; end loop;
      g := expanded;
    end;
    b := jsonb_set(b,'{columns}',to_jsonb(unlocked));
    events := events || jsonb_build_array(gazalbide_internal.le_gazal_event('expand','salamander',2,unlocked-1,0,g,positions,won)||jsonb_build_object('board',b));
  end if;
  return jsonb_build_object('patternVersion',3,'mode','living','bonusBoard',true,'grid',to_jsonb(initial_grid),'finalGrid',to_jsonb(g),
    'starts',starts,'events',events,'amountWon',won,'initialBoard',initial_board,'nextBoard',b,'winningCombinations','[]'::jsonb,'winningCellKeys','[]'::jsonb);
end;
$$;
revoke all on function gazalbide_internal.le_gazal_bonus_living(text,integer,integer,numeric,jsonb) from public,anon,authenticated;

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
  v_board jsonb;
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

  if v_was_free then
    v_visual := gazalbide_internal.le_gazal_bonus_living(v_scenario, get_byte(decode(md5(v_spin_id::text),'hex'),0), v_reference_bet, v_round_multiplier, v_session.board_state);
    v_payout := (v_visual->>'amountWon')::integer;
  else
    v_visual := gazalbide_internal.le_gazal_living(v_scenario, get_byte(decode(md5(v_spin_id::text),'hex'),0), v_reference_bet, v_round_multiplier);
    if (v_visual->>'amountWon')::integer <> v_payout then raise exception 'Living board payout mismatch'; end if;
  end if;
  if v_remaining > 0 then
    v_board := coalesce(v_visual->'nextBoard', '{"columns":6,"collections":0,"levels":{}}'::jsonb);
  end if;

  v_balance_after := v_session.balance - v_bet_spent + v_payout;
  v_spin_number := v_session.total_spins + 1;

  update public.le_gazal_sessions
  set balance = v_balance_after,
      board_state = v_board,
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
    'board_state', v_board,
    'spin_number', v_spin_number
  );
end;
$function$;

-- Cashout (manual or automatic) also ends floor progression; historical spin snapshots remain intact.
create or replace function gazalbide_internal.le_gazal_clear_bonus_board()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.status <> 'active' or new.free_spins_remaining = 0 then new.board_state := null; end if;
  return new;
end;
$$;
revoke all on function gazalbide_internal.le_gazal_clear_bonus_board() from public,anon,authenticated;
create trigger le_gazal_clear_bonus_board before update on public.le_gazal_sessions
for each row execute function gazalbide_internal.le_gazal_clear_bonus_board();
