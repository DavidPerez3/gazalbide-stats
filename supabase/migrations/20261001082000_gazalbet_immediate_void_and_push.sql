-- Void unavailable-player legs immediately, refund fully void tickets once,
-- and notify the affected user through the existing PWA push pipeline.

alter table public.notification_outbox
  drop constraint if exists notification_outbox_notification_type_check;
alter table public.notification_outbox
  add constraint notification_outbox_notification_type_check check (notification_type in (
    'new_gameweek','deadline_24h','deadline_1h','player_status',
    'match_live','result_published','prices_updated','economy_ready','gazalbet_void'
  ));

create or replace function public.notification_type_enabled(p_user_id uuid,p_type text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p.enabled,false) and case p_type
    when 'new_gameweek' then p.new_gameweek
    when 'deadline_24h' then p.deadline_24h
    when 'deadline_1h' then p.deadline_1h
    when 'player_status' then p.player_status
    when 'match_live' then p.match_live
    when 'result_published' then p.result_published
    when 'prices_updated' then p.prices_updated
    when 'economy_ready' then p.economy_ready
    when 'gazalbet_void' then p.player_status
    else false end
  from public.notification_preferences p where p.user_id=p_user_id;
$$;

create or replace function public.gazalbet_void_unavailable_ticket_legs(
  p_gameweek_id bigint,
  p_player_number smallint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket record;
  v_voided_legs integer := 0;
  v_refunded_tickets integer := 0;
  v_open integer;
  v_void integer;
  v_total integer;
  v_effective numeric;
  v_credited boolean;
begin
  if not exists (
    select 1 from public.gameweeks g
    where g.id=p_gameweek_id and g.deadline>now() and g.status='scheduled'
  ) then
    return jsonb_build_object('voided_legs',0,'refunded_tickets',0);
  end if;

  with unavailable as (
    select p.id
    from public.players p
    join public.player_statuses ps
      on ps.gameweek_id=p_gameweek_id
     and ps.player_number::text=coalesce(nullif(ltrim(p.number,'0'),''),'0')
    where coalesce(lower(ps.status),'available') not in ('available','disponible')
      and (p_player_number is null or ps.player_number=p_player_number)
  ), changed as (
    update public.gazalbet_ticket_legs l
       set status='void', settled_at=now()
      from public.gazalbet_tickets t
     where t.id=l.ticket_id
       and t.gameweek_id=p_gameweek_id
       and t.status='pending'
       and l.status='pending'
       and l.leg_type='player_prop'
       and l.player_id in (select id from unavailable)
    returning l.ticket_id
  )
  select count(*) into v_voided_legs from changed;

  for v_ticket in
    select t.*
    from public.gazalbet_tickets t
    where t.gameweek_id=p_gameweek_id and t.status='pending'
      and exists (
        select 1 from public.gazalbet_ticket_legs l
        where l.ticket_id=t.id and l.status='void'
      )
    for update
  loop
    select count(*) filter(where status='pending'),
           count(*) filter(where status='void'),
           count(*),
           coalesce(exp(sum(ln(odds)) filter(where status<>'void')),1)
      into v_open,v_void,v_total,v_effective
    from public.gazalbet_ticket_legs where ticket_id=v_ticket.id;

    if v_void=v_total then
      update public.gazalbet_tickets
         set status='void', payout=stake, settled_at=now()
       where id=v_ticket.id;

      insert into public.gazalbet_ticket_settlements(ticket_id)
      values(v_ticket.id) on conflict do nothing returning true into v_credited;

      if coalesce(v_credited,false) then
        update public.gazalbet_wallets
           set balance=balance+v_ticket.stake, updated_at=now()
         where user_id=v_ticket.user_id;
        v_refunded_tickets:=v_refunded_tickets+1;
      end if;

      perform public.notification_enqueue_user(
        v_ticket.user_id,'gazalbet_void','gazalbet:void:'||v_ticket.id::text,
        'Apuesta anulada',
        'Te hemos devuelto '||trim(to_char(v_ticket.stake,'FM999999990.00'))||' fichas porque el jugador no está convocado.',
        '/porra','gazalbet-void-'||v_ticket.id::text,
        jsonb_build_object('ticketId',v_ticket.id,'gameweekId',p_gameweek_id,'refund',v_ticket.stake),now()
      );
    else
      update public.gazalbet_tickets
         set total_odds=round(least(v_effective,100),2)
       where id=v_ticket.id;
      perform public.notification_enqueue_user(
        v_ticket.user_id,'gazalbet_void','gazalbet:leg-void:'||v_ticket.id::text,
        'Selección anulada',
        'Una selección de tu combinada se ha anulado. El resto del boleto sigue en juego.',
        '/porra','gazalbet-leg-void-'||v_ticket.id::text,
        jsonb_build_object('ticketId',v_ticket.id,'gameweekId',p_gameweek_id),now()
      );
    end if;
  end loop;

  return jsonb_build_object('voided_legs',v_voided_legs,'refunded_tickets',v_refunded_tickets);
end;
$$;

create or replace function public.gazalbet_player_status_void_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(lower(new.status),'available') not in ('available','disponible')
     and (tg_op='INSERT' or old.status is distinct from new.status) then
    perform public.gazalbet_void_unavailable_ticket_legs(new.gameweek_id,new.player_number);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_gazalbet_player_status_void on public.player_statuses;
create trigger trg_gazalbet_player_status_void
after insert or update of status on public.player_statuses
for each row execute function public.gazalbet_player_status_void_trigger();

revoke all on function public.gazalbet_void_unavailable_ticket_legs(bigint,smallint) from public,anon,authenticated;
revoke all on function public.gazalbet_player_status_void_trigger() from public,anon,authenticated;

-- Reconcile bets whose availability changed before this trigger existed.
do $$
declare r record;
begin
  for r in select id from public.gameweeks where status='scheduled' and deadline>now() loop
    perform public.gazalbet_void_unavailable_ticket_legs(r.id,null);
  end loop;
end;
$$;
