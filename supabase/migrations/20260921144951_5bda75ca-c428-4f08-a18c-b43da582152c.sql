alter table public.brand_kits drop column if exists anon_token;

drop policy if exists "Authenticated users can upload brand assets" on storage.objects;

create policy "Users upload into their own kit folders"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'brand-assets'
  and exists (
    select 1 from public.brand_kits k
    where k.id::text = (storage.foldername(name))[1]
      and k.user_id = auth.uid()
  )
);

drop policy if exists "Users can update own brand assets" on storage.objects;
create policy "Users update their own kit files"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'brand-assets'
  and exists (
    select 1 from public.brand_kits k
    where k.id::text = (storage.foldername(name))[1]
      and k.user_id = auth.uid()
  )
);

drop policy if exists "Users can delete own brand assets" on storage.objects;
create policy "Users delete their own kit files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'brand-assets'
  and exists (
    select 1 from public.brand_kits k
    where k.id::text = (storage.foldername(name))[1]
      and k.user_id = auth.uid()
  )
);