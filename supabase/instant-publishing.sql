-- SQL Editor: run once. Safe to run again. Existing posts stay in GitHub.
begin;
create table if not exists public.published_posts (
 id text primary key check (id ~ '^[a-zA-Z0-9_-]{1,160}$'),
 source_file text not null,
 post jsonb not null check (post->>'id' = id),
 updated_at timestamptz not null default now()
);
alter table public.published_posts enable row level security;
revoke all on public.published_posts from anon, authenticated;
grant select on public.published_posts to anon, authenticated;
grant insert, update on public.published_posts to authenticated;
drop policy if exists published_posts_read on public.published_posts;
create policy published_posts_read on public.published_posts
 for select to anon, authenticated using (true);
drop policy if exists published_posts_insert on public.published_posts;
create policy published_posts_insert on public.published_posts
 for insert to authenticated with check (private.is_admin());
drop policy if exists published_posts_update on public.published_posts;
create policy published_posts_update on public.published_posts
 for update to authenticated using (private.is_admin()) with check (private.is_admin());
-- Serialize updates per post, and never replace a newer revision with an older one.
create or replace function public.sync_published_post(p_post jsonb, p_file text)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
 if not private.is_admin() then raise exception 'FORBIDDEN'; end if;
 insert into public.published_posts(id, source_file, post, updated_at)
 values(p_post->>'id', p_file, p_post, (p_post->>'updatedAt')::timestamptz)
 on conflict(id) do update set source_file=excluded.source_file,
 post=excluded.post, updated_at=excluded.updated_at
 where public.published_posts.updated_at <= excluded.updated_at;
 return found;
end;
$$;
revoke all on function public.sync_published_post(jsonb,text) from public, anon;
grant execute on function public.sync_published_post(jsonb,text) to authenticated;
commit;
