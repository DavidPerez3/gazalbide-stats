-- Preserve a valid displayed price when a settled ticket has no winning legs.
-- PostgreSQL rejected total_odds=1 for lost/all-void tickets because the
-- original ticket constraint requires total_odds >= 1.01.

create or replace function public.settle_gazalbet_tickets(p_gameweek_id bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_gw public.gameweeks%rowtype; v_match public.matches%rowtype; v_leg public.gazalbet_ticket_legs%rowtype;
  v_value numeric; v_market public.gazalbet_markets%rowtype; v_ticket public.gazalbet_tickets%rowtype;
  v_effective numeric; v_lost int; v_open int; v_won int; v_void int; v_leg_won boolean;
begin
  select * into v_gw from public.gameweeks where id=p_gameweek_id;
  select * into v_match from public.matches where id=v_gw.match_id and status='published';
  if not found then return jsonb_build_object('settled',false); end if;

  for v_leg in
    select l.* from public.gazalbet_ticket_legs l
    join public.gazalbet_tickets t on t.id=l.ticket_id
    where t.gameweek_id=p_gameweek_id and t.status='pending' and l.status='pending'
    for update of l
  loop
    if v_leg.leg_type='market' then
      select * into v_market from public.gazalbet_markets where id=v_leg.market_id;
      if v_market.status='void' then
        update public.gazalbet_ticket_legs set status='void',settled_at=now() where id=v_leg.id;
      elsif v_market.status='settled' then
        update public.gazalbet_ticket_legs
        set status=case when v_market.winning_key=v_leg.selection_key then 'won' else 'lost' end,settled_at=now()
        where id=v_leg.id;
      end if;
    elsif v_leg.leg_type='player_prop' then
      select public.gazalbet_player_metric(v_leg.stat_key,s.pts,s.three_pm,s.reb,s.ast,s.pf,s.pir)
      into v_value from public.player_match_stats s
      where s.match_id=v_match.id and s.player_id=v_leg.player_id and s.min_seconds>0;
      if v_value is null then
        update public.gazalbet_ticket_legs set status='void',settled_at=now() where id=v_leg.id;
      else
        update public.gazalbet_ticket_legs set result_value=v_value,
          status=case when (v_leg.direction='over' and v_value>v_leg.line) or (v_leg.direction='under' and v_value<v_leg.line) then 'won' else 'lost' end,
          settled_at=now() where id=v_leg.id;
      end if;
    else
      if v_leg.stat_key='handicap' then
        v_value:=case when v_leg.selection_key='gazalbide' then v_match.gazal_pts-v_match.opp_pts else v_match.opp_pts-v_match.gazal_pts end;
        v_leg_won:=v_value+v_leg.line>0;
      else
        v_value:=v_match.gazal_pts+v_match.opp_pts;
        v_leg_won:=(v_leg.direction='over' and v_value>v_leg.line) or (v_leg.direction='under' and v_value<v_leg.line);
      end if;
      update public.gazalbet_ticket_legs set result_value=v_value,
        status=case when v_leg_won then 'won' else 'lost' end,settled_at=now()
      where id=v_leg.id;
    end if;
  end loop;

  for v_ticket in
    select * from public.gazalbet_tickets
    where gameweek_id=p_gameweek_id and status='pending' for update
  loop
    select count(*) filter(where status='lost'),count(*) filter(where status='pending'),
           count(*) filter(where status='won'),count(*) filter(where status='void'),
           coalesce(exp(sum(ln(odds)) filter(where status='won')),1)
    into v_lost,v_open,v_won,v_void,v_effective
    from public.gazalbet_ticket_legs where ticket_id=v_ticket.id;

    if v_open=0 then
      update public.gazalbet_tickets
      set status=case when v_lost>0 then 'lost' when v_won=0 then 'void' else 'won' end,
          total_odds=case
            when v_lost=0 and v_won>0 then greatest(1.01,round(least(v_effective,100),2))
            else total_odds
          end,
          payout=case when v_lost>0 then 0 when v_won=0 then stake else round(stake*least(v_effective,100),2) end,
          settled_at=now()
      where id=v_ticket.id;
    end if;
  end loop;

  with payouts as (
    select t.user_id,sum(t.payout) amount
    from public.gazalbet_tickets t
    where t.gameweek_id=p_gameweek_id and t.settled_at is not null and t.payout>0
      and not exists(select 1 from public.gazalbet_ticket_settlements s where s.ticket_id=t.id)
    group by t.user_id
  )
  update public.gazalbet_wallets w
  set balance=w.balance+p.amount,total_won=w.total_won+p.amount,updated_at=now()
  from payouts p where w.user_id=p.user_id;

  insert into public.gazalbet_ticket_settlements(ticket_id)
  select id from public.gazalbet_tickets
  where gameweek_id=p_gameweek_id and settled_at is not null and payout>0
  on conflict do nothing;

  return jsonb_build_object('settled',true);
end;
$$;

revoke all on function public.settle_gazalbet_tickets(bigint) from public,anon,authenticated;
