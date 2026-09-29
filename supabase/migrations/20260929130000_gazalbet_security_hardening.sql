-- GazalBet follow-up after database advisor review.

revoke execute on function public.gazalbet_match_published_trigger() from public, anon, authenticated;
revoke execute on function public.settle_gazalbet_gameweek(bigint) from public, anon, authenticated;

create policy "GazalBet settlement markers admin read"
on public.gazalbet_wallet_settlements for select to authenticated
using (public.is_gazal_admin());

create index if not exists gazalbet_bets_market_idx on public.gazalbet_bets(market_id);
create index if not exists gazalbet_credit_grants_gameweek_idx on public.gazalbet_credit_grants(gameweek_id);
