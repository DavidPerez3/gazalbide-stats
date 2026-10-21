-- Living board: each activation, move, pickup and refill is saved with the spin.
create or replace function gazalbide_internal.le_gazal_event(p_kind text,p_actor text,p_row integer,p_col integer,p_amount integer,p_grid text[][],p_positions jsonb,p_collected integer)
returns jsonb language sql immutable security invoker set search_path='' as $$
select jsonb_build_object('kind',p_kind,'actor',p_actor,'row',p_row,'col',p_col,'amount',p_amount,'grid',to_jsonb(p_grid),'positions',p_positions,'collected',p_collected);
$$;
create or replace function gazalbide_internal.le_gazal_living(p_scenario text,p_seed integer,p_bet integer,p_multiplier numeric)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare
 v_stock text[]:=array['TEN','J','Q','K','A','WHISTLE','TROPHY'];
 v_grid text[][]:=array_fill(''::text,array[5,6]); v_initial text[][];
 v_row integer:=1+p_seed%2; v_positions jsonb; v_starts jsonb;
 v_events jsonb:='[]'; v_total integer:=0; v_amount integer;
 v_actor text; v_assistant text; v_turn integer; v_raccoon integer:=0; v_salamander integer:=0;
 v_count integer:=case p_scenario when 'small' then 1 when 'medium' then 2 when 'high' then 4 when 'wild' then 2 else 0 end;
 r integer; c integer; i integer; j integer; n integer; v_special text;
begin
 v_positions:=jsonb_build_object('raccoon',jsonb_build_object('row',v_row,'col',0),'salamander',jsonb_build_object('row',4-v_row,'col',5));v_starts:=v_positions;
 for r in 0..4 loop for c in 0..5 loop v_grid[r+1][c+1]:=v_stock[(r*2+c+p_seed)%7+1]; end loop; end loop;
 v_initial:=v_grid;
 for i in 0..v_count-1 loop
  v_actor:=case when (i+p_seed)%2=0 then 'raccoon' else 'salamander' end;
  v_assistant:=case when v_actor='raccoon' then 'salamander' else 'raccoon' end;
  if v_actor='raccoon' then v_turn:=v_raccoon;v_raccoon:=v_raccoon+1;r:=v_row+v_turn;c:=1;
  else v_turn:=v_salamander;v_salamander:=v_salamander+1;r:=4-v_row-v_turn;c:=4;end if;
  v_grid[r+1][c+1]:=case when v_actor='raccoon' then 'BALL' else 'HOOP' end;
  v_events:=v_events||jsonb_build_array(gazalbide_internal.le_gazal_event('transform',v_assistant,r,c,0,v_grid,v_positions,v_total));
  v_positions:=jsonb_set(v_positions,array[v_actor],jsonb_build_object('row',r,'col',c));
  v_events:=v_events||jsonb_build_array(gazalbide_internal.le_gazal_event('move',v_actor,r,c,0,v_grid,v_positions,v_total));
  v_amount:=floor((i+1)*p_bet*p_multiplier)::integer-floor(i*p_bet*p_multiplier)::integer;
  v_total:=v_total+v_amount;v_grid[r+1][c+1]:=null;
  v_events:=v_events||jsonb_build_array(gazalbide_internal.le_gazal_event('collect',v_actor,r,c,v_amount,v_grid,v_positions,v_total));
  for j in reverse r..1 loop v_grid[j+1][c+1]:=v_grid[j][c+1];end loop;
  v_grid[1][c+1]:=v_stock[(p_seed+i+3)%7+1];
  v_events:=v_events||jsonb_build_array(gazalbide_internal.le_gazal_event('cascade',v_actor,r,c,0,v_grid,v_positions,v_total));
 end loop;
 if p_scenario in ('scatter','scatter4','scatter5','bonus') then
  n:=case p_scenario when 'scatter5' then 5 when 'scatter4' then 4 else 3 end;
  v_special:=case when p_scenario='bonus' then 'BONUS_BALL' else 'SHIELD' end;
  for i in 0..n-1 loop r:=(p_seed+i*2)%5;c:=(p_seed+i)%6;v_grid[r+1][c+1]:=v_special;end loop;
  v_initial:=v_grid;
  for i in 0..n-1 loop r:=(p_seed+i*2)%5;c:=(p_seed+i)%6;
   v_events:=v_events||jsonb_build_array(gazalbide_internal.le_gazal_event('signal','salamander',r,c,0,v_grid,v_positions,0));
  end loop;
 elsif v_count=0 then
  v_positions:=jsonb_set(v_positions,'{raccoon}',jsonb_build_object('row',v_row,'col',1));
  v_events:=v_events||jsonb_build_array(gazalbide_internal.le_gazal_event('scout','raccoon',v_row,1,0,v_grid,v_positions,0));
  v_positions:=jsonb_set(v_positions,'{salamander}',jsonb_build_object('row',4-v_row,'col',4));
  v_events:=v_events||jsonb_build_array(gazalbide_internal.le_gazal_event('scout','salamander',4-v_row,4,0,v_grid,v_positions,0));
 end if;
 return jsonb_build_object('patternVersion',2,'mode','living','grid',to_jsonb(v_initial),'finalGrid',to_jsonb(v_grid),
  'starts',v_starts,'events',v_events,'amountWon',v_total,'winningCombinations','[]'::jsonb,'winningCellKeys','[]'::jsonb);
end;
$$;
revoke all on function gazalbide_internal.le_gazal_event(text,text,integer,integer,integer,text[][],jsonb,integer) from public,anon,authenticated;
revoke all on function gazalbide_internal.le_gazal_living(text,integer,integer,numeric) from public,anon,authenticated;

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

  v_visual := gazalbide_internal.le_gazal_living(v_scenario, get_byte(decode(md5(v_spin_id::text),'hex'),0), v_reference_bet, v_round_multiplier);
  if (v_visual->>'amountWon')::integer <> v_payout then raise exception 'Living board payout mismatch'; end if;

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
