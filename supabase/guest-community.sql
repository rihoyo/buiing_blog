-- SQL Editor: run after schema.sql. Repeatable. Anonymous users can only READ.
begin;
create table if not exists public.guest_entries (
 id uuid primary key default gen_random_uuid(),
 scope text not null check(scope in ('comment','guestbook','thread')),
 blog_slug text check(blog_slug ~ '^[a-zA-Z0-9_-]{1,160}$'),
 thread_id uuid references public.entries(id) on delete cascade,
 root_id uuid not null references public.guest_entries(id) on delete cascade,
 parent_id uuid references public.guest_entries(id) on delete cascade,
 reply_to_name text,
 author_name text not null check(char_length(author_name) between 1 and 40),
 body text not null check(char_length(body) between 1 and 10000),
 likes integer not null default 0 check(likes>=0),
 created_at timestamptz not null default now(),deleted_at timestamptz,
 check((scope='comment' and blog_slug is not null and thread_id is null) or (scope='guestbook' and blog_slug is null and thread_id is null) or (scope='thread' and blog_slug is null and thread_id is not null))
);
create index if not exists guest_entries_context on public.guest_entries(scope,blog_slug,thread_id,created_at desc);
create index if not exists guest_entries_root on public.guest_entries(root_id,created_at);
alter table public.guest_entries enable row level security;
revoke all on public.guest_entries from public,anon,authenticated;
grant select on public.guest_entries to anon,authenticated;
drop policy if exists guest_entries_read on public.guest_entries;
create or replace function private.guest_context_visible(p_scope text,p_slug text,p_thread uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
 if p_scope='comment' then
  if to_regclass('public.published_posts') is not null then
   if exists(select 1 from public.published_posts where id=p_slug and post->>'visibility'='withdrawn') then return false; end if;
  end if;
  if to_regclass('public.owner_posts') is not null then
   if exists(select 1 from public.owner_posts where id=p_slug) then return false; end if;
  end if;
 elsif p_scope='thread' then
  return exists(select 1 from public.entries where id=p_thread and kind='thread' and deleted_at is null);
 end if;
 return true;
end $$;
revoke all on function private.guest_context_visible(text,text,uuid) from public;
grant execute on function private.guest_context_visible(text,text,uuid) to anon,authenticated;
create policy guest_entries_read on public.guest_entries for select to anon,authenticated using(deleted_at is null and private.guest_context_visible(scope,blog_slug,thread_id));
create table if not exists private.guest_credentials(entry_id uuid primary key references public.guest_entries(id) on delete cascade,salt text not null,password_hash text not null,actor_hash text not null);
create table if not exists private.guest_votes(entry_id uuid not null references public.guest_entries(id) on delete cascade,actor_hash text not null,primary key(entry_id,actor_hash));
create table if not exists private.guest_bans(actor_hash text primary key,created_at timestamptz not null default now());
create table if not exists private.guest_budgets(actor_hash text,action text,window_start timestamptz,count integer not null,primary key(actor_hash,action,window_start));
revoke all on private.guest_credentials,private.guest_votes,private.guest_bans,private.guest_budgets from public,anon,authenticated;
create or replace function public.secure_guest_budget(p_actor text,p_action text) returns boolean
language plpgsql security definer set search_path='' as $$
declare n integer; allowed boolean:=true; slot timestamptz;
begin
 if p_actor is null or p_actor !~ '^[a-f0-9]{64}$' or p_action not in ('create','delete','vote','admin') or p_action is null then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended('guest-budget',0));
 delete from private.guest_budgets where window_start<now()-interval '2 hours';
 insert into private.guest_budgets values('global','minute',date_trunc('minute',now()),1)
 on conflict(actor_hash,action,window_start) do update set count=private.guest_budgets.count+1 returning count into n;
 if n>120 then allowed:=false; end if;
 slot:=case when p_action='delete' then to_timestamp(floor(extract(epoch from now())/600)*600) else date_trunc('hour',now()) end;
 insert into private.guest_budgets values(p_actor,p_action,slot,1)
 on conflict(actor_hash,action,window_start) do update set count=private.guest_budgets.count+1 returning count into n;
 if n>(case p_action when 'create' then 20 when 'delete' then 5 when 'vote' then 60 else 120 end) then allowed:=false; end if;
 if p_action='create' then
  insert into private.guest_budgets values('global','create-hour',date_trunc('hour',now()),1)
  on conflict(actor_hash,action,window_start) do update set count=private.guest_budgets.count+1 returning count into n;
  if n>240 then allowed:=false; end if;
  if exists(select 1 from private.guest_budgets where actor_hash=p_actor and action='create-last' and window_start>now()-interval '30 seconds') then allowed:=false; end if;
  if allowed then insert into private.guest_budgets values(p_actor,'create-last',now(),1); end if;
 end if;
 return allowed;
