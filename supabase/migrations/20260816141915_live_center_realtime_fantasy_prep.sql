drop policy if exists stats_matches_public_read on public.matches;
create policy stats_matches_public_read
  on public.matches
  for select
  to public
  using (status in ('live','published') or public.is_gazal_admin());

alter publication supabase_realtime add table public.matches;
alter publication supabase_realtime add table public.live_game_state;
alter publication supabase_realtime add table public.game_events;
alter publication supabase_realtime add table public.game_roster;
alter publication supabase_realtime add table public.player_match_stats;
alter publication supabase_realtime add table public.match_lineup_stats;

create or replace function public.prepare_live_fantasy_gameweek(p_match_id text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_match public.matches%rowtype;
  v_gameweek public.gameweeks%rowtype;
  v_candidate_count integer := 0;
  v_team_count integer := 0;
  v_finalized_count integer := 0;
  v_economy jsonb := null;
begin
  if auth.uid() is null or not public.is_gazal_admin() then
    raise exception 'Admin permissions required';
  end if;

  select * into v_match
  from public.matches
  where id = p_match_id;

  if not found then
    raise exception 'Match not found';
  end if;

  select count(*)::integer, min(gw.id)
    into v_candidate_count, v_gameweek.id
  from public.gameweeks gw
  where gw.season_id = v_match.season
    and (
      gw.match_id = p_match_id
      or (
        gw.match_id is null
        and gw.date = v_match.date
        and lower(trim(coalesce(gw.opponent,''))) = lower(trim(coalesce(v_match.opponent,'')))
      )
    );

  if v_candidate_count = 0 then
    return jsonb_build_object('linked', false, 'reason', 'no_gameweek');
  end if;

  if v_candidate_count <> 1 then
    return jsonb_build_object('linked', false, 'reason', 'ambiguous_gameweek', 'candidates', v_candidate_count);
  end if;

  select * into v_gameweek from public.gameweeks where id = v_gameweek.id for update;

  if v_gameweek.match_id is null then
    update public.gameweeks
      set match_id = p_match_id
    where id = v_gameweek.id;
  elsif v_gameweek.match_id <> p_match_id then
    return jsonb_build_object('linked', false, 'reason', 'gameweek_linked_elsewhere', 'gameweek_id', v_gameweek.id);
  end if;

  if v_gameweek.deadline > now() then
    return jsonb_build_object(
      'linked', true,
      'gameweek_id', v_gameweek.id,
      'finalized', false,
      'reason', 'deadline_not_passed',
      'deadline', v_gameweek.deadline
    );
  end if;

  select count(*)::integer into v_team_count
  from public.fantasy_teams ft
  where ft.season_id = v_gameweek.season_id;

  select count(*)::integer into v_finalized_count
  from public.fantasy_gameweek_economy e
  where e.gameweek_id = v_gameweek.id
    and e.finalized_at is not null;

  if v_team_count > 0 and v_finalized_count < v_team_count then
    v_economy := public.finalize_fantasy_gameweek_economy(v_gameweek.id);
  end if;

  return jsonb_build_object(
    'linked', true,
    'gameweek_id', v_gameweek.id,
    'finalized', true,
    'team_count', v_team_count,
    'already_finalized', v_finalized_count >= v_team_count,
    'economy', v_economy
  );
end;
$$;

revoke all on function public.prepare_live_fantasy_gameweek(text) from public, anon;
grant execute on function public.prepare_live_fantasy_gameweek(text) to authenticated;
