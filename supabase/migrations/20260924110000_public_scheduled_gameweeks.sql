-- The public home only lists planned Fantasy rounds. Keep draft and completed
-- rounds under the existing authenticated policy.
create policy "Public can view scheduled gameweeks"
on public.gameweeks for select to anon
using (status = 'scheduled');
