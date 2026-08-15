-- Keep the atomic trait-assignment RPC exposed to authenticated admins without
-- elevating it above the caller. RLS remains the authority for table writes.

grant insert, delete on public.fantasy_player_traits to authenticated;
grant insert, delete on public.fantasy_staff_traits to authenticated;

alter function public.replace_fantasy_trait_assignments(text, jsonb, jsonb)
  security invoker;
