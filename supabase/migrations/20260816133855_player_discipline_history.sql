create table if not exists public.player_discipline_adjustments (
  season_id text not null references public.seasons(id) on update cascade on delete restrict,
  player_id bigint not null references public.players(id) on delete restrict,
  source text not null default 'manual_history',
  technical integer not null default 0 check (technical >= 0),
  unsportsmanlike integer not null default 0 check (unsportsmanlike >= 0),
  disqualifying integer not null default 0 check (disqualifying >= 0),
  disruptive integer not null default 0 check (disruptive >= 0),
  flagrant integer not null default 0 check (flagrant >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (season_id, player_id, source)
);

alter table public.player_discipline_adjustments enable row level security;
revoke all on public.player_discipline_adjustments from anon, authenticated;
grant select on public.player_discipline_adjustments to anon, authenticated;
grant insert, update, delete on public.player_discipline_adjustments to authenticated;

drop policy if exists "player_discipline_adjustments_public_read" on public.player_discipline_adjustments;
create policy "player_discipline_adjustments_public_read"
  on public.player_discipline_adjustments
  for select
  using (true);

drop policy if exists "player_discipline_adjustments_admin_write" on public.player_discipline_adjustments;
create policy "player_discipline_adjustments_admin_write"
  on public.player_discipline_adjustments
  for all to authenticated
  using ((select public.is_gazal_admin()))
  with check ((select public.is_gazal_admin()));

with historical(jersey_number, technical) as (
  values
    ('1', 1),
    ('3', 4),
    ('9', 3),
    ('11', 1),
    ('13', 2),
    ('14', 1),
    ('21', 2),
    ('25', 7)
)
insert into public.player_discipline_adjustments (
  season_id, player_id, source, technical, note
)
select
  '2025-2026',
  sp.player_id,
  'legacy_techs_json',
  h.technical,
  'Imported from public/data/techs.json; season total only, no match attribution.'
from historical h
join public.season_players sp
  on sp.season_id = '2025-2026'
 and sp.jersey_number = h.jersey_number
on conflict (season_id, player_id, source)
do update set
  technical = excluded.technical,
  note = excluded.note,
  updated_at = now();

create index if not exists player_discipline_adjustments_player_idx
  on public.player_discipline_adjustments(player_id, season_id);
