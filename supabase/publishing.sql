-- Run once after schema.sql. Safe to run again. No token belongs in this SQL.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('blog-images','blog-images',true,10485760,array['image/png','image/jpeg','image/webp','image/gif'])
on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists blog_images_owner_insert on storage.objects;
create policy blog_images_owner_insert on storage.objects for insert to authenticated
with check(bucket_id='blog-images' and private.is_admin());
-- Public URLs serve published images. Browser upload is restricted to admins.
commit;
