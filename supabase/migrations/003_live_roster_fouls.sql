-- Gazalbide Stats: roster limits and foul classification.
-- Safe to apply after 001_stats_core.sql and 002_live_stats_core.sql.

alter table public.matches
  add column if not exists rule_profile text not null default 'FIBA_2026'
  check (rule_profile in ('FIBA_2024', 'FIBA_2026'));

alter table public.game_events
  add column if not exists foul_kind text;

alter table public.game_events
  drop constraint if exists game_events_foul_kind_check;

alter table public.game_events
  add constraint game_events_foul_kind_check check (
    foul_kind is null
    or foul_kind in (
      'defensive',
      'offensive',
      'technical',
      'unsportsmanlike',
      'disqualifying',
      'technical_cat_1',
      'technical_cat_2',
      'disruptive',
      'flagrant'
    )
  );

alter table public.game_events
  drop constraint if exists game_events_pf_requires_foul_kind;

alter table public.game_events
  add constraint game_events_pf_requires_foul_kind check (
    (event_type = 'PF' and foul_kind is not null)
    or (event_type <> 'PF' and foul_kind is null)
  );

-- FIBA team list: at most 12 players, at most 5 starters.
create or replace function public.enforce_live_roster_limits()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  roster_count integer;
  starter_count integer;
begin
  select count(*)
    into roster_count
  from public.game_roster gr
  where gr.match_id = new.match_id
    and gr.player_id <> new.player_id;

  if roster_count + 1 > 12 then
    raise exception 'A match roster cannot contain more than 12 players';
  end if;

  if new.is_starter then
    select count(*)
      into starter_count
    from public.game_roster gr
    where gr.match_id = new.match_id
      and gr.is_starter = true
      and gr.player_id <> new.player_id;

    if starter_count + 1 > 5 then
      raise exception 'A match cannot contain more than 5 starters';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists game_roster_limits_trigger on public.game_roster;
create trigger game_roster_limits_trigger
before insert or update of match_id, player_id, is_starter
on public.game_roster
for each row execute function public.enforce_live_roster_limits();

comment on column public.matches.rule_profile is
  'Ruleset used to derive foul-out/disqualification behaviour for this match.';

comment on column public.game_events.foul_kind is
  'Required for PF events. Legacy FIBA 2024 and FIBA 2026 foul classifications are both supported.';
