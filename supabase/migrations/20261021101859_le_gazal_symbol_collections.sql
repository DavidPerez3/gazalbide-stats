-- v4: resolve actual neighboring symbols, with no preselected payout tier.
create or replace function gazalbide_internal.le_gazal_collection_event(
  k text,a text,r integer,c integer,amount integer,g text[][],positions jsonb,won integer,b jsonb,sym text default null
) returns jsonb language sql immutable security invoker set search_path='' as $$
 select gazalbide_internal.le_gazal_event(k,a,r,c,amount,g,positions,won)||jsonb_build_object('board',b,'symbol',sym);
$$;
revoke all on function gazalbide_internal.le_gazal_collection_event(text,text,integer,integer,integer,text[],jsonb,integer,jsonb,text) from public,anon,authenticated;

create or replace function gazalbide_internal.le_gazal_resolve_collections(
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
 actor text; other text; sym text; best_sym text;
 r integer; c integer; j integer; d integer; origin_r integer; origin_c integer;
 best_r integer; best_c integer; val integer; best_value integer; score integer; best_score integer;
 lvl integer; units integer := 0; amount integer; won integer := 0; cell_key text;
 moved boolean; shields integer := 0; scenario text; free_spins integer; award_mult integer; unlocked integer;
 expanded text[][];
 directions integer[][] := array[[-1,0],[0,1],[1,0],[0,-1]];
begin
 if cols not between 6 and 8 or array_length(g,1)<>5 then raise exception 'Invalid collection grid'; end if;
 positions := jsonb_build_object('raccoon',jsonb_build_object('row',2,'col',0),'salamander',jsonb_build_object('row',2,'col',cols-1)); starts := positions;
 loop
  moved := false;
  foreach actor in array array['raccoon','salamander'] loop
   other := case actor when 'raccoon' then 'salamander' else 'raccoon' end;
   origin_r := (positions->actor->>'row')::integer; origin_c := (positions->actor->>'col')::integer;
   best_value := 0; best_score := 0;
   for d in 1..4 loop
    r := origin_r+directions[d][1]; c := origin_c+directions[d][2];
    if r<0 or r>4 or c<0 or c>=cols then continue; end if;
    if r=(positions->other->>'row')::integer and c=(positions->other->>'col')::integer then continue; end if;
    sym := g[r+1][c+1];
    val := case when actor='raccoon' and sym='BALL' or actor='salamander' and sym='HOOP' then 1
      when actor='raccoon' and sym='TROPHY' or actor='salamander' and sym='WHISTLE' then 2 else 0 end;
    score := val*(1+case when p_bonus then coalesce((b->'levels'->>(r||'-'||c))::integer,0) else 0 end);
    if score>best_score then best_score:=score;best_value:=val;best_r:=r;best_c:=c;best_sym:=sym;end if;
   end loop;
   if best_value=0 then continue;end if;
   moved:=true;r:=best_r;c:=best_c;cell_key:=r||'-'||c;
   lvl := case when p_bonus then coalesce((b->'levels'->>cell_key)::integer,0) else 0 end;
   positions:=jsonb_set(positions,array[actor],jsonb_build_object('row',r,'col',c));
   events:=events||jsonb_build_array(gazalbide_internal.le_gazal_collection_event('move',actor,r,c,0,g,positions,won,b,best_sym));
   amount:=floor((units+best_value*(1+lvl))*p_bet*p_multiplier)::integer-floor(units*p_bet*p_multiplier)::integer;
   units:=units+best_value*(1+lvl);won:=won+amount;g[r+1][c+1]:=null;
   events:=events||jsonb_build_array(gazalbide_internal.le_gazal_collection_event('collect',actor,r,c,amount,g,positions,won,b,best_sym));
   for j in reverse r..1 loop g[j+1][c+1]:=g[j][c+1];end loop;
   used[c+1]:=used[c+1]+1;g[1][c+1]:=p_refills[used[c+1]][c+1];
   events:=events||jsonb_build_array(gazalbide_internal.le_gazal_collection_event('cascade',actor,r,c,0,g,positions,won,b));
   if p_bonus then
    b:=jsonb_set(b,'{collections}',to_jsonb((b->>'collections')::integer+1));
    b:=jsonb_set(b,array['levels',cell_key],to_jsonb(least(2,lvl+1)));
    if lvl<2 then events:=events||jsonb_build_array(gazalbide_internal.le_gazal_collection_event('upgrade',actor,r,c,0,g,positions,won,b));end if;
   end if;
  end loop;
  exit when not moved;
 end loop;
 for r in 1..5 loop for c in 1..cols loop if initial_grid[r][c]='SHIELD' then shields:=shields+1;end if;end loop;end loop;
 scenario:=case when shields>=5 then 'scatter5' when shields=4 then 'scatter4' when shields=3 then 'scatter' when won>0 then 'small' else 'lose' end;
 free_spins:=case when shields>=5 then 20 when shields=4 then 15 when shields=3 then 10 else 0 end;
 award_mult:=case when shields>=5 then 5 when shields=4 then 3 when shields=3 then 2 else 1 end;
 if free_spins>0 then for r in 0..4 loop for c in 0..cols-1 loop
  if g[r+1][c+1]='SHIELD' then events:=events||jsonb_build_array(gazalbide_internal.le_gazal_collection_event('signal','salamander',r,c,0,g,positions,won,b));end if;
 end loop;end loop;end if;
 unlocked:=case when p_bonus then least(8,6+(b->>'collections')::integer/6) else 6 end;
 if unlocked>cols then
  expanded:=array_fill(null::text,array[5,unlocked]);
  for r in 0..4 loop for c in 0..unlocked-1 loop expanded[r+1][c+1]:=case when c<cols then g[r+1][c+1] when r%2=1 then 'TROPHY' else 'BALL' end;end loop;end loop;
  g:=expanded;b:=jsonb_set(b,'{columns}',to_jsonb(unlocked));
  events:=events||jsonb_build_array(gazalbide_internal.le_gazal_collection_event('expand','salamander',2,unlocked-1,0,g,positions,won,b));
 end if;
 return jsonb_build_object('patternVersion',4,'mode','living','bonusBoard',p_bonus,'grid',to_jsonb(initial_grid),'finalGrid',to_jsonb(g),'starts',starts,'events',events,
  'amountWon',won,'initialBoard',initial_board,'nextBoard',b,'winningCombinations','[]'::jsonb,'winningCellKeys','[]'::jsonb,'scenarioId',scenario,
  'freeSpinsAwarded',free_spins,'awardedMultiplier',award_mult,'activatedClutchTime',free_spins>0,
  'clutchMode',case when shields>=5 then 'SCATTER_MADNESS' when shields=4 then 'SCATTER_PLUS' when shields=3 then 'SCATTER' else 'NONE' end,
  'message',case when free_spins>0 then free_spins||' tiradas gratis x'||award_mult||'.' when won>0 then won||' 🍺 recogidas.' else 'Sin símbolos compatibles al lado. Sin premio.' end);
end;
$$;
revoke all on function gazalbide_internal.le_gazal_resolve_collections(text[],text[],integer,numeric,boolean,jsonb) from public,anon,authenticated;

create or replace function gazalbide_internal.le_gazal_collections(p_seed integer,p_bet integer,p_multiplier numeric,p_bonus boolean,p_board jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare
 state bigint := p_seed%2147483646+1;
 cols integer := case when p_bonus then coalesce((p_board->>'columns')::integer,6) else 6 end;
 g text[][];reserve text[][];r integer;c integer;pass integer;roll integer;sym text;left_half boolean;shield boolean;
begin
 g:=array_fill(''::text,array[5,cols]);reserve:=g;
 for pass in 0..1 loop for r in 0..4 loop for c in 0..cols-1 loop
  state:=state*16807%2147483647;shield:=state%10000<case when pass=0 then 140 else 0 end;
  if shield then sym:='SHIELD';else
   state:=state*16807%2147483647;roll:=state%10000;left_half:=c<cols::numeric/2;
   sym:=case when roll<400 then case when left_half then 'BALL' else 'HOOP' end
    when roll<500 then case when left_half then 'TROPHY' else 'WHISTLE' end
    when roll<9000 then case when left_half then 'HOOP' else 'BALL' end
    else case when left_half then 'WHISTLE' else 'TROPHY' end end;
  end if;
  if pass=0 then g[r+1][c+1]:=sym;else reserve[r+1][c+1]:=sym;end if;
 end loop;end loop;end loop;
 return gazalbide_internal.le_gazal_resolve_collections(g,reserve,p_bet,p_multiplier,p_bonus,p_board);
end;
$$;
revoke all on function gazalbide_internal.le_gazal_collections(integer,integer,numeric,boolean,jsonb) from public,anon,authenticated;

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

  v_visual := gazalbide_internal.le_gazal_collections(
    ('x'||substr(md5(v_spin_id::text),1,7))::bit(28)::integer,
    v_reference_bet,v_round_multiplier,v_was_free,v_session.board_state);
  v_scenario := v_visual->>'scenarioId';
  v_payout := (v_visual->>'amountWon')::integer;
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

