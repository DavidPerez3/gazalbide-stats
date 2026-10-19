-- Public federation data, separate from our official player statistics.
create schema if not exists gazalbide_internal;
revoke all on schema gazalbide_internal from public,anon,authenticated;
create table public.league_sources (
  season_id text primary key, group_id integer not null,
  source_url text not null, enabled boolean not null default true,
  request_id bigint, requested_at timestamptz, synced_at timestamptz,
  last_error text, fixture_count integer not null default 0
);
create table public.league_team_aliases(alias_key text primary key,team_key text not null);
create table public.league_fixtures (
  season_id text not null references public.league_sources(season_id), round integer not null check(round>0),
  date date not null, home_key text not null, away_key text not null, home_name text not null, away_name text not null,
  home_score integer, away_score integer,
  primary key(season_id,round,home_key,away_key),
  check(home_key<>away_key), check((home_score is null)=(away_score is null)),
  check(home_score between 0 and 300),check(away_score between 0 and 300)
);
create index league_fixtures_date_idx on public.league_fixtures(season_id,date);
alter table public.league_sources enable row level security;
alter table public.league_team_aliases enable row level security;
alter table public.league_fixtures enable row level security;
create policy league_sources_read on public.league_sources for select to anon,authenticated using(true);
create policy league_aliases_read on public.league_team_aliases for select to anon,authenticated using(true);
create policy league_fixtures_read on public.league_fixtures for select to anon,authenticated using(true);
revoke all on public.league_sources,public.league_team_aliases,public.league_fixtures from anon,authenticated;
grant select on public.league_sources,public.league_team_aliases,public.league_fixtures to anon,authenticated;
insert into public.league_sources(season_id,group_id,source_url) values
('2026-2027',1001,'https://basketaraba.com/es/fab-online/calendario-y-resultados-federacion-alavesa-de-baloncesto?grupo=1001&seccion=2');
insert into public.league_team_aliases values ('gazalbide','gazalbide'),('gazalbidea','gazalbide'),('emvitvedrisko','vedrisko'),('vedrisko','vedrisko');
create function public.league_team_key(p_name text) returns text language sql stable set search_path='' as $$
  with normalized as(select regexp_replace(translate(lower(coalesce(p_name,'')),'áéíóúüñ','aeiouun'),'[^a-z0-9]','','g') k)
  select coalesce(a.team_key,n.k) from normalized n left join public.league_team_aliases a on a.alias_key=n.k
