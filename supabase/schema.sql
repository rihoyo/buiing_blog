-- Run once in Supabase SQL Editor. Public signup uses verified email OTP.
begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.admins(user_id uuid primary key references auth.users(id) on delete cascade);
create table private.bans(user_id uuid primary key references auth.users(id) on delete cascade, reason text not null default '', created_at timestamptz not null default now());
create table private.settings(id boolean primary key default true check(id), blocked_words text[] not null default '{}', filter_mode text not null default 'reject' check(filter_mode in ('reject','mask')));
insert into private.settings(id) values(true);
create table private.audit(id bigint generated always as identity primary key, actor uuid, action text not null, target text, created_at timestamptz default now());
create table public.entries(
 id uuid primary key default gen_random_uuid(),
 author_id uuid not null references auth.users(id) on delete cascade,
 author_name text not null check(char_length(author_name) between 1 and 40),
 kind text not null check(kind in ('thread','comment')),
 title text not null default '' check(char_length(title)<=160),
 body text not null check(char_length(body) between 1 and 10000),
 blog_slug text,
 thread_id uuid references public.entries(id) on delete cascade,
 created_at timestamptz not null default now(),
 deleted_at timestamptz,
 check((kind='thread' and char_length(title)>0 and blog_slug is null and thread_id is null) or (kind='comment' and ((blog_slug is not null and thread_id is null) or (thread_id is not null and blog_slug is null))))
);
create index entries_blog on public.entries(blog_slug,created_at);
create index entries_thread on public.entries(thread_id,created_at);
create index entries_author on public.entries(author_id,created_at);
create index entries_feed on public.entries(kind,created_at desc);
alter table public.entries enable row level security;
revoke all on public.entries from anon,authenticated;
grant select on public.entries to anon,authenticated;
-- Private helper is never directly exposed via PostgREST.
create function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from private.admins where user_id=auth.uid())$$;
create function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$select private.is_admin()$$;
create policy entries_visible on public.entries for select using(deleted_at is null or private.is_admin());
-- Policy helper needs schema/function access; tables remain completely private.
grant usage on schema private to anon,authenticated;
revoke all on all tables in schema private from public,anon,authenticated;
grant execute on function private.is_admin() to anon,authenticated;
create function public.create_entry(p_kind text,p_title text,p_body text,p_blog_slug text default null,p_thread_id uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); result uuid; cfg private.settings%rowtype; word text; t text:=btrim(coalesce(p_title,'')); b text:=btrim(coalesce(p_body,'')); display_name text;
begin
 if uid is null then raise exception 'LOGIN_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 if exists(select 1 from private.bans where user_id=uid) then raise exception 'ACCOUNT_BANNED'; end if;
 if exists(select 1 from public.entries where author_id=uid and created_at>now()-interval '30 seconds') then raise exception 'RATE_LIMIT'; end if;
 if p_kind not in ('thread','comment') or p_kind is null then raise exception 'INVALID_CONTENT'; end if;
 if char_length(b) not between 1 and 10000 or char_length(t)>160 or (p_kind='thread' and char_length(t)<1) then raise exception 'INVALID_CONTENT'; end if;
 if p_blog_slug is not null and p_blog_slug !~ '^[a-zA-Z0-9_-]{1,160}$' then raise exception 'INVALID_CONTENT'; end if;
 if p_thread_id is not null then
  perform 1 from public.entries where id=p_thread_id and kind='thread' and deleted_at is null for update;
  if not found then raise exception 'THREAD_NOT_FOUND'; end if;
 end if;
 select * into cfg from private.settings where id=true;
 foreach word in array cfg.blocked_words loop
  if strpos(lower(t),lower(word))>0 or strpos(lower(b),lower(word))>0 then
   if cfg.filter_mode='reject' then raise exception 'BLOCKED_WORD'; end if;
   -- Treat words as literal strings; no regular expression injection.
   while strpos(lower(t),lower(word))>0 loop t:=overlay(t placing repeat('＊',char_length(word)) from strpos(lower(t),lower(word)) for char_length(word)); end loop;
   while strpos(lower(b),lower(word))>0 loop b:=overlay(b placing repeat('＊',char_length(word)) from strpos(lower(b),lower(word)) for char_length(word)); end loop;
  end if;
 end loop;
 select left(coalesce(nullif(btrim(raw_user_meta_data->>'display_name'),''),'방문자'),40) into display_name from auth.users where id=uid and email_confirmed_at is not null;
 if display_name is null then raise exception 'VERIFIED_EMAIL_REQUIRED'; end if;
 insert into public.entries(author_id,author_name,kind,title,body,blog_slug,thread_id) values(uid,display_name,p_kind,t,b,p_blog_slug,p_thread_id) returning id into result;
 return result;
end $$;
create function public.delete_entry(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'LOGIN_REQUIRED'; end if;
 if not exists(select 1 from public.entries where id=p_id and (author_id=auth.uid() or private.is_admin())) then raise exception 'FORBIDDEN'; end if;
 perform 1 from public.entries where id=p_id for update;
 update public.entries set deleted_at=now() where id=p_id or thread_id=p_id;
 insert into private.audit(actor,action,target)values(auth.uid(),'delete_entry',p_id::text);
end $$;
create function public.admin_ban(p_user_id uuid,p_reason text default '',p_banned boolean default true) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'FORBIDDEN'; end if;
 if exists(select 1 from private.admins where user_id=p_user_id) then raise exception 'ADMIN_CANNOT_BE_BANNED'; end if;
 if char_length(p_reason)>500 then raise exception 'INVALID_CONTENT'; end if;
 if p_banned then insert into private.bans(user_id,reason)values(p_user_id,p_reason)on conflict(user_id)do update set reason=excluded.reason,created_at=now();
 else delete from private.bans where user_id=p_user_id;end if;
 insert into private.audit(actor,action,target)values(auth.uid(),case when p_banned then 'ban' else 'unban' end,p_user_id::text);
end $$;
create function public.admin_settings(p_words text[],p_mode text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'FORBIDDEN'; end if;
 if p_words is null or coalesce(array_length(p_words,1),0)>100 or p_mode not in ('reject','mask') or p_mode is null then raise exception 'INVALID_CONTENT'; end if;
 if exists(select 1 from unnest(p_words) w where w is null or char_length(btrim(w)) not between 1 and 40 or strpos(w,'＊')>0) then raise exception 'INVALID_WORD'; end if;
 update private.settings set blocked_words=array(select distinct btrim(w) from unnest(p_words) w),filter_mode=p_mode where id=true;
 insert into private.audit(actor,action,target)values(auth.uid(),'update_filter',p_mode);
end $$;
create function public.admin_state() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'FORBIDDEN'; end if;
 return jsonb_build_object('settings',(select to_jsonb(s) from private.settings s where id=true),'bans',coalesce((select jsonb_agg(to_jsonb(b)) from private.bans b),'[]'::jsonb),'audit',coalesce((select jsonb_agg(to_jsonb(a)) from (select * from private.audit order by created_at desc limit 30)a),'[]'::jsonb));
end $$;
revoke all on function public.is_admin(),public.create_entry(text,text,text,text,uuid),public.delete_entry(uuid),public.admin_ban(uuid,text,boolean),public.admin_settings(text[],text),public.admin_state() from public,anon,authenticated;
grant execute on function public.is_admin() to anon,authenticated;
grant execute on function public.create_entry(text,text,text,text,uuid),public.delete_entry(uuid),public.admin_ban(uuid,text,boolean),public.admin_settings(text[],text),public.admin_state() to authenticated;
commit;
