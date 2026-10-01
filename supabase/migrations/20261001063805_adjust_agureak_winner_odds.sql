-- Manual opponent adjustment for the 2026-10-03 game against Agureak.
-- The generic historical model overrated Gazalbide because it has no
-- opponent-strength input. Existing bets keep their snapshotted odds.

update public.gazalbet_markets gm
set selections = jsonb_build_array(
      jsonb_build_object('key', 'gazalbide', 'label', 'Gazalbide', 'odds', 2.10),
      jsonb_build_object('key', 'opponent', 'label', gw.opponent, 'odds', 1.70)
    ),
    model_version = 'gazalbet-v2-manual-opponent',
    generated_at = now()
from public.gameweeks gw
where gm.gameweek_id = gw.id
  and gm.code = 'winner'
  and gm.status = 'open'
  and gw.season_id = '2026-2027'
  and gw.date = date '2026-10-03'
  and lower(gw.opponent) = 'agureak';
