-- Preserve whole-beer history while allowing positive fractional collection prizes.
alter table public.le_gazal_sessions alter column balance type numeric(14,2), alter column total_payout type numeric(14,2);
alter table public.le_gazal_spins alter column payout type numeric(14,2), alter column balance_before type numeric(14,2), alter column balance_after type numeric(14,2);
alter table public.fantasy_economy_ledger alter column amount type numeric(14,2);

create or replace function gazalbide_internal.le_gazal_salamander_event(
  k text,a text,r integer,c integer,amount numeric,g text[][],positions jsonb,won numeric,b jsonb,sym text default null
) returns jsonb language sql immutable security invoker set search_path='' as $$
 select jsonb_build_object('kind',k,'actor',a,'row',r,'col',c,'amount',amount,'grid',to_jsonb(g),'positions',positions,'collected',won,'board',b,'symbol',sym);
$$;
revoke all on function gazalbide_internal.le_gazal_salamander_event(text,text,integer,integer,numeric,text[],jsonb,numeric,jsonb,text) from public,anon,authenticated;

create or replace function gazalbide_internal.le_gazal_resolve_salamanders(
 p_grid text[][],p_refills text[][],p_bet integer,p_multiplier numeric,p_bonus boolean,p_board jsonb
) returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare
 g text[][] := p_grid;
 initial_grid text[][] := p_grid;
 cols integer := array_length(p_grid,2);
 b jsonb := case when p_bonus then coalesce(p_board,'{"columns":6,"collections":0,"levels":{}}') else '{"columns":6,"collections":0,"levels":{}}' end;
 initial_board jsonb := b;
 positions jsonb;
 starts jsonb;
 events jsonb := '[]';
 used integer[] := array_fill(0,array[cols]);
 actor text; sym text; best_sym text;
 r integer; c integer; j integer; d integer; origin_r integer; origin_c integer;
 best_r integer; best_c integer; val integer; best_value integer; score integer; best_score integer;
 lvl integer; units integer := 0; amount numeric; won numeric := 0; cell_key text;
 moved boolean; shields integer := 0; scenario text; free_spins integer; award_mult integer; unlocked integer;
 expanded text[][];
 directions integer[][] := array[[-1,0],[0,1],[1,0],[0,-1]];
