-- Gazalbide Stats: season-level Fantasy market + immutable-ish price snapshots per gameweek.
-- 2026-2027 deliberately starts with market_ready=false so an admin cannot open
-- the first gameweek while the frontend still points at last season's JSON market.

create table if not exists public.fantasy_season_settings (
  season_id text primary key references public.seasons(id) on delete cascade,
  base_budget integer not null default 80 check (base_budget > 0),
  market_ready boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.fantasy_season_settings (season_id, base_budget, market_ready)
values
  ('2025-2026', 80, false),
  ('2026-2027', 80, false)
on conflict (season_id) do nothing;

create table if not exists public.fantasy_player_market (
  season_id text not null references public.seasons(id) on delete cascade,
  player_id bigint not null references public.players(id) on delete restrict,
  price integer not null check (price > 0),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (season_id, player_id)
);

create index if not exists fantasy_player_market_season_enabled_idx
  on public.fantasy_player_market(season_id, enabled, price);

create table if not exists public.fantasy_gameweek_prices (
  gameweek_id bigint not null references public.gameweeks(id) on delete cascade,
  player_id bigint not null references public.players(id) on delete restrict,
  price integer not null check (price > 0),
  created_at timestamptz not null default now(),
  primary key (gameweek_id, player_id)
);

create index if not exists fantasy_gameweek_prices_player_idx
  on public.fantasy_gameweek_prices(player_id, gameweek_id);

alter table public.gameweeks
  add column if not exists base_budget integer not null default 80 check (base_budget > 0);

update public.gameweeks
set base_budget = 80
where season_id = '2025-2026';

-- A season can only open a new gameweek once every active roster player has an
-- enabled market price. This catches both preseason omissions and midseason signings.
create or replace function public.validate_fantasy_market_before_gameweek()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  settings public.fantasy_season_settings%rowtype;
  active_roster_count integer;
  priced_roster_count integer;
begin
  select * into settings
  from public.fantasy_season_settings
  where season_id = new.season_id;

  if settings.season_id is null or not settings.market_ready then
    raise exception 'El mercado Fantasy de la temporada % todavía no está preparado.', new.season_id;
  end if;

  select count(*) into active_roster_count
  from public.season_players sp
  where sp.season_id = new.season_id
    and sp.active = true;

  select count(*) into priced_roster_count
  from public.season_players sp
  join public.fantasy_player_market fm
    on fm.season_id = sp.season_id
   and fm.player_id = sp.player_id
   and fm.enabled = true
  where sp.season_id = new.season_id
    and sp.active = true;

  if active_roster_count = 0 or priced_roster_count <> active_roster_count then
    raise exception 'El mercado Fantasy de % está incompleto: % jugadores activos, % con precio.',
      new.season_id, active_roster_count, priced_roster_count;
  end if;

  new.base_budget := settings.base_budget;
  return new;
end;
$$;

revoke all on function public.validate_fantasy_market_before_gameweek() from public, anon, authenticated;

drop trigger if exists fantasy_market_ready_before_gameweek on public.gameweeks;
create trigger fantasy_market_ready_before_gameweek
before insert on public.gameweeks
for each row execute function public.validate_fantasy_market_before_gameweek();

-- Snapshot the exact prices used by this gameweek. Later market changes therefore
-- cannot retroactively make an old lineup cheaper or more expensive.
create or replace function public.snapshot_fantasy_prices_for_gameweek()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.fantasy_gameweek_prices (gameweek_id, player_id, price)
  select new.id, fm.player_id, fm.price
  from public.fantasy_player_market fm
  join public.season_players sp
    on sp.season_id = fm.season_id
   and sp.player_id = fm.player_id
   and sp.active = true
  where fm.season_id = new.season_id
    and fm.enabled = true
  on conflict (gameweek_id, player_id) do nothing;

  return new;
end;
$$;

revoke all on function public.snapshot_fantasy_prices_for_gameweek() from public, anon, authenticated;

drop trigger if exists fantasy_snapshot_prices_after_gameweek on public.gameweeks;
create trigger fantasy_snapshot_prices_after_gameweek
after insert on public.gameweeks
for each row execute function public.snapshot_fantasy_prices_for_gameweek();

alter table public.fantasy_season_settings enable row level security;
alter table public.fantasy_player_market enable row level security;
alter table public.fantasy_gameweek_prices enable row level security;

drop policy if exists "fantasy_season_settings_read" on public.fantasy_season_settings;
create policy "fantasy_season_settings_read"
on public.fantasy_season_settings for select using (true);

drop policy if exists "fantasy_player_market_read" on public.fantasy_player_market;
create policy "fantasy_player_market_read"
on public.fantasy_player_market for select using (true);

drop policy if exists "fantasy_gameweek_prices_read" on public.fantasy_gameweek_prices;
create policy "fantasy_gameweek_prices_read"
on public.fantasy_gameweek_prices for select using (true);

drop policy if exists "fantasy_season_settings_admin_all" on public.fantasy_season_settings;
create policy "fantasy_season_settings_admin_all"
on public.fantasy_season_settings for all to authenticated
using (public.is_gazal_admin()) with check (public.is_gazal_admin());

drop policy if exists "fantasy_player_market_admin_all" on public.fantasy_player_market;
create policy "fantasy_player_market_admin_all"
on public.fantasy_player_market for all to authenticated
using (public.is_gazal_admin()) with check (public.is_gazal_admin());

drop policy if exists "fantasy_gameweek_prices_admin_all" on public.fantasy_gameweek_prices;
create policy "fantasy_gameweek_prices_admin_all"
on public.fantasy_gameweek_prices for all to authenticated
using (public.is_gazal_admin()) with check (public.is_gazal_admin());

grant select on public.fantasy_season_settings, public.fantasy_player_market, public.fantasy_gameweek_prices to anon, authenticated;

comment on table public.fantasy_player_market is
  'Current Fantasy market price per player and season. Updated between gameweeks.';
comment on table public.fantasy_gameweek_prices is
  'Price snapshot taken when a Fantasy gameweek is created; historical lineup validation must use this table.';
comment on column public.gameweeks.base_budget is
  'League base budget snapshot for this gameweek. Returning users can rejoin from this floor without earning savings for skipped gameweeks.';
