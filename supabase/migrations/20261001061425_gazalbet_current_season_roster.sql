-- GazalBet must use the roster attached to the gameweek season. Players from
-- previous seasons remain globally active so their historical stats continue
-- to work, but they must not be offered as current betting selections.

create or replace function public.gazalbet_quote_player_line(p_gameweek_id bigint,p_player_id bigint,p_stat_key text,p_direction text,p_line numeric)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_gw public.gameweeks%rowtype; v_player public.players%rowtype; v_mean numeric; v_sd numeric; v_games int;
  v_probability numeric; v_odds numeric; v_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_stat_key not in ('pts','three_pm','reb','ast','pf','pir') or p_direction not in ('over','under') then raise exception 'Invalid player market'; end if;
  if p_line < -10 or p_line > 80 or mod(p_line,1) <> .5 then raise exception 'Line must end in .5'; end if;
  select * into v_gw from public.gameweeks where id=p_gameweek_id;
  if not found or now()>=v_gw.deadline then raise exception 'Market closed'; end if;
  select p.* into v_player
  from public.players p
  join public.season_players sp on sp.player_id=p.id
  where p.id=p_player_id and p.active and sp.season_id=v_gw.season_id and sp.active;
  if not found then raise exception 'Player unavailable'; end if;
  select ps.status into v_status from public.player_statuses ps where ps.gameweek_id=p_gameweek_id and ps.player_number::text=coalesce(nullif(ltrim(v_player.number,'0'),''),'0') limit 1;
  if coalesce(v_status,'available') not in ('available','disponible') then raise exception 'Player unavailable'; end if;

  select avg(value),stddev_pop(value),count(*) into v_mean,v_sd,v_games from (
    select public.gazalbet_player_metric(p_stat_key,s.pts,s.three_pm,s.reb,s.ast,s.pf,s.pir) value
    from public.player_match_stats s join public.matches m on m.id=s.match_id
    where s.player_id=p_player_id and s.min_seconds>0 and m.status='published' and m.date<v_gw.date
    order by m.date desc limit 10
  ) history;
  if v_games=0 then v_mean:=case p_stat_key when 'pts' then 5 when 'reb' then 3 when 'ast' then 1 when 'pf' then 2 when 'pir' then 4 else .5 end; v_sd:=greatest(1,v_mean*.65); end if;
  v_sd:=greatest(coalesce(v_sd,0),case when p_stat_key in ('three_pm','ast','pf') then .9 else 2 end);
  v_probability:=1/(1+exp((p_line-v_mean)/(v_sd*.72)));
  v_probability:=(v_probability*least(v_games,8)+.5*greatest(0,8-v_games))/8;
  if p_direction='under' then v_probability:=1-v_probability; end if;
  v_probability:=greatest(.04,least(.92,v_probability));
  v_odds:=round(greatest(1.08,least(25,1/v_probability/1.08)),2);
  return jsonb_build_object('player_id',v_player.id,'player',v_player.name,'stat_key',p_stat_key,
    'stat_label',public.gazalbet_stat_label(p_stat_key),'direction',p_direction,'line',p_line,'odds',v_odds,
    'sample_size',v_games,'mean',round(v_mean,1),'label',v_player.name||' · '||public.gazalbet_stat_label(p_stat_key)||' · '||case when p_direction='over' then 'Más de ' else 'Menos de ' end||p_line::text);
end;
$$;

create or replace function public.get_gazalbet_builder(p_gameweek_id bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_gw public.gameweeks%rowtype; v_players jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_gw from public.gameweeks where id=p_gameweek_id;
  if not found then raise exception 'Gameweek not found'; end if;
  select coalesce(jsonb_agg(row_data order by sort_order),'[]'::jsonb) into v_players from (
    select sp.sort_order,jsonb_build_object('id',p.id,'name',p.name,'number',sp.jersey_number,'photo_path',p.photo_path,
      'games',count(s.*),'averages',jsonb_build_object('pts',round(coalesce(avg(s.pts),5),1),'three_pm',round(coalesce(avg(s.three_pm),.5),1),
      'reb',round(coalesce(avg(s.reb),3),1),'ast',round(coalesce(avg(s.ast),1),1),'pf',round(coalesce(avg(s.pf),2),1),'pir',round(coalesce(avg(s.pir),4),1))) row_data
    from public.players p
    join public.season_players sp on sp.player_id=p.id and sp.season_id=v_gw.season_id and sp.active
    left join public.player_statuses ps on ps.gameweek_id=p_gameweek_id and ps.player_number::text=coalesce(nullif(ltrim(sp.jersey_number,'0'),''),'0')
    left join public.player_match_stats s on s.player_id=p.id and s.min_seconds>0
    left join public.matches m on m.id=s.match_id and m.status='published' and m.date<v_gw.date
    where p.active and coalesce(ps.status,'available') in ('available','disponible')
    group by p.id,p.name,sp.jersey_number,p.photo_path,sp.sort_order
  ) available;
  return jsonb_build_object('players',v_players,'categories',jsonb_build_array(
    jsonb_build_object('key','pts','label','Puntos'),jsonb_build_object('key','three_pm','label','Triples'),
    jsonb_build_object('key','reb','label','Rebotes'),jsonb_build_object('key','ast','label','Asistencias'),
    jsonb_build_object('key','pf','label','Faltas'),jsonb_build_object('key','pir','label','Valoración')));
end;
$$;

revoke all on function public.gazalbet_quote_player_line(bigint,bigint,text,text,numeric) from public,anon;
revoke all on function public.get_gazalbet_builder(bigint) from public,anon;
grant execute on function public.gazalbet_quote_player_line(bigint,bigint,text,text,numeric) to authenticated;
grant execute on function public.get_gazalbet_builder(bigint) to authenticated;
