create index if not exists live_match_control_claimed_by_idx
  on public.live_match_control(claimed_by);

drop policy if exists "player_discipline_adjustments_admin_write"
  on public.player_discipline_adjustments;

drop policy if exists "player_discipline_adjustments_admin_insert"
  on public.player_discipline_adjustments;
create policy "player_discipline_adjustments_admin_insert"
  on public.player_discipline_adjustments
  for insert to authenticated
  with check ((select public.is_gazal_admin()));

drop policy if exists "player_discipline_adjustments_admin_update"
  on public.player_discipline_adjustments;
create policy "player_discipline_adjustments_admin_update"
  on public.player_discipline_adjustments
  for update to authenticated
  using ((select public.is_gazal_admin()))
  with check ((select public.is_gazal_admin()));

drop policy if exists "player_discipline_adjustments_admin_delete"
  on public.player_discipline_adjustments;
create policy "player_discipline_adjustments_admin_delete"
  on public.player_discipline_adjustments
  for delete to authenticated
  using ((select public.is_gazal_admin()));
