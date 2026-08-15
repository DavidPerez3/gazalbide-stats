-- Gazalbide Stats: carry the previous Fantasy lineup into a newly-created gameweek.
-- This is only a draft starting point. Budget validity is checked by the client/market
-- for the new gameweek; a copied lineup is not automatically guaranteed to be valid.

alter table public.fantasy_lineups
  add column if not exists copied_from_lineup_id uuid
  references public.fantasy_lineups(id) on delete set null;

create index if not exists fantasy_lineups_copied_from_idx
  on public.fantasy_lineups(copied_from_lineup_id)
  where copied_from_lineup_id is not null;

-- When a user creates a Fantasy team after the season has started, only create
-- editable lineups for currently-open/future scheduled gameweeks in that season.
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
    coach_code,
    copied_from_lineup_id
  )
  select
    new.id,
    gw.id,
    array['-1','-1','-1','-1','-1']::text[],
    null,
    null,
    null
  from public.gameweeks gw
  where gw.season_id = new.season_id
    and gw.status = 'scheduled'
    and gw.deadline > now()
  on conflict (fantasy_team_id, gameweek_id) do nothing;
  return new;
end;
$$;

-- Creating a new gameweek opens a fresh market. Every team in that season gets a
-- new lineup row. If it has a previous lineup, copy it as an editable draft even
-- when later price changes may make it exceed the new budget.
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
    coach_code,
    copied_from_lineup_id
  )
  select
    ft.id,
    new.id,
    coalesce(prev.players, array['-1','-1','-1','-1','-1']::text[]),
    prev.captain_number,
    prev.coach_code,
    prev.id
  from public.fantasy_teams ft
  left join lateral (
    select fl.id, fl.players, fl.captain_number, fl.coach_code
    from public.fantasy_lineups fl
    join public.gameweeks prev_gw on prev_gw.id = fl.gameweek_id
    where fl.fantasy_team_id = ft.id
      and prev_gw.season_id = new.season_id
      and (
        prev_gw.date < new.date
        or (prev_gw.date = new.date and prev_gw.id < new.id)
      )
    order by prev_gw.date desc, prev_gw.id desc
    limit 1
  ) prev on true
  where ft.season_id = new.season_id
  on conflict (fantasy_team_id, gameweek_id) do nothing;
  return new;
end;
$$;

comment on column public.fantasy_lineups.copied_from_lineup_id is
  'Previous-gameweek lineup copied as an editable starting point. Null means the lineup started empty or was created independently.';
