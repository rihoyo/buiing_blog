import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {mapConcurrent} from '../assets/async-work.js';
import {createAdminApi} from '../assets/admin-api.js';

test('Bounded uploads share a concurrency ceiling, preserve order, and drain before failing',async()=>{
 let active=0,max=0;const values=await mapConcurrent([3,2,1,0],2,async n=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,n*4));active--;return n*2});assert.deepEqual(values,[6,4,2,0]);assert.equal(max,2);
 await assert.rejects(()=>mapConcurrent([0,1,2],2,async n=>{if(n===0){await new Promise(r=>setTimeout(r,2));throw Error('upload failed')}active++;await new Promise(r=>setTimeout(r,10));active--}),/upload failed/);assert.equal(active,0);
});
test('Log paging uses the narrow API and only missing endpoints trigger legacy fallback',async()=>{
 const calls=[];const api=createAdminApi(async(name,args)=>{calls.push(name);return name==='admin_community_activity'?[{id:1}]:{threads:1}});assert.deepEqual(await api.activity({p_before:2}),[{id:1}]);await api.stats();assert.deepEqual(calls,['admin_community_activity','admin_community_stats']);
 let failures=0;const old=createAdminApi(async name=>{if(name==='admin_community_activity'){failures++;throw {code:'PGRST202'}}return {activity:[]}});await old.activity({});await old.activity({});assert.equal(failures,1);
 const denied=createAdminApi(async()=>{throw {code:'42501'}});await assert.rejects(()=>denied.activity({}));
});
test('Optimization migration preserves permissions, reply counts, daily metrics and idempotent backfill',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;`);
 for(const name of ['schema.sql','guest-community.sql','community-upgrade.sql','community-editing.sql'])await db.exec(await readFile('supabase/'+name,'utf8'));
 const uid='00000000-0000-4000-8000-000000000001';await db.query("insert into auth.users values($1,now(),'{}')",[uid]);await db.query('insert into private.admins values($1)',[uid]);
 const actor='a'.repeat(64),salt='b'.repeat(32),hash='c'.repeat(64);
 const create=async parent=>(await db.query("select secure_guest_create('guestbook',null,null,$1,'guest','body',$2,$3,$4) as id",[parent,salt,hash,actor])).rows[0].id;
 await db.exec('set role service_role');const root=await create(null),child=await create(root);await db.exec('reset role');const migration=await readFile('supabase/optimization.sql','utf8');await db.exec(migration);await db.exec(migration);
 assert.equal((await db.query('select reply_count from guest_entries where id=$1',[root])).rows[0].reply_count,1);
 await db.exec('set role service_role');const another=await create(root);await db.query('select secure_guest_vote($1,$2)',[root,actor]);assert.equal((await db.query('select secure_guest_delete($1,$2,false) as ok',[child,hash])).rows[0].ok,true);await db.exec('reset role');assert.equal((await db.query('select reply_count from guest_entries where id=$1',[root])).rows[0].reply_count,1);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.exec('set role authenticated');const stats=(await db.query('select admin_community_stats() as data')).rows[0].data;assert.equal(stats.guestbook,2);assert.equal(stats.recommendations,1);const series=(await db.query('select admin_activity_series(7) as data')).rows[0].data;assert.equal(series.length,7);assert.equal(series.reduce((n,d)=>n+Number(d.total),0),4);const logs=(await db.query('select admin_community_activity(null,$1,null) as data',[actor])).rows[0].data;assert.equal(logs.length,4);assert.ok(logs.every(x=>x.network_key===actor));
 await db.exec('reset role');await db.exec(migration);await db.exec('set role authenticated');assert.deepEqual((await db.query('select admin_activity_series(7) as data')).rows[0].data,series);
 await db.query("select set_config('request.jwt.claim.sub','',false)");await assert.rejects(()=>db.query('select admin_community_stats()'),/FORBIDDEN/);await assert.rejects(()=>db.query('select admin_activity_series()'),/FORBIDDEN/);await assert.rejects(()=>db.query('select admin_community_activity()'),/FORBIDDEN/);await assert.rejects(()=>db.query('select * from private.community_daily_metrics'),/permission denied/);
 await db.exec('reset role;set role service_role');await db.query('select secure_guest_delete($1,$2,false)',[root,hash]);await db.exec('reset role');assert.equal((await db.query('select reply_count from guest_entries where id=$1',[root])).rows[0].reply_count,0);assert.ok((await db.query('select deleted_at from guest_entries where id=$1',[another])).rows[0].deleted_at);
 }finally{await db.close()}
});
