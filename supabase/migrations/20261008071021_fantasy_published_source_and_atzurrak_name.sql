-- Preserve the existing Fantasy stats_file contract while new Live matches use
-- Supabase as the source of truth. The frontend resolves live:<matchId> as a
-- virtual JSON file backed by player_match_stats.

create or replace function public.set_fantasy_live_stats_file()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.match_id is not null
     and exists (
       select 1 from public.matches m
       where m.id = new.match_id
         and coalesce(m.publication_version, 0) > 0
     ) then
    new.stats_file := 'live:' || new.match_id;
  end if;
  return new;
end;
$$;

drop trigger if exists gameweeks_live_stats_file on public.gameweeks;
create trigger gameweeks_live_stats_file
before insert or update of match_id on public.gameweeks
for each row execute function public.set_fantasy_live_stats_file();

update public.gameweeks gw
set stats_file = 'live:' || gw.match_id
where gw.match_id is not null
  and exists (
    select 1 from public.matches m
    where m.id = gw.match_id
      and coalesce(m.publication_version, 0) > 0
  );

-- Canonical display name; immutable IDs and scoring data stay intact.
update public.matches set opponent = 'Atzurrak Sugoiak'
where lower(trim(opponent)) in ('atzurra', 'atzurra sugoiak', 'atzurrak sugoiak');
update public.gameweeks set opponent = 'Atzurrak Sugoiak'
where lower(trim(opponent)) in ('atzurra', 'atzurra sugoiak', 'atzurrak sugoiak');