begin
 if cols not between 6 and 8 or array_length(g,1)<>5 then raise exception 'Invalid collection grid'; end if;
 positions := jsonb_build_object('yellow',jsonb_build_object('row',0,'col',0),'pink',jsonb_build_object('row',0,'col',cols-1),'blue',jsonb_build_object('row',4,'col',0),'green',jsonb_build_object('row',4,'col',cols-1)); starts := positions;
 loop
  moved := false;
  foreach actor in array array['yellow','pink','blue','green'] loop
   origin_r := (positions->actor->>'row')::integer; origin_c := (positions->actor->>'col')::integer;
   best_value := 0; best_score := 0;
   for d in 1..4 loop
    r := origin_r+directions[d][1]; c := origin_c+directions[d][2];
    if r<0 or r>4 or c<0 or c>=cols then continue; end if;
    if exists(select 1 from jsonb_each(positions) p where p.key<>actor and (p.value->>'row')::integer=r and (p.value->>'col')::integer=c) then continue; end if;
    sym := g[r+1][c+1];
    val := case when actor='yellow' and sym='BALL' or actor='pink' and sym='WHISTLE' or actor='blue' and sym='SHOE' or actor='green' and sym='HOOP' then 1 else 0 end;
    score := val*(1+case when p_bonus then coalesce((b->'levels'->>(r||'-'||c))::integer,0) else 0 end);
    if score>best_score then best_score:=score;best_value:=val;best_r:=r;best_c:=c;best_sym:=sym;end if;
   end loop;
   if best_value=0 then continue;end if;
   moved:=true;r:=best_r;c:=best_c;cell_key:=r||'-'||c;
   lvl := case when p_bonus then coalesce((b->'levels'->>cell_key)::integer,0) else 0 end;
   positions:=jsonb_set(positions,array[actor],jsonb_build_object('row',r,'col',c));
   events:=events||jsonb_build_array(gazalbide_internal.le_gazal_salamander_event('move',actor,r,c,0,g,positions,won,b,best_sym));
   amount:=(floor((units+best_value*(1+lvl))*p_bet*p_multiplier*10)-floor(units*p_bet*p_multiplier*10))/100;
   units:=units+best_value*(1+lvl);won:=won+amount;g[r+1][c+1]:=null;
   events:=events||jsonb_build_array(gazalbide_internal.le_gazal_salamander_event('collect',actor,r,c,amount,g,positions,won,b,best_sym));
   for j in reverse r..1 loop g[j+1][c+1]:=g[j][c+1];end loop;
   used[c+1]:=used[c+1]+1;g[1][c+1]:=p_refills[used[c+1]][c+1];
   events:=events||jsonb_build_array(gazalbide_internal.le_gazal_salamander_event('cascade',actor,r,c,0,g,positions,won,b));
   if p_bonus then
    b:=jsonb_set(b,'{collections}',to_jsonb((b->>'collections')::integer+1));
    b:=jsonb_set(b,array['levels',cell_key],to_jsonb(least(2,lvl+1)));
    if lvl<2 then events:=events||jsonb_build_array(gazalbide_internal.le_gazal_salamander_event('upgrade',actor,r,c,0,g,positions,won,b));end if;
   end if;
  end loop;
  exit when not moved;
 end loop;
 for r in 1..5 loop for c in 1..cols loop if initial_grid[r][c]='SHIELD' then shields:=shields+1;end if;end loop;end loop;
 scenario:=case when shields>=5 then 'scatter5' when shields=4 then 'scatter4' when shields=3 then 'scatter' when won>0 then 'small' else 'lose' end;
 free_spins:=case when shields>=5 then 20 when shields=4 then 15 when shields=3 then 10 else 0 end;
 award_mult:=case when shields>=5 then 5 when shields=4 then 3 when shields=3 then 2 else 1 end;
 if free_spins>0 then for r in 0..4 loop for c in 0..cols-1 loop
  if g[r+1][c+1]='SHIELD' then events:=events||jsonb_build_array(gazalbide_internal.le_gazal_salamander_event('signal','yellow',r,c,0,g,positions,won,b));end if;
 end loop;end loop;end if;
 unlocked:=case when p_bonus then least(8,6+(b->>'collections')::integer/6) else 6 end;
 if unlocked>cols then
  expanded:=array_fill(null::text,array[5,unlocked]);
  for r in 0..4 loop for c in 0..unlocked-1 loop expanded[r+1][c+1]:=case when c<cols then g[r+1][c+1] else (array['BALL','WHISTLE','SHOE','HOOP'])[(r+c)%4+1] end;end loop;end loop;
  g:=expanded;b:=jsonb_set(b,'{columns}',to_jsonb(unlocked));
  events:=events||jsonb_build_array(gazalbide_internal.le_gazal_salamander_event('expand','green',2,unlocked-1,0,g,positions,won,b));
 end if;
 return jsonb_build_object('patternVersion',5,'mode','living','payoutUnit',0.1,'bonusBoard',p_bonus,'grid',to_jsonb(initial_grid),'finalGrid',to_jsonb(g),'starts',starts,'events',events,
  'amountWon',won,'initialBoard',initial_board,'nextBoard',b,'winningCombinations','[]'::jsonb,'winningCellKeys','[]'::jsonb,'scenarioId',scenario,
  'freeSpinsAwarded',free_spins,'awardedMultiplier',award_mult,'activatedClutchTime',free_spins>0,
  'clutchMode',case when shields>=5 then 'SCATTER_MADNESS' when shields=4 then 'SCATTER_PLUS' when shields=3 then 'SCATTER' else 'NONE' end,
  'message',case when free_spins>0 then free_spins||' tiradas gratis x'||award_mult||'.' when won>0 then trim_scale(won)||' 🍺 recogidas.' else 'Sin símbolos compatibles al lado. Sin premio.' end);
