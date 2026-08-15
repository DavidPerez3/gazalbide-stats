-- Gazalbide Stats: managed staff records and optional profile photos from the PWA.
-- DML is granted to authenticated users, while existing RLS policies continue to
-- restrict mutations to Gazalbide admins only.

grant insert, update, delete on public.staff_members to authenticated;
grant insert, update, delete on public.season_staff to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('staff-photos', 'staff-photos', true, 2097152, array['image/webp']::text[])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "staff_photos_public_read" on storage.objects;
create policy "staff_photos_public_read"
  on storage.objects for select using (bucket_id = 'staff-photos');

drop policy if exists "staff_photos_admin_insert" on storage.objects;
create policy "staff_photos_admin_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'staff-photos' and public.is_gazal_admin());

drop policy if exists "staff_photos_admin_update" on storage.objects;
create policy "staff_photos_admin_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'staff-photos' and public.is_gazal_admin())
  with check (bucket_id = 'staff-photos' and public.is_gazal_admin());

drop policy if exists "staff_photos_admin_delete" on storage.objects;
create policy "staff_photos_admin_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'staff-photos' and public.is_gazal_admin());

comment on column public.staff_members.photo_path is
  'Optional staff profile photo. Legacy /images/coaches paths are supported; new uploads live in the public staff-photos bucket as 512x512 WebP.';
