-- Remove the selection-count cap while retaining duplicate checks and 100x odds.
alter table public.gazalbet_ticket_legs drop constraint gazalbet_ticket_legs_position_check;
alter table public.gazalbet_ticket_legs alter column position type integer;
alter table public.gazalbet_ticket_legs add constraint gazalbet_ticket_legs_position_check check (position >= 1);

create or replace function public.place_gazalbet_ticket(p_gameweek_id bigint,p_legs jsonb,p_stake numeric)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid:=auth.uid(); v_gw public.gameweeks%rowtype; v_wallet public.gazalbet_wallets%rowtype;
  v_leg jsonb; v_quote jsonb; v_market public.gazalbet_markets%rowtype; v_selection jsonb;
  v_ticket public.gazalbet_tickets%rowtype; v_total numeric:=1; v_count int; v_pos int:=0; v_seen text[]:='{}';
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_legs is null or jsonb_typeof(p_legs)<>'array' then raise exception 'Selections must be an array'; end if;
  v_count:=jsonb_array_length(p_legs);
  if v_count<1 then raise exception 'Ticket must contain at least one selection'; end if;
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
      v_total:=least(100,v_total*(v_selection->>'odds')::numeric);
    elsif v_leg->>'type'='player_prop' then
      if ('player:'||(v_leg->>'player_id')||':'||(v_leg->>'stat_key'))=any(v_seen) then raise exception 'Related selections cannot be combined'; end if;
      v_seen:=array_append(v_seen,'player:'||(v_leg->>'player_id')||':'||(v_leg->>'stat_key'));
      v_quote:=public.gazalbet_quote_player_line(p_gameweek_id,(v_leg->>'player_id')::bigint,v_leg->>'stat_key',v_leg->>'direction',(v_leg->>'line')::numeric);
      insert into pg_temp.gb_validated values(v_pos,'player_prop',null,null,(v_quote->>'player_id')::bigint,v_quote->>'stat_key',v_quote->>'direction',(v_quote->>'line')::numeric,v_quote->>'label',(v_quote->>'odds')::numeric,(v_quote->>'sample_size')::int);
      v_total:=least(100,v_total*(v_quote->>'odds')::numeric);
    elsif v_leg->>'type'='game_prop' then
      if ('game:'||(v_leg->>'stat_key'))=any(v_seen) then raise exception 'Related selections cannot be combined'; end if;
      v_seen:=array_append(v_seen,'game:'||(v_leg->>'stat_key'));
      v_quote:=public.gazalbet_quote_game_line(p_gameweek_id,v_leg->>'stat_key',v_leg->>'selection_key',v_leg->>'direction',(v_leg->>'line')::numeric);
      insert into pg_temp.gb_validated values(v_pos,'game_prop',null,v_quote->>'selection_key',null,v_quote->>'stat_key',v_quote->>'direction',(v_quote->>'line')::numeric,v_quote->>'label',(v_quote->>'odds')::numeric,(v_quote->>'sample_size')::int);
      v_total:=least(100,v_total*(v_quote->>'odds')::numeric);
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
