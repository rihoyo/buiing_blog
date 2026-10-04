-- Run in Supabase SQL Editor after schema.sql. Private posts never enter GitHub.
begin;
create table if not exists public.owner_posts (
 id text primary key check (id ~ '^[a-zA-Z0-9_-]{1,160}$'),
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 post jsonb not null check (post->>'visibility' is not distinct from 'private' and post->>'id' is not distinct from id and octet_length(post::text) <= 900000),
 revision text not null,
 updated_at timestamptz not null default now()
);
alter table public.owner_posts enable row level security;
revoke all on public.owner_posts from public, anon, authenticated;
grant select, insert, update, delete on public.owner_posts to authenticated;
drop policy if exists owner_posts_access on public.owner_posts;
create policy owner_posts_access on public.owner_posts for all to authenticated
 using (owner_id = auth.uid() and private.is_admin())
 with check (owner_id = auth.uid() and private.is_admin());
create or replace function public.save_owner_post(p_post jsonb, p_expected_revision text default null)
returns text language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_revision text := p_post->>'revision'; v_id text := p_post->>'id'; v_count integer;
begin
 if auth.uid() is null or not private.is_admin() then raise exception 'FORBIDDEN'; end if;
 if p_post->>'visibility' is distinct from 'private' or v_id is null or v_revision is null
 or length(v_revision)>100 or coalesce(length(trim(p_post->>'title')),0) not between 1 and 160
 or jsonb_typeof(p_post->'blocks') is distinct from 'array' then raise exception 'INVALID_POST'; end if;
 if jsonb_array_length(p_post->'blocks') not between 1 and 300 then raise exception 'INVALID_POST'; end if;
 if p_expected_revision is null then
  begin
   insert into public.owner_posts(id,post,revision) values(v_id,p_post,v_revision);
  exception when unique_violation then raise exception 'EDIT_CONFLICT'; end;
 else
  update public.owner_posts set post=p_post,revision=v_revision,updated_at=now()
  where id=v_id and owner_id=auth.uid() and revision=p_expected_revision;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'EDIT_CONFLICT'; end if;
 end if;
 return v_revision;
end $$;
revoke all on function public.save_owner_post(jsonb,text) from public, anon;
grant execute on function public.save_owner_post(jsonb,text) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('blog-private-images','blog-private-images',false,10485760,array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists owner_private_images on storage.objects;
create policy owner_private_images on storage.objects for all to authenticated
 using (bucket_id='blog-private-images' and (storage.foldername(name))[1]=auth.uid()::text and private.is_admin())
 with check (bucket_id='blog-private-images' and (storage.foldername(name))[1]=auth.uid()::text and private.is_admin());
commit;
