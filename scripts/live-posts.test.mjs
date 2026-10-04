import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {mergePosts} from '../assets/live-posts.js';
import {renderCover} from '../assets/post-cover.js';
test('Public live revisions override old static pages without downgrading newer static revisions',()=>{
 const old={id:'one',date:'2026-10-04',updatedAt:'2026-10-04T00:00:00Z',title:'old'};
 const latest={...old,updatedAt:'2026-10-04T01:00:00Z',title:'new'};
 const newPost={id:'two',date:'2026-10-05',title:'new post'};
 assert.deepEqual(mergePosts([old],[latest,newPost]),[newPost,latest]);
 assert.deepEqual(mergePosts([latest],[old]),[latest]);
 const html=renderCover({art:'orb',artLabel:'<script>x</script>',coverImage:'javascript:bad'});assert.ok(html.includes('orb'));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('javascript:'));
 assert.ok(renderCover({coverImage:'https://example.com/cover.png',coverAlt:'" onerror="bad'}).includes('&quot;'));
});
test('Instant publication allows public reads, restricts writes, and prevents snapshot downgrades',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema private;grant usage on schema private to authenticated;create function private.is_admin() returns boolean language sql stable as $$select current_setting('test.admin',true)='yes'$$;`);
 const migration=await readFile('supabase/instant-publishing.sql','utf8');await db.exec(migration);await db.exec(migration);
 const post={id:'one',title:'new',updatedAt:'2026-10-04T01:00:00Z'};
 const sync=p=>db.query('select public.sync_published_post($1::jsonb,$2) as synced',[JSON.stringify(p),'one.json']);
 await db.exec("set role authenticated;select set_config('test.admin','no',false)");await assert.rejects(()=>sync(post),/FORBIDDEN/);
 await db.exec("select set_config('test.admin','yes',false)");assert.equal((await sync(post)).rows[0].synced,true);assert.equal((await sync({...post,title:'stale',updatedAt:'2026-10-04T00:00:00Z'})).rows[0].synced,false);
 await db.exec('reset role;set role anon');assert.equal((await db.query('select post from public.published_posts')).rows[0].post.title,'new');await assert.rejects(()=>sync(post),/permission denied/);await assert.rejects(()=>db.exec('delete from public.published_posts'),/permission denied/);
 await db.exec("reset role;set role authenticated;select set_config('test.admin','no',false)");await assert.rejects(()=>db.query('insert into public.published_posts(id,source_file,post) values($1,$2,$3)',['other','other.json',JSON.stringify({id:'other'})]),/row-level security/);assert.equal((await db.exec("update public.published_posts set source_file='bad.json'"))[0].affectedRows,0);
 }finally{await db.close()}
});

test('Code and terminal centers render editable text safely and preserve default designs',()=>{
 assert.ok(renderCover({art:'code'}).includes('<svg'));
 const code=renderCover({art:'code',artCodeText:'React <script>'});assert.ok(code.includes('React &lt;script&gt;'));assert.ok(!code.includes('<svg'));assert.ok(!code.includes('<script>'));
 const terminal=renderCover({art:'terminal',artTerminalText:'~/my-blog\n❯ npm run build\n완료 <img onerror=x>'});assert.ok(terminal.includes('~/my-blog'));assert.ok(terminal.includes('❯ npm run build'));assert.ok(terminal.includes('완료 &lt;img onerror=x&gt;'));assert.ok(!terminal.includes('<img'));assert.ok(!terminal.includes('git add'));
});

test('Withdrawal always removes a static record, including one with an incorrect future timestamp',()=>{const old={id:'private',date:'2026-10-05',updatedAt:'2099-01-01'};assert.deepEqual(mergePosts([old],[{id:old.id,visibility:'withdrawn',updatedAt:'2026-10-05'}]),[])});
