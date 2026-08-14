-- Gazalbide Stats: persist foul breakdown alongside total PF.
-- Every player foul still increments player_match_stats.pf and team fouls.
-- These subtype columns make season/career rankings possible without losing the exact foul type.

alter table public.player_match_stats
  add column if not exists pf_defensive integer not null default 0,
  add column if not exists pf_offensive integer not null default 0,
  add column if not exists pf_technical integer not null default 0,
  add column if not exists pf_unsportsmanlike integer not null default 0,
  add column if not exists pf_disqualifying integer not null default 0,
  add column if not exists pf_technical_cat_1 integer not null default 0,
  add column if not exists pf_technical_cat_2 integer not null default 0,
  add column if not exists pf_disruptive integer not null default 0,
  add column if not exists pf_flagrant integer not null default 0;

comment on column public.player_match_stats.pf is
  'Total player fouls. Includes every foul subtype, including technical/unsportsmanlike/disqualifying fouls.';
comment on column public.player_match_stats.pf_technical is
  'Legacy/general technical foul count. FIBA 2026 technical categories are also stored separately.';
comment on column public.player_match_stats.pf_unsportsmanlike is
  'Legacy FIBA unsportsmanlike foul count.';
comment on column public.player_match_stats.pf_disqualifying is
  'Direct disqualifying foul count.';

-- Aggregate view ready for future ranking screens. Historical games imported from legacy JSON
-- will simply have zero in subtype columns because the original source did not store that detail.
create or replace view public.player_foul_rankings as
select
  p.id as player_id,
  p.number,
  p.name,
  count(distinct s.match_id)::integer as games,
  coalesce(sum(s.pf), 0)::integer as pf_total,
  coalesce(sum(s.pf_defensive), 0)::integer as defensive,
  coalesce(sum(s.pf_offensive), 0)::integer as offensive,
  coalesce(sum(s.pf_technical), 0)::integer as technical_legacy,
  coalesce(sum(s.pf_technical_cat_1), 0)::integer as technical_cat_1,
  coalesce(sum(s.pf_technical_cat_2), 0)::integer as technical_cat_2,
  (
    coalesce(sum(s.pf_technical), 0)
    + coalesce(sum(s.pf_technical_cat_1), 0)
    + coalesce(sum(s.pf_technical_cat_2), 0)
  )::integer as technical_total,
  coalesce(sum(s.pf_unsportsmanlike), 0)::integer as unsportsmanlike,
  coalesce(sum(s.pf_disqualifying), 0)::integer as disqualifying,
  coalesce(sum(s.pf_disruptive), 0)::integer as disruptive,
  coalesce(sum(s.pf_flagrant), 0)::integer as flagrant
from public.players p
left join public.player_match_stats s on s.player_id = p.id
group by p.id, p.number, p.name;

grant select on public.player_foul_rankings to anon, authenticated;
