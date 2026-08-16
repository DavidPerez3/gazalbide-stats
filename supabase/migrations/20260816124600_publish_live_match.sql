-- Atomic publication of a reviewed Live Stats match.

create or replace function public.publish_live_match(
  p_match_id text,
  p_expected_source_token text,
  p_publication jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_match public.matches%rowtype;
  v_state public.live_game_state%rowtype;
  v_current_token text;
  v_score_g integer;
  v_score_o integer;
  v_event_score_g integer;
  v_event_score_o integer;
  v_period integer;
  v_version integer;
  v_player jsonb;
  v_stats jsonb;
  v_lineup jsonb;
  v_player_id bigint;
  v_played_ms integer;
  v_remote_played_ms integer;
  v_min_seconds integer;
  v_eff integer;
  v_pir integer;
  v_player_count integer := 0;
  v_roster_count integer;
  v_gameweek_id bigint;
  v_gameweek_count integer;
  v_economy jsonb := null;
  v_price_count integer := 0;
  v_price_warning text := null;
  v_q_pf integer[] := '{}';
  v_q_pa integer[] := '{}';
  v_period_g integer;
  v_period_o integer;
  v_calc jsonb;
  v_total_plus_minus integer := 0;
begin
  if v_uid is null or not public.is_gazal_admin() then
    raise exception 'Admin permissions required';
  end if;
  if p_publication is null or jsonb_typeof(p_publication) <> 'object' then
    raise exception 'Publication payload is required';
  end if;

  select * into v_match
  from public.matches
  where id = p_match_id
  for update;
  if not found then raise exception 'Match not found'; end if;
  if v_match.status <> 'live' then
    raise exception 'Only a live match can be published (current status: %)', v_match.status;
  end if;

  select * into v_state
  from public.live_game_state
  where match_id = p_match_id;
  if not found then raise exception 'Live state not found'; end if;
  if v_state.clock_running or v_state.clock_ms <> 0 or v_state.period < 4 then
    raise exception 'The final period must be stopped at 0:00 before publishing';
  end if;
  if not exists (
    select 1 from public.game_events ge
    where ge.match_id = p_match_id
      and ge.is_void = false
      and ge.event_type = 'PERIOD_END'
      and ge.period = v_state.period
  ) then
    raise exception 'The final period has not been closed';
  end if;

  v_current_token := public.live_match_source_token(p_match_id);
  if p_expected_source_token is null or p_expected_source_token <> v_current_token then
    raise exception 'Live source changed after review. Refresh the review before publishing';
  end if;

  if coalesce(p_publication->>'matchId', '') <> p_match_id then
    raise exception 'Publication matchId does not match';
  end if;
  if coalesce(p_publication->>'season', '') <> v_match.season
     or coalesce(p_publication->>'date', '') <> v_match.date::text
     or coalesce(p_publication->>'opponent', '') <> v_match.opponent then
    raise exception 'Publication metadata no longer matches the remote match';
  end if;

  v_score_g := coalesce((p_publication#>>'{score,gazalbide}')::integer, 0);
  v_score_o := coalesce((p_publication#>>'{score,opponent}')::integer, 0);

  select
    coalesce(sum(case ge.event_type
      when 'FT_MADE' then 1 when 'TWO_MADE' then 2 when 'THREE_MADE' then 3 else 0 end), 0)::integer,
    coalesce(sum(case ge.event_type
      when 'OPP_SCORE_1' then 1 when 'OPP_SCORE_2' then 2 when 'OPP_SCORE_3' then 3 else 0 end), 0)::integer
  into v_event_score_g, v_event_score_o
  from public.game_events ge
  where ge.match_id = p_match_id and ge.is_void = false;

  if v_score_g <> v_event_score_g or v_score_o <> v_event_score_o then
    raise exception 'Publication score does not match remote Live events';
  end if;
  if v_score_g = v_score_o then
    raise exception 'A published match cannot finish tied';
  end if;

  select count(*)::integer into v_roster_count
  from public.game_roster
  where match_id = p_match_id and is_active = true;

  if jsonb_typeof(p_publication->'playerRows') <> 'array' then
    raise exception 'Publication playerRows must be an array';
  end if;
  if jsonb_array_length(p_publication->'playerRows') <> v_roster_count then
    raise exception 'Publication player count does not match Live roster';
  end if;

  -- All materialization below stays in this transaction. Any mismatch rolls the
  -- whole publication back, including match status and Fantasy handoff.
  delete from public.player_match_stats where match_id = p_match_id;

  for v_player in select value from jsonb_array_elements(p_publication->'playerRows')
  loop
    v_player_id := (v_player->>'playerId')::bigint;
    select gr.played_ms into v_remote_played_ms
    from public.game_roster gr
    where gr.match_id = p_match_id
      and gr.player_id = v_player_id
      and gr.is_active = true;
    if not found then
      raise exception 'Player % is not in the Live roster', v_player_id;
    end if;

    v_stats := coalesce(v_player->'stats', '{}'::jsonb);
    v_played_ms := greatest(0, coalesce((v_player->>'playedMs')::integer, 0));
    if abs(v_played_ms - coalesce(v_remote_played_ms, 0)) > 1000 then
      raise exception 'Player % minutes differ from the synced Live roster', v_player_id;
    end if;

    select jsonb_build_object(
      'pts', coalesce(sum(case ge.event_type when 'FT_MADE' then 1 when 'TWO_MADE' then 2 when 'THREE_MADE' then 3 else 0 end),0)::integer,
      'ftm', count(*) filter (where ge.event_type='FT_MADE')::integer,
      'fta', count(*) filter (where ge.event_type in ('FT_MADE','FT_MISSED'))::integer,
      'two_pm', count(*) filter (where ge.event_type='TWO_MADE')::integer,
      'two_pa', count(*) filter (where ge.event_type in ('TWO_MADE','TWO_MISSED'))::integer,
      'three_pm', count(*) filter (where ge.event_type='THREE_MADE')::integer,
      'three_pa', count(*) filter (where ge.event_type in ('THREE_MADE','THREE_MISSED'))::integer,
      'oreb', count(*) filter (where ge.event_type='OREB')::integer,
      'dreb', count(*) filter (where ge.event_type='DREB')::integer,
      'ast', count(*) filter (where ge.event_type='AST')::integer,
      'tov', count(*) filter (where ge.event_type='TOV')::integer,
      'stl', count(*) filter (where ge.event_type='STL')::integer,
      'blk', count(*) filter (where ge.event_type='BLK')::integer,
      'pf', count(*) filter (where ge.event_type='PF')::integer,
      'pfd', count(*) filter (where ge.event_type='PFD')::integer,
      'pf_defensive', count(*) filter (where ge.event_type='PF' and ge.foul_kind='defensive')::integer,
      'pf_offensive', count(*) filter (where ge.event_type='PF' and ge.foul_kind='offensive')::integer,
      'pf_technical', count(*) filter (where ge.event_type='PF' and ge.foul_kind='technical')::integer,
      'pf_unsportsmanlike', count(*) filter (where ge.event_type='PF' and ge.foul_kind='unsportsmanlike')::integer,
      'pf_disqualifying', count(*) filter (where ge.event_type='PF' and ge.foul_kind='disqualifying')::integer,
      'pf_technical_cat_1', count(*) filter (where ge.event_type='PF' and ge.foul_kind='technical_cat_1')::integer,
      'pf_technical_cat_2', count(*) filter (where ge.event_type='PF' and ge.foul_kind='technical_cat_2')::integer,
      'pf_disruptive', count(*) filter (where ge.event_type='PF' and ge.foul_kind='disruptive')::integer,
      'pf_flagrant', count(*) filter (where ge.event_type='PF' and ge.foul_kind='flagrant')::integer
    ) into v_calc
    from public.game_events ge
    where ge.match_id = p_match_id
      and ge.is_void = false
      and ge.player_id = v_player_id;

    if coalesce((v_stats->>'pts')::integer,0) <> (v_calc->>'pts')::integer
      or coalesce((v_stats->>'ftm')::integer,0) <> (v_calc->>'ftm')::integer
      or coalesce((v_stats->>'fta')::integer,0) <> (v_calc->>'fta')::integer
      or coalesce((v_stats->>'two_pm')::integer,0) <> (v_calc->>'two_pm')::integer
      or coalesce((v_stats->>'two_pa')::integer,0) <> (v_calc->>'two_pa')::integer
      or coalesce((v_stats->>'three_pm')::integer,0) <> (v_calc->>'three_pm')::integer
      or coalesce((v_stats->>'three_pa')::integer,0) <> (v_calc->>'three_pa')::integer
      or coalesce((v_stats->>'oreb')::integer,0) <> (v_calc->>'oreb')::integer
      or coalesce((v_stats->>'dreb')::integer,0) <> (v_calc->>'dreb')::integer
      or coalesce((v_stats->>'ast')::integer,0) <> (v_calc->>'ast')::integer
      or coalesce((v_stats->>'tov')::integer,0) <> (v_calc->>'tov')::integer
      or coalesce((v_stats->>'stl')::integer,0) <> (v_calc->>'stl')::integer
      or coalesce((v_stats->>'blk')::integer,0) <> (v_calc->>'blk')::integer
      or coalesce((v_stats->>'pf')::integer,0) <> (v_calc->>'pf')::integer
      or coalesce((v_stats->>'pfd')::integer,0) <> (v_calc->>'pfd')::integer then
      raise exception 'Player % box score differs from remote Live events', v_player_id;
    end if;

    v_min_seconds := round(v_played_ms / 1000.0)::integer;
    v_eff :=
      coalesce((v_stats->>'pts')::integer,0)
      + coalesce((v_stats->>'reb')::integer,0)
      + coalesce((v_stats->>'ast')::integer,0)
      + coalesce((v_stats->>'stl')::integer,0)
      + coalesce((v_stats->>'blk')::integer,0)
      - (coalesce((v_stats->>'fga')::integer,0) - coalesce((v_stats->>'fgm')::integer,0))
      - (coalesce((v_stats->>'fta')::integer,0) - coalesce((v_stats->>'ftm')::integer,0))
      - coalesce((v_stats->>'tov')::integer,0);
    v_pir := v_eff + coalesce((v_stats->>'pfd')::integer,0) - coalesce((v_stats->>'pf')::integer,0);
    v_total_plus_minus := v_total_plus_minus + coalesce((v_stats->>'plus_minus')::integer,0);

    insert into public.player_match_stats (
      match_id,player_id,sort_order,min_seconds,min_str,
      pts,two_pm,two_pa,three_pm,three_pa,fgm,fga,ftm,fta,
      oreb,dreb,reb,ast,tov,stl,blk,pf,pfd,pir,eff,plus_minus,
      pf_defensive,pf_offensive,pf_technical,pf_unsportsmanlike,pf_disqualifying,
      pf_technical_cat_1,pf_technical_cat_2,pf_disruptive,pf_flagrant,updated_at
    )
    select
      p_match_id,v_player_id,gr.sort_order,v_min_seconds,
      lpad((v_min_seconds/60)::text,2,'0')||':'||lpad((v_min_seconds%60)::text,2,'0'),
      (v_calc->>'pts')::integer,(v_calc->>'two_pm')::integer,(v_calc->>'two_pa')::integer,
      (v_calc->>'three_pm')::integer,(v_calc->>'three_pa')::integer,
      ((v_calc->>'two_pm')::integer+(v_calc->>'three_pm')::integer),
      ((v_calc->>'two_pa')::integer+(v_calc->>'three_pa')::integer),
      (v_calc->>'ftm')::integer,(v_calc->>'fta')::integer,
      (v_calc->>'oreb')::integer,(v_calc->>'dreb')::integer,
      ((v_calc->>'oreb')::integer+(v_calc->>'dreb')::integer),
      (v_calc->>'ast')::integer,(v_calc->>'tov')::integer,(v_calc->>'stl')::integer,
      (v_calc->>'blk')::integer,(v_calc->>'pf')::integer,(v_calc->>'pfd')::integer,
      v_pir,v_eff,coalesce((v_stats->>'plus_minus')::integer,0),
      (v_calc->>'pf_defensive')::integer,(v_calc->>'pf_offensive')::integer,
      (v_calc->>'pf_technical')::integer,(v_calc->>'pf_unsportsmanlike')::integer,
      (v_calc->>'pf_disqualifying')::integer,(v_calc->>'pf_technical_cat_1')::integer,
      (v_calc->>'pf_technical_cat_2')::integer,(v_calc->>'pf_disruptive')::integer,
      (v_calc->>'pf_flagrant')::integer,now()
    from public.game_roster gr
    where gr.match_id=p_match_id and gr.player_id=v_player_id;

    v_player_count := v_player_count + 1;
  end loop;

  if v_player_count <> v_roster_count then
    raise exception 'Not all roster players were materialized';
  end if;
  if v_total_plus_minus <> (v_score_g-v_score_o)*5 then
    raise exception 'Player plus-minus total does not match final score differential';
  end if;

  delete from public.match_lineup_stats where match_id=p_match_id;
  if jsonb_typeof(p_publication->'lineupRows')='array' then
    for v_lineup in select value from jsonb_array_elements(p_publication->'lineupRows')
    loop
      insert into public.match_lineup_stats(
        match_id,lineup_key,player_ids,stint_count,duration_ms,gazal_pts,opp_pts,plus_minus,updated_at
      ) values (
        p_match_id,
        v_lineup->>'lineupKey',
        array(select (jsonb_array_elements_text(v_lineup->'lineupIds'))::bigint),
        coalesce((v_lineup->>'stints')::integer,0),
        coalesce((v_lineup->>'durationMs')::integer,0),
        coalesce((v_lineup->>'gazalbidePts')::integer,0),
        coalesce((v_lineup->>'opponentPts')::integer,0),
        coalesce((v_lineup->>'plusMinus')::integer,0),
        now()
      );
    end loop;
  end if;

  for v_period in 1..v_state.period loop
    select
      coalesce(sum(case ge.event_type when 'FT_MADE' then 1 when 'TWO_MADE' then 2 when 'THREE_MADE' then 3 else 0 end),0)::integer,
      coalesce(sum(case ge.event_type when 'OPP_SCORE_1' then 1 when 'OPP_SCORE_2' then 2 when 'OPP_SCORE_3' then 3 else 0 end),0)::integer
    into v_period_g,v_period_o
    from public.game_events ge
    where ge.match_id=p_match_id and ge.is_void=false and ge.period=v_period;
    v_q_pf := array_append(v_q_pf,v_period_g);
    v_q_pa := array_append(v_q_pa,v_period_o);
  end loop;

  v_version := coalesce(v_match.publication_version,0)+1;
  update public.matches
  set gazal_pts=v_score_g,
      opp_pts=v_score_o,
      q_pf=v_q_pf,
      q_pa=v_q_pa,
      result=case when v_score_g>v_score_o then 'W' else 'L' end,
      status='published',
      publication_version=v_version,
      publication_source_token=v_current_token,
      published_at=now(),
      published_by=v_uid,
      updated_at=now()
  where id=p_match_id;

  insert into public.match_publication_revisions(
    match_id,version,source_token,client_source_fingerprint,snapshot,published_by,published_at
  ) values (
    p_match_id,v_version,v_current_token,p_publication->>'sourceFingerprint',p_publication,v_uid,now()
  );

  -- Link Fantasy only when the gameweek is unambiguous. No gameweek is ever
  -- created here and season readiness/market activation is never changed.
  select count(*)::integer,min(gw.id)
  into v_gameweek_count,v_gameweek_id
  from public.gameweeks gw
  where gw.season_id=v_match.season
    and (
      gw.match_id=p_match_id
      or (
        gw.match_id is null
        and gw.date=v_match.date
        and lower(trim(coalesce(gw.opponent,'')))=lower(trim(v_match.opponent))
      )
    );

  if v_gameweek_count=1 and v_gameweek_id is not null then
    update public.gameweeks set match_id=p_match_id,status='played' where id=v_gameweek_id;

    if exists(select 1 from public.gameweeks where id=v_gameweek_id and deadline<=now()) then
      begin
        v_economy := public.finalize_fantasy_gameweek_economy(v_gameweek_id);
        update public.gameweeks set status='scored' where id=v_gameweek_id;
      exception when others then
        v_economy := jsonb_build_object('warning',sqlerrm);
      end;
    end if;
  else
    v_gameweek_id := null;
  end if;

  -- A corrected re-publication must never move prices twice for the same game.
  if exists (
    select 1 from public.fantasy_price_proposals fpp
    where fpp.season_id=v_match.season
      and fpp.source_match_id=p_match_id
      and fpp.status='applied'
  ) then
    v_price_count := 0;
    v_price_warning := 'Prices from an earlier publication of this match were already applied; no second automatic move was generated.';
  else
    delete from public.fantasy_price_proposals
    where season_id=v_match.season and source_match_id=p_match_id;
    begin
      select count(*) into v_price_count
      from public.generate_fantasy_price_proposals(v_match.season,p_match_id);
    exception when others then
      v_price_count := -1;
      v_price_warning := sqlerrm;
    end;
  end if;

  return jsonb_build_object(
    'match_id',p_match_id,
    'publication_version',v_version,
    'status','published',
    'players',v_player_count,
    'gameweek_id',v_gameweek_id,
    'fantasy_economy',v_economy,
    'price_proposals',v_price_count,
    'price_warning',v_price_warning,
    'source_token',v_current_token
  );
end;
$$;

revoke all on function public.publish_live_match(text,text,jsonb) from public, anon;
grant execute on function public.publish_live_match(text,text,jsonb) to authenticated;
