-- Bootstrap a dispatcher secret inside the Edge Function, store it in Vault, and
-- require it for every later call. Nothing secret is committed to the repository.

create or replace function public.notification_initialize_dispatch_secret(p_secret text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare v_id uuid;
begin
  if coalesce(length(p_secret),0)<32 then raise exception 'Invalid dispatcher secret'; end if;
  select id into v_id from vault.secrets where name='gazalbide_push_dispatch' order by created_at desc limit 1;
  if v_id is null then
    perform vault.create_secret(p_secret,'gazalbide_push_dispatch','Gazalbide internal push dispatcher key',null);
  else
    perform vault.update_secret(v_id,p_secret,'gazalbide_push_dispatch','Gazalbide internal push dispatcher key',null);
  end if;
end;
$$;
revoke all on function public.notification_initialize_dispatch_secret(text) from public, anon, authenticated;
grant execute on function public.notification_initialize_dispatch_secret(text) to service_role;

create or replace function public.notification_push_dispatch_secret()
returns text
language sql
security definer
set search_path = vault
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name='gazalbide_push_dispatch'
  order by created_at desc
  limit 1;
$$;
revoke all on function public.notification_push_dispatch_secret() from public, anon, authenticated;
grant execute on function public.notification_push_dispatch_secret() to service_role;

create or replace function public.dispatch_push_notifications()
returns bigint
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare cfg public.notification_server_config%rowtype; v_secret text; v_headers jsonb; v_request_id bigint;
begin
  select * into cfg from public.notification_server_config where singleton=true;
  if cfg.edge_function_url is null then return null; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets
  where name='gazalbide_push_dispatch' order by created_at desc limit 1;
  v_headers := jsonb_build_object('Content-Type','application/json');
  if v_secret is not null then
    v_headers := v_headers || jsonb_build_object('x-dispatch-key',v_secret);
  end if;
  select net.http_post(
    url := cfg.edge_function_url,
    headers := v_headers,
    body := '{"limit":100}'::jsonb,
    timeout_milliseconds := 10000
  ) into v_request_id;
  return v_request_id;
end;
$$;
revoke all on function public.dispatch_push_notifications() from public, anon, authenticated;

create or replace function public.notification_lineup_valid(p_user_id uuid, p_gameweek_id bigint)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_lineup public.fantasy_lineups%rowtype;
  v_team public.fantasy_teams%rowtype;
  v_gw public.gameweeks%rowtype;
  v_count integer := 0;
  v_distinct integer := 0;
  v_priced integer := 0;
  v_cost integer := 0;
  v_budget integer := 0;
  v_coach_valid boolean := false;
begin
  select * into v_gw from public.gameweeks where id=p_gameweek_id;
  if not found then return false; end if;
  select * into v_team from public.fantasy_teams where user_id=p_user_id and season_id=v_gw.season_id limit 1;
  if not found then return false; end if;
  select * into v_lineup from public.fantasy_lineups where fantasy_team_id=v_team.id and gameweek_id=p_gameweek_id limit 1;
  if not found or array_length(v_lineup.players,1)<>5 or v_lineup.captain_number is null or v_lineup.coach_code is null then return false; end if;

  select count(sp.player_id), count(distinct sp.player_id), count(coalesce(fgp.player_id,fpm.player_id)),
         coalesce(sum(coalesce(fgp.price,fpm.price)),0)
    into v_count,v_distinct,v_priced,v_cost
  from unnest(v_lineup.players) p(raw_number)
  left join public.season_players sp
    on sp.season_id=v_gw.season_id and sp.active=true
   and p.raw_number ~ '^[0-9]+$' and sp.jersey_number ~ '^[0-9]+$'
   and sp.jersey_number::integer=p.raw_number::integer
  left join public.fantasy_gameweek_prices fgp
    on fgp.gameweek_id=v_gw.id and fgp.player_id=sp.player_id
  left join public.fantasy_player_market fpm
    on fpm.season_id=v_gw.season_id and fpm.player_id=sp.player_id and fpm.enabled=true;

  select coalesce(e.available_budget,v_gw.base_budget)
    into v_budget
  from (select 1) x
  left join public.fantasy_gameweek_economy e
    on e.fantasy_team_id=v_team.id and e.gameweek_id=v_gw.id;

  select exists(
    select 1 from public.season_staff ss
    join public.staff_members sm on sm.id=ss.staff_id
    where ss.season_id=v_gw.season_id and ss.active=true and ss.fantasy_enabled=true
      and sm.code=v_lineup.coach_code
  ) into v_coach_valid;

  return v_count=5 and v_distinct=5 and v_priced=5
    and v_cost<=coalesce(v_budget,v_gw.base_budget)
    and v_coach_valid
    and exists (
      select 1 from unnest(v_lineup.players) c(raw_number)
      where c.raw_number ~ '^[0-9]+$' and c.raw_number::integer=v_lineup.captain_number::integer
    );
end;
$$;
revoke all on function public.notification_lineup_valid(uuid,bigint) from public, anon, authenticated;
