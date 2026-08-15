-- Gazalbide Stats: make Fantasy season-aware and introduce first-class staff.
-- Existing Fantasy data belongs to 2025-2026. New Fantasy teams default to 2026-2027.

-- -----------------------------------------------------------------------------
-- Fantasy gameweeks belong to a season.
-- -----------------------------------------------------------------------------
alter table public.gameweeks add column if not exists season_id text;

update public.gameweeks
set season_id = '2025-2026'
where season_id is null;

alter table public.gameweeks alter column season_id set default '2026-2027';
alter table public.gameweeks alter column season_id set not null;
alter table public.gameweeks drop constraint if exists gameweeks_season_id_fkey;
alter table public.gameweeks add constraint gameweeks_season_id_fkey
  foreign key (season_id) references public.seasons(id) on update cascade on delete restrict;

create index if not exists gameweeks_season_deadline_idx
  on public.gameweeks(season_id, deadline);

-- Historical gameweeks already have published match stats, so they are no longer
-- active scheduled gameweeks. This also prevents old Fantasy screens from treating
-- 2025-2026 as an active season if a client forgets to filter by season.
update public.gameweeks
set status = 'scored'
where season_id = '2025-2026'
  and match_id is not null
  and status = 'scheduled';

-- -----------------------------------------------------------------------------
-- Fantasy teams are season-specific. Preserve every 2025-2026 team and lineup.
-- -----------------------------------------------------------------------------
alter table public.fantasy_teams add column if not exists season_id text;

update public.fantasy_teams
set season_id = '2025-2026'
where season_id is null;

alter table public.fantasy_teams alter column season_id set default '2026-2027';
alter table public.fantasy_teams alter column season_id set not null;
alter table public.fantasy_teams drop constraint if exists fantasy_teams_season_id_fkey;
alter table public.fantasy_teams add constraint fantasy_teams_season_id_fkey
  foreign key (season_id) references public.seasons(id) on update cascade on delete restrict;

-- The old schema allowed exactly one Fantasy team per user for all time.
-- Replace that with one team per user and season.
alter table public.fantasy_teams drop constraint if exists fantasy_teams_user_id_key;
create unique index if not exists fantasy_teams_user_season_uidx
  on public.fantasy_teams(user_id, season_id);
create index if not exists fantasy_teams_season_idx
  on public.fantasy_teams(season_id);

-- New teams only receive empty lineups for gameweeks in the same season.
create or replace function public.create_empty_lineups_for_new_team()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.fantasy_lineups (
    fantasy_team_id,
    gameweek_id,
    players,
    captain_number,
    coach_code
  )
  select
    new.id,
    gw.id,
    array['-1','-1','-1','-1','-1']::text[],
    null,
    null
  from public.gameweeks gw
  where gw.season_id = new.season_id
  on conflict (fantasy_team_id, gameweek_id) do nothing;
  return new;
end;
$$;

-- New gameweeks only create empty lineups for teams in that same season.
create or replace function public.create_empty_lineups_for_new_gameweek()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.fantasy_lineups (
    fantasy_team_id,
    gameweek_id,
    players,
    captain_number,
    coach_code
  )
  select
    ft.id,
    new.id,
    array['-1','-1','-1','-1','-1']::text[],
    null,
    null
  from public.fantasy_teams ft
  where ft.season_id = new.season_id
  on conflict (fantasy_team_id, gameweek_id) do nothing;
  return new;
end;
$$;

-- Guard against accidental cross-season lineup references.
create or replace function public.validate_fantasy_lineup_season()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  team_season text;
  gw_season text;
begin
  select season_id into team_season
  from public.fantasy_teams
  where id = new.fantasy_team_id;

  select season_id into gw_season
  from public.gameweeks
  where id = new.gameweek_id;

  if team_season is null or gw_season is null or team_season <> gw_season then
    raise exception 'Fantasy lineup team and gameweek must belong to the same season';
  end if;

  return new;
end;
$$;

drop trigger if exists fantasy_lineup_season_guard on public.fantasy_lineups;
create trigger fantasy_lineup_season_guard
before insert or update of fantasy_team_id, gameweek_id on public.fantasy_lineups
for each row execute function public.validate_fantasy_lineup_season();

revoke all on function public.validate_fantasy_lineup_season() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- First-class staff identities. Staff are not players: they do not get minutes,
-- PIR or shooting stats, but can be selected in Fantasy and receive discipline.
-- -----------------------------------------------------------------------------
create table if not exists public.staff_members (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.season_staff (
  season_id text not null references public.seasons(id) on delete cascade,
  staff_id uuid not null references public.staff_members(id) on delete restrict,
  role text not null default 'coach',
  active boolean not null default true,
  fantasy_enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (season_id, staff_id)
);

create index if not exists season_staff_season_sort_idx
  on public.season_staff(season_id, sort_order, staff_id);

insert into public.staff_members (code, name, photo_path)
values
  ('david', 'David', '/images/coaches/david.png'),
  ('gorka', 'Gorka', '/images/coaches/gorka.png'),
  ('unai', 'Unai', '/images/coaches/unai.png'),
  ('araiko', 'Araiko', null)
on conflict (code) do update set
  name = excluded.name,
  photo_path = coalesce(public.staff_members.photo_path, excluded.photo_path),
  updated_at = now();

insert into public.season_staff (season_id, staff_id, role, active, fantasy_enabled, sort_order)
select '2025-2026', id, 'coach', true, true,
  case code when 'david' then 0 when 'gorka' then 1 when 'unai' then 2 else 99 end
from public.staff_members
where code in ('david','gorka','unai')
on conflict (season_id, staff_id) do update set
  active = excluded.active,
  fantasy_enabled = excluded.fantasy_enabled,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into public.season_staff (season_id, staff_id, role, active, fantasy_enabled, sort_order)
select '2026-2027', id, 'coach', true, true,
  case code when 'david' then 0 when 'araiko' then 1 when 'unai' then 2 else 99 end
from public.staff_members
where code in ('david','araiko','unai')
on conflict (season_id, staff_id) do update set
  active = excluded.active,
  fantasy_enabled = excluded.fantasy_enabled,
  sort_order = excluded.sort_order,
  updated_at = now();

alter table public.staff_members enable row level security;
alter table public.season_staff enable row level security;

drop policy if exists "staff_members_public_read" on public.staff_members;
create policy "staff_members_public_read" on public.staff_members
  for select using (true);

drop policy if exists "season_staff_public_read" on public.season_staff;
create policy "season_staff_public_read" on public.season_staff
  for select using (true);

drop policy if exists "staff_members_admin_all" on public.staff_members;
create policy "staff_members_admin_all" on public.staff_members
  for all to authenticated
  using (public.is_gazal_admin()) with check (public.is_gazal_admin());

drop policy if exists "season_staff_admin_all" on public.season_staff;
create policy "season_staff_admin_all" on public.season_staff
  for all to authenticated
  using (public.is_gazal_admin()) with check (public.is_gazal_admin());

grant select on public.staff_members, public.season_staff to anon, authenticated;

comment on column public.fantasy_teams.season_id is
  'Fantasy season. Allows the same user to create a fresh team each season while preserving history.';
comment on table public.staff_members is
  'Permanent staff identities, separate from players so discipline and Fantasy selection do not pollute player box-score stats.';
comment on table public.season_staff is
  'Season membership and Fantasy availability for Gazalbide staff.';
