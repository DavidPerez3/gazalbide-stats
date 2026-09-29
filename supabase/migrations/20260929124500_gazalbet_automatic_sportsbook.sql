-- GazalBet replaces the manual Porra with a small, automatic virtual sportsbook.
-- The old Porra tables are intentionally kept so historical data is not lost.

create table if not exists public.gazalbet_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance numeric(12,2) not null default 0 check (balance >= 0),
  total_wagered numeric(12,2) not null default 0 check (total_wagered >= 0),
  total_won numeric(12,2) not null default 0 check (total_won >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.gazalbet_credit_grants (
  user_id uuid not null references auth.users(id) on delete cascade,
  gameweek_id bigint not null references public.gameweeks(id) on delete cascade,
  amount numeric(12,2) not null default 100 check (amount > 0),
  granted_at timestamptz not null default now(),
  primary key (user_id, gameweek_id)
);

create table if not exists public.gazalbet_markets (
  id uuid primary key default gen_random_uuid(),
  gameweek_id bigint not null references public.gameweeks(id) on delete cascade,
  code text not null,
  kind text not null check (kind in ('winner','handicap','total','top_scorer','player_points','head_to_head')),
  title text not null,
  subtitle text,
  line numeric(8,2),
  selections jsonb not null check (jsonb_typeof(selections) = 'array' and jsonb_array_length(selections) >= 2),
  model_version text not null default 'gazalbet-v1',
  confidence smallint not null default 25 check (confidence between 0 and 100),
  status text not null default 'open' check (status in ('open','closed','settled','void')),
  winning_key text,
  generated_at timestamptz not null default now(),
  settled_at timestamptz,
  unique (gameweek_id, code)
);

create table if not exists public.gazalbet_bets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gameweek_id bigint not null references public.gameweeks(id) on delete cascade,
  market_id uuid not null references public.gazalbet_markets(id) on delete restrict,
  selection_key text not null,
  selection_label text not null,
  stake numeric(12,2) not null check (stake in (5,10,20)),
  odds numeric(8,2) not null check (odds >= 1.01),
  status text not null default 'pending' check (status in ('pending','won','lost','void')),
  payout numeric(12,2) not null default 0 check (payout >= 0),
  placed_at timestamptz not null default now(),
  settled_at timestamptz,
  unique (user_id, market_id)
);

-- Idempotency marker: prevents a second settlement call from crediting payouts twice.
create table if not exists public.gazalbet_wallet_settlements (
  bet_id uuid primary key references public.gazalbet_bets(id) on delete cascade,
  credited_at timestamptz not null default now()
);

create index if not exists gazalbet_markets_gameweek_idx on public.gazalbet_markets(gameweek_id, status);
create index if not exists gazalbet_bets_user_idx on public.gazalbet_bets(user_id, placed_at desc);
create index if not exists gazalbet_bets_gameweek_idx on public.gazalbet_bets(gameweek_id, status);

alter table public.gazalbet_wallets enable row level security;
alter table public.gazalbet_credit_grants enable row level security;
alter table public.gazalbet_markets enable row level security;
alter table public.gazalbet_bets enable row level security;
alter table public.gazalbet_wallet_settlements enable row level security;

create policy "GazalBet own wallet" on public.gazalbet_wallets for select to authenticated
using ((select auth.uid()) = user_id or public.is_gazal_admin());
create policy "GazalBet own grants" on public.gazalbet_credit_grants for select to authenticated
using ((select auth.uid()) = user_id or public.is_gazal_admin());
create policy "GazalBet markets visible" on public.gazalbet_markets for select to authenticated using (true);
create policy "GazalBet own bets" on public.gazalbet_bets for select to authenticated
using ((select auth.uid()) = user_id or public.is_gazal_admin());

grant select on public.gazalbet_wallets, public.gazalbet_credit_grants, public.gazalbet_markets, public.gazalbet_bets to authenticated;

create or replace function public.gazalbet_decimal_odds(p_probability numeric)
returns numeric language sql immutable set search_path = public as $$
  select round(greatest(1.15, least(6.00, 1 / greatest(0.05, least(0.95, p_probability)) / 1.08)), 2)
$$;

