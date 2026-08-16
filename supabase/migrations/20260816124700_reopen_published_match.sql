-- Reopen a published Live match without destroying the last official materialization.
-- The previous player/lineup stats and Fantasy score stay visible until a corrected
-- version is atomically re-published over them.

create or replace function public.reopen_published_match(p_match_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_match public.matches%rowtype;
  v_gameweek_id bigint;
begin
  if v_uid is null or not public.is_gazal_admin() then
    raise exception 'Admin permissions required';
  end if;

  select * into v_match
  from public.matches
  where id = p_match_id
  for update;
  if not found then raise exception 'Match not found'; end if;
  if v_match.status <> 'published' then
    raise exception 'Only a published match can be reopened';
  end if;
  if coalesce(v_match.publication_version, 0) < 1 then
    raise exception 'This match has no versioned Live publication to reopen';
  end if;

  update public.matches
  set status = 'live',
      publication_source_token = null,
      updated_at = now()
  where id = p_match_id;

  select gw.id into v_gameweek_id
  from public.gameweeks gw
  where gw.match_id = p_match_id
  order by gw.id desc
  limit 1;

  return jsonb_build_object(
    'match_id', p_match_id,
    'reopened_from_version', v_match.publication_version,
    'status', 'live',
    'gameweek_id', v_gameweek_id,
    'official_stats_preserved', true
  );
end;
$$;

revoke all on function public.reopen_published_match(text) from public, anon;
grant execute on function public.reopen_published_match(text) to authenticated;