end;
$$;
revoke all on function gazalbide_internal.le_gazal_resolve_salamanders(text[],text[],integer,numeric,boolean,jsonb) from public,anon,authenticated;

create or replace function gazalbide_internal.le_gazal_salamanders(p_seed integer,p_bet integer,p_multiplier numeric,p_bonus boolean,p_board jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare
 state bigint := p_seed%2147483646+1;
 cols integer := case when p_bonus then coalesce((p_board->>'columns')::integer,6) else 6 end;
 g text[][];reserve text[][];r integer;c integer;pass integer;roll integer;sym text;shield boolean;
begin
 g:=array_fill(''::text,array[5,cols]);reserve:=g;
 for pass in 0..1 loop for r in 0..4 loop for c in 0..cols-1 loop
  state:=state*16807%2147483647;shield:=state%10000<case when pass=0 then 140 else 0 end;
  if shield then sym:='SHIELD';else
   state:=state*16807%2147483647;roll:=state%10000;
   sym:=(array['BALL','WHISTLE','SHOE','HOOP'])[roll%4+1];
  end if;
  if pass=0 then g[r+1][c+1]:=sym;else reserve[r+1][c+1]:=sym;end if;
 end loop;end loop;end loop;
 return gazalbide_internal.le_gazal_resolve_salamanders(g,reserve,p_bet,p_multiplier,p_bonus,p_board);
end;
$$;
revoke all on function gazalbide_internal.le_gazal_salamanders(integer,integer,numeric,boolean,jsonb) from public,anon,authenticated;

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
  v_scenario text;
  v_round_multiplier numeric(4, 2) := 1;
  v_was_free boolean := false;
  v_reference_bet integer;
  v_bet_spent integer := 0;
  v_payout numeric(14,2) := 0;
  v_balance_before numeric(14,2);
  v_balance_after numeric(14,2);
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

  v_visual := gazalbide_internal.le_gazal_salamanders(
    ('x'||substr(md5(v_spin_id::text),1,7))::bit(28)::integer,
    v_reference_bet,v_round_multiplier,v_was_free,v_session.board_state);
  v_scenario := v_visual->>'scenarioId';
  v_payout := (v_visual->>'amountWon')::numeric;
  v_free_awarded := (v_visual->>'freeSpinsAwarded')::integer;
  if v_free_awarded > 0 then
    v_remaining := v_remaining+v_free_awarded;
    v_next_bonus := greatest(v_next_bonus,(v_visual->>'awardedMultiplier')::numeric);
    v_next_free_bet := v_reference_bet;
  elsif v_remaining=0 then
    v_next_bonus:=1; v_next_free_bet:=null;
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


-- Fantasy budgets remain whole beers; cashout explicitly floors and reports the remainder.
CREATE OR REPLACE FUNCTION public.settle_le_gazal_session(p_session_id uuid, p_actor uuid, p_auto boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_session public.le_gazal_sessions%rowtype;
  v_current_carry integer;
  v_max_carry integer := 30;
  v_total integer;
  v_new_carry integer;
  v_session_transfer integer;
  v_discarded numeric(14,2);
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

  v_total := v_current_carry + floor(v_session.balance)::integer;
  v_new_carry := least(v_total, v_max_carry);
  v_session_transfer := greatest(v_new_carry - v_current_carry, 0);
  v_discarded := greatest(v_current_carry + v_session.balance - v_new_carry, 0);

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
        'reason', case when v_total > v_max_carry then 'max_le_gazal_carry' else 'fractional_remainder' end,
        'fraction_discarded', v_session.balance-floor(v_session.balance),
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
$function$
;

revoke all on function public.settle_le_gazal_session(uuid,uuid,boolean) from public,anon,authenticated;
