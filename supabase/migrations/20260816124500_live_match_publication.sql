-- Gazalbide Stats: atomic Live Stats publication, official lineup materialization,
-- Fantasy handoff and versioned reopening.

alter table public.matches
  add column if not exists publication_version integer not null default 0,
  add column if not exists published_at timestamptz,
  add column if not exists published_by uuid references auth.users(id) on delete set null,
  add column if not exists publication_source_token text;

create table if not exists public.match_lineup_stats (
  match_id text not null references public.matches(id) on delete cascade,
  lineup_key text not null,
  player_ids bigint[] not null,
  stint_count integer not null default 0 check (stint_count >= 0),
  duration_ms integer not null default 0 check (duration_ms >= 0),
  gazal_pts integer not null default 0,
  opp_pts integer not null default 0,
  plus_minus integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (match_id, lineup_key)
);

create table if not exists public.match_publication_revisions (
  match_id text not null references public.matches(id) on delete cascade,
  version integer not null check (version > 0),
  source_token text not null,
  client_source_fingerprint text,
  snapshot jsonb not null,
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz not null default now(),
  primary key (match_id, version)
);

create index if not exists match_publication_revisions_published_idx
  on public.match_publication_revisions(match_id, published_at desc);

alter table public.match_lineup_stats enable row level security;
alter table public.match_publication_revisions enable row level security;

revoke all on public.match_lineup_stats from anon;
revoke all on public.match_publication_revisions from anon;
grant select on public.match_lineup_stats to authenticated;
grant select on public.match_publication_revisions to authenticated;

drop policy if exists "match_lineup_stats_published_read" on public.match_lineup_stats;
create policy "match_lineup_stats_published_read"
  on public.match_lineup_stats
  for select
  using (
    exists (
      select 1 from public.matches m
      where m.id = match_lineup_stats.match_id
        and (m.status = 'published' or public.is_gazal_admin())
    )
  );

drop policy if exists "match_publication_revisions_admin_read" on public.match_publication_revisions;
create policy "match_publication_revisions_admin_read"
  on public.match_publication_revisions
  for select to authenticated
  using ((select public.is_gazal_admin()));

