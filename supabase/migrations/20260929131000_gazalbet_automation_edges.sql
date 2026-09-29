-- Complete automatic settlement for markets created after a match was published
-- and for gameweeks linked to an already-published match.

create policy "GazalBet ranking wallets visible"
on public.gazalbet_wallets for select to authenticated
using (true);

create or replace function public.gazalbet_market_insert_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if exists (
    select 1 from public.gameweeks gw
    join public.matches m on m.id=gw.match_id
    where gw.id=new.gameweek_id and m.status='published'
  ) then
    perform public.settle_gazalbet_gameweek(new.gameweek_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_gazalbet_market_insert on public.gazalbet_markets;
create trigger trg_gazalbet_market_insert after insert on public.gazalbet_markets
for each row execute function public.gazalbet_market_insert_trigger();

create or replace function public.gazalbet_gameweek_link_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.match_id is not null and new.match_id is distinct from old.match_id
     and exists(select 1 from public.matches where id=new.match_id and status='published') then
    perform public.settle_gazalbet_gameweek(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_gazalbet_gameweek_link on public.gameweeks;
create trigger trg_gazalbet_gameweek_link after update of match_id on public.gameweeks
for each row execute function public.gazalbet_gameweek_link_trigger();

revoke execute on function public.gazalbet_market_insert_trigger() from public, anon, authenticated;
revoke execute on function public.gazalbet_gameweek_link_trigger() from public, anon, authenticated;
