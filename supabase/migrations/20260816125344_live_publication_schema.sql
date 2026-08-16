-- Gazalbide Stats: schema for atomic Live Stats publication and revisions.

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

revoke all on public.match_lineup_stats from public;
revoke all on public.match_publication_revisions from public;
grant select on public.match_lineup_stats to anon, authenticated;
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

create or replace function public.live_match_source_token(p_match_id text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select md5(
    coalesce((
      select jsonb_agg(jsonb_build_array(
        ge.id,ge.client_id,ge.client_sequence,ge.period,ge.clock_ms,ge.subject,
        ge.event_type,ge.player_id,ge.related_player_id,ge.staff_id,ge.foul_kind,
        ge.is_void,ge.voided_at,ge.void_reason,ge.metadata,ge.updated_at
      ) order by ge.server_sequence)::text
      from public.game_events ge where ge.match_id = p_match_id
    ), '[]') || '|' ||
    coalesce((
      select jsonb_agg(jsonb_build_array(
        gr.player_id,gr.jersey_number,gr.sort_order,gr.is_starter,gr.is_active,
        gr.played_ms,gr.updated_at
      ) order by gr.sort_order,gr.player_id)::text
      from public.game_roster gr where gr.match_id = p_match_id
    ), '[]') || '|' ||
    coalesce((
      select jsonb_build_array(lgs.period,lgs.clock_ms,lgs.clock_running,lgs.updated_at)::text
      from public.live_game_state lgs where lgs.match_id = p_match_id
    ), 'null')
  );
$$;

revoke all on function public.live_match_source_token(text) from public, anon;
grant execute on function public.live_match_source_token(text) to authenticated;
