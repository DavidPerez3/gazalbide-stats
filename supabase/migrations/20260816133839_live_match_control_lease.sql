create table if not exists public.live_match_control (
  match_id text primary key references public.matches(id) on delete cascade,
  device_id uuid not null,
  device_label text,
  control_token uuid not null default gen_random_uuid(),
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  lease_expires_at timestamptz not null default (now() + interval '30 seconds'),
  updated_at timestamptz not null default now()
);

alter table public.game_events add column if not exists control_token uuid;
alter table public.game_roster add column if not exists control_token uuid;
alter table public.live_game_state add column if not exists control_token uuid;

alter table public.live_match_control enable row level security;
revoke all on public.live_match_control from anon, authenticated;

create or replace function public.enforce_live_control_token()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_status text;
  v_control public.live_match_control%rowtype;
begin
  select m.status into v_match_status
  from public.matches m
  where m.id = new.match_id;

  if v_match_status is distinct from 'live' then
    return new;
  end if;

  select * into v_control
  from public.live_match_control c
  where c.match_id = new.match_id;

  if not found then
    return new;
  end if;

  if v_control.lease_expires_at <= now() then
    raise exception 'Live control lease expired. Claim control before writing.';
  end if;

  if new.control_token is null or new.control_token <> v_control.control_token then
    raise exception 'This device no longer controls the Live match.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_live_control_token() from public, anon, authenticated;

drop trigger if exists game_events_live_control_guard on public.game_events;
create trigger game_events_live_control_guard
before insert or update on public.game_events
for each row execute function public.enforce_live_control_token();

drop trigger if exists game_roster_live_control_guard on public.game_roster;
create trigger game_roster_live_control_guard
before insert or update on public.game_roster
for each row execute function public.enforce_live_control_token();

drop trigger if exists live_game_state_control_guard on public.live_game_state;
create trigger live_game_state_control_guard
before insert or update on public.live_game_state
for each row execute function public.enforce_live_control_token();

create or replace function public.claim_live_match_control(
  p_match_id text,
  p_device_id uuid,
  p_device_label text default null,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_match public.matches%rowtype;
  v_control public.live_match_control%rowtype;
  v_token uuid;
  v_same_device boolean := false;
begin
  if v_uid is null or not public.is_gazal_admin() then
    raise exception 'Admin permissions required';
  end if;
  if p_device_id is null then
    raise exception 'device_id is required';
  end if;

  select * into v_match from public.matches where id = p_match_id for update;
  if not found then raise exception 'Live match not found'; end if;
  if v_match.status <> 'live' then raise exception 'Match is not live'; end if;

  select * into v_control
  from public.live_match_control
  where match_id = p_match_id
  for update;

  if found then
    v_same_device := v_control.device_id = p_device_id;
    if v_control.lease_expires_at > now() and not v_same_device and not p_force then
      return jsonb_build_object(
        'granted', false,
        'match_id', p_match_id,
        'device_id', v_control.device_id,
        'device_label', v_control.device_label,
        'lease_expires_at', v_control.lease_expires_at,
        'reason', 'held_by_other_device'
      );
    end if;
  end if;

  if found and v_same_device then
    v_token := v_control.control_token;
  else
    v_token := gen_random_uuid();
  end if;

  insert into public.live_match_control (
    match_id, device_id, device_label, control_token, claimed_by,
    claimed_at, last_seen_at, lease_expires_at, updated_at
  ) values (
    p_match_id, p_device_id, nullif(trim(coalesce(p_device_label, '')), ''), v_token, v_uid,
    now(), now(), now() + interval '30 seconds', now()
  )
  on conflict (match_id) do update set
    device_id = excluded.device_id,
    device_label = excluded.device_label,
    control_token = excluded.control_token,
    claimed_by = excluded.claimed_by,
    claimed_at = case
      when public.live_match_control.device_id = excluded.device_id
        then public.live_match_control.claimed_at
      else now()
    end,
    last_seen_at = now(),
    lease_expires_at = now() + interval '30 seconds',
    updated_at = now();

  if found and not v_same_device then
    update public.live_game_state
    set clock_running = false,
        control_token = v_token,
        updated_at = now()
    where match_id = p_match_id;
  end if;

  return jsonb_build_object(
    'granted', true,
    'match_id', p_match_id,
    'device_id', p_device_id,
    'device_label', nullif(trim(coalesce(p_device_label, '')), ''),
    'control_token', v_token,
    'lease_expires_at', now() + interval '30 seconds',
    'taken_over', found and not v_same_device
  );
end;
$$;

create or replace function public.heartbeat_live_match_control(
  p_match_id text,
  p_device_id uuid,
  p_control_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_expires timestamptz;
begin
  if v_uid is null or not public.is_gazal_admin() then
    raise exception 'Admin permissions required';
  end if;

  update public.live_match_control
  set last_seen_at = now(),
      lease_expires_at = now() + interval '30 seconds',
      updated_at = now()
  where match_id = p_match_id
    and device_id = p_device_id
    and control_token = p_control_token
    and claimed_by = v_uid
  returning lease_expires_at into v_expires;

  if v_expires is null then
    return jsonb_build_object('granted', false, 'reason', 'control_lost');
  end if;

  return jsonb_build_object('granted', true, 'lease_expires_at', v_expires);
end;
$$;

create or replace function public.release_live_match_control(
  p_match_id text,
  p_device_id uuid,
  p_control_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null or not public.is_gazal_admin() then
    raise exception 'Admin permissions required';
  end if;

  update public.live_match_control
  set lease_expires_at = now(),
      last_seen_at = now(),
      updated_at = now()
  where match_id = p_match_id
    and device_id = p_device_id
    and control_token = p_control_token
    and claimed_by = v_uid;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

create or replace function public.get_live_match_control(p_match_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_control public.live_match_control%rowtype;
begin
  if v_uid is null or not public.is_gazal_admin() then
    raise exception 'Admin permissions required';
  end if;

  select * into v_control from public.live_match_control where match_id = p_match_id;
  if not found then
    return jsonb_build_object('active', false, 'match_id', p_match_id);
  end if;

  return jsonb_build_object(
    'active', v_control.lease_expires_at > now(),
    'match_id', p_match_id,
    'device_id', v_control.device_id,
    'device_label', v_control.device_label,
    'claimed_at', v_control.claimed_at,
    'last_seen_at', v_control.last_seen_at,
    'lease_expires_at', v_control.lease_expires_at
  );
end;
$$;

revoke all on function public.claim_live_match_control(text,uuid,text,boolean) from public, anon;
revoke all on function public.heartbeat_live_match_control(text,uuid,uuid) from public, anon;
revoke all on function public.release_live_match_control(text,uuid,uuid) from public, anon;
revoke all on function public.get_live_match_control(text) from public, anon;
grant execute on function public.claim_live_match_control(text,uuid,text,boolean) to authenticated;
grant execute on function public.heartbeat_live_match_control(text,uuid,uuid) to authenticated;
grant execute on function public.release_live_match_control(text,uuid,uuid) to authenticated;
grant execute on function public.get_live_match_control(text) to authenticated;
