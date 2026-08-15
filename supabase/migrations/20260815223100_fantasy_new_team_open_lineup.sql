-- A Fantasy team created while a gameweek is already open must still have an
-- explicit lineup row. Leaving that row empty represents a skipped gameweek as
-- 0 points / 0 savings instead of making the team disappear from the jornada.

create or replace function public.create_open_gameweek_lineup_for_new_team()
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
    and gw.status = 'scheduled'
    and gw.deadline > now()
    and not exists (
      select 1
      from public.fantasy_lineups fl
      where fl.fantasy_team_id = new.id
        and fl.gameweek_id = gw.id
    );

  return new;
end;
$$;

revoke all on function public.create_open_gameweek_lineup_for_new_team()
  from public, anon, authenticated;

drop trigger if exists zz_fantasy_open_lineup_for_new_team
  on public.fantasy_teams;
create trigger zz_fantasy_open_lineup_for_new_team
after insert on public.fantasy_teams
for each row
execute function public.create_open_gameweek_lineup_for_new_team();
