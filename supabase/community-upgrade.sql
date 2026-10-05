-- Run AFTER guest-community.sql. Repeatable; existing approved threads remain approved.
begin;
alter table public.entries add column if not exists moderation_status text not null default 'approved' check(moderation_status in ('pending','approved','rejected'));
alter table public.guest_entries add column if not exists edited_at timestamptz;
create table if not exists private.community_activity(id bigint generated always as identity primary key,actor_id uuid,actor_key text,author_name text,action text not null,target text,scope text,created_at timestamptz not null default now());
alter table private.community_activity enable row level security;
revoke all on private.community_activity from public,anon,authenticated;
create index if not exists community_activity_time on private.community_activity(created_at desc,id desc);
create or replace function private.check_community_words(p_text text) returns void
language plpgsql security definer set search_path='' as $$
declare word text;
begin
 for word in select unnest(blocked_words) from private.settings where id=true loop
  if char_length(word)>0 and strpos(lower(coalesce(p_text,'')),lower(word))>0 then raise exception 'BLOCKED_WORD'; end if;
 end loop;
end $$;
revoke all on function private.check_community_words(text) from public,anon,authenticated;
create or replace function private.community_entry_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='INSERT' or new.author_name is distinct from old.author_name or new.body is distinct from old.body or new.title is distinct from old.title then
  perform private.check_community_words(new.author_name||E'\n'||new.title||E'\n'||new.body);
 end if;
 if TG_OP='INSERT' then
  if new.kind='thread' then new.moderation_status:=case when private.is_admin() then 'approved' else 'pending' end;
  elsif new.thread_id is not null and not exists(select 1 from public.entries where id=new.thread_id and kind='thread' and deleted_at is null and moderation_status='approved') then raise exception 'THREAD_NOT_FOUND'; end if;
 end if;
 return new;
end $$;
drop trigger if exists community_entry_guard on public.entries;
create trigger community_entry_guard before insert or update on public.entries for each row execute function private.community_entry_guard();
create or replace function private.community_guest_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.scope='thread' and not private.approved_thread(new.thread_id) then raise exception 'THREAD_NOT_FOUND';end if;
 if TG_OP='INSERT' or new.author_name is distinct from old.author_name or new.body is distinct from old.body then perform private.check_community_words(new.author_name||E'\n'||new.body);end if;
 return new;
