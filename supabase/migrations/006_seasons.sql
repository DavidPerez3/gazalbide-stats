-- Gazalbide Stats: first-class seasons and season-specific rosters.
-- Safe to apply after 001_stats_core.sql.

create table if not exists public.seasons (
  id text primary key,
  label text not null,
  starts_on date not null,
  ends_on date not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

insert into public.seasons (id, label, starts_on, ends_on, is_current)
values
  ('2025-2026', '2025-2026', '2025-07-01', '2026-06-30', false),
  ('2026-2027', '2026-2027', '2026-07-01', '2027-06-30', true)
on conflict (id) do update set
  label = excluded.label,
  starts_on = excluded.starts_on,
  ends_on = excluded.ends_on,
  is_current = excluded.is_current;

update public.matches
set season = '2025-2026'
where season in ('2025-26', '2025/26', '25/26');

alter table public.matches
  alter column season set default '2026-2027';

alter table public.matches
  drop constraint if exists matches_season_fkey;

alter table public.matches
  add constraint matches_season_fkey
  foreign key (season) references public.seasons(id) on update cascade on delete restrict;

-- players.number was originally globally unique. From now on the canonical dorsal
-- belongs to season_players so the same number can be reused by a different player
-- in another season, and the same player can change number between seasons.
alter table public.players drop constraint if exists players_number_key;
comment on column public.players.number is
  'Legacy/default jersey number. Canonical season-specific number lives in season_players.jersey_number.';

create table if not exists public.season_players (
  season_id text not null references public.seasons(id) on delete cascade,
  player_id bigint not null references public.players(id) on delete restrict,
  jersey_number text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (season_id, player_id),
  unique (season_id, jersey_number)
);

insert into public.season_players (season_id, player_id, jersey_number, active, sort_order)
select '2025-2026', p.id, p.number, true, p.sort_order
from public.players p
on conflict (season_id, player_id) do nothing;

create index if not exists matches_season_date_idx
  on public.matches(season, date desc);
create index if not exists season_players_season_sort_idx
  on public.season_players(season_id, sort_order, jersey_number);

alter table public.seasons enable row level security;
alter table public.season_players enable row level security;

drop policy if exists "seasons_public_read" on public.seasons;
create policy "seasons_public_read" on public.seasons for select using (true);

drop policy if exists "season_players_public_read" on public.season_players;
create policy "season_players_public_read" on public.season_players for select using (true);

drop policy if exists "seasons_admin_all" on public.seasons;
create policy "seasons_admin_all"
  on public.seasons for all to authenticated
  using (public.is_gazal_admin())
  with check (public.is_gazal_admin());

drop policy if exists "season_players_admin_all" on public.season_players;
create policy "season_players_admin_all"
  on public.season_players for all to authenticated
  using (public.is_gazal_admin())
  with check (public.is_gazal_admin());

grant select on public.seasons, public.season_players to anon, authenticated;

comment on table public.season_players is
  'Season-specific Gazalbide roster. Keeps former players in historical seasons without mixing them into the current squad.';
