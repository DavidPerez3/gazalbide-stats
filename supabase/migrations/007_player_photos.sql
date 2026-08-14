-- Gazalbide Stats: optional player profile photos.
-- Photos are public content, but only the existing Gazalbide admin may write them.

alter table public.players
  add column if not exists photo_path text;

comment on column public.players.photo_path is
  'Optional path inside the public player-photos Storage bucket. Uploaded photos are normalised by the PWA to 512x512 WebP.';

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'player-photos',
  'player-photos',
  true,
  2097152,
  array['image/webp']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Publicly visible profile photos, consistent with the public stats site.
drop policy if exists "player_photos_public_read" on storage.objects;
create policy "player_photos_public_read"
  on storage.objects for select
  using (bucket_id = 'player-photos');

-- Reuse profiles.is_admin via is_gazal_admin(); no new role is introduced.
drop policy if exists "player_photos_admin_insert" on storage.objects;
create policy "player_photos_admin_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'player-photos'
    and public.is_gazal_admin()
  );

drop policy if exists "player_photos_admin_update" on storage.objects;
create policy "player_photos_admin_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'player-photos'
    and public.is_gazal_admin()
  )
  with check (
    bucket_id = 'player-photos'
    and public.is_gazal_admin()
  );

drop policy if exists "player_photos_admin_delete" on storage.objects;
create policy "player_photos_admin_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'player-photos'
    and public.is_gazal_admin()
  );
