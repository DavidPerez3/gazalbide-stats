-- Apply one reviewed price batch atomically. Manual corrections stay bounded by
-- the same per-player change limit, and the final reviewed market must preserve
-- the five-player affordability guard before current market prices are updated.

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
begin
  if v_uid is null or not public.is_gazal_admin() then
    raise exception 'Admin permissions required';
  end if;

  if p_prices is null or jsonb_typeof(p_prices) <> 'object' then
    raise exception 'Reviewed prices must be a JSON object';
  end if;

  select coalesce(fss.base_budget, 80)
    into v_base_budget
  from public.fantasy_season_settings fss
  where fss.season_id = p_season_id;

  v_base_budget := coalesce(v_base_budget, 80);
  v_affordability_limit := floor(v_base_budget * 0.80)::integer;

  if not exists (
    select 1
    from public.fantasy_price_proposals fpp
    where fpp.season_id = p_season_id
      and fpp.source_match_id = p_match_id
  ) then
    raise exception 'No price proposal exists for this match';
  end if;

  for v_row in
    select fpp.player_id, fpp.previous_price, fpp.max_change
    from public.fantasy_price_proposals fpp
    where fpp.season_id = p_season_id
      and fpp.source_match_id = p_match_id
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
      raise exception
        'Reviewed price for player % exceeds the allowed change of +/- %',
        v_row.player_id,
        v_row.max_change;
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
    order by (j.value)::integer asc, fpp.player_id asc
    limit 5
  ) x;

  if v_count < 5 or v_cheapest_five > v_affordability_limit then
    raise exception
      'Reviewed market fails affordability guard: five cheapest cost %, limit %',
      v_cheapest_five,
      v_affordability_limit;
  end if;

  for v_row in
    select fpp.player_id
    from public.fantasy_price_proposals fpp
    where fpp.season_id = p_season_id
      and fpp.source_match_id = p_match_id
  loop
    v_price := (p_prices ->> v_row.player_id::text)::integer;

    update public.fantasy_player_market
    set price = v_price,
        updated_at = now()
    where season_id = p_season_id
      and player_id = v_row.player_id
      and enabled = true;

    update public.fantasy_price_proposals
    set reviewed_price = v_price,
        status = 'applied',
        reviewed_at = now()
    where season_id = p_season_id
      and source_match_id = p_match_id
      and player_id = v_row.player_id;
  end loop;

  return jsonb_build_object(
    'season_id', p_season_id,
    'source_match_id', p_match_id,
    'players', v_count,
    'cheapest_five', v_cheapest_five,
    'affordability_limit', v_affordability_limit
  );
end;
$$;

revoke all on function public.apply_fantasy_price_review(text, text, jsonb)
  from public, anon;
grant execute on function public.apply_fantasy_price_review(text, text, jsonb)
  to authenticated;
