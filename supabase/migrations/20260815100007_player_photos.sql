-- Gazalbide Stats: optional player profile photos.

alter table public.players add column if not exists photo_path text;

comment on column public.players.photo_path is
  'Optional profile photo reference. Legacy /images paths are supported; new uploads live in the public player-photos Storage bucket as 512x512 WebP.';

update public.players p
set photo_path =
  '/images/players/' ||
  case when trim(p.number) in ('0', '00') then '00' else lpad(trim(p.number), 2, '0') end || '_' ||
  regexp_replace(trim(p.name), '\s+', '_', 'g') || '.png'
where p.photo_path is null
  and exists (
    select 1 from public.season_players sp
    where sp.player_id = p.id and sp.season_id = '2025-2026'
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('player-photos', 'player-photos', true, 2097152, array['image/webp']::text[])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "player_photos_public_read" on storage.objects;
create policy "player_photos_public_read"
  on storage.objects for select using (bucket_id = 'player-photos');

drop policy if exists "player_photos_admin_insert" on storage.objects;
create policy "player_photos_admin_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'player-photos' and public.is_gazal_admin());

drop policy if exists "player_photos_admin_update" on storage.objects;
create policy "player_photos_admin_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'player-photos' and public.is_gazal_admin())
  with check (bucket_id = 'player-photos' and public.is_gazal_admin());

drop policy if exists "player_photos_admin_delete" on storage.objects;
create policy "player_photos_admin_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'player-photos' and public.is_gazal_admin());
