-- Run after community-upgrade.sql. Repeatable; preserves existing content.
begin;
alter table public.entries add column if not exists edited_at timestamptz;
create or replace function public.edit_entry(p_id uuid,p_title text,p_body text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); record public.entries%rowtype; is_owner boolean; changed boolean; title_value text:=btrim(coalesce(p_title,'')); body_value text:=btrim(coalesce(p_body,''));
begin
 if uid is null then raise exception 'LOGIN_REQUIRED';end if;
 is_owner:=private.is_admin();
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 if exists(select 1 from private.bans where user_id=uid) and not is_owner then raise exception 'ACCOUNT_BANNED';end if;
 select * into record from public.entries where id=p_id and deleted_at is null for update;
 if not found or (record.author_id<>uid and not is_owner) then raise exception 'FORBIDDEN';end if;
 if char_length(body_value) not between 1 and 10000 or char_length(title_value)>160 or (record.kind='thread' and char_length(title_value)<1) then raise exception 'INVALID_CONTENT';end if;
 if record.kind='comment' then title_value:='';end if;
 if record.thread_id is not null and not private.approved_thread(record.thread_id) then raise exception 'THREAD_NOT_FOUND';end if;
 changed:=record.title is distinct from title_value or record.body is distinct from body_value;
 if changed then
  if (select count(*) from private.community_activity where actor_id=uid and action='member_edit' and created_at>now()-interval '1 minute')>=10 then raise exception 'RATE_LIMIT';end if;
  perform private.check_community_words(record.author_name||E'\n'||title_value||E'\n'||body_value);
  update public.entries set title=title_value,body=body_value,edited_at=clock_timestamp(),moderation_status=case when record.kind='thread' and not is_owner then 'pending' else moderation_status end where id=p_id returning * into record;
  insert into private.community_activity(actor_id,author_name,action,target,scope) values(uid,record.author_name,'member_edit',p_id::text,record.kind);
  delete from private.community_activity where created_at<now()-interval '90 days';
 end if;
 return jsonb_build_object('changed',changed,'pending',record.kind='thread' and record.moderation_status='pending','edited_at',record.edited_at);
end $$;
revoke all on function public.edit_entry(uuid,text,text) from public,anon,authenticated;
grant execute on function public.edit_entry(uuid,text,text) to authenticated;
commit;
