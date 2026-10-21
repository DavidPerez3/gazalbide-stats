-- Longest visible simple route first, then total floor value, then up/right/down/left.
-- A deterministic 4096-node search budget bounds pathological monochrome boards.
create or replace function gazalbide_internal.le_gazal_salamander_route(p_grid text[][],p_positions jsonb,p_actor text,p_levels jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare
 cols integer:=array_length(p_grid,2);
 rr integer[]:=array[(p_positions->p_actor->>'row')::integer];
 cc integer[]:=array[(p_positions->p_actor->>'col')::integer];
 next_dir integer[]:=array[0]; scores integer[]:=array[0];
 best_rr integer[]:='{}'; best_cc integer[]:='{}';best_score integer:=0;best_depth integer:=0;
 occupied boolean[][]:=array_fill(false,array[5,cols]);seen boolean[][]:=array_fill(false,array[5,cols]);
 directions integer[][]:=array[[-1,0],[0,1],[1,0],[0,-1]];
 depth integer:=0;nodes integer:=0;d integer;r integer;c integer;i integer;v integer;sym text;pos jsonb;result jsonb:='[]';
begin
 for pos in select value from jsonb_each(p_positions) loop occupied[(pos->>'row')::integer+1][(pos->>'col')::integer+1]:=true;end loop;
 while depth>=0 and nodes<4096 loop
  if next_dir[depth+1]>=4 then
   if depth>0 then seen[rr[depth+1]+1][cc[depth+1]+1]:=false;end if;
   depth:=depth-1;continue;
  end if;
  d:=next_dir[depth+1]+1;next_dir[depth+1]:=d;
  r:=rr[depth+1]+directions[d][1];c:=cc[depth+1]+directions[d][2];
  if r<0 or r>=5 or c<0 or c>=cols then continue;end if;
  if occupied[r+1][c+1] or seen[r+1][c+1] then continue;end if;
  sym:=p_grid[r+1][c+1];
  v:=case when p_actor='yellow' and sym='BALL' or p_actor='pink' and sym='WHISTLE' or p_actor='blue' and sym='SHOE' or p_actor='green' and sym='HOOP' then 1 else 0 end;
  if v=0 then continue;end if;
  nodes:=nodes+1;depth:=depth+1;rr[depth+1]:=r;cc[depth+1]:=c;next_dir[depth+1]:=0;seen[r+1][c+1]:=true;
  scores[depth+1]:=scores[depth]+1+coalesce((p_levels->>(r||'-'||c))::integer,0);
  if depth>best_depth or depth=best_depth and scores[depth+1]>best_score then
   best_depth:=depth;best_score:=scores[depth+1];best_rr:=rr[2:depth+1];best_cc:=cc[2:depth+1];
  end if;
 end loop;
 for i in 1..best_depth loop
  r:=best_rr[i];c:=best_cc[i];
  result:=result||jsonb_build_array(jsonb_build_object('row',r,'col',c,'symbol',p_grid[r+1][c+1],'value',1,'score',1+coalesce((p_levels->>(r||'-'||c))::integer,0)));
 end loop;
 return result;
end;
$$;
revoke all on function gazalbide_internal.le_gazal_salamander_route(text[],jsonb,text,jsonb) from public,anon,authenticated;
-- Cumulative 5/10/15 pickup extras are shared by all actors and reset each spin.
-- Only the bet scales extras; floor and scatter multipliers apply to pickups alone.
create or replace function gazalbide_internal.le_gazal_resolve_salamanders(
 p_grid text[][],p_refills text[][],p_bet integer,p_multiplier numeric,p_bonus boolean,p_board jsonb,p_positions jsonb
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
 chain_count integer := 0; chain_bonus numeric := 0; extra numeric;
 lvl integer; units integer := 0; amount numeric; won numeric := 0; cell_key text;
 moved boolean; shields integer := 0; scenario text; free_spins integer; award_mult integer; unlocked integer;
 expanded text[][];
 affected integer[]; column_no integer; free_rows integer[]; symbols text[]; missing integer; idx integer; n integer;
 occupied boolean[][] := array_fill(false,array[5,cols]);
 route jsonb;target jsonb;pos jsonb;exhausted boolean:=false;
begin
 if cols not between 6 and 8 or array_length(g,1)<>5 then raise exception 'Invalid collection grid'; end if;
 positions := coalesce(p_positions,jsonb_build_object('yellow',jsonb_build_object('row',0,'col',0),'pink',jsonb_build_object('row',0,'col',cols-1),'blue',jsonb_build_object('row',4,'col',0),'green',jsonb_build_object('row',4,'col',cols-1))); starts := positions;
 if (select count(*) from jsonb_each(positions))<>4 or not positions ?& array['yellow','pink','blue','green'] then raise exception 'Invalid salamander positions';end if;
 for pos in select value from jsonb_each(positions) loop
  r:=(pos->>'row')::integer;c:=(pos->>'col')::integer;
  if r is null or c is null or r<0 or r>=5 or c<0 or c>=cols then raise exception 'Invalid salamander positions';end if;
  if occupied[r+1][c+1] then raise exception 'Invalid salamander positions';end if;
  occupied[r+1][c+1]:=true;
 end loop;
 for r in 0..4 loop for c in 0..cols-1 loop
  if occupied[r+1][c+1] then g[r+1][c+1]:=null;end if;
 end loop;end loop;
 initial_grid:=g;
 loop
  moved := false;
  foreach actor in array array['yellow','pink','blue','green'] loop
   route:=gazalbide_internal.le_gazal_salamander_route(g,positions,actor,case when p_bonus then b->'levels' else '{}'::jsonb end);
   if jsonb_array_length(route)=0 then continue;end if;
   moved:=true;affected:=array[(positions->actor->>'col')::integer];
   for target in select value from jsonb_array_elements(route) loop
   origin_r:=(positions->actor->>'row')::integer;origin_c:=(positions->actor->>'col')::integer;
   r:=(target->>'row')::integer;c:=(target->>'col')::integer;best_sym:=target->>'symbol';best_value:=1;cell_key:=r||'-'||c;
   if not c=any(affected) then affected:=array_append(affected,c);end if;
   lvl := case when p_bonus then coalesce((b->'levels'->>cell_key)::integer,0) else 0 end;
   g[r+1][c+1]:=null;
   occupied[origin_r+1][origin_c+1]:=false;occupied[r+1][c+1]:=true;
   positions:=jsonb_set(positions,array[actor],jsonb_build_object('row',r,'col',c));
   events:=events||jsonb_build_array(gazalbide_internal.le_gazal_salamander_event('move',actor,r,c,0,g,positions,won,b,best_sym)||jsonb_build_object('chainCount',chain_count,'chainBonus',chain_bonus));
   amount:=(floor((units+best_value*(1+lvl))*p_bet*p_multiplier*5)-floor(units*p_bet*p_multiplier*5))/100;
   units:=units+best_value*(1+lvl);won:=won+amount;g[r+1][c+1]:=null;chain_count:=chain_count+1;
   events:=events||jsonb_build_array(gazalbide_internal.le_gazal_salamander_event('collect',actor,r,c,amount,g,positions,won,b,best_sym)||jsonb_build_object('chainCount',chain_count,'chainBonus',chain_bonus));
   extra:=case chain_count when 5 then 0.3 when 10 then 0.9 when 15 then 1.8 else 0 end*p_bet;
   if extra>0 then
    chain_bonus:=chain_bonus+extra;won:=won+extra;
    events:=events||jsonb_build_array(gazalbide_internal.le_gazal_salamander_event('chain',actor,r,c,extra,g,positions,won,b)||jsonb_build_object('chainCount',chain_count,'chainBonus',chain_bonus));
   end if;
   if p_bonus then
    b:=jsonb_set(b,'{collections}',to_jsonb((b->>'collections')::integer+1));
    b:=jsonb_set(b,array['levels',cell_key],to_jsonb(least(2,lvl+1)));
    if lvl<2 then events:=events||jsonb_build_array(gazalbide_internal.le_gazal_salamander_event('upgrade',actor,r,c,0,g,positions,won,b)||jsonb_build_object('chainCount',chain_count,'chainBonus',chain_bonus));end if;
   end if;
   end loop;
   foreach column_no in array affected loop
    free_rows:='{}';symbols:='{}';
    for j in 0..4 loop
     if not occupied[j+1][column_no+1] then
      free_rows:=array_append(free_rows,j);
      if g[j+1][column_no+1] is not null then symbols:=array_append(symbols,g[j+1][column_no+1]);end if;
     end if;
    end loop;
    missing:=cardinality(free_rows)-cardinality(symbols);
    if missing>0 then for n in 1..missing loop
     used[column_no+1]:=used[column_no+1]+1;
     symbols:=array_prepend(p_refills[used[column_no+1]][column_no+1],symbols);
    end loop;end if;
    for idx in 1..cardinality(free_rows) loop g[free_rows[idx]+1][column_no+1]:=symbols[idx];end loop;
   end loop;
   events:=events||jsonb_build_array(gazalbide_internal.le_gazal_salamander_event('cascade',actor,r,c,0,g,positions,won,b)||jsonb_build_object('chainCount',chain_count,'chainBonus',chain_bonus)||jsonb_build_object('columns',to_jsonb(affected)));

  end loop;
  exit when not moved;
 end loop;
 for r in 1..5 loop for c in 1..cols loop if initial_grid[r][c]='SHIELD' then shields:=shields+1;end if;end loop;end loop;
 scenario:=case when shields>=5 then 'scatter5' when shields=4 then 'scatter4' when shields=3 then 'scatter' when won>0 then 'small' else 'lose' end;
 free_spins:=case when shields>=5 then 20 when shields=4 then 15 when shields=3 then 10 else 0 end;
 award_mult:=case when shields>=5 then 5 when shields=4 then 3 when shields=3 then 2 else 1 end;
 if free_spins>0 then for r in 0..4 loop for c in 0..cols-1 loop
  if g[r+1][c+1]='SHIELD' then events:=events||jsonb_build_array(gazalbide_internal.le_gazal_salamander_event('signal','yellow',r,c,0,g,positions,won,b)||jsonb_build_object('chainCount',chain_count,'chainBonus',chain_bonus));end if;
 end loop;end loop;end if;
 unlocked:=case when p_bonus then least(8,6+(b->>'collections')::integer/6) else 6 end;
 if unlocked>cols then
  expanded:=array_fill(null::text,array[5,unlocked]);
  for r in 0..4 loop for c in 0..unlocked-1 loop expanded[r+1][c+1]:=case when c<cols then g[r+1][c+1] else (array['BALL','WHISTLE','SHOE','HOOP'])[(r+c)%4+1] end;end loop;end loop;
  g:=expanded;b:=jsonb_set(b,'{columns}',to_jsonb(unlocked));
  events:=events||jsonb_build_array(gazalbide_internal.le_gazal_salamander_event('expand','green',2,unlocked-1,0,g,positions,won,b)||jsonb_build_object('chainCount',chain_count,'chainBonus',chain_bonus));
 end if;
 for r in 0..4 loop for c in 0..cols-1 loop
  if g[r+1][c+1] is null and not occupied[r+1][c+1] then exhausted:=true;end if;
 end loop;end loop;
 return jsonb_build_object('patternVersion',8,'reserveExhausted',exhausted,'chainCount',chain_count,'chainBonus',chain_bonus,'chainBet',p_bet,'mode','living','payoutUnit',0.05,'bonusBoard',p_bonus,'grid',to_jsonb(initial_grid),'finalGrid',to_jsonb(g),'starts',starts,'events',events,
  'amountWon',won,'initialBoard',initial_board,'nextBoard',b,'winningCombinations','[]'::jsonb,'winningCellKeys','[]'::jsonb,'scenarioId',scenario,
  'freeSpinsAwarded',free_spins,'awardedMultiplier',award_mult,'activatedClutchTime',free_spins>0,
  'clutchMode',case when shields>=5 then 'SCATTER_MADNESS' when shields=4 then 'SCATTER_PLUS' when shields=3 then 'SCATTER' else 'NONE' end,
  'message',case when free_spins>0 then free_spins||' tiradas gratis x'||award_mult||'.' when won>0 then trim_scale(won)||' 🍺 recogidas.' else 'Sin símbolos compatibles al lado. Sin premio.' end);
end;
$$;
revoke all on function gazalbide_internal.le_gazal_resolve_salamanders(text[],text[],integer,numeric,boolean,jsonb,jsonb) from public,anon,authenticated;


-- Keep the existing private fixture signature, using distinct corner positions by default.
create or replace function gazalbide_internal.le_gazal_resolve_salamanders(p_grid text[][],p_refills text[][],p_bet integer,p_multiplier numeric,p_bonus boolean,p_board jsonb)
returns jsonb language sql immutable security invoker set search_path='' as $$
 select gazalbide_internal.le_gazal_resolve_salamanders(p_grid,p_refills,p_bet,p_multiplier,p_bonus,p_board,null);
$$;
revoke all on function gazalbide_internal.le_gazal_resolve_salamanders(text[],text[],integer,numeric,boolean,jsonb) from public,anon,authenticated;
create or replace function gazalbide_internal.le_gazal_salamanders(p_seed integer,p_bet integer,p_multiplier numeric,p_bonus boolean,p_board jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare
 state bigint := p_seed%2147483646+1;
 cols integer := case when p_bonus then coalesce((p_board->>'columns')::integer,6) else 6 end;
 g text[][];reserve text[][];r integer;c integer;pass integer;roll integer;sym text;shield boolean;available integer[];idx integer;cell integer;actor text;positions jsonb:='{}';
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
 select array_agg(i order by i) into available from generate_series(0,5*cols-1) i;
 foreach actor in array array['yellow','pink','blue','green'] loop
  state:=state*16807%2147483647;idx:=(state%10000)%cardinality(available)+1;cell:=available[idx];
  available:=array_remove(available,cell);
  positions:=positions||jsonb_build_object(actor,jsonb_build_object('row',cell/cols,'col',cell%cols));
 end loop;
 return gazalbide_internal.le_gazal_resolve_salamanders(g,reserve,p_bet,p_multiplier,p_bonus,p_board,positions);
end;
$$;
revoke all on function gazalbide_internal.le_gazal_salamanders(integer,integer,numeric,boolean,jsonb) from public,anon,authenticated;