-- Stable server-side token for the exact remote Live source. This protects the
-- review -> publish boundary from concurrent edits or a stale device.
create or replace function public.live_match_source_token(p_match_id text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select md5(
    coalesce((
      select jsonb_agg(
        jsonb_build_array(
          ge.id,
          ge.client_id,
          ge.client_sequence,
          ge.period,
          ge.clock_ms,
          ge.subject,
          ge.event_type,
          ge.player_id,
          ge.related_player_id,
          ge.staff_id,
          ge.foul_kind,
          ge.is_void,
          ge.voided_at,
          ge.void_reason,
          ge.metadata,
          ge.updated_at
        ) order by ge.server_sequence
      )::text
      from public.game_events ge
      where ge.match_id = p_match_id
    ), '[]')
    || '|'
    || coalesce((
      select jsonb_agg(
        jsonb_build_array(
          gr.player_id,
          gr.jersey_number,
          gr.sort_order,
          gr.is_starter,
          gr.is_active,
          gr.played_ms,
          gr.updated_at
        ) order by gr.sort_order, gr.player_id
      )::text
      from public.game_roster gr
      where gr.match_id = p_match_id
    ), '[]')
    || '|'
    || coalesce((
      select jsonb_build_array(
        lgs.period,
        lgs.clock_ms,
        lgs.clock_running,
        lgs.updated_at
      )::text
      from public.live_game_state lgs
      where lgs.match_id = p_match_id
    ), 'null')
  );
$$;

revoke all on function public.live_match_source_token(text) from public, anon;
grant execute on function public.live_match_source_token(text) to authenticated;

-- Version price proposals by publication revision so a corrected/re-published
-- match can generate a fresh review batch without destroying prior audit data.
alter table public.fantasy_price_proposals
  add column if not exists source_publication_version integer not null default 1;

do $$
declare
  v_constraint text;
begin
  select c.conname into v_constraint
  from pg_constraint c
  where c.conrelid = 'public.fantasy_price_proposals'::regclass
    and c.contype = 'u'
    and pg_get_constraintdef(c.oid) like '%season_id, source_match_id, player_id%'
  limit 1;

  if v_constraint is not null then
    execute format('alter table public.fantasy_price_proposals drop constraint %I', v_constraint);
  end if;
end
$$;

create unique index if not exists fantasy_price_proposals_version_player_uidx
  on public.fantasy_price_proposals(
    season_id,
    source_match_id,
    source_publication_version,
    player_id
  );

create or replace function public.generate_fantasy_price_proposals(
  p_season_id text,
  p_match_id text default null
)
returns table (
  player_id bigint,
  previous_price integer,
  game_pir numeric,
  recent_pir numeric,
  season_pir numeric,
  games_played integer,
  blended_pir numeric,
  inflation_adjustment numeric,
  proposed_price integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_match public.matches%rowtype;
  v_latest_gameweek_id bigint;
  v_avg_carry numeric := 0;
  v_base_budget integer := 80;
  v_inflation numeric := 0;
  v_affordability_limit integer;
  v_cheapest_five integer;
  v_changed integer;
  v_publication_version integer;
begin
  if v_uid is null or not public.is_gazal_admin() then
    raise exception 'Admin permissions required';
  end if;

  if p_match_id is null then
    select * into v_match
    from public.matches
    where season = p_season_id
      and status = 'published'
    order by date desc, id desc
    limit 1;
  else
    select * into v_match
    from public.matches
    where id = p_match_id
      and season = p_season_id
      and status = 'published';
  end if;

  if not found then
    raise exception 'No published match found for season %', p_season_id;
  end if;

  v_publication_version := greatest(1, coalesce(v_match.publication_version, 1));

  select coalesce(fss.base_budget, 80)
    into v_base_budget
  from public.fantasy_season_settings fss
  where fss.season_id = p_season_id;

  v_base_budget := coalesce(v_base_budget, 80);
  v_affordability_limit := floor(v_base_budget * 0.80)::integer;

  select gw.id
    into v_latest_gameweek_id
  from public.gameweeks gw
  where gw.season_id = p_season_id
    and exists (
      select 1
      from public.fantasy_gameweek_economy e
      where e.gameweek_id = gw.id
        and e.finalized_at is not null
    )
  order by gw.date desc, gw.id desc
  limit 1;

  if v_latest_gameweek_id is not null then
    select coalesce(avg(e.carry_out), 0)
      into v_avg_carry
    from public.fantasy_gameweek_economy e
    where e.gameweek_id = v_latest_gameweek_id
      and e.finalized_at is not null;
  end if;

  v_inflation := least(
    1.0,
    greatest(0.0, (v_avg_carry / greatest(v_base_budget, 1)) * 4.0)
  );

  delete from public.fantasy_price_proposals
  where season_id = p_season_id
    and source_match_id = v_match.id
    and source_publication_version = v_publication_version
    and status = 'pending';

  insert into public.fantasy_price_proposals (
    season_id,
    source_match_id,
    source_publication_version,
    player_id,
    previous_price,
    game_pir,
    recent_pir,
    season_pir,
    games_played,
    blended_pir,
    performance_target,
    inflation_adjustment,
    max_change,
    proposed_price
  )
  select
    p_season_id,
    v_match.id,
    v_publication_version,
    fm.player_id,
    fm.price,
    s.game_pir,
    s.recent_pir,
    s.season_pir,
    s.games_played,
    case
      when s.game_pir is null then null
      else round((0.40*s.game_pir + 0.35*s.recent_pir + 0.25*s.season_pir)::numeric, 2)
    end,
    case
      when s.game_pir is null then null
      else round(
        least(30.0, greatest(8.0,
          10.0 + 0.8*(0.40*s.game_pir + 0.35*s.recent_pir + 0.25*s.season_pir) + v_inflation
        ))::numeric,
        2
      )
    end,
    v_inflation,
    case when s.games_played between 1 and 3 then 1 else 2 end,
    case
      when s.game_pir is null then fm.price
      else greatest(
        8,
        least(
          30,
          fm.price + (case when s.games_played between 1 and 3 then 1 else 2 end),
          greatest(
            fm.price - (case when s.games_played between 1 and 3 then 1 else 2 end),
            round(
              fm.price * (case when s.games_played between 1 and 3 then 0.80 else 0.65 end)
              + least(30.0, greatest(8.0,
                  10.0 + 0.8*(0.40*s.game_pir + 0.35*s.recent_pir + 0.25*s.season_pir) + v_inflation
                )) * (case when s.games_played between 1 and 3 then 0.20 else 0.35 end)
            )::integer
          )
        )
      )
    end
  from public.fantasy_player_market fm
  join public.season_players sp
    on sp.season_id = fm.season_id
   and sp.player_id = fm.player_id
   and sp.active = true
  left join lateral (
    select
      (
        select pms0.pir::numeric
        from public.player_match_stats pms0
        where pms0.match_id = v_match.id
          and pms0.player_id = fm.player_id
        limit 1
      ) as game_pir,
      (
        select avg(z.pir)::numeric
        from (
          select pms1.pir
          from public.player_match_stats pms1
          join public.matches m1 on m1.id = pms1.match_id
          where pms1.player_id = fm.player_id
            and m1.season = p_season_id
            and m1.status = 'published'
            and (m1.date < v_match.date or (m1.date = v_match.date and m1.id <= v_match.id))
          order by m1.date desc, m1.id desc
          limit 3
        ) z
      ) as recent_pir,
      (
        select avg(pms2.pir)::numeric
        from public.player_match_stats pms2
        join public.matches m2 on m2.id = pms2.match_id
        where pms2.player_id = fm.player_id
          and m2.season = p_season_id
          and m2.status = 'published'
          and (m2.date < v_match.date or (m2.date = v_match.date and m2.id <= v_match.id))
      ) as season_pir,
      (
        select count(*)::integer
        from public.player_match_stats pms3
        join public.matches m3 on m3.id = pms3.match_id
        where pms3.player_id = fm.player_id
          and m3.season = p_season_id
          and m3.status = 'published'
          and (m3.date < v_match.date or (m3.date = v_match.date and m3.id <= v_match.id))
      ) as games_played
  ) s on true
  where fm.season_id = p_season_id
    and fm.enabled = true;

  loop
    select coalesce(sum(x.proposed_price), 0)
      into v_cheapest_five
    from (
      select fpp.proposed_price
      from public.fantasy_price_proposals fpp
      where fpp.season_id = p_season_id
        and fpp.source_match_id = v_match.id
        and fpp.source_publication_version = v_publication_version
      order by fpp.proposed_price asc, fpp.player_id asc
      limit 5
    ) x;

    exit when v_cheapest_five <= v_affordability_limit;

    with cheapest as (
      select fpp.id
      from public.fantasy_price_proposals fpp
      where fpp.season_id = p_season_id
        and fpp.source_match_id = v_match.id
        and fpp.source_publication_version = v_publication_version
        and fpp.proposed_price > greatest(8, fpp.previous_price - fpp.max_change)
      order by fpp.proposed_price asc, fpp.player_id asc
      limit 5
    )
    update public.fantasy_price_proposals fpp
    set proposed_price = fpp.proposed_price - 1
    where fpp.id in (select id from cheapest);

    get diagnostics v_changed = row_count;
    if v_changed = 0 then
      raise exception 'Cannot preserve affordable five-player market within configured change limits';
    end if;
  end loop;

  return query
  select
    fpp.player_id,
    fpp.previous_price,
    fpp.game_pir,
    fpp.recent_pir,
    fpp.season_pir,
    fpp.games_played,
    fpp.blended_pir,
    fpp.inflation_adjustment,
    fpp.proposed_price
  from public.fantasy_price_proposals fpp
  where fpp.season_id = p_season_id
    and fpp.source_match_id = v_match.id
    and fpp.source_publication_version = v_publication_version
  order by fpp.proposed_price desc, fpp.player_id;
end;
$$;

create or replace function public.apply_fantasy_price_review(
  p_season_id text,
  p_match_id text,
  p_prices jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row record;
  v_price integer;
  v_base_budget integer := 80;
  v_affordability_limit integer;
  v_cheapest_five integer;
  v_count integer := 0;
  v_publication_version integer;
begin
  if v_uid is null or not public.is_gazal_admin() then
    raise exception 'Admin permissions required';
  end if;

  if p_prices is null or jsonb_typeof(p_prices) <> 'object' then
    raise exception 'Reviewed prices must be a JSON object';
  end if;

  select greatest(1, coalesce(publication_version, 1))
    into v_publication_version
  from public.matches
  where id = p_match_id
    and season = p_season_id
    and status = 'published';

  if not found then
    raise exception 'Published match not found';
  end if;

  select coalesce(fss.base_budget, 80)
    into v_base_budget
  from public.fantasy_season_settings fss
  where fss.season_id = p_season_id;
  v_base_budget := coalesce(v_base_budget, 80);
  v_affordability_limit := floor(v_base_budget * 0.80)::integer;

  if not exists (
    select 1 from public.fantasy_price_proposals fpp
    where fpp.season_id = p_season_id
      and fpp.source_match_id = p_match_id
      and fpp.source_publication_version = v_publication_version
  ) then
    raise exception 'No price proposal exists for this publication version';
  end if;

  for v_row in
    select fpp.player_id, fpp.previous_price, fpp.max_change
    from public.fantasy_price_proposals fpp
    where fpp.season_id = p_season_id
      and fpp.source_match_id = p_match_id
      and fpp.source_publication_version = v_publication_version
    order by fpp.player_id
  loop
    if not (p_prices ? v_row.player_id::text) then
      raise exception 'Missing reviewed price for player %', v_row.player_id;
    end if;
    begin
      v_price := (p_prices ->> v_row.player_id::text)::integer;
    exception when others then
      raise exception 'Invalid reviewed price for player %', v_row.player_id;
    end;
    if v_price < 8 or v_price > 30 then
      raise exception 'Reviewed price for player % must be between 8 and 30', v_row.player_id;
    end if;
    if abs(v_price - v_row.previous_price) > v_row.max_change then
      raise exception 'Reviewed price for player % exceeds allowed change +/- %', v_row.player_id, v_row.max_change;
    end if;
    v_count := v_count + 1;
  end loop;

  select coalesce(sum(x.price), 0)
    into v_cheapest_five
  from (
    select (j.value)::integer as price
    from jsonb_each_text(p_prices) j
    join public.fantasy_price_proposals fpp
      on fpp.player_id::text = j.key
     and fpp.season_id = p_season_id
     and fpp.source_match_id = p_match_id
     and fpp.source_publication_version = v_publication_version
    order by (j.value)::integer asc, fpp.player_id asc
    limit 5
  ) x;

  if v_count < 5 or v_cheapest_five > v_affordability_limit then
    raise exception 'Reviewed market fails affordability guard: five cheapest cost %, limit %', v_cheapest_five, v_affordability_limit;
  end if;

  for v_row in
    select fpp.player_id
    from public.fantasy_price_proposals fpp
    where fpp.season_id = p_season_id
      and fpp.source_match_id = p_match_id
      and fpp.source_publication_version = v_publication_version
  loop
    v_price := (p_prices ->> v_row.player_id::text)::integer;

    update public.fantasy_player_market
    set price = v_price, updated_at = now()
    where season_id = p_season_id
      and player_id = v_row.player_id
      and enabled = true;

    update public.fantasy_price_proposals
    set reviewed_price = v_price,
        status = 'applied',
        reviewed_at = now()
    where season_id = p_season_id
      and source_match_id = p_match_id
      and source_publication_version = v_publication_version
      and player_id = v_row.player_id;
  end loop;

  return jsonb_build_object(
    'season_id', p_season_id,
    'source_match_id', p_match_id,
    'publication_version', v_publication_version,
    'players', v_count,
    'cheapest_five', v_cheapest_five,
    'affordability_limit', v_affordability_limit
  );
end;
$$;

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
  v_min_seconds integer;
  v_eff integer;
  v_pir integer;
  v_player_count integer := 0;
  v_roster_count integer;
  v_gameweek_id bigint;
  v_gameweek_count integer;
  v_economy jsonb := null;
  v_price_count integer := 0;
  v_q_pf integer[] := '{}';
  v_q_pa integer[] := '{}';
  v_period_g integer;
  v_period_o integer;
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

  select * into v_state from public.live_game_state where match_id = p_match_id;
  if not found then raise exception 'Live state not found'; end if;
  if v_state.clock_running or v_state.clock_ms <> 0 or v_state.period < 4 then
    raise exception 'The final period must be stopped at 0:00 before publishing';
  end if;
  if not exists (
    select 1 from public.game_events ge
    where ge.match_id = p_match_id and ge.is_void = false
      and ge.event_type = 'PERIOD_END' and ge.period = v_state.period
  ) then
    raise exception 'The final period has not been closed';
  end if;

  v_current_token := public.live_match_source_token(p_match_id);
  if p_expected_source_token is null or p_expected_source_token <> v_current_token then
    raise exception 'Live source changed after review. Refresh the review before publishing';
  end if;

  if coalesce(p_publication->>'matchId','') <> p_match_id then
    raise exception 'Publication matchId does not match';
  end if;
  if coalesce(p_publication->>'season','') <> v_match.season
     or coalesce(p_publication->>'date','') <> v_match.date::text
     or coalesce(p_publication->>'opponent','') <> v_match.opponent then
    raise exception 'Publication metadata no longer matches the remote match';
  end if;

  v_score_g := coalesce((p_publication#>>'{score,gazalbide}')::integer, 0);
  v_score_o := coalesce((p_publication#>>'{score,opponent}')::integer, 0);

  select
    coalesce(sum(case ge.event_type when 'FT_MADE' then 1 when 'TWO_MADE' then 2 when 'THREE_MADE' then 3 else 0 end), 0)::integer,
    coalesce(sum(case ge.event_type when 'OPP_SCORE_1' then 1 when 'OPP_SCORE_2' then 2 when 'OPP_SCORE_3' then 3 else 0 end), 0)::integer
  into v_event_score_g, v_event_score_o
  from public.game_events ge
  where ge.match_id = p_match_id and ge.is_void = false;

  if v_score_g <> v_event_score_g or v_score_o <> v_event_score_o then
    raise exception 'Publication score does not match remote Live events';
  end if;
  if v_score_g = v_score_o then raise exception 'A published match cannot finish tied'; end if;

  select count(*)::integer into v_roster_count
  from public.game_roster
  where match_id = p_match_id and is_active = true;

  if jsonb_typeof(p_publication->'playerRows') <> 'array' then
    raise exception 'Publication playerRows must be an array';
  end if;
  if jsonb_array_length(p_publication->'playerRows') <> v_roster_count then
    raise exception 'Publication player count does not match Live roster';
  end if;

  delete from public.player_match_stats where match_id = p_match_id;

  for v_player in select value from jsonb_array_elements(p_publication->'playerRows')
  loop
    v_player_id := (v_player->>'playerId')::bigint;
    if not exists (
      select 1 from public.game_roster gr
      where gr.match_id = p_match_id and gr.player_id = v_player_id and gr.is_active = true
    ) then
      raise exception 'Player % is not in the Live roster', v_player_id;
    end if;

    v_stats := coalesce(v_player->'stats', '{}'::jsonb);
    v_played_ms := greatest(0, coalesce((v_player->>'playedMs')::integer, 0));
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

    insert into public.player_match_stats (
      match_id, player_id, sort_order, min_seconds, min_str,
      pts, two_pm, two_pa, three_pm, three_pa, fgm, fga, ftm, fta,
      oreb, dreb, reb, ast, tov, stl, blk, pf, pfd, pir, eff, plus_minus,
      pf_defensive, pf_offensive, pf_technical, pf_unsportsmanlike, pf_disqualifying,
      pf_technical_cat_1, pf_technical_cat_2, pf_disruptive, pf_flagrant,
      updated_at
    )
    select
      p_match_id,
      v_player_id,
      gr.sort_order,
      v_min_seconds,
      lpad((v_min_seconds / 60)::text, 2, '0') || ':' || lpad((v_min_seconds % 60)::text, 2, '0'),
      coalesce((v_stats->>'pts')::integer,0),
      coalesce((v_stats->>'two_pm')::integer,0),
      coalesce((v_stats->>'two_pa')::integer,0),
      coalesce((v_stats->>'three_pm')::integer,0),
      coalesce((v_stats->>'three_pa')::integer,0),
      coalesce((v_stats->>'fgm')::integer,0),
      coalesce((v_stats->>'fga')::integer,0),
      coalesce((v_stats->>'ftm')::integer,0),
      coalesce((v_stats->>'fta')::integer,0),
      coalesce((v_stats->>'oreb')::integer,0),
      coalesce((v_stats->>'dreb')::integer,0),
      coalesce((v_stats->>'reb')::integer,0),
      coalesce((v_stats->>'ast')::integer,0),
      coalesce((v_stats->>'tov')::integer,0),
      coalesce((v_stats->>'stl')::integer,0),
      coalesce((v_stats->>'blk')::integer,0),
      coalesce((v_stats->>'pf')::integer,0),
      coalesce((v_stats->>'pfd')::integer,0),
      v_pir,
      v_eff,
      coalesce((v_stats->>'plus_minus')::integer,0),
      coalesce((v_stats->>'pf_defensive')::integer,0),
      coalesce((v_stats->>'pf_offensive')::integer,0),
      coalesce((v_stats->>'pf_technical')::integer,0),
      coalesce((v_stats->>'pf_unsportsmanlike')::integer,0),
      coalesce((v_stats->>'pf_disqualifying')::integer,0),
      coalesce((v_stats->>'pf_technical_cat_1')::integer,0),
      coalesce((v_stats->>'pf_technical_cat_2')::integer,0),
      coalesce((v_stats->>'pf_disruptive')::integer,0),
      coalesce((v_stats->>'pf_flagrant')::integer,0),
      now()
    from public.game_roster gr
    where gr.match_id = p_match_id and gr.player_id = v_player_id;

    v_player_count := v_player_count + 1;
  end loop;

  if v_player_count <> v_roster_count then
    raise exception 'Not all roster players were materialized';
  end if;

  delete from public.match_lineup_stats where match_id = p_match_id;
  if jsonb_typeof(p_publication->'lineupRows') = 'array' then
    for v_lineup in select value from jsonb_array_elements(p_publication->'lineupRows')
    loop
      insert into public.match_lineup_stats (
        match_id, lineup_key, player_ids, stint_count, duration_ms,
        gazal_pts, opp_pts, plus_minus, updated_at
      ) values (
        p_match_id,
        v_lineup->>'lineupKey',
        array(select jsonb_array_elements_text(v_lineup->'lineupIds')::bigint),
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
    into v_period_g, v_period_o
    from public.game_events ge
    where ge.match_id = p_match_id and ge.is_void = false and ge.period = v_period;
    v_q_pf := array_append(v_q_pf, v_period_g);
    v_q_pa := array_append(v_q_pa, v_period_o);
  end loop;

  v_version := coalesce(v_match.publication_version, 0) + 1;

  update public.matches
  set gazal_pts = v_score_g,
      opp_pts = v_score_o,
      q_pf = v_q_pf,
      q_pa = v_q_pa,
      result = case when v_score_g > v_score_o then 'W' else 'L' end,
      status = 'published',
      publication_version = v_version,
      publication_source_token = v_current_token,
      published_at = now(),
      published_by = v_uid,
      updated_at = now()
  where id = p_match_id;

  insert into public.match_publication_revisions (
    match_id, version, source_token, client_source_fingerprint,
    snapshot, published_by, published_at
  ) values (
    p_match_id,
    v_version,
    v_current_token,
    p_publication->>'sourceFingerprint',
    p_publication,
    v_uid,
    now()
  );

  -- Link a single unlinked Fantasy gameweek automatically when season/date/opponent
  -- clearly identify it. If the gameweek already has match_id, keep that link.
  select count(*)::integer, min(gw.id)
    into v_gameweek_count, v_gameweek_id
  from public.gameweeks gw
  where gw.season_id = v_match.season
    and (
      gw.match_id = p_match_id
      or (
        gw.match_id is null
        and gw.date = v_match.date
        and lower(trim(coalesce(gw.opponent,''))) = lower(trim(v_match.opponent))
      )
    );

  if v_gameweek_count = 1 and v_gameweek_id is not null then
    update public.gameweeks
    set match_id = p_match_id,
        status = 'played'
    where id = v_gameweek_id;

    -- Economy finalization is part of the round handoff. It remains idempotent
    -- through ledger event keys and is only attempted once the deadline passed.
    if exists (select 1 from public.gameweeks where id = v_gameweek_id and deadline <= now()) then
      begin
        v_economy := public.finalize_fantasy_gameweek_economy(v_gameweek_id);
      exception when others then
        -- Publication of official stats must not be rolled back because a
        -- Fantasy economy edge case needs admin attention.
        v_economy := jsonb_build_object('warning', sqlerrm);
      end;
    end if;

    update public.gameweeks set status = 'scored' where id = v_gameweek_id;
  else
    v_gameweek_id := null;
  end if;

  -- Generate reviewable prices automatically. Failure here must not undo the
  -- official match publication; surface it in the response instead.
  begin
    select count(*) into v_price_count
    from public.generate_fantasy_price_proposals(v_match.season, p_match_id);
  exception when others then
    v_price_count := -1;
  end;

  return jsonb_build_object(
    'match_id', p_match_id,
    'publication_version', v_version,
    'status', 'published',
    'players', v_player_count,
    'gameweek_id', v_gameweek_id,
    'fantasy_economy', v_economy,
    'price_proposals', v_price_count,
    'source_token', v_current_token
  );
end;
$$;

revoke all on function public.publish_live_match(text, text, jsonb) from public, anon;
grant execute on function public.publish_live_match(text, text, jsonb) to authenticated;

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

  update public.matches
  set status = 'live',
      publication_source_token = null,
      updated_at = now()
  where id = p_match_id;

  delete from public.player_match_stats where match_id = p_match_id;
  delete from public.match_lineup_stats where match_id = p_match_id;

  select gw.id into v_gameweek_id
  from public.gameweeks gw
  where gw.match_id = p_match_id
  order by gw.id desc
  limit 1;

  if v_gameweek_id is not null then
    update public.gameweeks set status = 'played' where id = v_gameweek_id;
  end if;

  return jsonb_build_object(
    'match_id', p_match_id,
    'reopened_from_version', v_match.publication_version,
    'status', 'live',
    'gameweek_id', v_gameweek_id
  );
end;
$$;

revoke all on function public.reopen_published_match(text) from public, anon;
grant execute on function public.reopen_published_match(text) to authenticated;
