-- GazalBet v4: persistent bankroll, one initial grant, a once-per-gameweek
-- rescue floor, and user-built handicap / total-points lines.

alter table public.gazalbet_credit_grants
  drop constraint gazalbet_credit_grants_amount_check,
  add constraint gazalbet_credit_grants_amount_check check (amount >= 0);

alter table public.gazalbet_tickets
  drop constraint gazalbet_tickets_stake_check,
  add constraint gazalbet_tickets_stake_check check (stake >= 1);

alter table public.gazalbet_ticket_legs
  drop constraint gazalbet_ticket_legs_leg_type_check,
  add constraint gazalbet_ticket_legs_leg_type_check
    check (leg_type in ('market','player_prop','game_prop')),
  drop constraint gazalbet_ticket_legs_stat_key_check,
  add constraint gazalbet_ticket_legs_stat_key_check
    check (stat_key is null or stat_key in ('pts','three_pm','reb','ast','pf','pir','handicap','total'));

create or replace function public.gazalbet_prepare_wallet(p_gameweek_id bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid := auth.uid();
  v_balance numeric;
  v_grant numeric := 0;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.gameweeks where id=p_gameweek_id) then raise exception 'Gameweek not found'; end if;

  insert into public.gazalbet_wallets(user_id) values(v_uid) on conflict do nothing;
  select balance into v_balance from public.gazalbet_wallets where user_id=v_uid for update;

  if not exists(select 1 from public.gazalbet_credit_grants where user_id=v_uid) then
    v_grant := 100;
  elsif not exists(select 1 from public.gazalbet_credit_grants where user_id=v_uid and gameweek_id=p_gameweek_id) then
    v_grant := greatest(20-v_balance,0);
  else
    return jsonb_build_object('balance',v_balance,'grant',0);
  end if;

  insert into public.gazalbet_credit_grants(user_id,gameweek_id,amount)
  values(v_uid,p_gameweek_id,v_grant) on conflict do nothing;
  if found and v_grant>0 then
    update public.gazalbet_wallets set balance=balance+v_grant,updated_at=now()
    where user_id=v_uid returning balance into v_balance;
  end if;
  return jsonb_build_object('balance',v_balance,'grant',v_grant);
end;
$$;

create or replace function public.gazalbet_quote_game_line(
  p_gameweek_id bigint,
  p_stat_key text,
  p_selection_key text,
  p_direction text,
  p_line numeric
)
returns jsonb language plpgsql security definer set search_path='' as $$
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
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_stat_key not in ('handicap','total') then raise exception 'Invalid game market'; end if;
  if p_line is null or abs(mod(p_line,1))<>.5 then raise exception 'Line must end in .5'; end if;
  select * into v_gw from public.gameweeks where id=p_gameweek_id;
  if not found or now()>=v_gw.deadline then raise exception 'Market closed'; end if;

  select count(*),avg(margin),stddev_pop(margin),avg(total),stddev_pop(total)
  into v_games,v_margin_mean,v_margin_sd,v_total_mean,v_total_sd
  from (
    select (m.gazal_pts-m.opp_pts)::numeric margin,(m.gazal_pts+m.opp_pts)::numeric total
    from public.matches m
    where m.status='published' and m.date<v_gw.date
    order by m.date desc limit 8
  ) recent;
  v_margin_mean:=coalesce(v_margin_mean,0);
  v_margin_sd:=greatest(coalesce(v_margin_sd,0),8);
  v_total_mean:=coalesce(v_total_mean,130);
  v_total_sd:=greatest(coalesce(v_total_sd,0),10);

  -- A manually adjusted winner market represents opponent knowledge that the
  -- historical model cannot see. Reuse its normalized probability so custom
  -- handicap prices stay coherent with the displayed match-winner prices.
  select (s->>'odds')::numeric into v_gazal_odds
  from public.gazalbet_markets gm cross join lateral jsonb_array_elements(gm.selections) s
  where gm.gameweek_id=p_gameweek_id and gm.code='winner' and s->>'key'='gazalbide' limit 1;
  select (s->>'odds')::numeric into v_opp_odds
  from public.gazalbet_markets gm cross join lateral jsonb_array_elements(gm.selections) s
  where gm.gameweek_id=p_gameweek_id and gm.code='winner' and s->>'key'='opponent' limit 1;
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
$$;

