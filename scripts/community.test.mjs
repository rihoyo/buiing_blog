import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const ADMIN='00000000-0000-4000-8000-000000000001',ALICE='00000000-0000-4000-8000-000000000002',BOB='00000000-0000-4000-8000-000000000003';
test('Database enforces auth, ownership, bans, rate limits and filtering',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
 await db.exec(await readFile('supabase/schema.sql','utf8'));
 await db.query(`insert into auth.users values($1,now(),'{"display_name":"Admin"}'),($2,now(),'{"display_name":"Alice"}'),($3,now(),'{"display_name":"Bob"}')`,[ADMIN,ALICE,BOB]);
 await db.query('insert into private.admins values($1)',[ADMIN]);
 const as=async(uid,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid||'']);await db.exec(`set role ${role}`)};
 const create=(body,kind='thread',slug=null,thread=null)=>db.query("select public.create_entry($1,'A title',$2,$3,$4) as id",[kind,body,slug,thread]);
 const age=async()=>{await db.exec("reset role;update public.entries set created_at=now()-interval '1 minute'")};
 await as(null,'anon');await assert.rejects(()=>create('Anonymous'),/permission denied/);
 await as(ALICE);const thread=(await create('Hello')).rows[0].id;
 await assert.rejects(()=>create('Spam'),/RATE_LIMIT/);
 await assert.rejects(()=>db.query("insert into public.entries(author_id,author_name,kind,title,body)values($1,'Fake','thread','Bypass','Bypass')",[ALICE]),/permission denied/);
 await assert.rejects(()=>db.exec("select public.admin_settings(array['x'],'reject')"),/FORBIDDEN/);
 await assert.rejects(()=>db.exec('select * from private.admins'),/permission denied/);
 await as(BOB);await assert.rejects(()=>db.query('select public.delete_entry($1)',[thread]),/FORBIDDEN/);
 const reply=(await create('Reply','comment',null,thread)).rows[0].id;
 await as(ADMIN);await db.exec("select public.admin_settings(array['BAD','a.b'],'reject')");
 await age();await as(ALICE);await assert.rejects(()=>create('This is bad'),/BLOCKED_WORD/);await assert.rejects(()=>create('a.b'),/BLOCKED_WORD/);
 await as(ADMIN);await db.exec("select public.admin_settings(array['BAD','a.b'],'mask')");
 await as(ALICE);const masked=(await create('BAD bad a.b aXb')).rows[0].id;assert.equal((await db.query('select body from public.entries where id=$1',[masked])).rows[0].body,'＊＊＊ ＊＊＊ ＊＊＊ aXb');
 await as(ADMIN);await assert.rejects(()=>db.exec("select public.admin_settings(array[''],'mask')"),/INVALID_WORD/);await assert.rejects(()=>db.exec("select public.admin_settings(array['＊'],'mask')"),/INVALID_WORD/);
 await db.query("select public.admin_ban($1,'abuse',true)",[BOB]);await age();await as(BOB);await assert.rejects(()=>create('After ban'),/ACCOUNT_BANNED/);
 await as(ADMIN);await db.query("select public.admin_ban($1,'',false)",[BOB]);await as(BOB);await create('Unbanned','comment','react-thinking');
 await as(ALICE);await db.query('select public.delete_entry($1)',[thread]);await as(null,'anon');assert.equal((await db.query('select * from public.entries where id=any($1::uuid[])',[[thread,reply]])).rows.length,0);
 await as(ADMIN);assert.equal((await db.query('select * from public.entries where id=any($1::uuid[])',[[thread,reply]])).rows.length,2);assert.ok((await db.query('select public.admin_state() as state')).rows[0].state.audit.length>=4);
 await age();await as(BOB);await assert.rejects(()=>create('On deleted parent','comment',null,thread),/THREAD_NOT_FOUND/);
 await db.exec('reset role');await db.query('update auth.users set email_confirmed_at=null where id=$1',[BOB]);await as(BOB);await assert.rejects(()=>create('Unverified'),/VERIFIED_EMAIL_REQUIRED/);
 }finally{await db.close()}
});
