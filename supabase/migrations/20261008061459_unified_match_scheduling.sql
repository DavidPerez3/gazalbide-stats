alter table public.matches add column if not exists is_scheduled boolean not null default false;

create or replace function public.schedule_match(
  p_match_id text, p_season text, p_date date, p_opponent text,
  p_fantasy boolean, p_name text default null, p_deadline timestamptz default null,
  p_markets boolean default false
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_gw public.gameweeks%rowtype;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and is_admin) then
    raise exception 'Solo administradores pueden programar partidos';
  end if;
  if coalesce(trim(p_match_id),'')='' or coalesce(trim(p_opponent),'')='' or p_date is null or coalesce(trim(p_season),'')='' then
    raise exception 'Indica fecha, rival, temporada e identificador';
  end if;
  if p_markets and not p_fantasy then raise exception 'Los mercados requieren una jornada vinculada'; end if;
  if p_fantasy and (p_deadline is null or p_deadline <= now()) then raise exception 'El cierre debe estar en el futuro'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_match_id,0));
  if exists(select 1 from public.matches where id=p_match_id) or exists(select 1 from public.gameweeks where match_id=p_match_id) then
    raise exception 'Este partido ya está programado. Abre su convocatoria existente';
  end if;
  insert into public.matches(id,season,date,opponent,status,is_scheduled)
  values(p_match_id,p_season,p_date,trim(p_opponent),'draft',true);
  if p_fantasy then
    if not exists(select 1 from public.fantasy_season_settings where season_id=p_season and market_ready) then
      raise exception 'El mercado Fantasy de la temporada no está listo';
    end if;
    insert into public.gameweeks(name,opponent,date,deadline,match_id,stats_file,season_id)
    values(nullif(trim(p_name),''),trim(p_opponent),p_date,p_deadline,p_match_id,p_match_id||'.json',p_season)
    returning * into v_gw;
    if p_markets then perform public.ensure_gazalbet_markets(v_gw.id); end if;
  end if;
  return jsonb_build_object('match_id',p_match_id,'gameweek',case when p_fantasy then to_jsonb(v_gw) else null end);
end;
$$;
revoke all on function public.schedule_match(text,text,date,text,boolean,text,timestamptz,boolean) from public,anon;
grant execute on function public.schedule_match(text,text,date,text,boolean,text,timestamptz,boolean) to authenticated;
