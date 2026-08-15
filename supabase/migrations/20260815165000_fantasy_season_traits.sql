-- Gazalbide Stats: season-specific Fantasy traits.
-- Historical 2025-2026 assignments reproduce the old hardcoded scoring exactly.
-- 2026-2027 keeps retained-player traits, replaces Primos with Julen Power for
-- the two Julenes, and deliberately leaves Araiko/Izan/Gontzal/Dani without
-- invented traits until an admin chooses them.

create table if not exists public.fantasy_traits (
  season_id text not null references public.seasons(id) on delete cascade,
  code text not null,
  label text not null,
  activation_type text not null check (activation_type in ('coach_match','lineup_count')),
  multiplier numeric(6,3) not null check (multiplier > 0),
  required_count integer not null default 1 check (required_count > 0),
  sort_order integer not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (season_id, code)
);

create table if not exists public.fantasy_player_traits (
  season_id text not null,
  player_id bigint not null references public.players(id) on delete cascade,
  trait_code text not null,
  created_at timestamptz not null default now(),
  primary key (season_id, player_id, trait_code),
  foreign key (season_id, trait_code)
    references public.fantasy_traits(season_id, code) on update cascade on delete cascade,
  foreign key (season_id, player_id)
    references public.season_players(season_id, player_id) on update cascade on delete cascade
);

create table if not exists public.fantasy_staff_traits (
  season_id text not null,
  staff_id uuid not null references public.staff_members(id) on delete cascade,
  trait_code text not null,
  created_at timestamptz not null default now(),
  primary key (season_id, staff_id, trait_code),
  foreign key (season_id, trait_code)
    references public.fantasy_traits(season_id, code) on update cascade on delete cascade,
  foreign key (season_id, staff_id)
    references public.season_staff(season_id, staff_id) on update cascade on delete cascade
);

create index if not exists fantasy_player_traits_season_idx
  on public.fantasy_player_traits(season_id, player_id);
create index if not exists fantasy_staff_traits_season_idx
  on public.fantasy_staff_traits(season_id, staff_id);

-- Shared coach-activated traits.
insert into public.fantasy_traits
  (season_id, code, label, activation_type, multiplier, required_count, sort_order, enabled)
values
  ('2025-2026','A','Alcohólico','coach_match',1.5,1,10,true),
  ('2025-2026','L','Ludópata','coach_match',1.5,1,20,true),
  ('2025-2026','S','Sexólogo','coach_match',1.5,1,30,true),
  ('2025-2026','V','Vieja guardia','coach_match',1.5,1,40,true),
  ('2025-2026','J','Joven promesa','coach_match',1.5,1,50,true),
  ('2025-2026','C','Boost Covela','coach_match',2.0,1,60,true),
  ('2025-2026','P','Primos','lineup_count',1.5,2,70,true),
  ('2026-2027','A','Alcohólico','coach_match',1.5,1,10,true),
  ('2026-2027','L','Ludópata','coach_match',1.5,1,20,true),
  ('2026-2027','S','Sexólogo','coach_match',1.5,1,30,true),
  ('2026-2027','V','Vieja guardia','coach_match',1.5,1,40,true),
  ('2026-2027','J','Joven promesa','coach_match',1.5,1,50,true),
  ('2026-2027','C','Boost Covela','coach_match',2.0,1,60,true),
  ('2026-2027','JP','Julen Power','lineup_count',1.5,2,70,true)
on conflict (season_id, code) do update set
  label = excluded.label,
  activation_type = excluded.activation_type,
  multiplier = excluded.multiplier,
  required_count = excluded.required_count,
  sort_order = excluded.sort_order,
  enabled = excluded.enabled,
  updated_at = now();

-- Historical 2025-2026 player traits. These match the previous JS map exactly.
with assignments(jersey_number, trait_code) as (
  values
    ('00','J'),('00','S'),
    ('1','S'),('1','L'),
    ('25','S'),('25','L'),
    ('15','S'),('15','A'),
    ('3','A'),('3','V'),
    ('6','A'),('6','J'),
    ('8','S'),('8','A'),
    ('9','V'),('9','P'),
    ('21','V'),('21','P'),
    ('13','V'),('13','A'),
    ('17','C'),('17','A'),
    ('14','V'),('14','L'),
    ('11','A'),('11','V'),
    ('10','J'),('10','A')
)
insert into public.fantasy_player_traits (season_id, player_id, trait_code)
select '2025-2026', sp.player_id, a.trait_code
from assignments a
join public.season_players sp
  on sp.season_id='2025-2026' and sp.jersey_number=a.jersey_number
on conflict do nothing;

