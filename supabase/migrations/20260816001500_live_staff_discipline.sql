-- Staff discipline support for Live Stats.
-- Staff can be the actor of technical/disqualifying PF events without creating
-- player_match_stats rows. Historical 2025-2026 Gorka techniques are preserved
-- as an explicit season adjustment; 2026-2027+ comes from Live Stats events.

alter table public.game_events
  add column if not exists staff_id uuid references public.staff_members(id) on delete restrict;

alter table public.game_events
  drop constraint if exists game_events_subject_player_check;

alter table public.game_events
  drop constraint if exists game_events_subject_actor_check;

alter table public.game_events
  add constraint game_events_subject_actor_check
  check (
    (
      subject = 'gazalbide'
      and event_type = 'PF'
      and ((player_id is not null)::integer + (staff_id is not null)::integer = 1)
    )
    or
    (
      subject = 'gazalbide'
      and event_type <> 'PF'
      and player_id is not null
      and staff_id is null
    )
    or
    (
      subject in ('opponent','system')
      and player_id is null
      and staff_id is null
    )
  );

alter table public.game_events
  drop constraint if exists game_events_staff_foul_kind_check;

alter table public.game_events
  add constraint game_events_staff_foul_kind_check
  check (
    staff_id is null
    or (
      event_type = 'PF'
      and foul_kind in (
        'technical',
        'technical_cat_1',
        'technical_cat_2',
        'disqualifying'
      )
    )
  );

create or replace function public.validate_game_event_staff_season()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_season text;
begin
  if new.staff_id is null then
    return new;
  end if;

  select m.season
    into v_season
  from public.matches m
  where m.id = new.match_id;

  if v_season is null then
    raise exception 'Match % has no season', new.match_id;
  end if;

  if not exists (
    select 1
    from public.season_staff ss
    where ss.season_id = v_season
      and ss.staff_id = new.staff_id
      and ss.active = true
  ) then
    raise exception 'Staff member is not active in match season %', v_season;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_game_event_staff_season
  on public.game_events;
create trigger trg_validate_game_event_staff_season
before insert or update of match_id, staff_id
on public.game_events
for each row
execute function public.validate_game_event_staff_season();

create table if not exists public.staff_discipline_adjustments (
  season_id text not null,
  staff_id uuid not null references public.staff_members(id) on delete restrict,
  technical integer not null default 0 check (technical >= 0),
  disqualifying integer not null default 0 check (disqualifying >= 0),
  source text not null default 'manual_history',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (season_id, staff_id),
  foreign key (season_id, staff_id)
    references public.season_staff(season_id, staff_id)
    on delete cascade
);

alter table public.staff_discipline_adjustments enable row level security;
revoke all on public.staff_discipline_adjustments from anon, authenticated;
grant select on public.staff_discipline_adjustments to anon, authenticated;
grant insert, update, delete on public.staff_discipline_adjustments to authenticated;

drop policy if exists "staff_discipline_adjustments_public_read"
  on public.staff_discipline_adjustments;
create policy "staff_discipline_adjustments_public_read"
  on public.staff_discipline_adjustments
  for select
  to anon, authenticated
  using (true);

drop policy if exists "staff_discipline_adjustments_admin_write"
  on public.staff_discipline_adjustments;
create policy "staff_discipline_adjustments_admin_write"
  on public.staff_discipline_adjustments
  for all
  to authenticated
  using ((select public.is_gazal_admin()))
  with check ((select public.is_gazal_admin()));

insert into public.staff_discipline_adjustments (
  season_id,
  staff_id,
  technical,
  disqualifying,
  source,
  note
)
select
  '2025-2026',
  sm.id,
  4,
  0,
  'manual_history',
  'Histórico confirmado previo a Live Stats'
from public.staff_members sm
where sm.code = 'gorka'
on conflict (season_id, staff_id)
do update set
  technical = excluded.technical,
  disqualifying = excluded.disqualifying,
  source = excluded.source,
  note = excluded.note,
  updated_at = now();

drop view if exists public.staff_discipline_rankings;
create view public.staff_discipline_rankings
with (security_invoker = true)
as
with live as (
  select
    m.season as season_id,
    ge.staff_id,
    count(distinct ge.match_id)::integer as games,
    count(*) filter (where ge.foul_kind = 'technical')::integer as technical_legacy,
    count(*) filter (where ge.foul_kind = 'technical_cat_1')::integer as technical_cat_1,
    count(*) filter (where ge.foul_kind = 'technical_cat_2')::integer as technical_cat_2,
    count(*) filter (where ge.foul_kind = 'disqualifying')::integer as disqualifying
  from public.game_events ge
  join public.matches m on m.id = ge.match_id
  where ge.staff_id is not null
    and ge.event_type = 'PF'
    and ge.is_void = false
    and m.status in ('live','published')
  group by m.season, ge.staff_id
),
adjustments as (
  select
    season_id,
    staff_id,
    technical,
    disqualifying
  from public.staff_discipline_adjustments
),
base as (
  select
    ss.season_id,
    ss.staff_id,
    sm.code,
    sm.name,
    ss.role
  from public.season_staff ss
  join public.staff_members sm on sm.id = ss.staff_id
)
select
  b.season_id,
  b.staff_id,
  b.code,
  b.name,
  b.role,
  coalesce(l.games, 0)::integer as games,
  coalesce(l.technical_legacy, 0)::integer as technical_legacy,
  coalesce(l.technical_cat_1, 0)::integer as technical_cat_1,
  coalesce(l.technical_cat_2, 0)::integer as technical_cat_2,
  (
    coalesce(l.technical_legacy, 0)
    + coalesce(l.technical_cat_1, 0)
    + coalesce(l.technical_cat_2, 0)
    + coalesce(a.technical, 0)
  )::integer as technical_total,
  coalesce(l.disqualifying, 0)::integer as live_disqualifying,
  coalesce(a.disqualifying, 0)::integer as historical_disqualifying,
  (
    coalesce(l.disqualifying, 0)
    + coalesce(a.disqualifying, 0)
  )::integer as disqualifying,
  (
    coalesce(l.technical_legacy, 0)
    + coalesce(l.technical_cat_1, 0)
    + coalesce(l.technical_cat_2, 0)
    + coalesce(a.technical, 0)
    + coalesce(l.disqualifying, 0)
    + coalesce(a.disqualifying, 0)
  )::integer as disciplinary_total
from base b
left join live l
  on l.season_id = b.season_id
 and l.staff_id = b.staff_id
left join adjustments a
  on a.season_id = b.season_id
 and a.staff_id = b.staff_id;

grant select on public.staff_discipline_rankings to anon, authenticated;

comment on column public.game_events.staff_id is
  'Optional Gazalbide staff actor. Only PF technical/disqualifying events may use staff_id; player_id remains NULL so no player stats are generated.';
comment on table public.staff_discipline_adjustments is
  'Explicit manual discipline history from seasons before staff fouls were captured by Live Stats.';
