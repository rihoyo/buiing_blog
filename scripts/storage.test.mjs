import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('Image storage accepts only authenticated admins, migration is repeatable',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role authenticated;create role anon;create schema private;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id text primary key,bucket_id text);alter table storage.objects enable row level security;grant usage on schema storage,private to authenticated,anon;grant insert on storage.objects to authenticated,anon;create function private.is_admin() returns boolean language sql stable as $$select current_setting('test.admin',true)='yes'$$;`);
 const sql=await readFile('supabase/publishing.sql','utf8');await db.exec(sql);await db.exec(sql);
 await db.exec("set role authenticated;select set_config('test.admin','no',false)");await assert.rejects(()=>db.exec("insert into storage.objects values('member','blog-images')"),/row-level security/);
 await db.exec("select set_config('test.admin','yes',false)");await db.exec("insert into storage.objects values('admin','blog-images')");await assert.rejects(()=>db.exec("insert into storage.objects values('other','private-bucket')"),/row-level security/);
 await db.exec('reset role;set role anon');await assert.rejects(()=>db.exec("insert into storage.objects values('anon','blog-images')"),/row-level security/);
 }finally{await db.close()}
});