-- Current 2026-2027 traits. Departed players are absent; new players are left
-- unassigned except Julen Anda, who participates in the new shared Julen Power.
with assignments(jersey_number, trait_code) as (
  values
    ('00','J'),('00','S'),
    ('1','S'),('1','L'),
    ('25','S'),('25','L'),
    ('3','A'),('3','V'),
    ('8','S'),('8','A'),
    ('21','V'),('21','JP'),
    ('22','JP'),
    ('13','V'),('13','A'),
    ('17','C'),('17','A'),
    ('14','V'),('14','L'),
    ('11','A'),('11','V'),
    ('10','J'),('10','A')
)
insert into public.fantasy_player_traits (season_id, player_id, trait_code)
select '2026-2027', sp.player_id, a.trait_code
from assignments a
join public.season_players sp
  on sp.season_id='2026-2027' and sp.jersey_number=a.jersey_number
on conflict do nothing;

-- Historical and current staff traits. Araiko intentionally starts with none.
with assignments(season_id, staff_code, trait_code) as (
  values
    ('2025-2026','david','S'),('2025-2026','david','A'),
    ('2025-2026','gorka','V'),('2025-2026','gorka','C'),
    ('2025-2026','unai','J'),('2025-2026','unai','L'),
    ('2026-2027','david','S'),('2026-2027','david','A'),
    ('2026-2027','unai','J'),('2026-2027','unai','L')
)
insert into public.fantasy_staff_traits (season_id, staff_id, trait_code)
select a.season_id, sm.id, a.trait_code
from assignments a
join public.staff_members sm on sm.code=a.staff_code
join public.season_staff ss on ss.season_id=a.season_id and ss.staff_id=sm.id
on conflict do nothing;

alter table public.fantasy_traits enable row level security;
alter table public.fantasy_player_traits enable row level security;
alter table public.fantasy_staff_traits enable row level security;

drop policy if exists "fantasy_traits_read" on public.fantasy_traits;
create policy "fantasy_traits_read" on public.fantasy_traits for select using (true);
drop policy if exists "fantasy_player_traits_read" on public.fantasy_player_traits;
create policy "fantasy_player_traits_read" on public.fantasy_player_traits for select using (true);
drop policy if exists "fantasy_staff_traits_read" on public.fantasy_staff_traits;
create policy "fantasy_staff_traits_read" on public.fantasy_staff_traits for select using (true);

drop policy if exists "fantasy_traits_admin_all" on public.fantasy_traits;
create policy "fantasy_traits_admin_all" on public.fantasy_traits for all to authenticated
  using (public.is_gazal_admin()) with check (public.is_gazal_admin());
drop policy if exists "fantasy_player_traits_admin_all" on public.fantasy_player_traits;
create policy "fantasy_player_traits_admin_all" on public.fantasy_player_traits for all to authenticated
  using (public.is_gazal_admin()) with check (public.is_gazal_admin());
drop policy if exists "fantasy_staff_traits_admin_all" on public.fantasy_staff_traits;
create policy "fantasy_staff_traits_admin_all" on public.fantasy_staff_traits for all to authenticated
  using (public.is_gazal_admin()) with check (public.is_gazal_admin());

grant select on public.fantasy_traits, public.fantasy_player_traits, public.fantasy_staff_traits to anon, authenticated;

-- Atomic admin replacement used by the mobile Admin editor.
create or replace function public.replace_fantasy_trait_assignments(
  p_season_id text,
  p_player_assignments jsonb,
  p_staff_assignments jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_gazal_admin() then
    raise exception 'Admin permissions required';
  end if;

  if not exists (select 1 from public.seasons where id=p_season_id) then
    raise exception 'Unknown season %', p_season_id;
  end if;

  delete from public.fantasy_player_traits where season_id=p_season_id;
  delete from public.fantasy_staff_traits where season_id=p_season_id;

  insert into public.fantasy_player_traits (season_id, player_id, trait_code)
  select p_season_id, x.player_id, x.trait_code
  from jsonb_to_recordset(coalesce(p_player_assignments, '[]'::jsonb))
    as x(player_id bigint, trait_code text)
  join public.season_players sp
    on sp.season_id=p_season_id and sp.player_id=x.player_id
  join public.fantasy_traits ft
    on ft.season_id=p_season_id and ft.code=x.trait_code and ft.enabled=true
  on conflict do nothing;

  insert into public.fantasy_staff_traits (season_id, staff_id, trait_code)
  select p_season_id, x.staff_id, x.trait_code
  from jsonb_to_recordset(coalesce(p_staff_assignments, '[]'::jsonb))
    as x(staff_id uuid, trait_code text)
  join public.season_staff ss
    on ss.season_id=p_season_id and ss.staff_id=x.staff_id
  join public.fantasy_traits ft
    on ft.season_id=p_season_id and ft.code=x.trait_code and ft.enabled=true
  on conflict do nothing;
end;
$$;

revoke all on function public.replace_fantasy_trait_assignments(text,jsonb,jsonb) from public, anon;
grant execute on function public.replace_fantasy_trait_assignments(text,jsonb,jsonb) to authenticated;

comment on table public.fantasy_traits is
  'Season-specific Fantasy synergy definitions. coach_match is activated by a matching coach trait; lineup_count activates when enough lineup players share the trait.';
