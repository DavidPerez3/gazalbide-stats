-- Availability is provisional. Keep purchased selections and their original odds
-- until official participation settles them; never undo a credited settlement.
alter table public.gazalbet_ticket_legs add column availability_status text not null default 'available'
  check (availability_status in ('available','doubtful','unavailable'));
alter table public.gazalbet_markets add column availability_suspended boolean not null default false;

create or replace function public.gazalbet_player_availability(p_gameweek_id bigint,p_player_id bigint)
returns text language sql stable security invoker set search_path='' as $$
  select case lower(trim(coalesce(ps.status,'available')))
    when '' then 'available' when 'available' then 'available' when 'disponible' then 'available'
    when 'doubtful' then 'doubtful' when 'dudoso' then 'doubtful' else 'unavailable' end
  from public.gameweeks g join public.players p on p.id=p_player_id
  left join public.season_players sp on sp.season_id=g.season_id and sp.player_id=p.id
  left join public.player_statuses ps on ps.gameweek_id=g.id
    and ps.player_number::text=coalesce(nullif(ltrim(coalesce(sp.jersey_number,p.number),'0'),''),'0')
  where g.id=p_gameweek_id;
$$;

-- Keep this internal signature for existing callers, but stop destructive voiding.
create or replace function public.gazalbet_void_unavailable_ticket_legs(
  p_gameweek_id bigint,p_player_number smallint default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_changed integer;
begin
  if not exists(select 1 from public.gameweeks g where g.id=p_gameweek_id
    and g.status in ('scheduled','played') and not exists(
      select 1 from public.matches m where m.id=g.match_id and m.status='published'
    )) then return jsonb_build_object('changed_legs',0,'voided_legs',0,'refunded_tickets',0); end if;
  -- Serialize availability changes per pending ticket.
  perform t.id from public.gazalbet_tickets t where t.gameweek_id=p_gameweek_id
    and t.status='pending' order by t.id for update;
  with changed as (
    update public.gazalbet_ticket_legs l
    set availability_status=coalesce(public.gazalbet_player_availability(p_gameweek_id,l.player_id),'available')
    from public.gazalbet_tickets t
    where t.id=l.ticket_id and t.gameweek_id=p_gameweek_id and t.status='pending'
      and l.status='pending' and l.leg_type='player_prop'
      and l.availability_status is distinct from coalesce(public.gazalbet_player_availability(p_gameweek_id,l.player_id),'available')
    returning l.id
  ) select count(*) into v_changed from changed;
  return jsonb_build_object('changed_legs',v_changed,'voided_legs',0,'refunded_tickets',0);
end;
$$;

-- Suspend new purchases, leaving existing market bets intact. Only reopen
-- markets that this function suspended, and never reopen after the deadline.
create or replace function public.gazalbet_void_unavailable_player_markets(p_gameweek_id bigint)
returns integer language plpgsql security definer set search_path='' as $$
declare v_market record; v_unavailable boolean; v_count integer:=0; v_deadline timestamptz;
begin
  select deadline into v_deadline from public.gameweeks where id=p_gameweek_id;
  for v_market in select * from public.gazalbet_markets where gameweek_id=p_gameweek_id
    and kind in ('top_scorer','player_points','head_to_head') and status in ('open','closed')
    order by id for update loop
    select exists(select 1 from jsonb_array_elements(v_market.selections) sel
      join public.players p on p.id::text=coalesce(sel->>'player_id',sel->>'key')
      where public.gazalbet_player_availability(p_gameweek_id,p.id)<>'available') into v_unavailable;
    if v_unavailable and (v_market.status='open' or v_market.availability_suspended) then
      update public.gazalbet_markets set status='closed',availability_suspended=true where id=v_market.id;
      v_count:=v_count+1;
    elsif not v_unavailable and v_market.availability_suspended then
      update public.gazalbet_markets set status=case when now()<v_deadline then 'open' else 'closed' end,
        availability_suspended=false where id=v_market.id;
    end if;
  end loop;
  return v_count;
end;
$$;

create or replace function public.gazalbet_player_status_void_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform public.gazalbet_void_unavailable_ticket_legs(new.gameweek_id,new.player_number);
  return new;
end;
$$;

revoke all on function public.gazalbet_player_availability(bigint,bigint) from public,anon,authenticated;
revoke all on function public.gazalbet_void_unavailable_ticket_legs(bigint,smallint) from public,anon,authenticated;
revoke all on function public.gazalbet_void_unavailable_player_markets(bigint) from public,anon,authenticated;
revoke all on function public.gazalbet_player_status_void_trigger() from public,anon,authenticated;

-- Repair only the old pregame automatic player-prop voids in still-open,
-- uncredited tickets. Manual market voids and refunded tickets stay final.
update public.gazalbet_ticket_legs l set status='pending',settled_at=null
from public.gazalbet_tickets t,public.gameweeks g
where t.id=l.ticket_id and g.id=t.gameweek_id and t.status='pending'
  and t.settled_at is null and g.status='scheduled' and g.deadline>now()
  and l.leg_type='player_prop' and l.status='void' and l.result_value is null
  and l.settled_at<g.deadline
  and not exists(select 1 from public.gazalbet_ticket_settlements s where s.ticket_id=t.id)
  and not exists(select 1 from public.matches m where m.id=g.match_id and m.status='published');
update public.gazalbet_tickets t set total_odds=greatest(1.01,round(exp(least(ln(100::numeric),(
  select sum(ln(l.odds)) from public.gazalbet_ticket_legs l where l.ticket_id=t.id and l.status<>'void'
))),2))
where t.status='pending' and t.settled_at is null
  and exists(select 1 from public.gameweeks g where g.id=t.gameweek_id and g.status='scheduled' and g.deadline>now())
  and not exists(select 1 from public.gazalbet_ticket_settlements s where s.ticket_id=t.id);

do $$ declare r record; begin
  for r in select id from public.gameweeks where status in ('scheduled','played') loop
    perform public.gazalbet_void_unavailable_ticket_legs(r.id,null);
    perform public.gazalbet_void_unavailable_player_markets(r.id);
  end loop;
end; $$;

create or replace function public.ensure_gazalbet_markets(p_gameweek_id bigint)
returns jsonb language plpgsql security definer set search_path=public as $$
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
  where m.status='published' and m.date<gw.date;
  update public.gazalbet_markets set sample_size=v_team_sample,model_version='gazalbet-v2'
  where gameweek_id=p_gameweek_id and kind in ('winner','handicap','total')
    and model_version<>'gazalbet-v2-manual-opponent';
  return v_result||jsonb_build_object('model_version','gazalbet-v4','wallet',v_wallet);
end;
$$;

revoke all on function public.ensure_gazalbet_markets(bigint) from public,anon;
grant execute on function public.ensure_gazalbet_markets(bigint) to authenticated;

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
      if v_ties<>1 or exists(select 1 from jsonb_array_elements(v_market.selections) sel
        where not exists(select 1 from public.player_match_stats s where s.match_id=v_match.id
          and s.player_id::text=sel->>'key' and s.min_seconds>0)) then v_winner:=null; end if;
    elsif v_market.kind='player_points' then
      v_player_id:=(v_market.selections->0->>'player_id')::bigint;
      select pts into v_pts from public.player_match_stats where match_id=v_match.id and player_id=v_player_id and min_seconds>0;
      if v_pts is not null then v_winner:=case when v_pts>v_market.line then 'over' when v_pts<v_market.line then 'under' end; end if;
    elsif v_market.kind='head_to_head' then
      v_player_id:=(v_market.selections->0->>'key')::bigint; v_player2_id:=(v_market.selections->1->>'key')::bigint;
      select pts into v_pts from public.player_match_stats where match_id=v_match.id and player_id=v_player_id and min_seconds>0;
      select pts into v_pts2 from public.player_match_stats where match_id=v_match.id and player_id=v_player2_id and min_seconds>0;
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
revoke all on function public.settle_gazalbet_gameweek(bigint) from public,anon,authenticated;
