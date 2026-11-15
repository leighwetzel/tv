-- Profile photos. Each person uploads one square JPEG to avatars/<their id>/avatar.jpg.
-- The bucket is public-read so photos load fast in the feed; paths are random ids, not names.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

drop policy if exists "avatars: see own" on storage.objects;
drop policy if exists "avatars: add own" on storage.objects;
drop policy if exists "avatars: replace own" on storage.objects;
drop policy if exists "avatars: remove own" on storage.objects;

create policy "avatars: see own" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars: add own" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars: replace own" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars: remove own" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
