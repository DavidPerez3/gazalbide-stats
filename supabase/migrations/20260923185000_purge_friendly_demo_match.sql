-- Admin cleanup for an isolated friendly, including a published demo.
-- Keep its ID/status so delayed Live clients cannot recreate the match.
create or replace function public.discard_unpublished_live_match(p_match_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.matches%rowtype;
begin
  if auth.uid() is null or not public.is_gazal_admin() then
    raise exception 'Only an administrator can discard a match';
  end if;
  select * into v_match from public.matches where id = p_match_id for update;
  if not found then raise exception 'Match not found'; end if;
  if v_match.status <> 'live' and not (v_match.is_friendly and v_match.status = 'published') then
    raise exception 'Only an active Live or a published friendly can be discarded';
  end if;
  if exists(select 1 from public.gameweeks where match_id = p_match_id) then
    raise exception 'A Fantasy-linked match cannot be discarded';
  end if;
  if exists(select 1 from public.fantasy_price_proposals where source_match_id = p_match_id and status = 'applied') then
    raise exception 'This match has applied Fantasy prices';
  end if;
  if not v_match.is_friendly and (v_match.published_at is not null or exists(
    select 1 from public.match_publication_revisions where match_id = p_match_id
  )) then
    raise exception 'An official publication cannot be discarded';
  end if;

  update public.matches
  set status = 'finished', gazal_pts = 0, opp_pts = 0,
      q_pf = '{}', q_pa = '{}', result = null,
      published_at = null, published_by = null,
      publication_version = 0, publication_source_token = null,
      updated_at = now()
  where id = p_match_id;
  delete from public.match_publication_revisions where match_id = p_match_id;
  delete from public.match_lineup_stats where match_id = p_match_id;
  delete from public.player_match_stats where match_id = p_match_id;
  delete from public.fantasy_price_proposals where source_match_id = p_match_id;
  delete from public.game_events where match_id = p_match_id;
  delete from public.live_game_state where match_id = p_match_id;
  delete from public.game_roster where match_id = p_match_id;
  delete from public.live_match_control where match_id = p_match_id;
  return jsonb_build_object('discarded', true, 'match_id', p_match_id);
end;
$$;

revoke all on function public.discard_unpublished_live_match(text) from public, anon;
grant execute on function public.discard_unpublished_live_match(text) to authenticated;
