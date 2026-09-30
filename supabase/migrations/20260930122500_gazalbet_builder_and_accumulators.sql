-- GazalBet v3: user-built player props and accumulator tickets.
-- Legacy gazalbet_bets remain readable and settle exactly as before.

create table public.gazalbet_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gameweek_id bigint not null references public.gameweeks(id) on delete cascade,
  ticket_type text not null check (ticket_type in ('single','accumulator')),
  stake numeric(12,2) not null check (stake >= 1 and stake <= 60),
  total_odds numeric(10,2) not null check (total_odds >= 1.01 and total_odds <= 100),
  status text not null default 'pending' check (status in ('pending','won','lost','void')),
  payout numeric(12,2) not null default 0 check (payout >= 0),
  placed_at timestamptz not null default now(),
  settled_at timestamptz
);

create table public.gazalbet_ticket_legs (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.gazalbet_tickets(id) on delete cascade,
  position smallint not null check (position between 1 and 6),
  leg_type text not null check (leg_type in ('market','player_prop')),
  market_id uuid references public.gazalbet_markets(id) on delete restrict,
  selection_key text,
  player_id bigint references public.players(id) on delete restrict,
  stat_key text check (stat_key is null or stat_key in ('pts','three_pm','reb','ast','pf','pir')),
  direction text check (direction is null or direction in ('over','under')),
  line numeric(8,2),
  label text not null,
  odds numeric(8,2) not null check (odds >= 1.01),
  sample_size smallint not null default 0,
  status text not null default 'pending' check (status in ('pending','won','lost','void')),
  result_value numeric(8,2),
  settled_at timestamptz,
  unique(ticket_id, position)
);

create table public.gazalbet_ticket_settlements (
  ticket_id uuid primary key references public.gazalbet_tickets(id) on delete cascade,
  credited_at timestamptz not null default now()
);

create index gazalbet_tickets_user_idx on public.gazalbet_tickets(user_id, placed_at desc);
create index gazalbet_tickets_gameweek_idx on public.gazalbet_tickets(gameweek_id, status);
create index gazalbet_ticket_legs_ticket_idx on public.gazalbet_ticket_legs(ticket_id, position);
create index gazalbet_ticket_legs_player_idx on public.gazalbet_ticket_legs(player_id, stat_key) where player_id is not null;

alter table public.gazalbet_tickets enable row level security;
alter table public.gazalbet_ticket_legs enable row level security;
alter table public.gazalbet_ticket_settlements enable row level security;

create policy "GazalBet own tickets" on public.gazalbet_tickets for select to authenticated
using ((select auth.uid()) = user_id or public.is_gazal_admin());
create policy "GazalBet own ticket legs" on public.gazalbet_ticket_legs for select to authenticated
using (exists(select 1 from public.gazalbet_tickets t where t.id=ticket_id and (t.user_id=(select auth.uid()) or public.is_gazal_admin())));
create policy "GazalBet ticket settlements admin" on public.gazalbet_ticket_settlements for select to authenticated
using (public.is_gazal_admin());

grant select on public.gazalbet_tickets, public.gazalbet_ticket_legs to authenticated;

create or replace function public.gazalbet_stat_label(p_stat text)
returns text language sql immutable set search_path='' as $$
  select case p_stat when 'pts' then 'Puntos' when 'three_pm' then 'Triples' when 'reb' then 'Rebotes'
    when 'ast' then 'Asistencias' when 'pf' then 'Faltas' when 'pir' then 'Valoración' end
$$;

create or replace function public.gazalbet_player_metric(p_stat text,p_pts int,p_three int,p_reb int,p_ast int,p_pf int,p_pir int)
returns numeric language sql immutable set search_path='' as $$
  select case p_stat when 'pts' then p_pts when 'three_pm' then p_three when 'reb' then p_reb
    when 'ast' then p_ast when 'pf' then p_pf when 'pir' then p_pir end::numeric
$$;

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
  select * into v_player from public.players where id=p_player_id and active;
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
  -- Logistic approximation, shrunk toward a neutral prior while samples are small.
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
    select p.sort_order,jsonb_build_object('id',p.id,'name',p.name,'number',p.number,'photo_path',p.photo_path,
      'games',count(s.*),'averages',jsonb_build_object('pts',round(coalesce(avg(s.pts),5),1),'three_pm',round(coalesce(avg(s.three_pm),.5),1),
      'reb',round(coalesce(avg(s.reb),3),1),'ast',round(coalesce(avg(s.ast),1),1),'pf',round(coalesce(avg(s.pf),2),1),'pir',round(coalesce(avg(s.pir),4),1))) row_data
    from public.players p left join public.player_statuses ps on ps.gameweek_id=p_gameweek_id and ps.player_number::text=coalesce(nullif(ltrim(p.number,'0'),''),'0')
    left join public.player_match_stats s on s.player_id=p.id and s.min_seconds>0
    left join public.matches m on m.id=s.match_id and m.status='published' and m.date<v_gw.date
    where p.active and coalesce(ps.status,'available') in ('available','disponible')
    group by p.id,p.name,p.number,p.photo_path,p.sort_order
  ) available;
  return jsonb_build_object('players',v_players,'categories',jsonb_build_array(
    jsonb_build_object('key','pts','label','Puntos'),jsonb_build_object('key','three_pm','label','Triples'),
    jsonb_build_object('key','reb','label','Rebotes'),jsonb_build_object('key','ast','label','Asistencias'),
    jsonb_build_object('key','pf','label','Faltas'),jsonb_build_object('key','pir','label','Valoración')));
