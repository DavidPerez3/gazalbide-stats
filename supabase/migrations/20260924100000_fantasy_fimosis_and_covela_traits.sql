-- New current-season coach synergy, with the same x1.5 multiplier as the
-- other coach-matched traits. Existing Gazalbide B assignments are retained.
insert into public.fantasy_traits
  (season_id, code, label, activation_type, multiplier, required_count, sort_order, enabled)
values
  ('2026-2027', 'F', 'Fimosis', 'coach_match', 1.5, 1, 60, true)
on conflict (season_id, code) do update set
  label = excluded.label,
  activation_type = excluded.activation_type,
  multiplier = excluded.multiplier,
  required_count = excluded.required_count,
  sort_order = excluded.sort_order,
  enabled = excluded.enabled,
  updated_at = now();

insert into public.fantasy_player_traits (season_id, player_id, trait_code)
select sp.season_id, sp.player_id, 'F'
from public.season_players sp
join public.players p on p.id = sp.player_id
where sp.season_id = '2026-2027'
  and sp.active = true
  and (sp.jersey_number, p.name) in (('5', 'Izan'), ('15', 'Gontzal'))
on conflict do nothing;

insert into public.fantasy_staff_traits (season_id, staff_id, trait_code)
select ss.season_id, ss.staff_id, 'F'
from public.season_staff ss
join public.staff_members sm on sm.id = ss.staff_id
where ss.season_id = '2026-2027'
  and ss.active = true
  and sm.code = 'david'
on conflict do nothing;

-- Dani already has Joven promesa in production; retain and ensure it on
-- installations applying the migration to a fresh season.
insert into public.fantasy_player_traits (season_id, player_id, trait_code)
select sp.season_id, sp.player_id, 'J'
from public.season_players sp
join public.players p on p.id = sp.player_id
where sp.season_id = '2026-2027'
  and sp.active = true
  and sp.jersey_number = '19'
  and p.name = 'Dani'
on conflict do nothing;

-- Replace Covela Boost with Sexólogo in both seasons so the retired trait
-- cannot reappear in the historical view either. The C foreign keys cascade.
insert into public.fantasy_player_traits (season_id, player_id, trait_code)
select sp.season_id, sp.player_id, 'S'
from public.season_players sp
join public.players p on p.id = sp.player_id
where sp.season_id in ('2025-2026', '2026-2027')
  and p.name = 'Covela'
on conflict do nothing;

delete from public.fantasy_traits
where season_id in ('2025-2026', '2026-2027')
  and code = 'C';