end $$;
drop trigger if exists community_guest_guard on public.guest_entries;
create trigger community_guest_guard before insert or update on public.guest_entries for each row execute function private.community_guest_guard();
-- Use a security-definer helper for parent visibility to prevent recursive RLS evaluation.
create or replace function private.approved_thread(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.entries where id=p_id and kind='thread' and moderation_status='approved' and deleted_at is null)$$;
revoke all on function private.approved_thread(uuid) from public;
grant execute on function private.approved_thread(uuid) to anon,authenticated;
drop policy if exists entries_visible on public.entries;
create policy entries_visible on public.entries for select to anon,authenticated using(private.is_admin() or (deleted_at is null and (author_id=auth.uid() or (kind='thread' and moderation_status='approved') or (kind='comment' and (thread_id is null or private.approved_thread(thread_id))))));
create or replace function private.guest_context_visible(p_scope text,p_slug text,p_thread uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
 if p_scope='comment' then
  if to_regclass('public.published_posts') is not null then if exists(select 1 from public.published_posts where id=p_slug and post->>'visibility'='withdrawn') then return false; end if;end if;
  if to_regclass('public.owner_posts') is not null then if exists(select 1 from public.owner_posts where id=p_slug) then return false; end if;end if;
 elsif p_scope='thread' then return private.approved_thread(p_thread);end if;
 return true;
end $$;
create or replace function private.community_activity_trigger() returns trigger
language plpgsql security definer set search_path='' as $$
declare action_name text; actor_key_value text;
begin
 if TG_TABLE_NAME='entries' then
  action_name:=case when TG_OP='INSERT' then case when new.kind='thread' then 'thread_submit' else 'member_comment' end when new.moderation_status is distinct from old.moderation_status then 'thread_'||new.moderation_status when new.deleted_at is distinct from old.deleted_at then 'member_delete' else null end;
  if action_name is not null then insert into private.community_activity(actor_id,author_name,action,target,scope) values(auth.uid(),new.author_name,action_name,new.id::text,new.kind);end if;
 else
  if TG_OP='INSERT' then insert into private.community_activity(author_name,action,target,scope) values(new.author_name,'guest_create',new.id::text,new.scope);end if;
 end if;
 delete from private.community_activity where created_at<now()-interval '90 days';
 return new;
end $$;
drop trigger if exists community_entry_activity on public.entries;
create trigger community_entry_activity after insert or update on public.entries for each row execute function private.community_activity_trigger();
drop trigger if exists community_guest_activity on public.guest_entries;
create trigger community_guest_activity after insert on public.guest_entries for each row execute function private.community_activity_trigger();
create or replace function private.community_vote_activity() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 delete from private.community_activity where created_at<now()-interval '90 days';
 insert into private.community_activity(actor_key,author_name,action,target,scope)
 select new.actor_hash,author_name,'recommend',id::text,scope from public.guest_entries where id=new.entry_id;
 return new;
end $$;
drop trigger if exists community_vote_activity on private.guest_votes;
create trigger community_vote_activity after insert on private.guest_votes for each row execute function private.community_vote_activity();
create or replace function public.secure_guest_activity(p_id uuid,p_action text,p_actor text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_actor is null or p_actor !~ '^[a-f0-9]{64}$' or p_action not in ('password_rejected','edit','delete','admin_delete') or p_action is null then raise exception 'INVALID_CONTENT';end if;
 delete from private.community_activity where created_at<now()-interval '90 days';
 insert into private.community_activity(actor_key,author_name,action,target,scope) select p_actor,author_name,p_action,id::text,scope from public.guest_entries where id=p_id;
end $$;
create or replace function public.secure_guest_edit(p_id uuid,p_hash text,p_body text,p_actor text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if p_actor is null or p_actor !~ '^[a-f0-9]{64}$' or char_length(btrim(p_body)) not between 1 and 10000 or p_body is null then raise exception 'INVALID_CONTENT';end if;
 if exists(select 1 from private.guest_bans where actor_hash=p_actor) then raise exception 'ACCOUNT_BANNED';end if;
 perform 1 from public.guest_entries where id=p_id and deleted_at is null and private.guest_context_visible(scope,blog_slug,thread_id) for update;
 if not found then raise exception 'ENTRY_NOT_FOUND';end if;
 if not exists(select 1 from private.guest_credentials where entry_id=p_id and password_hash=p_hash) then return false;end if;
 perform private.check_community_words(p_body);
 update public.guest_entries set body=btrim(p_body),edited_at=clock_timestamp() where id=p_id and body is distinct from btrim(p_body);
 if found then perform public.secure_guest_activity(p_id,'edit',p_actor);end if;
 return true;
end $$;
create or replace function public.admin_moderate_thread(p_id uuid,p_approved boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'FORBIDDEN';end if;
 if p_approved is null then raise exception 'INVALID_CONTENT';end if;
 perform 1 from public.entries where id=p_id and kind='thread' and deleted_at is null for update;
 if not found then raise exception 'THREAD_NOT_FOUND';end if;
 if p_approved then perform private.check_community_words((select author_name||E'\n'||title||E'\n'||body from public.entries where id=p_id));end if;
 update public.entries set moderation_status=case when p_approved then 'approved' else 'rejected' end where id=p_id;
end $$;
create or replace function public.admin_community_dashboard(p_before bigint default null,p_actor text default null,p_action text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.is_admin() then raise exception 'FORBIDDEN';end if;
 select jsonb_build_object('stats',jsonb_build_object('threads',(select count(*) from public.entries where kind='thread' and deleted_at is null and moderation_status='approved'),'pending',(select count(*) from public.entries where kind='thread' and deleted_at is null and moderation_status='pending'),'guestbook',(select count(*) from public.guest_entries where scope='guestbook' and deleted_at is null),'comments',(select count(*) from public.guest_entries where scope<>'guestbook' and deleted_at is null),'recommendations',(select coalesce(sum(likes),0) from public.guest_entries where deleted_at is null),'members',(select count(distinct author_id) from public.entries),'today',(select count(*) from private.community_activity where created_at>=date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')),'pending',coalesce((select jsonb_agg(to_jsonb(e)) from (select * from public.entries where kind='thread' and moderation_status='pending' and deleted_at is null order by created_at limit 100)e),'[]'::jsonb),'activity',coalesce((select jsonb_agg(to_jsonb(a)) from (select a.*,coalesce(a.actor_key,c.actor_hash) as network_key from private.community_activity a left join private.guest_credentials c on c.entry_id::text=a.target where a.created_at>=now()-interval '90 days' and (p_before is null or a.id<p_before) and (p_actor is null or a.actor_id::text=p_actor or a.actor_key=p_actor or c.actor_hash=p_actor) and (p_action is null or a.action=p_action) order by a.id desc limit 50)a),'[]'::jsonb)) into result;
 return result;
end $$;
-- Literal blocked words also apply to newly saved public/private blog JSON.
create or replace function private.blog_words_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.post->>'visibility' is distinct from 'withdrawn' then perform private.check_community_words(coalesce(new.post->>'title','')||E'\n'||coalesce(new.post->>'excerpt','')||E'\n'||coalesce(new.post->>'blocks','')||E'\n'||coalesce(new.post->>'tags',''));end if;
 return new;
end $$;
do $$ begin
 if to_regclass('public.published_posts') is not null then execute 'drop trigger if exists blog_words_guard on public.published_posts';execute 'create trigger blog_words_guard before insert or update on public.published_posts for each row execute function private.blog_words_guard()';end if;
 if to_regclass('public.owner_posts') is not null then execute 'drop trigger if exists blog_words_guard on public.owner_posts';execute 'create trigger blog_words_guard before insert or update on public.owner_posts for each row execute function private.blog_words_guard()';end if;
end $$;
revoke all on function public.secure_guest_activity(uuid,text,text),public.secure_guest_edit(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.secure_guest_activity(uuid,text,text),public.secure_guest_edit(uuid,text,text,text) to service_role;
revoke all on function public.admin_moderate_thread(uuid,boolean),public.admin_community_dashboard(bigint,text,text) from public,anon,authenticated;
grant execute on function public.admin_moderate_thread(uuid,boolean),public.admin_community_dashboard(bigint,text,text) to authenticated;
create or replace function public.validate_blog_words(p_post jsonb) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'FORBIDDEN';end if;
 perform private.check_community_words(coalesce(p_post->>'title','')||E'\n'||coalesce(p_post->>'excerpt','')||E'\n'||coalesce(p_post->>'blocks','')||E'\n'||coalesce(p_post->>'tags',''));
 return true;
end $$;
revoke all on function public.validate_blog_words(jsonb) from public,anon,authenticated;
grant execute on function public.validate_blog_words(jsonb) to authenticated;
commit;