end;
$$;

create or replace function public.place_gazalbet_ticket(p_gameweek_id bigint,p_legs jsonb,p_stake numeric)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid:=auth.uid(); v_gw public.gameweeks%rowtype; v_wallet public.gazalbet_wallets%rowtype;
  v_leg jsonb; v_quote jsonb; v_market public.gazalbet_markets%rowtype; v_selection jsonb;
  v_ticket public.gazalbet_tickets%rowtype; v_total numeric:=1; v_week_staked numeric:=0; v_count int; v_pos int:=0; v_seen text[]:='{}';
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  v_count:=jsonb_array_length(p_legs);
  if v_count<1 or v_count>6 then raise exception 'Ticket must contain 1 to 6 selections'; end if;
  if p_stake is null or p_stake<1 or p_stake>60 or trunc(p_stake)<>p_stake then raise exception 'Stake must be a whole number from 1 to 60'; end if;
  select * into v_gw from public.gameweeks where id=p_gameweek_id for share;
  if not found or now()>=v_gw.deadline then raise exception 'Market closed'; end if;
  insert into public.gazalbet_wallets(user_id) values(v_uid) on conflict do nothing;
  insert into public.gazalbet_credit_grants(user_id,gameweek_id,amount) values(v_uid,v_gw.id,100) on conflict do nothing;
  if found then update public.gazalbet_wallets set balance=balance+100,updated_at=now() where user_id=v_uid; end if;
  select * into v_wallet from public.gazalbet_wallets where user_id=v_uid for update;
  select coalesce((select sum(stake) from public.gazalbet_bets where user_id=v_uid and gameweek_id=p_gameweek_id),0)+
         coalesce((select sum(stake) from public.gazalbet_tickets where user_id=v_uid and gameweek_id=p_gameweek_id),0) into v_week_staked;
  if v_week_staked+p_stake>60 then raise exception 'Maximum 60 credits per gameweek'; end if;
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
declare v_gw public.gameweeks%rowtype; v_match public.matches%rowtype; v_leg public.gazalbet_ticket_legs%rowtype; v_value numeric; v_market public.gazalbet_markets%rowtype; v_ticket public.gazalbet_tickets%rowtype; v_effective numeric; v_lost int; v_open int; v_won int; v_void int;
begin
  select * into v_gw from public.gameweeks where id=p_gameweek_id;
  select * into v_match from public.matches where id=v_gw.match_id and status='published';
  if not found then return jsonb_build_object('settled',false); end if;
  for v_leg in select l.* from public.gazalbet_ticket_legs l join public.gazalbet_tickets t on t.id=l.ticket_id where t.gameweek_id=p_gameweek_id and t.status='pending' and l.status='pending' for update of l loop
    if v_leg.leg_type='market' then
      select * into v_market from public.gazalbet_markets where id=v_leg.market_id;
      if v_market.status='void' then update public.gazalbet_ticket_legs set status='void',settled_at=now() where id=v_leg.id;
      elsif v_market.status='settled' then update public.gazalbet_ticket_legs set status=case when v_market.winning_key=v_leg.selection_key then 'won' else 'lost' end,settled_at=now() where id=v_leg.id; end if;
    else
      select public.gazalbet_player_metric(v_leg.stat_key,s.pts,s.three_pm,s.reb,s.ast,s.pf,s.pir) into v_value from public.player_match_stats s where s.match_id=v_match.id and s.player_id=v_leg.player_id and s.min_seconds>0;
      if v_value is null then update public.gazalbet_ticket_legs set status='void',settled_at=now() where id=v_leg.id;
      else update public.gazalbet_ticket_legs set result_value=v_value,status=case when (v_leg.direction='over' and v_value>v_leg.line) or (v_leg.direction='under' and v_value<v_leg.line) then 'won' else 'lost' end,settled_at=now() where id=v_leg.id; end if;
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

create or replace function public.gazalbet_match_published_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_gameweek_id bigint;
begin
  if new.status='published' and (old.status is distinct from new.status or old.gazal_pts is distinct from new.gazal_pts or old.opp_pts is distinct from new.opp_pts) then
    for v_gameweek_id in select id from public.gameweeks where match_id=new.id loop
      perform public.settle_gazalbet_gameweek(v_gameweek_id);
      perform public.settle_gazalbet_tickets(v_gameweek_id);
    end loop;
  end if;
  return new;
end;
$$;

revoke all on function public.gazalbet_stat_label(text) from public,anon,authenticated;
revoke all on function public.gazalbet_player_metric(text,int,int,int,int,int,int) from public,anon,authenticated;
revoke all on function public.gazalbet_quote_player_line(bigint,bigint,text,text,numeric) from public,anon;
revoke all on function public.get_gazalbet_builder(bigint) from public,anon;
revoke all on function public.place_gazalbet_ticket(bigint,jsonb,numeric) from public,anon;
revoke all on function public.settle_gazalbet_tickets(bigint) from public,anon,authenticated;
revoke all on function public.gazalbet_match_published_trigger() from public,anon,authenticated;
grant execute on function public.gazalbet_quote_player_line(bigint,bigint,text,text,numeric) to authenticated;
grant execute on function public.get_gazalbet_builder(bigint) to authenticated;
grant execute on function public.place_gazalbet_ticket(bigint,jsonb,numeric) to authenticated;
