-- A discarded practice Live must never reappear in recovery or alter Fantasy.
-- Published matches and any match associated with a gameweek are protected.
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
    raise exception 'Only an administrator can discard a Live';
  end if;

  select * into v_match from public.matches where id = p_match_id for update;
  if not found then raise exception 'Live match not found'; end if;
  if v_match.status <> 'live' or v_match.published_at is not null then
    raise exception 'Only an unpublished Live can be discarded';
  end if;
  if exists(select 1 from public.gameweeks where match_id = p_match_id) then
    raise exception 'This match is linked to Fantasy. Remove the test gameweek with its dedicated cleanup first';
  end if;
  if exists(select 1 from public.match_publication_revisions where match_id = p_match_id) then
    raise exception 'A match with publication history cannot be discarded';
  end if;

  delete from public.matches where id = p_match_id;
  return jsonb_build_object('discarded', true, 'match_id', p_match_id);
end;
$$;

revoke all on function public.discard_unpublished_live_match(text) from public, anon;
grant execute on function public.discard_unpublished_live_match(text) to authenticated;