create or replace function public.ensure_gazalbet_markets(p_gameweek_id bigint)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_result jsonb; v_team_sample integer; v_wallet jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  v_wallet:=public.gazalbet_prepare_wallet(p_gameweek_id);
  perform public.gazalbet_void_unavailable_player_markets(p_gameweek_id);
  delete from public.gazalbet_markets gm
  where gm.gameweek_id=p_gameweek_id and gm.kind in ('top_scorer','player_points','head_to_head')
    and not exists(select 1 from public.gazalbet_bets b where b.market_id=gm.id);
  v_result:=public.gazalbet_generate_markets_v1(p_gameweek_id);
  select least(8,count(*)) into v_team_sample
  from public.matches m join public.gameweeks gw on gw.id=p_gameweek_id
  where m.status='published' and m.date<gw.date;
  update public.gazalbet_markets set sample_size=v_team_sample,model_version='gazalbet-v2'
  where gameweek_id=p_gameweek_id and kind in ('winner','handicap','total')
    and model_version<>'gazalbet-v2-manual-opponent';
  return v_result||jsonb_build_object('model_version','gazalbet-v4','wallet',v_wallet);
end;
$$;

create or replace function public.place_gazalbet_ticket(p_gameweek_id bigint,p_legs jsonb,p_stake numeric)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid:=auth.uid(); v_gw public.gameweeks%rowtype; v_wallet public.gazalbet_wallets%rowtype;
  v_leg jsonb; v_quote jsonb; v_market public.gazalbet_markets%rowtype; v_selection jsonb;
  v_ticket public.gazalbet_tickets%rowtype; v_total numeric:=1; v_count int; v_pos int:=0; v_seen text[]:='{}';
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  v_count:=jsonb_array_length(p_legs);
  if v_count<1 or v_count>6 then raise exception 'Ticket must contain 1 to 6 selections'; end if;
  if p_stake is null or p_stake<1 or trunc(p_stake)<>p_stake then raise exception 'Stake must be a positive whole number'; end if;
  select * into v_gw from public.gameweeks where id=p_gameweek_id for share;
  if not found or now()>=v_gw.deadline then raise exception 'Market closed'; end if;
  perform public.gazalbet_prepare_wallet(p_gameweek_id);
  select * into v_wallet from public.gazalbet_wallets where user_id=v_uid for update;
  if v_wallet.balance<p_stake then raise exception 'Insufficient balance'; end if;

  create temporary table if not exists pg_temp.gb_validated(position int,leg_type text,market_id uuid,selection_key text,player_id bigint,stat_key text,direction text,line numeric,label text,odds numeric,sample_size int) on commit drop;
  truncate pg_temp.gb_validated;
  for v_leg in select value from jsonb_array_elements(p_legs) loop
    v_pos:=v_pos+1;
    if v_leg->>'type'='market' then
      select * into v_market from public.gazalbet_markets where id=(v_leg->>'market_id')::uuid and gameweek_id=p_gameweek_id and status='open';
      if not found then raise exception 'Invalid market selection'; end if;
      select value into v_selection from jsonb_array_elements(v_market.selections) where value->>'key'=v_leg->>'selection_key' limit 1;
      if v_selection is null then raise exception 'Invalid market selection'; end if;
      if ('market:'||v_market.id::text)=any(v_seen) then raise exception 'Duplicate selection in accumulator'; end if;
      v_seen:=array_append(v_seen,'market:'||v_market.id::text);
      insert into pg_temp.gb_validated values(v_pos,'market',v_market.id,v_leg->>'selection_key',null,null,null,v_market.line,v_market.title||' · '||(v_selection->>'label'),(v_selection->>'odds')::numeric,coalesce(v_market.sample_size,0));
      v_total:=v_total*(v_selection->>'odds')::numeric;
    elsif v_leg->>'type'='player_prop' then
      if ('player:'||(v_leg->>'player_id')||':'||(v_leg->>'stat_key'))=any(v_seen) then raise exception 'Related selections cannot be combined'; end if;
      v_seen:=array_append(v_seen,'player:'||(v_leg->>'player_id')||':'||(v_leg->>'stat_key'));
      v_quote:=public.gazalbet_quote_player_line(p_gameweek_id,(v_leg->>'player_id')::bigint,v_leg->>'stat_key',v_leg->>'direction',(v_leg->>'line')::numeric);
      insert into pg_temp.gb_validated values(v_pos,'player_prop',null,null,(v_quote->>'player_id')::bigint,v_quote->>'stat_key',v_quote->>'direction',(v_quote->>'line')::numeric,v_quote->>'label',(v_quote->>'odds')::numeric,(v_quote->>'sample_size')::int);
      v_total:=v_total*(v_quote->>'odds')::numeric;
    elsif v_leg->>'type'='game_prop' then
      if ('game:'||(v_leg->>'stat_key'))=any(v_seen) then raise exception 'Related selections cannot be combined'; end if;
      v_seen:=array_append(v_seen,'game:'||(v_leg->>'stat_key'));
      v_quote:=public.gazalbet_quote_game_line(p_gameweek_id,v_leg->>'stat_key',v_leg->>'selection_key',v_leg->>'direction',(v_leg->>'line')::numeric);
      insert into pg_temp.gb_validated values(v_pos,'game_prop',null,v_quote->>'selection_key',null,v_quote->>'stat_key',v_quote->>'direction',(v_quote->>'line')::numeric,v_quote->>'label',(v_quote->>'odds')::numeric,(v_quote->>'sample_size')::int);
      v_total:=v_total*(v_quote->>'odds')::numeric;
    else raise exception 'Invalid selection type'; end if;
  end loop;
  v_total:=round(least(v_total,100),2);
  insert into public.gazalbet_tickets(user_id,gameweek_id,ticket_type,stake,total_odds)
  values(v_uid,p_gameweek_id,case when v_count=1 then 'single' else 'accumulator' end,p_stake,v_total) returning * into v_ticket;
  insert into public.gazalbet_ticket_legs(ticket_id,position,leg_type,market_id,selection_key,player_id,stat_key,direction,line,label,odds,sample_size)
    select v_ticket.id,position,leg_type,market_id,selection_key,player_id,stat_key,direction,line,label,odds,sample_size from pg_temp.gb_validated;
  update public.gazalbet_wallets set balance=balance-p_stake,total_wagered=total_wagered+p_stake,updated_at=now() where user_id=v_uid;
  return jsonb_build_object('ticket_id',v_ticket.id,'type',v_ticket.ticket_type,'stake',p_stake,'odds',v_total,'potential_return',round(p_stake*v_total,2));
