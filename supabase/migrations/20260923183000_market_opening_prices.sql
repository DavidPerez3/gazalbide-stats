-- Opening adjustment from 2025-26 PIR, keeping the 80-beer budget viable.
-- Newcomers remain at the 15-beer median until they have league data.
with opening(jersey_number, previous_price, next_price) as (
  values ('3',13,12), ('8',15,14), ('13',18,17), ('25',12,11)
)
update public.fantasy_player_market fm
set price = opening.next_price, updated_at = now()
from opening
join public.season_players sp
  on sp.season_id = '2026-2027'
 and sp.jersey_number = opening.jersey_number
 and sp.active
where fm.season_id = sp.season_id
  and fm.player_id = sp.player_id
  and fm.price = opening.previous_price;

-- Market configuration is ready for a future scheduled gameweek. This alone
-- does not open lineup editing; the admin still chooses the official deadline.
do $$
declare
  v_active integer;
  v_priced integer;
  v_cheapest integer;
begin
  select count(*), count(fm.player_id)
  into v_active, v_priced
  from public.season_players sp
  left join public.fantasy_player_market fm
    on fm.season_id = sp.season_id and fm.player_id = sp.player_id and fm.enabled
  where sp.season_id = '2026-2027' and sp.active;
  select sum(price) into v_cheapest from (
    select fm.price from public.fantasy_player_market fm
    join public.season_players sp on sp.player_id = fm.player_id and sp.season_id = fm.season_id
    where fm.season_id = '2026-2027' and fm.enabled and sp.active
    order by fm.price limit 5
  ) affordable;
  if v_active <> 15 or v_priced <> v_active or v_cheapest > 64 then
    raise exception 'Opening market readiness check failed';
  end if;
end $$;

update public.fantasy_season_settings
set market_ready = true, updated_at = now()
where season_id = '2026-2027';
