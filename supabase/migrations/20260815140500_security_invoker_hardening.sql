-- Harden helper/view semantics without changing application authorization.

alter function public.is_gazal_admin()
  security invoker;

alter view public.player_foul_rankings
  set (security_invoker = true);
