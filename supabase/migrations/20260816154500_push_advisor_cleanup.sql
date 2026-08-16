drop policy if exists notification_server_config_public_key_read on public.notification_server_config;
create policy notification_server_config_public_key_read
  on public.notification_server_config
  for select to authenticated
  using (true);

grant select(singleton, vapid_public_key) on public.notification_server_config to authenticated;

create or replace function public.get_push_public_config()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'vapidPublicKey', vapid_public_key,
    'supportedTypes', jsonb_build_array(
      'new_gameweek','deadline_24h','deadline_1h','player_status',
      'match_live','result_published','prices_updated','economy_ready'
    )
  )
  from public.notification_server_config
  where singleton = true;
$$;
revoke all on function public.get_push_public_config() from public;
grant execute on function public.get_push_public_config() to authenticated;
