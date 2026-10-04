import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,cp,writeFile,readFile,symlink,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
test('Withdrawn articles build authentication shells without public bodies, lists or sitemap entries',async()=>{
 const root=process.cwd(),dir=await mkdtemp('/tmp/buiing-withdraw-build-');try{
 for(const f of ['assets','app.js','community.js','blog-editor.js','view-counter.js','style.css','counter-sw.js','index.html'])await cp(resolve(root,f),resolve(dir,f),{recursive:true});await symlink(resolve(root,'node_modules'),resolve(dir,'node_modules'),'dir');await mkdir(resolve(dir,'posts'));await writeFile(resolve(dir,'site.config.json'),JSON.stringify({url:'https://example.com/blog/',title:'Test',description:'Test',supabaseUrl:'',supabasePublishableKey:''}));await writeFile(resolve(dir,'posts/old-public.json'),JSON.stringify({id:'old-public',visibility:'withdrawn',date:'2026-10-05',updatedAt:new Date().toISOString()}));await promisify(execFile)(process.execPath,[resolve(root,'scripts/build.mjs')],{cwd:dir});
 assert.deepEqual(JSON.parse(await readFile(resolve(dir,'dist/posts.json'),'utf8')),[]);assert.ok(!(await readFile(resolve(dir,'dist/sitemap.xml'),'utf8')).includes('old-public'));const html=await readFile(resolve(dir,'dist/posts/old-public/index.html'),'utf8');assert.match(html,/noindex/);assert.match(html,/data-withdrawn-id="old-public"/);assert.match(html,/private-post\/\?id=old-public/);assert.ok(!html.includes('class="article-body"'));
 await writeFile(resolve(dir,'posts/illegal-private.json'),JSON.stringify({id:'private',visibility:'private',title:'PRIVATE_BODY_SENTINEL',blocks:[]}));await assert.rejects(()=>promisify(execFile)(process.execPath,[resolve(root,'scripts/build.mjs')],{cwd:dir}),/Private content must never be stored/);
 }finally{await rm(dir,{recursive:true,force:true})}
});
