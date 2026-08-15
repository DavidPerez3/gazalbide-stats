-- Gazalbide Stats: 2026-2027 Gazalbide B cohort trait.
-- Izan, Gontzal and Dani share the B synergy. Julen Anda keeps Julen Power
-- and receives Alcohólico instead, matching the intended Fantasy character.

insert into public.fantasy_traits
  (season_id, code, label, activation_type, multiplier, required_count, sort_order, enabled)
values
  ('2026-2027', 'B', 'Gazalbide B', 'lineup_count', 1.5, 2, 65, true)
on conflict (season_id, code) do update set
  label = excluded.label,
  activation_type = excluded.activation_type,
  multiplier = excluded.multiplier,
  required_count = excluded.required_count,
  sort_order = excluded.sort_order,
  enabled = excluded.enabled,
  updated_at = now();

with assignments(jersey_number, trait_code) as (
  values
    ('5',  'B'),  -- Izan
    ('15', 'B'),  -- Gontzal
    ('19', 'B'),  -- Dani
    ('22', 'A')   -- Julen Anda; JP already exists from the previous migration
)
insert into public.fantasy_player_traits (season_id, player_id, trait_code)
select '2026-2027', sp.player_id, a.trait_code
from assignments a
join public.season_players sp
  on sp.season_id='2026-2027'
 and sp.jersey_number=a.jersey_number
 and sp.active=true
on conflict do nothing;

-- Julen Anda intentionally does not receive the Gazalbide B trait.
delete from public.fantasy_player_traits fpt
using public.season_players sp
where fpt.season_id='2026-2027'
  and fpt.player_id=sp.player_id
  and sp.season_id='2026-2027'
  and sp.jersey_number='22'
  and fpt.trait_code='B';
