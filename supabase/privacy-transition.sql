-- Run after private-posts.sql and instant-publishing.sql. Repeatable migration.
begin;
create or replace function public.stage_public_to_private(p_post jsonb,p_file text)
returns text language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_id text := p_post->>'id'; v_revision text := p_post->>'revision'; v_existing public.owner_posts%rowtype; v_private jsonb;
begin
 if auth.uid() is null or not private.is_admin() then raise exception 'FORBIDDEN'; end if;
 if p_file is null or p_file !~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,159}\.json$' then raise exception 'INVALID_FILE'; end if;
 v_private := p_post || jsonb_build_object('visibility','private','publicSourceFile',p_file,'publicRemovalPending',true);
 select * into v_existing from public.owner_posts where id=v_id for update;
 if found then
  if v_existing.revision is distinct from v_revision or v_existing.post->>'publicSourceFile' is distinct from p_file then raise exception 'EDIT_CONFLICT'; end if;
 else
  perform public.save_owner_post(v_private,null);
 end if;
 insert into public.published_posts(id,source_file,post,updated_at)
 values(v_id,p_file,jsonb_build_object('id',v_id,'visibility','withdrawn','updatedAt',now()),now())
 on conflict(id) do update set post=excluded.post,updated_at=excluded.updated_at,source_file=excluded.source_file;
 return v_revision;
end $$;
create or replace function public.finish_owner_transition(p_id text,p_revision text)
returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
begin
 if auth.uid() is null or not private.is_admin() then raise exception 'FORBIDDEN'; end if;
 update public.owner_posts set post=jsonb_set(post,'{publicRemovalPending}','false'::jsonb),updated_at=now()
 where id=p_id and owner_id=auth.uid() and revision=p_revision;
 return found;
end $$;
revoke all on function public.stage_public_to_private(jsonb,text),public.finish_owner_transition(text,text) from public,anon;
grant execute on function public.stage_public_to_private(jsonb,text),public.finish_owner_transition(text,text) to authenticated;
-- A stale public publisher cannot restore the live snapshot after withdrawal.
create or replace function public.guard_withdrawn_post() returns trigger language plpgsql set search_path='' as $$
begin
 if new.post->>'visibility'='private' or (new.post->>'visibility'='withdrawn' and new.post - array['id','visibility','updatedAt','date'] <> '{}'::jsonb) then raise exception 'PRIVATE_DATA_IN_PUBLIC_STORE'; end if;
 if TG_OP='UPDATE' and old.post->>'visibility'='withdrawn' and new.post->>'visibility' is distinct from 'withdrawn' then raise exception 'POST_PRIVATE'; end if;
 return new;
end $$;
drop trigger if exists guard_withdrawn_post on public.published_posts;
create trigger guard_withdrawn_post before insert or update on public.published_posts for each row execute function public.guard_withdrawn_post();
commit;
