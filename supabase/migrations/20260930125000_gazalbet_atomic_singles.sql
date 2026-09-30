-- Confirm several independent selections atomically: either all are placed or none are.
create or replace function public.place_gazalbet_singles(p_gameweek_id bigint,p_legs jsonb,p_stake_each numeric)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_leg jsonb; v_results jsonb:='[]'::jsonb; v_result jsonb; v_count int;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  v_count:=jsonb_array_length(p_legs);
  if v_count<1 or v_count>6 then raise exception 'Singles batch must contain 1 to 6 selections'; end if;
  for v_leg in select value from jsonb_array_elements(p_legs) loop
    v_result:=public.place_gazalbet_ticket(p_gameweek_id,jsonb_build_array(v_leg),p_stake_each);
    v_results:=v_results||jsonb_build_array(v_result);
  end loop;
  return jsonb_build_object('tickets',v_results,'count',v_count,'total_stake',v_count*p_stake_each);
end;
$$;
revoke all on function public.place_gazalbet_singles(bigint,jsonb,numeric) from public,anon;
grant execute on function public.place_gazalbet_singles(bigint,jsonb,numeric) to authenticated;