end;
$$;

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
  for v_leg in select l.* from public.gazalbet_ticket_legs l join public.gazalbet_tickets t on t.id=l.ticket_id where t.gameweek_id=p_gameweek_id and t.status='pending' and l.status='pending' for update of l loop
    if v_leg.leg_type='market' then
      select * into v_market from public.gazalbet_markets where id=v_leg.market_id;
      if v_market.status='void' then update public.gazalbet_ticket_legs set status='void',settled_at=now() where id=v_leg.id;
      elsif v_market.status='settled' then update public.gazalbet_ticket_legs set status=case when v_market.winning_key=v_leg.selection_key then 'won' else 'lost' end,settled_at=now() where id=v_leg.id; end if;
    elsif v_leg.leg_type='player_prop' then
      select public.gazalbet_player_metric(v_leg.stat_key,s.pts,s.three_pm,s.reb,s.ast,s.pf,s.pir) into v_value from public.player_match_stats s where s.match_id=v_match.id and s.player_id=v_leg.player_id and s.min_seconds>0;
      if v_value is null then update public.gazalbet_ticket_legs set status='void',settled_at=now() where id=v_leg.id;
      else update public.gazalbet_ticket_legs set result_value=v_value,status=case when (v_leg.direction='over' and v_value>v_leg.line) or (v_leg.direction='under' and v_value<v_leg.line) then 'won' else 'lost' end,settled_at=now() where id=v_leg.id; end if;
    else
      if v_leg.stat_key='handicap' then
        v_value:=case when v_leg.selection_key='gazalbide' then v_match.gazal_pts-v_match.opp_pts else v_match.opp_pts-v_match.gazal_pts end;
        v_leg_won:=v_value+v_leg.line>0;
      else
        v_value:=v_match.gazal_pts+v_match.opp_pts;
        v_leg_won:=(v_leg.direction='over' and v_value>v_leg.line) or (v_leg.direction='under' and v_value<v_leg.line);
      end if;
      update public.gazalbet_ticket_legs set result_value=v_value,status=case when v_leg_won then 'won' else 'lost' end,settled_at=now() where id=v_leg.id;
    end if;
  end loop;
  for v_ticket in select * from public.gazalbet_tickets where gameweek_id=p_gameweek_id and status='pending' for update loop
    select count(*) filter(where status='lost'),count(*) filter(where status='pending'),count(*) filter(where status='won'),count(*) filter(where status='void'),coalesce(exp(sum(ln(odds)) filter(where status='won')),1)
      into v_lost,v_open,v_won,v_void,v_effective from public.gazalbet_ticket_legs where ticket_id=v_ticket.id;
    if v_open=0 then
      update public.gazalbet_tickets set status=case when v_lost>0 then 'lost' when v_won=0 then 'void' else 'won' end,
        total_odds=round(least(v_effective,100),2),payout=case when v_lost>0 then 0 when v_won=0 then stake else round(stake*least(v_effective,100),2) end,settled_at=now() where id=v_ticket.id;
    end if;
  end loop;
  with payouts as (select t.user_id,sum(t.payout) amount from public.gazalbet_tickets t where t.gameweek_id=p_gameweek_id and t.settled_at is not null and t.payout>0 and not exists(select 1 from public.gazalbet_ticket_settlements s where s.ticket_id=t.id) group by t.user_id)
  update public.gazalbet_wallets w set balance=w.balance+p.amount,total_won=w.total_won+p.amount,updated_at=now() from payouts p where w.user_id=p.user_id;
  insert into public.gazalbet_ticket_settlements(ticket_id) select id from public.gazalbet_tickets where gameweek_id=p_gameweek_id and settled_at is not null and payout>0 on conflict do nothing;
  return jsonb_build_object('settled',true);
end;
$$;

-- The old one-click endpoint is no longer used. Revoking it also prevents its
-- legacy per-gameweek 100-credit grant from being called directly.
revoke execute on function public.place_gazalbet_bet(uuid,text,numeric) from authenticated;

revoke all on function public.gazalbet_prepare_wallet(bigint) from public,anon;
revoke all on function public.gazalbet_quote_game_line(bigint,text,text,text,numeric) from public,anon;
revoke all on function public.ensure_gazalbet_markets(bigint) from public,anon;
revoke all on function public.place_gazalbet_ticket(bigint,jsonb,numeric) from public,anon;
revoke all on function public.settle_gazalbet_tickets(bigint) from public,anon,authenticated;
grant execute on function public.gazalbet_prepare_wallet(bigint) to authenticated;
grant execute on function public.gazalbet_quote_game_line(bigint,text,text,text,numeric) to authenticated;
grant execute on function public.ensure_gazalbet_markets(bigint) to authenticated;
grant execute on function public.place_gazalbet_ticket(bigint,jsonb,numeric) to authenticated;