$$;
revoke all on function public.league_team_key(text) from public;
grant execute on function public.league_team_key(text) to anon,authenticated;
create function gazalbide_internal.league_text(p_text text) returns text language sql immutable set search_path='' as $$
 select trim(regexp_replace(replace(replace(replace(replace(replace(regexp_replace(p_text,'<[^>]+>','','g'),'&amp;','&'),'&nbsp;',' '),'&#039;',''''),'&quot;','"'),'&ndash;','–'),'[[:space:]]+',' ','g'))
$$;
-- Validate the entire page before touching the last successful snapshot.
create function gazalbide_internal.import_league_html(p_season text,p_html text) returns integer
language plpgsql security definer set search_path='' as $$
declare src public.league_sources%rowtype; tbl text[]; hdr text[]; row_data text[]; scores text[];
  day date; home text; away text; hk text; ak text; payload jsonb:='[]'; item jsonb; n int;
begin
 select * into strict src from public.league_sources where season_id=p_season for update;
 if p_html !~ ('GRUPO:[[:space:]]*'||src.group_id||'[[:space:]]') or p_html not like '%GAZALBIDE A%' then raise exception 'Federation group does not match'; end if;
 for tbl in select regexp_matches(regexp_replace(p_html,'<!--.*?-->','','gs'),'<table[^>]*?>(.*?)</table>','gis') loop
  hdr:=regexp_match(tbl[1],'Jornada[[:space:]]+?([0-9]+).*?<th[^>]*?>[[:space:]]*?([0-9]{2})-([0-9]{2})-([0-9]{4})','is');
  if hdr is null then continue; end if;
  day:=make_date(hdr[4]::int,hdr[3]::int,hdr[2]::int);
  if day<make_date(split_part(p_season,'-',1)::int,7,1) or day>=make_date(split_part(p_season,'-',2)::int,7,1) then raise exception 'Federation season does not match'; end if;
  for row_data in select regexp_matches(tbl[1],'<tr[^>]*?>[[:space:]]*?<td[^>]*?>(.*?)</td>[[:space:]]*?<td[^>]*?>(.*?)</td>[[:space:]]*?<td[^>]*?>(.*?)</td>[[:space:]]*?</tr>','gis') loop
   home:=gazalbide_internal.league_text(row_data[1]);away:=gazalbide_internal.league_text(row_data[3]);
   hk:=public.league_team_key(home);ak:=public.league_team_key(away);
   if hk='descansa' or ak='descansa' then continue; end if;
   if hk='' or ak='' or hk=ak then raise exception 'Invalid federation teams'; end if;
   scores:=regexp_match(gazalbide_internal.league_text(row_data[2]),'^([0-9]{1,3})[[:space:]]*[-–—][[:space:]]*([0-9]{1,3})$');
   if scores is null and gazalbide_internal.league_text(row_data[2]) not in ('–','-','—','') then raise exception 'Unknown score format'; end if;
   if scores[1]='0' and scores[2]='0' then scores:=null;end if;
   if scores is not null and day>current_date then raise exception 'Future match has a result: % (% vs %) at %',day,home,away,current_date; end if;
   payload:=payload||jsonb_build_array(jsonb_build_object('round',hdr[1]::int,'date',day,'home',home,'away',away,'hk',hk,'ak',ak,'hs',scores[1]::int,'as',scores[2]::int));
  end loop;
 end loop;
 n:=jsonb_array_length(payload);
 if n<20 or n>300 or (src.fixture_count>0 and n<src.fixture_count*.8) then raise exception 'Incomplete federation calendar (%)',n; end if;
 delete from public.league_fixtures where season_id=p_season;
 for item in select value from jsonb_array_elements(payload) loop
  insert into public.league_fixtures values(p_season,(item->>'round')::int,(item->>'date')::date,item->>'hk',item->>'ak',item->>'home',item->>'away',(item->>'hs')::int,(item->>'as')::int);
 end loop;
 update public.league_sources set synced_at=now(),last_error=null,fixture_count=n where season_id=p_season;
 return n;
end $$;
revoke all on function gazalbide_internal.league_text(text),gazalbide_internal.import_league_html(text,text) from public,anon,authenticated;
-- Network requests are asynchronous. No browser CORS, credentials or extra secrets.
create function gazalbide_internal.request_league_sync() returns void language plpgsql security definer set search_path='' as $$
declare src public.league_sources%rowtype;
begin
 for src in select * from public.league_sources where enabled and (requested_at is null or requested_at<now()-interval '30 minutes') for update skip locked loop
  update public.league_sources set request_id=net.http_get(url:=src.source_url,timeout_milliseconds:=20000),requested_at=now() where season_id=src.season_id;
 end loop;
end $$;
create function gazalbide_internal.consume_league_sync() returns void language plpgsql security definer set search_path='' as $$
declare src record;
begin
 for src in select s.season_id,r.status_code,r.content,r.error_msg from public.league_sources s join net._http_response r on r.id=s.request_id for update of s skip locked loop
  begin
   if src.status_code<>200 or src.error_msg is not null then raise exception 'Federation HTTP error: % %',src.status_code,src.error_msg; end if;
   perform gazalbide_internal.import_league_html(src.season_id,src.content);
   update public.league_sources set request_id=null where season_id=src.season_id;
  exception when others then
   update public.league_sources set last_error=left(sqlerrm,250),request_id=null where season_id=src.season_id;
  end;
 end loop;
 update public.league_sources set last_error='Federation request timed out; keeping previous data',request_id=null where request_id is not null and requested_at<now()-interval '10 minutes';
end $$;
revoke all on function gazalbide_internal.request_league_sync(),gazalbide_internal.consume_league_sync() from public,anon,authenticated;
-- CRON_SETUP: extensions already enabled on production; skipped by fixture tests.
select cron.schedule('gazalbide-league-request','15 6,12,18 * * *','select gazalbide_internal.request_league_sync()');
select cron.schedule('gazalbide-league-consume','*/5 * * * *','select gazalbide_internal.consume_league_sync()');

-- Ratings use the whole group, so defeating stronger opponents is worth more.
-- Only completed games strictly before the predicted game are eligible.
create function public.league_match_model(p_opponent text,p_date date,p_season text,p_home boolean default true)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare teams jsonb:='{}'; r record; h jsonb; a jsonb; key text; node jsonb; expected numeric; change numeric; outcome numeric;
 g jsonb; o jsonb; opponent_key text:=public.league_team_key(p_opponent); gn int; onum int;
 league_mean numeric; margin numeric; total numeric; probability numeric; h2h jsonb; hn int; hm numeric; ht numeric; hw numeric;
 fallback_margin numeric; fallback_total numeric; group_games int:=0; source_data jsonb; standings jsonb; fixture_count int;
begin
 for r in select f.* from public.league_fixtures f where season_id=p_season and f.date<p_date and f.date<=current_date and home_score is not null order by f.date,round,home_key,away_key loop
  h:=coalesce(teams->r.home_key,jsonb_build_object('name',r.home_name,'rating',1500,'games',0,'wins',0,'losses',0,'pf',0,'pa',0,'form','[]'::jsonb));
  a:=coalesce(teams->r.away_key,jsonb_build_object('name',r.away_name,'rating',1500,'games',0,'wins',0,'losses',0,'pf',0,'pa',0,'form','[]'::jsonb));
  expected:=1/(1+power(10::numeric,(((a->>'rating')::numeric-(h->>'rating')::numeric-35)/400)));
  outcome:=case when r.home_score>r.away_score then 1 when r.home_score<r.away_score then 0 else .5 end;
  change:=24*(outcome-expected)*least(1.5,greatest(.5,ln(abs(r.home_score-r.away_score)+1)/ln(10)));
  h:=h||jsonb_build_object('rating',(h->>'rating')::numeric+change,'games',(h->>'games')::int+1,'wins',(h->>'wins')::int+(outcome=1)::int,'losses',(h->>'losses')::int+(outcome=0)::int,'pf',(h->>'pf')::int+r.home_score,'pa',(h->>'pa')::int+r.away_score,'form',(h->'form')||jsonb_build_array(case when outcome=1 then 'V' when outcome=0 then 'D' else 'E' end));
  a:=a||jsonb_build_object('rating',(a->>'rating')::numeric-change,'games',(a->>'games')::int+1,'wins',(a->>'wins')::int+(outcome=0)::int,'losses',(a->>'losses')::int+(outcome=1)::int,'pf',(a->>'pf')::int+r.away_score,'pa',(a->>'pa')::int+r.home_score,'form',(a->'form')||jsonb_build_array(case when outcome=0 then 'V' when outcome=1 then 'D' else 'E' end));
  teams:=jsonb_set(jsonb_set(teams,array[r.home_key],h),array[r.away_key],a);group_games:=group_games+1;
 end loop;
 -- Include teams who have not played yet (byes do not count as games).
 for r in select home_key k,home_name n from public.league_fixtures where season_id=p_season union select away_key,away_name from public.league_fixtures where season_id=p_season loop
  if not teams ? r.k then teams:=jsonb_set(teams,array[r.k],jsonb_build_object('name',r.n,'rating',1500,'games',0,'wins',0,'losses',0,'pf',0,'pa',0,'form','[]'::jsonb));end if;
 end loop;
 g:=coalesce(teams->'gazalbide','{}');o:=coalesce(teams->opponent_key,'{}');
 gn:=coalesce((g->>'games')::int,0);onum:=coalesce((o->>'games')::int,0);
 select (coalesce(sum(home_score+away_score),0)+12*65)::numeric/(count(*)*2+12) into league_mean from public.league_fixtures where season_id=p_season and date<p_date and date<=current_date and home_score is not null;
 select avg(m.gazal_pts-m.opp_pts),avg(m.gazal_pts+m.opp_pts) into fallback_margin,fallback_total from (select * from public.matches where status='published' and not is_friendly and date<p_date and date<=current_date order by date desc limit 8)m;
 margin:=coalesce(fallback_margin,0)*.35;total:=coalesce(fallback_total,130);
 if gn+onum>0 then
  margin:=.6*((coalesce((g->>'rating')::numeric,1500)-coalesce((o->>'rating')::numeric,1500))/15)
   +.4*((coalesce((g->>'pf')::numeric,0)-coalesce((g->>'pa')::numeric,0))/(gn+3)-(coalesce((o->>'pf')::numeric,0)-coalesce((o->>'pa')::numeric,0))/(onum+3));
  total:=((coalesce((g->>'pf')::numeric,0)+coalesce((g->>'pa')::numeric,0)+6*league_mean)/(gn+3)+(coalesce((o->>'pf')::numeric,0)+coalesce((o->>'pa')::numeric,0)+6*league_mean)/(onum+3))/2;
 end if;
 -- Punctuation-insensitive identity matches historical names without fuzzy guessing.
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'date',date,'opponent',opponent,'gazal',gazal_pts,'rival',opp_pts) order by date desc),'[]'),count(*),
  sum((gazal_pts-opp_pts)*power(.5::numeric,(p_date-date)::numeric/365))/nullif(sum(power(.5::numeric,(p_date-date)::numeric/365)),0),
  sum((gazal_pts+opp_pts)*power(.5::numeric,(p_date-date)::numeric/365))/nullif(sum(power(.5::numeric,(p_date-date)::numeric/365)),0)
 into h2h,hn,hm,ht from public.matches where status='published' and not is_friendly and date<p_date and date<=current_date and date>=p_date-interval '3 years' and public.league_team_key(opponent)=opponent_key;
 hw:=least(.2,hn::numeric/(hn+8));
 margin:=margin*(1-hw)+coalesce(hm,0)*hw+case when p_home then 1.5 else -1.5 end;
 total:=total*(1-hw/2)+coalesce(ht,total)*hw/2;
 probability:=greatest(.1,least(.9,1/(1+exp(-margin/8))));
 select coalesce(jsonb_agg(value order by (value->>'wins')::int desc,((value->>'pf')::int-(value->>'pa')::int) desc,value->>'name'),'[]') into standings from jsonb_each(teams);
 select jsonb_build_object('url',source_url,'synced_at',synced_at,'last_error',last_error) into source_data from public.league_sources where season_id=p_season;
 select count(*) into fixture_count from public.league_fixtures where season_id=p_season;
 return jsonb_build_object('version','league-v1','opponent',p_opponent,'opponent_key',opponent_key,'date',p_date,'season',p_season,'home',p_home,
 'gazalbide',g,'rival',o,'standings',standings,'group_games',group_games,'fixtures',fixture_count,'h2h',h2h,'h2h_count',hn,
 'margin',round(margin,2),'total',round(total,2),'probability',probability,'sample_size',gn+onum,'source',source_data,
 'provisional',least(gn,onum)<4,'h2h_weight',hw);
end $$;
revoke all on function public.league_match_model(text,date,text,boolean) from public;
grant execute on function public.league_match_model(text,date,text,boolean) to anon,authenticated;

create function public.get_league_preview(p_opponent text default null,p_date date default null,p_season text default '2026-2027')
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare f public.league_fixtures%rowtype; opponent text; home boolean:=true; day date;
begin
 if p_opponent is null then
  select * into f from public.league_fixtures where season_id=p_season and (home_key='gazalbide' or away_key='gazalbide') and date>=current_date and home_score is null order by date limit 1;
 else
  select * into f from public.league_fixtures where season_id=p_season and date=p_date and (home_key='gazalbide' and away_key=public.league_team_key(p_opponent) or away_key='gazalbide' and home_key=public.league_team_key(p_opponent)) limit 1;
 end if;
 if p_opponent is null and f.date is null then return null; end if;
 opponent:=coalesce(p_opponent,case when f.home_key='gazalbide' then f.away_name else f.home_name end);
 day:=coalesce(p_date,f.date);home:=coalesce(f.home_key='gazalbide',true);
 return public.league_match_model(opponent,day,p_season,home);
end $$;
revoke all on function public.get_league_preview(text,date,text) from public;
grant execute on function public.get_league_preview(text,date,text) to anon,authenticated;

alter table public.gazalbet_markets add column model_context jsonb;

create function gazalbide_internal.apply_league_market_model(p_gameweek_id bigint) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare gw public.gameweeks%rowtype; model jsonb; probability numeric; handicap numeric; total numeric;
begin
 select * into strict gw from public.gameweeks where id=p_gameweek_id;
 model:=public.get_league_preview(gw.opponent,gw.date,gw.season_id);
 probability:=(model->>'probability')::numeric;
 handicap:=-(round((model->>'margin')::numeric)+.5);total:=floor((model->>'total')::numeric)+.5;
 update public.gazalbet_markets m set
  line=case when kind='handicap' then handicap when kind='total' then total else line end,
  selections=case when kind='winner' then jsonb_build_array(
   jsonb_build_object('key','gazalbide','label','Gazalbide','odds',public.gazalbet_decimal_odds(probability)),
   jsonb_build_object('key','opponent','label',gw.opponent,'odds',public.gazalbet_decimal_odds(1-probability)))
  when kind='handicap' then jsonb_build_array(
   jsonb_build_object('key','gazalbide','label','Gazalbide '||handicap::text,'odds',1.85),
   jsonb_build_object('key','opponent','label',gw.opponent||' '||(-handicap)::text,'odds',1.85))
  when kind='total' then jsonb_build_array(jsonb_build_object('key','over','label','Más de '||total::text,'odds',1.85),jsonb_build_object('key','under','label','Menos de '||total::text,'odds',1.85)) else selections end,
  model_version='league-v1',model_context=model,sample_size=(model->>'sample_size')::int,
  subtitle=case when kind='winner' then 'Forma del grupo y enfrentamientos previos · solo liga' else subtitle end
 where gameweek_id=gw.id and kind in('winner','handicap','total') and status='open' and now()<gw.deadline
 and model_version<>'gazalbet-v2-manual-opponent'
 and not exists(select 1 from public.gazalbet_ticket_legs l where l.market_id=m.id)
 and not exists(select 1 from public.gazalbet_bets b where b.market_id=m.id);
 return model;
end $$;
revoke all on function gazalbide_internal.apply_league_market_model(bigint) from public,anon,authenticated;
CREATE OR REPLACE FUNCTION public.ensure_gazalbet_markets(p_gameweek_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_result jsonb; v_team_sample integer; v_wallet jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  v_wallet:=public.gazalbet_prepare_wallet(p_gameweek_id);
  perform public.gazalbet_void_unavailable_player_markets(p_gameweek_id);
  delete from public.gazalbet_markets gm
  where gm.gameweek_id=p_gameweek_id and gm.kind in ('top_scorer','player_points','head_to_head')
    and not gm.availability_suspended
    and not exists(select 1 from public.gazalbet_bets b where b.market_id=gm.id)
    and not exists(select 1 from public.gazalbet_ticket_legs l where l.market_id=gm.id);
  v_result:=public.gazalbet_generate_markets_v1(p_gameweek_id);
  perform public.gazalbet_void_unavailable_player_markets(p_gameweek_id);
  select least(8,count(*)) into v_team_sample
  from public.matches m join public.gameweeks gw on gw.id=p_gameweek_id
  where m.status='published' and not m.is_friendly and m.date<gw.date;
  update public.gazalbet_markets set sample_size=v_team_sample,model_version='gazalbet-v2'
  where gameweek_id=p_gameweek_id and kind in ('winner','handicap','total')
    and model_version not in ('gazalbet-v2-manual-opponent','league-v1');
  perform gazalbide_internal.apply_league_market_model(p_gameweek_id);
  return v_result||jsonb_build_object('model_version','gazalbet-v4','wallet',v_wallet);
end;
$function$

;
CREATE OR REPLACE FUNCTION public.gazalbet_generate_markets_v1(p_gameweek_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_gw public.gameweeks%rowtype;
  v_games integer := 0;
  v_wins integer := 0;
  v_pf numeric := 65;
  v_pa numeric := 65;
  v_prob numeric := .50;
  v_margin numeric := 0;
  v_total numeric := 130.5;
  v_handicap numeric := -.5;
  v_confidence integer := 20;
  v_p1 record;
  v_p2 record;
  v_p3 record;
  v_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_gw from public.gameweeks where id = p_gameweek_id;
  if not found then raise exception 'Gameweek not found'; end if;

  -- Opening the current slate grants that week's virtual bankroll once.
  if now() < v_gw.deadline then
    insert into public.gazalbet_wallets(user_id) values(auth.uid()) on conflict do nothing;
    insert into public.gazalbet_credit_grants(user_id,gameweek_id,amount) values(auth.uid(),v_gw.id,100)
    on conflict do nothing;
    if found then
      update public.gazalbet_wallets set balance=balance+100,updated_at=now() where user_id=auth.uid();
    end if;
  end if;

  select count(*), count(*) filter (where result = 'W'),
         coalesce(avg(gazal_pts),65), coalesce(avg(opp_pts),65)
  into v_games, v_wins, v_pf, v_pa
  from (select * from public.matches where status = 'published' and not is_friendly and date < v_gw.date order by date desc limit 8) recent;

  v_margin := v_pf - v_pa;
  v_prob := greatest(.20, least(.80, .5 + (v_margin / 35) + ((coalesce(v_wins,0)::numeric / greatest(v_games,1)) - .5) * .20));
  v_total := floor(v_pf + v_pa) + .5;
  v_handicap := -(round(v_margin) + .5);
  v_confidence := least(90, 20 + v_games * 8);

  insert into public.gazalbet_markets(gameweek_id, code, kind, title, subtitle, selections, confidence)
  values (v_gw.id, 'winner', 'winner', 'Ganador del partido', 'Resultado final, incluida prórroga',
    jsonb_build_array(
      jsonb_build_object('key','gazalbide','label','Gazalbide','odds',public.gazalbet_decimal_odds(v_prob)),
      jsonb_build_object('key','opponent','label',coalesce(v_gw.opponent,'Rival'),'odds',public.gazalbet_decimal_odds(1-v_prob))
    ), v_confidence)
  on conflict (gameweek_id, code) do nothing;

  insert into public.gazalbet_markets(gameweek_id, code, kind, title, subtitle, line, selections, confidence)
  values (v_gw.id, 'handicap', 'handicap', 'Hándicap Gazalbide', 'El hándicap se suma al marcador de Gazalbide', v_handicap,
    jsonb_build_array(
      jsonb_build_object('key','gazalbide','label','Gazalbide ' || case when v_handicap > 0 then '+' else '' end || v_handicap::text,'odds',1.85),
      jsonb_build_object('key','opponent','label',coalesce(v_gw.opponent,'Rival') || ' ' || case when -v_handicap > 0 then '+' else '' end || (-v_handicap)::text,'odds',1.85)
    ), v_confidence)
  on conflict (gameweek_id, code) do nothing;

  insert into public.gazalbet_markets(gameweek_id, code, kind, title, subtitle, line, selections, confidence)
  values (v_gw.id, 'total', 'total', 'Puntos totales', 'Suma de los dos equipos', v_total,
    jsonb_build_array(
      jsonb_build_object('key','over','label','Más de ' || v_total::text,'odds',1.85),
      jsonb_build_object('key','under','label','Menos de ' || v_total::text,'odds',1.85)
    ), v_confidence)
  on conflict (gameweek_id, code) do nothing;

  select ranked.* into v_p1 from (
    select p.id, p.name, round(avg(s.pts)::numeric,1) ppg, count(*) games
    from public.player_match_stats s join public.matches m on m.id=s.match_id join public.players p on p.id=s.player_id
    where m.status='published' and not m.is_friendly and m.date < v_gw.date and p.active and s.min_seconds > 0
    group by p.id,p.name order by avg(s.pts) desc, count(*) desc limit 1
  ) ranked;
  select ranked.* into v_p2 from (
    select p.id, p.name, round(avg(s.pts)::numeric,1) ppg, count(*) games
    from public.player_match_stats s join public.matches m on m.id=s.match_id join public.players p on p.id=s.player_id
    where m.status='published' and not m.is_friendly and m.date < v_gw.date and p.active and s.min_seconds > 0
    group by p.id,p.name order by avg(s.pts) desc, count(*) desc offset 1 limit 1
  ) ranked;
  select ranked.* into v_p3 from (
    select p.id, p.name, round(avg(s.pts)::numeric,1) ppg, count(*) games
    from public.player_match_stats s join public.matches m on m.id=s.match_id join public.players p on p.id=s.player_id
    where m.status='published' and not m.is_friendly and m.date < v_gw.date and p.active and s.min_seconds > 0
    group by p.id,p.name order by avg(s.pts) desc, count(*) desc offset 2 limit 1
  ) ranked;

  if v_p1.id is not null and v_p2.id is not null then
    insert into public.gazalbet_markets(gameweek_id, code, kind, title, subtitle, selections, confidence)
    values (v_gw.id, 'top_scorer', 'top_scorer', 'Máximo anotador de Gazalbide', 'Entre los favoritos del modelo',
      case when v_p3.id is null then jsonb_build_array(
        jsonb_build_object('key',v_p1.id::text,'label',v_p1.name,'odds',1.70),
        jsonb_build_object('key',v_p2.id::text,'label',v_p2.name,'odds',2.15))
      else jsonb_build_array(
        jsonb_build_object('key',v_p1.id::text,'label',v_p1.name,'odds',2.10),
        jsonb_build_object('key',v_p2.id::text,'label',v_p2.name,'odds',2.65),
        jsonb_build_object('key',v_p3.id::text,'label',v_p3.name,'odds',3.20)) end,
      least(85,20+least(v_p1.games,v_p2.games)*7))
    on conflict (gameweek_id, code) do nothing;

    insert into public.gazalbet_markets(gameweek_id, code, kind, title, subtitle, line, selections, confidence)
    values (v_gw.id, 'player_points_'||v_p1.id, 'player_points', 'Puntos de '||v_p1.name, 'Media previa: '||v_p1.ppg, floor(v_p1.ppg)+.5,
      jsonb_build_array(
        jsonb_build_object('key','over','label','Más de '||(floor(v_p1.ppg)+.5)::text,'odds',1.85,'player_id',v_p1.id),
        jsonb_build_object('key','under','label','Menos de '||(floor(v_p1.ppg)+.5)::text,'odds',1.85,'player_id',v_p1.id)),
      least(85,20+v_p1.games*7))
    on conflict (gameweek_id, code) do nothing;

    insert into public.gazalbet_markets(gameweek_id, code, kind, title, subtitle, selections, confidence)
    values (v_gw.id, 'h2h_'||v_p1.id||'_'||v_p2.id, 'head_to_head', 'Duelo de anotadores', '¿Quién meterá más puntos?',
      jsonb_build_array(
        jsonb_build_object('key',v_p1.id::text,'label',v_p1.name,'odds',public.gazalbet_decimal_odds(greatest(.25,least(.75,.5+(v_p1.ppg-v_p2.ppg)/20)))),
        jsonb_build_object('key',v_p2.id::text,'label',v_p2.name,'odds',public.gazalbet_decimal_odds(greatest(.25,least(.75,.5+(v_p2.ppg-v_p1.ppg)/20))))),
      least(85,20+least(v_p1.games,v_p2.games)*7))
    on conflict (gameweek_id, code) do nothing;
  end if;

  update public.gazalbet_markets set status='closed'
  where gameweek_id=v_gw.id and status='open' and now() >= v_gw.deadline;
  select count(*) into v_count from public.gazalbet_markets where gameweek_id=v_gw.id;
  return jsonb_build_object('gameweek_id',v_gw.id,'markets',v_count,'sample_size',v_games,'confidence',v_confidence);
end;
$function$

;
CREATE OR REPLACE FUNCTION public.gazalbet_player_market_normalizer()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_gw public.gameweeks%rowtype;
  v_p1 record;
  v_p2 record;
  v_p3 record;
  v_w1 numeric;
  v_w2 numeric;
  v_w3 numeric;
  v_total_w numeric;
  v_h2h_p1 numeric;
begin
  if new.kind not in ('top_scorer','player_points','head_to_head') then return new; end if;
  select * into v_gw from public.gameweeks where id=new.gameweek_id;

  select ranked.* into v_p1 from (
    select p.id,p.name,round(avg(s.pts)::numeric,2) ppg,count(*) games
    from public.player_match_stats s
    join public.matches m on m.id=s.match_id
    join public.players p on p.id=s.player_id
    left join public.player_statuses ps on ps.gameweek_id=v_gw.id
      and p.number ~ '^[0-9]+$' and ps.player_number=p.number::smallint
    where m.status='published' and not m.is_friendly and m.date<v_gw.date and p.active and s.min_seconds>0
      and coalesce(ps.status::text,'available')='available'
    group by p.id,p.name order by avg(s.pts) desc,count(*) desc limit 1
  ) ranked;
  select ranked.* into v_p2 from (
    select p.id,p.name,round(avg(s.pts)::numeric,2) ppg,count(*) games
    from public.player_match_stats s
    join public.matches m on m.id=s.match_id
    join public.players p on p.id=s.player_id
    left join public.player_statuses ps on ps.gameweek_id=v_gw.id
      and p.number ~ '^[0-9]+$' and ps.player_number=p.number::smallint
    where m.status='published' and not m.is_friendly and m.date<v_gw.date and p.active and s.min_seconds>0
      and coalesce(ps.status::text,'available')='available'
    group by p.id,p.name order by avg(s.pts) desc,count(*) desc offset 1 limit 1
  ) ranked;
  select ranked.* into v_p3 from (
    select p.id,p.name,round(avg(s.pts)::numeric,2) ppg,count(*) games
    from public.player_match_stats s
    join public.matches m on m.id=s.match_id
    join public.players p on p.id=s.player_id
    left join public.player_statuses ps on ps.gameweek_id=v_gw.id
      and p.number ~ '^[0-9]+$' and ps.player_number=p.number::smallint
    where m.status='published' and not m.is_friendly and m.date<v_gw.date and p.active and s.min_seconds>0
      and coalesce(ps.status::text,'available')='available'
    group by p.id,p.name order by avg(s.pts) desc,count(*) desc offset 2 limit 1
  ) ranked;

  if v_p1.id is null or v_p2.id is null then return null; end if;
  v_w1 := exp(v_p1.ppg/6.0);
  v_w2 := exp(v_p2.ppg/6.0);
  v_w3 := case when v_p3.id is null then 0 else exp(v_p3.ppg/6.0) end;
  v_total_w := v_w1+v_w2+v_w3;
  v_h2h_p1 := 1/(1+exp(-(v_p1.ppg-v_p2.ppg)/5.0));

  if new.kind='top_scorer' then
    new.code := 'top_scorer_v2_'||v_p1.id||'_'||v_p2.id||coalesce('_'||v_p3.id,'');
    new.title := 'Máximo anotador entre los favoritos';
    new.subtitle := case when v_p3.id is null then v_p1.name||' o '||v_p2.name else v_p1.name||', '||v_p2.name||' o '||v_p3.name end;
    new.selections := case when v_p3.id is null then jsonb_build_array(
      jsonb_build_object('key',v_p1.id::text,'label',v_p1.name,'odds',public.gazalbet_decimal_odds(v_w1/v_total_w)),
      jsonb_build_object('key',v_p2.id::text,'label',v_p2.name,'odds',public.gazalbet_decimal_odds(v_w2/v_total_w)))
    else jsonb_build_array(
      jsonb_build_object('key',v_p1.id::text,'label',v_p1.name,'odds',public.gazalbet_decimal_odds(v_w1/v_total_w)),
      jsonb_build_object('key',v_p2.id::text,'label',v_p2.name,'odds',public.gazalbet_decimal_odds(v_w2/v_total_w)),
      jsonb_build_object('key',v_p3.id::text,'label',v_p3.name,'odds',public.gazalbet_decimal_odds(v_w3/v_total_w))) end;
    new.sample_size := least(v_p1.games,v_p2.games,coalesce(v_p3.games,v_p2.games));
  elsif new.kind='player_points' then
    new.code := 'player_points_v2_'||v_p1.id;
    new.title := 'Puntos de '||v_p1.name;
    new.subtitle := 'Media previa: '||round(v_p1.ppg,1);
    new.line := floor(v_p1.ppg)+.5;
    new.selections := jsonb_build_array(
      jsonb_build_object('key','over','label','Más de '||new.line::text,'odds',public.gazalbet_decimal_odds(.5),'player_id',v_p1.id),
      jsonb_build_object('key','under','label','Menos de '||new.line::text,'odds',public.gazalbet_decimal_odds(.5),'player_id',v_p1.id));
    new.sample_size := v_p1.games;
  else
    new.code := 'h2h_v2_'||v_p1.id||'_'||v_p2.id;
    new.title := 'Duelo de anotadores';
    new.subtitle := '¿Quién anotará más puntos?';
    new.selections := jsonb_build_array(
      jsonb_build_object('key',v_p1.id::text,'label',v_p1.name,'odds',public.gazalbet_decimal_odds(v_h2h_p1)),
      jsonb_build_object('key',v_p2.id::text,'label',v_p2.name,'odds',public.gazalbet_decimal_odds(1-v_h2h_p1)));
    new.sample_size := least(v_p1.games,v_p2.games);
  end if;
  new.model_version := 'gazalbet-v2';
  return new;
end;
$function$

;
CREATE OR REPLACE FUNCTION public.gazalbet_quote_player_line(p_gameweek_id bigint, p_player_id bigint, p_stat_key text, p_direction text, p_line numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    where s.player_id=p_player_id and s.min_seconds>0 and m.status='published' and not m.is_friendly and m.date<v_gw.date
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
$function$

;
CREATE OR REPLACE FUNCTION public.get_gazalbet_builder(p_gameweek_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    left join public.matches m on m.id=s.match_id and m.status='published' and not m.is_friendly and m.date<v_gw.date
    where p.active and coalesce(ps.status,'available') in ('available','disponible')
    group by p.id,p.name,sp.jersey_number,p.photo_path,sp.sort_order
  ) available;
  return jsonb_build_object('players',v_players,'categories',jsonb_build_array(
    jsonb_build_object('key','pts','label','Puntos'),jsonb_build_object('key','three_pm','label','Triples'),
    jsonb_build_object('key','reb','label','Rebotes'),jsonb_build_object('key','ast','label','Asistencias'),
    jsonb_build_object('key','pf','label','Faltas'),jsonb_build_object('key','pir','label','Valoración')));
end;
$function$

;
CREATE OR REPLACE FUNCTION public.gazalbet_quote_game_line(p_gameweek_id bigint, p_stat_key text, p_selection_key text, p_direction text, p_line numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_gw public.gameweeks%rowtype;
  v_games int;
  v_margin_mean numeric;
  v_margin_sd numeric;
  v_total_mean numeric;
  v_total_sd numeric;
  v_probability numeric;
  v_odds numeric;
  v_gazal_odds numeric;
  v_opp_odds numeric;
  v_gazal_probability numeric;
  v_team_label text;
  v_label text;
  v_model jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_stat_key not in ('handicap','total') then raise exception 'Invalid game market'; end if;
  if p_line is null or abs(mod(p_line,1))<>.5 then raise exception 'Line must end in .5'; end if;
  select * into v_gw from public.gameweeks where id=p_gameweek_id;
  if not found or now()>=v_gw.deadline then raise exception 'Market closed'; end if;

  v_model:=public.get_league_preview(v_gw.opponent,v_gw.date,v_gw.season_id);
  v_games:=(v_model->>'sample_size')::int;
  v_margin_mean:=(v_model->>'margin')::numeric;
  v_margin_sd:=8/.72;
  v_total_mean:=(v_model->>'total')::numeric;
  v_total_sd:=14/.72;

  -- A manually adjusted winner market represents opponent knowledge that the
  -- historical model cannot see. Reuse its normalized probability so custom
  -- handicap prices stay coherent with the displayed match-winner prices.
  select (s->>'odds')::numeric into v_gazal_odds
  from public.gazalbet_markets gm cross join lateral jsonb_array_elements(gm.selections) s
  where gm.gameweek_id=p_gameweek_id and gm.code='winner' and gm.model_version='gazalbet-v2-manual-opponent' and s->>'key'='gazalbide' limit 1;
  select (s->>'odds')::numeric into v_opp_odds
  from public.gazalbet_markets gm cross join lateral jsonb_array_elements(gm.selections) s
  where gm.gameweek_id=p_gameweek_id and gm.code='winner' and gm.model_version='gazalbet-v2-manual-opponent' and s->>'key'='opponent' limit 1;
  if v_gazal_odds is not null and v_opp_odds is not null then
    v_gazal_probability:=(1/v_gazal_odds)/((1/v_gazal_odds)+(1/v_opp_odds));
    v_margin_mean:=ln(v_gazal_probability/(1-v_gazal_probability))*v_margin_sd*.72;
  end if;

  if p_stat_key='handicap' then
    if p_selection_key not in ('gazalbide','opponent') or p_line < -40.5 or p_line > 40.5 then raise exception 'Invalid handicap'; end if;
    v_probability:=1/(1+exp(-((case when p_selection_key='gazalbide' then v_margin_mean else -v_margin_mean end)+p_line)/(v_margin_sd*.72)));
    v_team_label:=case when p_selection_key='gazalbide' then 'Gazalbide' else coalesce(v_gw.opponent,'Rival') end;
    v_label:=v_team_label||' '||case when p_line>0 then '+' else '' end||p_line::text;
  else
    if p_direction not in ('over','under') or p_line<60.5 or p_line>220.5 then raise exception 'Invalid total line'; end if;
    v_probability:=1/(1+exp((p_line-v_total_mean)/(v_total_sd*.72)));
    if p_direction='under' then v_probability:=1-v_probability; end if;
    v_label:=case when p_direction='over' then 'Más de ' else 'Menos de ' end||p_line::text||' puntos';
  end if;
  v_probability:=greatest(.04,least(.92,v_probability));
  v_odds:=round(greatest(1.08,least(25,1/v_probability/1.08)),2);
  return jsonb_build_object('stat_key',p_stat_key,'selection_key',p_selection_key,'direction',p_direction,
    'line',p_line,'odds',v_odds,'sample_size',v_games,'mean',round(case when p_stat_key='handicap' then v_margin_mean else v_total_mean end,1),
    'label',v_label);
end;
$function$

;

revoke all on function public.gazalbet_generate_markets_v1(bigint),public.gazalbet_player_market_normalizer() from public,anon,authenticated;
revoke all on function public.gazalbet_quote_game_line(bigint,text,text,text,numeric),public.gazalbet_quote_player_line(bigint,bigint,text,text,numeric),public.get_gazalbet_builder(bigint),public.ensure_gazalbet_markets(bigint) from public,anon;
grant execute on function public.gazalbet_quote_game_line(bigint,text,text,text,numeric),public.gazalbet_quote_player_line(bigint,bigint,text,text,numeric),public.get_gazalbet_builder(bigint),public.ensure_gazalbet_markets(bigint) to authenticated;
