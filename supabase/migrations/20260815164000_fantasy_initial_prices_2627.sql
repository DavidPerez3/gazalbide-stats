-- Gazalbide Stats: provisional opening prices for Fantasy 2026-2027.
-- The market remains market_ready=false. These values are deliberately editable
-- from Admin before Jornada 1 is opened.
--
-- Calibration goal with an 80-beer base budget:
-- - median player price around 15;
-- - a sensible mixed five is affordable;
-- - the five most expensive players cannot all be selected immediately;
-- - newcomers start around the market median rather than as artificial bargains.

with proposed(jersey_number, price) as (
  values
    ('00', 14), -- Iker
    ('1',  23), -- Josu
    ('3',  13), -- Ibon
    ('5',  15), -- Izan (new)
    ('8',  15), -- Aimar
    ('10', 22), -- Oier
    ('11', 19), -- Jorge
    ('13', 18), -- Aguirre
    ('14', 12), -- Iñaki
    ('15', 15), -- Gontzal (new)
    ('17', 10), -- Covela
    ('19', 15), -- Dani (new)
    ('21', 14), -- Julen
    ('22', 15), -- Julen Anda (new)
    ('25', 12)  -- Imanol
)
insert into public.fantasy_player_market (season_id, player_id, price, enabled, updated_at)
select
  sp.season_id,
  sp.player_id,
  proposed.price,
  true,
  now()
from proposed
join public.season_players sp
  on sp.season_id = '2026-2027'
 and sp.jersey_number = proposed.jersey_number
 and sp.active = true
on conflict (season_id, player_id) do update set
  price = excluded.price,
  enabled = true,
  updated_at = now();

-- Fail loudly if the current roster and the proposed list drift apart before deploy.
do $$
declare
  active_count integer;
  priced_count integer;
begin
  select count(*) into active_count
  from public.season_players
  where season_id = '2026-2027' and active = true;

  select count(*) into priced_count
  from public.fantasy_player_market
  where season_id = '2026-2027' and enabled = true;

  if active_count <> 15 or priced_count <> active_count then
    raise exception 'Expected 15 active/priced Fantasy players for 2026-2027, got active %, priced %', active_count, priced_count;
  end if;
end $$;

update public.fantasy_season_settings
set market_ready = false,
    updated_at = now()
where season_id = '2026-2027';
