-- Ranking needs to know whether every lineup is eligible to score, but normal
-- users must not receive opponents' budget/carry/lineup-cost details. Expose only
-- the boolean eligibility tuple through a narrow authenticated RPC.

create or replace function public.get_fantasy_scoring_eligibility(
  p_season_id text
)
returns table (
  fantasy_team_id uuid,
  gameweek_id bigint,
  valid_lineup boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.fantasy_team_id,
    e.gameweek_id,
    e.valid_lineup
  from public.fantasy_gameweek_economy e
  join public.fantasy_teams ft on ft.id = e.fantasy_team_id
  join public.gameweeks gw on gw.id = e.gameweek_id
  where (select auth.uid()) is not null
    and ft.season_id = p_season_id
    and gw.season_id = p_season_id;
$$;

revoke all on function public.get_fantasy_scoring_eligibility(text)
  from public, anon;

grant execute on function public.get_fantasy_scoring_eligibility(text)
  to authenticated;
