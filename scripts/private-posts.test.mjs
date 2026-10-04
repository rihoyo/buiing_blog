import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {savePrivatePost,loadPrivatePost} from '../assets/private-posts.js';
test('Private posts and images require their owner AND admin status, including direct API writes',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role authenticated;create role anon;create schema auth;create schema private;create schema storage;create table auth.users(id uuid primary key);insert into auth.users values('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;create function private.is_admin() returns boolean language sql stable as $$select current_setting('test.admin',true)='yes'$$;create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id text primary key,bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema auth,private,storage to authenticated,anon;grant select,insert on storage.objects to authenticated,anon;`);
 const sql=await readFile('supabase/private-posts.sql','utf8');await db.exec(sql);await db.exec(sql);
 const owner='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',post={id:'secret',visibility:'private',title:'Owner only',revision:'r1',blocks:[{type:'paragraph',text:'confidential'}]};
 const save=async(p,revision=null)=>db.query('select public.save_owner_post($1::jsonb,$2::text)',[JSON.stringify(p),revision]);
 await db.exec(`set role authenticated;select set_config('test.uid','${owner}',false);select set_config('test.admin','yes',false)`);await save(post);await assert.rejects(()=>save(post),/EDIT_CONFLICT/);await assert.rejects(()=>save({...post,revision:'r2'},'wrong'),/EDIT_CONFLICT/);await save({...post,revision:'r2'},'r1');
 await db.exec(`insert into storage.objects values('owned','blog-private-images','${owner}/file.png')`);await assert.rejects(()=>db.exec(`insert into storage.objects values('wrong','blog-private-images','${other}/file.png')`),/row-level security/);
 await db.exec(`select set_config('test.uid','${other}',false)`);assert.equal((await db.query('select * from public.owner_posts')).rows.length,0);assert.equal((await db.query('select * from storage.objects')).rows.length,0);await assert.rejects(()=>save({...post,revision:'r3'},'r2'),/EDIT_CONFLICT/);
 assert.equal((await db.query('update public.owner_posts set owner_id=$1 where id=$2',[other,'secret'])).affectedRows,0);
 await db.exec(`select set_config('test.uid','${owner}',false);select set_config('test.admin','no',false)`);assert.equal((await db.query('select * from public.owner_posts')).rows.length,0);await assert.rejects(()=>save({...post,revision:'r3'},'r2'),/FORBIDDEN/);
 await db.exec('reset role;set role anon');await assert.rejects(()=>db.query('select * from public.owner_posts'),/permission denied/);await assert.rejects(()=>save(post),/permission denied/);assert.equal((await db.query('select * from storage.objects')).rows.length,0);
 await db.exec('reset role');assert.equal((await db.query("select public from storage.buckets where id='blog-private-images'")).rows[0].public,false);
 }finally{await db.close()}
});
test('Private save strips signed image URLs and never uses publishing functions or public storage',async()=>{
 globalThis.document={baseURI:'https://example.com/blog/'};let saved;const client={rpc:async(name,args)=>{assert.equal(name,'save_owner_post');saved=args;return {data:'revision'}},functions:{invoke(){assert.fail('Private data reached publisher')}},storage:{from(bucket){assert.equal(bucket,'blog-private-images');return {createSignedUrl:async(path,ttl)=>{assert.equal(ttl,300);return {data:{signedUrl:'https://example.com/signed/'+path}}}}}}};
 const post={id:'private-id',revision:'r1',blocks:[{type:'image',src:'https://signed/secret',privateImagePath:'owner/image.png'}],coverImage:'https://signed/cover',coverPrivateImagePath:'owner/cover.png'};
 const result=await savePrivatePost(client,post,null);assert.equal(saved.p_post.blocks[0].src,'');assert.equal(saved.p_post.coverImage,undefined);assert.equal(saved.p_post.visibility,'private');assert.match(result.url,/private-post/);assert.equal(post.blocks[0].src,'https://signed/secret');delete globalThis.document;
});