create or replace function public.ensure_gazalbet_markets(p_gameweek_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
  from (select * from public.matches where status = 'published' and date < v_gw.date order by date desc limit 8) recent;

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
    where m.status='published' and m.date < v_gw.date and p.active and s.min_seconds > 0
    group by p.id,p.name order by avg(s.pts) desc, count(*) desc limit 1
  ) ranked;
  select ranked.* into v_p2 from (
    select p.id, p.name, round(avg(s.pts)::numeric,1) ppg, count(*) games
    from public.player_match_stats s join public.matches m on m.id=s.match_id join public.players p on p.id=s.player_id
    where m.status='published' and m.date < v_gw.date and p.active and s.min_seconds > 0
    group by p.id,p.name order by avg(s.pts) desc, count(*) desc offset 1 limit 1
  ) ranked;
  select ranked.* into v_p3 from (
    select p.id, p.name, round(avg(s.pts)::numeric,1) ppg, count(*) games
    from public.player_match_stats s join public.matches m on m.id=s.match_id join public.players p on p.id=s.player_id
    where m.status='published' and m.date < v_gw.date and p.active and s.min_seconds > 0
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
$$;

create or replace function public.place_gazalbet_bet(p_market_id uuid, p_selection_key text, p_stake numeric)
returns public.gazalbet_bets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_market public.gazalbet_markets%rowtype;
  v_gw public.gameweeks%rowtype;
  v_selection jsonb;
  v_week_staked numeric;
  v_week_count integer;
  v_bet public.gazalbet_bets%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_stake not in (5,10,20) then raise exception 'Stake must be 5, 10 or 20'; end if;
  select * into v_market from public.gazalbet_markets where id=p_market_id for update;
  if not found then raise exception 'Market not found'; end if;
  select * into v_gw from public.gameweeks where id=v_market.gameweek_id;
  if v_market.status <> 'open' or now() >= v_gw.deadline then raise exception 'Market closed'; end if;
  select value into v_selection from jsonb_array_elements(v_market.selections) where value->>'key'=p_selection_key limit 1;
  if v_selection is null then raise exception 'Invalid selection'; end if;

  insert into public.gazalbet_wallets(user_id) values(v_uid) on conflict do nothing;
  insert into public.gazalbet_credit_grants(user_id,gameweek_id,amount) values(v_uid,v_gw.id,100)
  on conflict do nothing;
  if found then update public.gazalbet_wallets set balance=balance+100,updated_at=now() where user_id=v_uid; end if;

  select coalesce(sum(stake),0),count(*) into v_week_staked,v_week_count
  from public.gazalbet_bets where user_id=v_uid and gameweek_id=v_gw.id;
  if v_week_count >= 3 then raise exception 'Maximum 3 bets per gameweek'; end if;
  if v_week_staked + p_stake > 60 then raise exception 'Maximum 60 credits per gameweek'; end if;
  if exists(select 1 from public.gazalbet_bets where user_id=v_uid and market_id=v_market.id) then raise exception 'You already bet on this market'; end if;
  if (select balance from public.gazalbet_wallets where user_id=v_uid) < p_stake then raise exception 'Insufficient balance'; end if;

  update public.gazalbet_wallets set balance=balance-p_stake,total_wagered=total_wagered+p_stake,updated_at=now() where user_id=v_uid;
  insert into public.gazalbet_bets(user_id,gameweek_id,market_id,selection_key,selection_label,stake,odds)
  values(v_uid,v_gw.id,v_market.id,p_selection_key,v_selection->>'label',p_stake,(v_selection->>'odds')::numeric)
  returning * into v_bet;
  return v_bet;
end;
$$;

create or replace function public.settle_gazalbet_gameweek(p_gameweek_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gw public.gameweeks%rowtype;
  v_match public.matches%rowtype;
  v_market public.gazalbet_markets%rowtype;
  v_winner text;
  v_player_id bigint;
  v_player2_id bigint;
  v_pts integer;
  v_pts2 integer;
  v_top integer;
  v_paid numeric := 0;
begin
  select * into v_gw from public.gameweeks where id=p_gameweek_id;
  select * into v_match from public.matches where id=v_gw.match_id and status='published';
  if not found then return jsonb_build_object('settled',false,'reason','match_not_published'); end if;

  for v_market in select * from public.gazalbet_markets where gameweek_id=p_gameweek_id and status in ('open','closed') for update loop
    v_winner := null;
    if v_market.kind='winner' then
      v_winner := case when v_match.gazal_pts>v_match.opp_pts then 'gazalbide' when v_match.gazal_pts<v_match.opp_pts then 'opponent' end;
    elsif v_market.kind='handicap' then
      v_winner := case when v_match.gazal_pts+v_market.line>v_match.opp_pts then 'gazalbide' when v_match.gazal_pts+v_market.line<v_match.opp_pts then 'opponent' end;
    elsif v_market.kind='total' then
      v_winner := case when v_match.gazal_pts+v_match.opp_pts>v_market.line then 'over' when v_match.gazal_pts+v_match.opp_pts<v_market.line then 'under' end;
    elsif v_market.kind='top_scorer' then
      select max(pts) into v_top from public.player_match_stats where match_id=v_match.id;
      select player_id::text into v_winner from public.player_match_stats
      where match_id=v_match.id and pts=v_top and player_id::text in (select value->>'key' from jsonb_array_elements(v_market.selections))
      order by player_id limit 1;
    elsif v_market.kind='player_points' then
      v_player_id := (v_market.selections->0->>'player_id')::bigint;
      select pts into v_pts from public.player_match_stats where match_id=v_match.id and player_id=v_player_id;
      if v_pts is not null then v_winner := case when v_pts>v_market.line then 'over' when v_pts<v_market.line then 'under' end; end if;
    elsif v_market.kind='head_to_head' then
      v_player_id := (v_market.selections->0->>'key')::bigint;
      v_player2_id := (v_market.selections->1->>'key')::bigint;
      select pts into v_pts from public.player_match_stats where match_id=v_match.id and player_id=v_player_id;
      select pts into v_pts2 from public.player_match_stats where match_id=v_match.id and player_id=v_player2_id;
      if v_pts is not null and v_pts2 is not null then v_winner := case when v_pts>v_pts2 then v_player_id::text when v_pts<v_pts2 then v_player2_id::text end; end if;
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
    select user_id,sum(payout) amount from public.gazalbet_bets
    where gameweek_id=p_gameweek_id and settled_at is not null and payout>0
      and not exists (select 1 from public.gazalbet_wallet_settlements s where s.bet_id=gazalbet_bets.id)
    group by user_id
  )
  update public.gazalbet_wallets w set balance=w.balance+p.amount,total_won=w.total_won+p.amount,updated_at=now()
  from payouts p where w.user_id=p.user_id;
  insert into public.gazalbet_wallet_settlements(bet_id)
  select id from public.gazalbet_bets where gameweek_id=p_gameweek_id and settled_at is not null and payout>0 on conflict do nothing;
  select coalesce(sum(payout),0) into v_paid from public.gazalbet_bets where gameweek_id=p_gameweek_id;
  return jsonb_build_object('settled',true,'paid',v_paid);
end;
$$;

create or replace function public.gazalbet_match_published_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_gameweek_id bigint;
begin
  if new.status='published' and (old.status is distinct from new.status or old.gazal_pts is distinct from new.gazal_pts or old.opp_pts is distinct from new.opp_pts) then
    for v_gameweek_id in select id from public.gameweeks where match_id=new.id loop
      perform public.settle_gazalbet_gameweek(v_gameweek_id);
    end loop;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_gazalbet_match_published on public.matches;
create trigger trg_gazalbet_match_published after update on public.matches
for each row execute function public.gazalbet_match_published_trigger();

create or replace function public.admin_void_gazalbet_market(p_market_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or not public.is_gazal_admin() then raise exception 'Admin required'; end if;
  update public.gazalbet_markets set status='void',winning_key=null,settled_at=now() where id=p_market_id and status in ('open','closed');
  update public.gazalbet_bets set status='void',payout=stake,settled_at=now() where market_id=p_market_id and status='pending';
  update public.gazalbet_wallets w set balance=w.balance+x.amount,updated_at=now()
  from (select user_id,sum(payout) amount from public.gazalbet_bets b where b.market_id=p_market_id and b.status='void'
    and not exists(select 1 from public.gazalbet_wallet_settlements s where s.bet_id=b.id) group by user_id) x where w.user_id=x.user_id;
  insert into public.gazalbet_wallet_settlements(bet_id) select id from public.gazalbet_bets where market_id=p_market_id and status='void' on conflict do nothing;
end;
$$;

revoke all on function public.gazalbet_decimal_odds(numeric) from public;
revoke all on function public.ensure_gazalbet_markets(bigint) from public;
revoke all on function public.place_gazalbet_bet(uuid,text,numeric) from public;
revoke all on function public.settle_gazalbet_gameweek(bigint) from public;
revoke all on function public.admin_void_gazalbet_market(uuid) from public;
revoke all on function public.gazalbet_match_published_trigger() from public, anon, authenticated;
grant execute on function public.ensure_gazalbet_markets(bigint) to authenticated;
grant execute on function public.place_gazalbet_bet(uuid,text,numeric) to authenticated;
grant execute on function public.admin_void_gazalbet_market(uuid) to authenticated;