end $$;
create or replace function public.secure_guest_create(p_scope text,p_slug text,p_thread uuid,p_parent uuid,p_name text,p_body text,p_salt text,p_hash text,p_actor text) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid:=gen_random_uuid(); root uuid:=result; parent public.guest_entries%rowtype; cfg private.settings%rowtype; word text; nickname text:=btrim(p_name); body text:=btrim(p_body);
begin
 if nickname is null or body is null or char_length(nickname) not between 1 and 40 or char_length(body) not between 1 and 10000
 or p_actor is null or p_actor !~ '^[a-f0-9]{64}$' or p_salt is null or p_salt !~ '^[a-f0-9]{32}$' or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_CONTENT'; end if;
 if p_scope not in ('comment','guestbook','thread') or p_scope is null then raise exception 'INVALID_CONTENT'; end if;
 if exists(select 1 from private.guest_bans where actor_hash=p_actor) then raise exception 'ACCOUNT_BANNED'; end if;
 if p_scope='comment' then
  if p_slug is null or p_slug !~ '^[a-zA-Z0-9_-]{1,160}$' or p_thread is not null then raise exception 'INVALID_CONTENT'; end if;
  if to_regclass('public.published_posts') is not null then
   if exists(select 1 from public.published_posts where id=p_slug and post->>'visibility'='withdrawn') then raise exception 'POST_PRIVATE'; end if;
  end if;
  if to_regclass('public.owner_posts') is not null then
   if exists(select 1 from public.owner_posts where id=p_slug) then raise exception 'POST_PRIVATE'; end if;
  end if;
 elsif p_scope='thread' then
  if p_thread is null or p_slug is not null then raise exception 'INVALID_CONTENT'; end if;
  perform 1 from public.entries where id=p_thread and kind='thread' and deleted_at is null for update;
  if not found then raise exception 'THREAD_NOT_FOUND'; end if;
 elsif p_slug is not null or p_thread is not null then raise exception 'INVALID_CONTENT'; end if;
 if p_parent is not null then
  select * into parent from public.guest_entries where id=p_parent and deleted_at is null for update;
  if not found or parent.scope<>p_scope or parent.blog_slug is distinct from p_slug or parent.thread_id is distinct from p_thread then raise exception 'INVALID_PARENT'; end if;
  perform 1 from public.guest_entries where id=parent.root_id and deleted_at is null for update;
  if not found then raise exception 'INVALID_PARENT'; end if;
  root:=parent.root_id;
 end if;
 select * into cfg from private.settings where id=true;
 foreach word in array cfg.blocked_words loop
  if strpos(lower(nickname),lower(word))>0 or strpos(lower(body),lower(word))>0 then
   if cfg.filter_mode='reject' then raise exception 'BLOCKED_WORD'; end if;
   while strpos(lower(nickname),lower(word))>0 loop nickname:=overlay(nickname placing repeat('＊',char_length(word)) from strpos(lower(nickname),lower(word)) for char_length(word)); end loop;
   while strpos(lower(body),lower(word))>0 loop body:=overlay(body placing repeat('＊',char_length(word)) from strpos(lower(body),lower(word)) for char_length(word)); end loop;
  end if;
 end loop;
 insert into public.guest_entries(id,scope,blog_slug,thread_id,root_id,parent_id,reply_to_name,author_name,body)
 values(result,p_scope,p_slug,p_thread,root,case when p_parent is null then null else root end,case when p_parent is null then null else parent.author_name end,nickname,body);
 insert into private.guest_credentials values(result,p_salt,p_hash,p_actor);
 return result;
end $$;
create or replace function public.secure_guest_secret(p_id uuid) returns jsonb
language sql security definer set search_path='' as $$select jsonb_build_object('salt',salt,'hash',password_hash) from private.guest_credentials c join public.guest_entries e on e.id=c.entry_id where c.entry_id=p_id and e.deleted_at is null$$;
create or replace function public.secure_guest_delete(p_id uuid,p_hash text,p_admin boolean default false) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.guest_entries where id=p_id and deleted_at is null for update;
 if not found then return false; end if;
 if p_admin is not true and not exists(select 1 from private.guest_credentials where entry_id=p_id and password_hash=p_hash) then return false; end if;
 update public.guest_entries set deleted_at=now() where id=p_id or (root_id=p_id);
 return true;
end $$;
create or replace function public.secure_guest_vote(p_id uuid,p_actor text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare added boolean; n integer;
begin
 if p_actor is null or p_actor !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_CONTENT'; end if;
 if exists(select 1 from private.guest_bans where actor_hash=p_actor) then raise exception 'ACCOUNT_BANNED'; end if;
 perform 1 from public.guest_entries where id=p_id and deleted_at is null and private.guest_context_visible(scope,blog_slug,thread_id) for update;
 if not found then raise exception 'ENTRY_NOT_FOUND'; end if;
 insert into private.guest_votes values(p_id,p_actor) on conflict do nothing;added:=found;
 if added then update public.guest_entries set likes=likes+1 where id=p_id; end if;
 select likes into n from public.guest_entries where id=p_id;
 return jsonb_build_object('likes',n,'already',not added);
end $$;
create or replace function public.secure_guest_ban(p_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 insert into private.guest_bans(actor_hash) select actor_hash from private.guest_credentials where entry_id=p_id on conflict do nothing;
 return found;
end $$;
create or replace function public.secure_guest_unban(p_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 delete from private.guest_bans where actor_hash=(select actor_hash from private.guest_credentials where entry_id=p_id);
 return found;
end $$;
revoke all on function public.secure_guest_budget(text,text),public.secure_guest_create(text,text,uuid,uuid,text,text,text,text,text),public.secure_guest_secret(uuid),public.secure_guest_delete(uuid,text,boolean),public.secure_guest_vote(uuid,text),public.secure_guest_ban(uuid),public.secure_guest_unban(uuid) from public,anon,authenticated;
grant execute on function public.secure_guest_budget(text,text),public.secure_guest_create(text,text,uuid,uuid,text,text,text,text,text),public.secure_guest_secret(uuid),public.secure_guest_delete(uuid,text,boolean),public.secure_guest_vote(uuid,text),public.secure_guest_ban(uuid),public.secure_guest_unban(uuid) to service_role;
commit;
