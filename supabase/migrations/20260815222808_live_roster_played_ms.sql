-- Persist the Live Stats runtime minutes per roster player so a match can be
-- recovered accurately after local storage is lost or on another device.

alter table public.game_roster
  add column if not exists played_ms integer not null default 0
  check (played_ms >= 0);
