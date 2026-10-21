-- Occupied cells are empty, including initial grids and every playback frame.
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
 affected integer[]; column_no integer; free_rows integer[]; symbols text[]; missing integer; idx integer; n integer;
 occupied boolean[][] := array_fill(false,array[5,cols]);
 directions integer[][] := array[[-1,0],[0,1],[1,0],[0,-1]];
begin
 if cols not between 6 and 8 or array_length(g,1)<>5 then raise exception 'Invalid collection grid'; end if;
 positions := jsonb_build_object('yellow',jsonb_build_object('row',0,'col',0),'pink',jsonb_build_object('row',0,'col',cols-1),'blue',jsonb_build_object('row',4,'col',0),'green',jsonb_build_object('row',4,'col',cols-1)); starts := positions;
 occupied[1][1]:=true;occupied[1][cols]:=true;occupied[5][1]:=true;occupied[5][cols]:=true;
 for r in 0..4 loop for c in 0..cols-1 loop
  if occupied[r+1][c+1] then g[r+1][c+1]:=null;end if;
 end loop;end loop;
 initial_grid:=g;
 loop
  moved := false;
  foreach actor in array array['yellow','pink','blue','green'] loop
   origin_r := (positions->actor->>'row')::integer; origin_c := (positions->actor->>'col')::integer;
   best_value := 0; best_score := 0;
   for d in 1..4 loop
    r := origin_r+directions[d][1]; c := origin_c+directions[d][2];
    if r<0 or r>4 or c<0 or c>=cols then continue; end if;
    if occupied[r+1][c+1] then continue; end if;
    sym := g[r+1][c+1];
    val := case when actor='yellow' and sym='BALL' or actor='pink' and sym='WHISTLE' or actor='blue' and sym='SHOE' or actor='green' and sym='HOOP' then 1 else 0 end;
    score := val*(1+case when p_bonus then coalesce((b->'levels'->>(r||'-'||c))::integer,0) else 0 end);
    if score>best_score then best_score:=score;best_value:=val;best_r:=r;best_c:=c;best_sym:=sym;end if;
   end loop;
   if best_value=0 then continue;end if;
   moved:=true;r:=best_r;c:=best_c;cell_key:=r||'-'||c;
   lvl := case when p_bonus then coalesce((b->'levels'->>cell_key)::integer,0) else 0 end;
   g[r+1][c+1]:=null;
   occupied[origin_r+1][origin_c+1]:=false;occupied[r+1][c+1]:=true;
   positions:=jsonb_set(positions,array[actor],jsonb_build_object('row',r,'col',c));
   events:=events||jsonb_build_array(gazalbide_internal.le_gazal_salamander_event('move',actor,r,c,0,g,positions,won,b,best_sym));
   amount:=(floor((units+best_value*(1+lvl))*p_bet*p_multiplier*10)-floor(units*p_bet*p_multiplier*10))/100;
   units:=units+best_value*(1+lvl);won:=won+amount;g[r+1][c+1]:=null;
   events:=events||jsonb_build_array(gazalbide_internal.le_gazal_salamander_event('collect',actor,r,c,amount,g,positions,won,b,best_sym));
   affected:=case when origin_c=c then array[c] else array[origin_c,c] end;
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
   events:=events||jsonb_build_array(gazalbide_internal.le_gazal_salamander_event('cascade',actor,r,c,0,g,positions,won,b)||jsonb_build_object('columns',to_jsonb(affected)));
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
 return jsonb_build_object('patternVersion',6,'mode','living','payoutUnit',0.1,'bonusBoard',p_bonus,'grid',to_jsonb(initial_grid),'finalGrid',to_jsonb(g),'starts',starts,'events',events,
  'amountWon',won,'initialBoard',initial_board,'nextBoard',b,'winningCombinations','[]'::jsonb,'winningCellKeys','[]'::jsonb,'scenarioId',scenario,
  'freeSpinsAwarded',free_spins,'awardedMultiplier',award_mult,'activatedClutchTime',free_spins>0,
  'clutchMode',case when shields>=5 then 'SCATTER_MADNESS' when shields=4 then 'SCATTER_PLUS' when shields=3 then 'SCATTER' else 'NONE' end,
  'message',case when free_spins>0 then free_spins||' tiradas gratis x'||award_mult||'.' when won>0 then trim_scale(won)||' 🍺 recogidas.' else 'Sin símbolos compatibles al lado. Sin premio.' end);
end;
$$;
revoke all on function gazalbide_internal.le_gazal_resolve_salamanders(text[],text[],integer,numeric,boolean,jsonb) from public,anon,authenticated;

