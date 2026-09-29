-- GazalBet v2: availability-aware player props and one coherent probability model.

alter table public.gazalbet_markets
add column if not exists sample_size smallint check (sample_size is null or sample_size >= 0);

-- Keep the original generator as an internal implementation and wrap it with
-- refresh/refund behaviour. The insert trigger below normalises every player market.
alter function public.ensure_gazalbet_markets(bigint) rename to gazalbet_generate_markets_v1;
revoke execute on function public.gazalbet_generate_markets_v1(bigint) from public, anon, authenticated;

create or replace function public.gazalbet_player_market_normalizer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
    where m.status='published' and m.date<v_gw.date and p.active and s.min_seconds>0
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
    where m.status='published' and m.date<v_gw.date and p.active and s.min_seconds>0
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
    where m.status='published' and m.date<v_gw.date and p.active and s.min_seconds>0
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
$$;

drop trigger if exists trg_gazalbet_normalize_player_market on public.gazalbet_markets;
create trigger trg_gazalbet_normalize_player_market
before insert on public.gazalbet_markets
for each row execute function public.gazalbet_player_market_normalizer();

create or replace function public.gazalbet_void_unavailable_player_markets(p_gameweek_id bigint)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market record;
  v_count integer := 0;
begin
  for v_market in
    select distinct gm.id
    from public.gazalbet_markets gm
    cross join lateral jsonb_array_elements(gm.selections) sel
    join public.players p on p.id::text=coalesce(sel->>'player_id',sel->>'key')
    join public.player_statuses ps on ps.gameweek_id=gm.gameweek_id
      and p.number ~ '^[0-9]+$' and ps.player_number=p.number::smallint
    where gm.gameweek_id=p_gameweek_id and gm.kind in ('top_scorer','player_points','head_to_head')
      and gm.status in ('open','closed') and ps.status::text<>'available'
  loop
    update public.gazalbet_bets set status='void',payout=stake,settled_at=now()
    where market_id=v_market.id and status='pending';
    update public.gazalbet_wallets w set balance=w.balance+x.amount,updated_at=now()
    from (
      select b.user_id,sum(b.payout) amount from public.gazalbet_bets b
      where b.market_id=v_market.id and b.status='void'
        and not exists(select 1 from public.gazalbet_wallet_settlements s where s.bet_id=b.id)
      group by b.user_id
    ) x where w.user_id=x.user_id;
    insert into public.gazalbet_wallet_settlements(bet_id)
      select id from public.gazalbet_bets where market_id=v_market.id and status='void'
      on conflict do nothing;
    update public.gazalbet_markets set status='void',winning_key=null,settled_at=now() where id=v_market.id;
    v_count := v_count+1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.ensure_gazalbet_markets(p_gameweek_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_team_sample integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform public.gazalbet_void_unavailable_player_markets(p_gameweek_id);
  delete from public.gazalbet_markets gm
  where gm.gameweek_id=p_gameweek_id and gm.kind in ('top_scorer','player_points','head_to_head')
    and not exists(select 1 from public.gazalbet_bets b where b.market_id=gm.id);
  v_result := public.gazalbet_generate_markets_v1(p_gameweek_id);
  select least(8,count(*)) into v_team_sample
  from public.matches m join public.gameweeks gw on gw.id=p_gameweek_id
  where m.status='published' and m.date<gw.date;
  update public.gazalbet_markets set sample_size=v_team_sample,model_version='gazalbet-v2'
  where gameweek_id=p_gameweek_id and kind in ('winner','handicap','total');
  return v_result || jsonb_build_object('model_version','gazalbet-v2');
end;
$$;

create or replace function public.gazalbet_player_status_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.gazalbet_void_unavailable_player_markets(new.gameweek_id);
  return new;
end;
$$;

drop trigger if exists trg_gazalbet_player_status on public.player_statuses;
create trigger trg_gazalbet_player_status
after insert or update of status on public.player_statuses
for each row execute function public.gazalbet_player_status_trigger();

-- A top-scorer market is explicitly among its listed favourites. Resolve it
-- only from those candidates, so its probability matches the offered event.
create or replace function public.settle_gazalbet_gameweek(p_gameweek_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gw public.gameweeks%rowtype; v_match public.matches%rowtype; v_market public.gazalbet_markets%rowtype;
  v_winner text; v_player_id bigint; v_player2_id bigint; v_pts integer; v_pts2 integer; v_top integer; v_ties integer; v_paid numeric:=0;
begin
  select * into v_gw from public.gameweeks where id=p_gameweek_id;
  select * into v_match from public.matches where id=v_gw.match_id and status='published';
  if not found then return jsonb_build_object('settled',false,'reason','match_not_published'); end if;
  for v_market in select * from public.gazalbet_markets where gameweek_id=p_gameweek_id and status in ('open','closed') for update loop
    v_winner:=null;
    if v_market.kind='winner' then v_winner:=case when v_match.gazal_pts>v_match.opp_pts then 'gazalbide' when v_match.gazal_pts<v_match.opp_pts then 'opponent' end;
    elsif v_market.kind='handicap' then v_winner:=case when v_match.gazal_pts+v_market.line>v_match.opp_pts then 'gazalbide' when v_match.gazal_pts+v_market.line<v_match.opp_pts then 'opponent' end;
    elsif v_market.kind='total' then v_winner:=case when v_match.gazal_pts+v_match.opp_pts>v_market.line then 'over' when v_match.gazal_pts+v_match.opp_pts<v_market.line then 'under' end;
    elsif v_market.kind='top_scorer' then
      select max(s.pts) into v_top from public.player_match_stats s where s.match_id=v_match.id
        and s.player_id::text in (select value->>'key' from jsonb_array_elements(v_market.selections));
      select count(*),min(s.player_id::text) into v_ties,v_winner from public.player_match_stats s where s.match_id=v_match.id and s.pts=v_top
        and s.player_id::text in (select value->>'key' from jsonb_array_elements(v_market.selections));
      if v_ties<>1 then v_winner:=null; end if;
    elsif v_market.kind='player_points' then
      v_player_id:=(v_market.selections->0->>'player_id')::bigint;
      select pts into v_pts from public.player_match_stats where match_id=v_match.id and player_id=v_player_id;
      if v_pts is not null then v_winner:=case when v_pts>v_market.line then 'over' when v_pts<v_market.line then 'under' end; end if;
    elsif v_market.kind='head_to_head' then
      v_player_id:=(v_market.selections->0->>'key')::bigint; v_player2_id:=(v_market.selections->1->>'key')::bigint;
      select pts into v_pts from public.player_match_stats where match_id=v_match.id and player_id=v_player_id;
      select pts into v_pts2 from public.player_match_stats where match_id=v_match.id and player_id=v_player2_id;
      if v_pts is not null and v_pts2 is not null then v_winner:=case when v_pts>v_pts2 then v_player_id::text when v_pts<v_pts2 then v_player2_id::text end; end if;
    end if;
    if v_winner is null then
      update public.gazalbet_markets set status='void',settled_at=now() where id=v_market.id;
      update public.gazalbet_bets set status='void',payout=stake,settled_at=now() where market_id=v_market.id and status='pending';
    else
      update public.gazalbet_markets set status='settled',winning_key=v_winner,settled_at=now() where id=v_market.id;
      update public.gazalbet_bets set status=case when selection_key=v_winner then 'won' else 'lost' end,
        payout=case when selection_key=v_winner then round(stake*odds,2) else 0 end,settled_at=now()
      where market_id=v_market.id and status='pending';
    end if;
  end loop;
  with payouts as (
    select user_id,sum(payout) amount from public.gazalbet_bets b where gameweek_id=p_gameweek_id and settled_at is not null and payout>0
      and not exists(select 1 from public.gazalbet_wallet_settlements s where s.bet_id=b.id) group by user_id
  ) update public.gazalbet_wallets w set balance=w.balance+p.amount,total_won=w.total_won+p.amount,updated_at=now() from payouts p where w.user_id=p.user_id;
  insert into public.gazalbet_wallet_settlements(bet_id) select id from public.gazalbet_bets where gameweek_id=p_gameweek_id and settled_at is not null and payout>0 on conflict do nothing;
  select coalesce(sum(payout),0) into v_paid from public.gazalbet_bets where gameweek_id=p_gameweek_id;
  return jsonb_build_object('settled',true,'paid',v_paid);
end;
$$;

revoke execute on function public.gazalbet_player_market_normalizer() from public,anon,authenticated;
revoke execute on function public.gazalbet_void_unavailable_player_markets(bigint) from public,anon,authenticated;
revoke execute on function public.gazalbet_player_status_trigger() from public,anon,authenticated;
revoke execute on function public.settle_gazalbet_gameweek(bigint) from public,anon,authenticated;
revoke execute on function public.ensure_gazalbet_markets(bigint) from public,anon;
grant execute on function public.ensure_gazalbet_markets(bigint) to authenticated;
