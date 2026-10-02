-- After signing in once on the blog, replace the email below and run in SQL Editor.
-- Never expose this operation as a client RPC.
do $$
declare target uuid;
begin
 select id into target from auth.users where lower(email)=lower('YOUR_ADMIN_EMAIL@example.com') and email_confirmed_at is not null;
 if target is null then raise exception '해당 이메일로 블로그에서 먼저 인증 로그인을 완료하세요.'; end if;
 insert into private.admins(user_id)values(target)on conflict do nothing;
end $$;
