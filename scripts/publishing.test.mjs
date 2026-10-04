import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transformSync} from 'esbuild';
import vm from 'node:vm';
import {renderBlock} from '../assets/post-content.js';
const src=transformSync(await readFile('supabase/functions/publish-post/index.ts','utf8'),{loader:'ts'}).code;
function service({admin=true,signedIn=true,old=null,token=true}={}){
 let handler,written,githubCalls=0;
 const fetch=async(url,opts={})=>{
  if(url.endsWith('/auth/v1/user'))return Response.json({id:'owner'},{status:signedIn?200:401});
  if(url.endsWith('/rpc/is_admin'))return Response.json(admin);
  githubCalls++;
  if(opts.method==='PUT'){written=JSON.parse(opts.body);return Response.json({content:{sha:'new-sha'}})}
  return old?Response.json({sha:'old-sha',content:Buffer.from(JSON.stringify(old)).toString('base64')}):Response.json({},{status:404});
 };
 vm.runInNewContext(src,{Deno:{env:{get:k=>({SUPABASE_URL:'https://project.supabase.co',SUPABASE_ANON_KEY:'anon',BLOG_GITHUB_TOKEN:token?'server-only-token':null})[k]},serve:h=>handler=h},fetch,Request,Response,TextEncoder,TextDecoder,URL,Uint8Array,atob,btoa,Intl});
 return {call:body=>handler(new Request('https://project.supabase.co/functions/v1/publish-post',{method:'POST',headers:{Authorization:'Bearer user-token'},body:JSON.stringify(body)})),get written(){return written},get calls(){return githubCalls}};
}
const post={id:'new-record',title:'새 글',category:'Development',tags:['JS'],revision:'r-1',blocks:[{type:'paragraph',text:'hello'},{type:'youtube',url:'https://youtu.be/dQw4w9WgXcQ',mode:'bookmark'}]};
test('Publisher rejects unauthenticated and non-admin users before accessing GitHub',async()=>{
 for(const opts of [{signedIn:false},{admin:false}]){const s=service(opts);const r=await s.call({action:'publish',file:'new-record.json',post});assert.ok([401,403].includes(r.status));assert.equal(s.calls,0)}
});
test('Publisher creates a static post and preserves existing URL/date on edit',async()=>{
 const s=service();assert.equal((await s.call({action:'publish',file:'new-record.json',post})).status,200);
 const saved=JSON.parse(Buffer.from(s.written.content,'base64').toString());assert.equal(saved.blocks[1].mode,'bookmark');assert.equal(saved.revision,'r-1');assert.equal(s.written.branch,'main');assert.ok(!s.written.content.includes('server-only-token'));
 const edit=service({old:{...post,date:'2020-01-01'}});assert.equal((await edit.call({action:'publish',file:'new-record.json',sha:'old-sha',post:{...post,title:'수정'}})).status,200);assert.equal(JSON.parse(Buffer.from(edit.written.content,'base64')).date,'2020-01-01');
});
test('Publisher prevents stale overwrites, path traversal and unsafe video blocks',async()=>{
 const s=service({old:post});assert.equal((await s.call({action:'publish',file:'new-record.json',sha:'stale',post})).status,409);assert.equal(s.written,undefined);
 const path=service();assert.equal((await path.call({action:'publish',file:'../index.html',post})).status,400);assert.equal(path.calls,0);
 const bad=service();assert.equal((await bad.call({action:'publish',file:'new-record.json',post:{...post,blocks:[{type:'youtube',url:'https://evil.test/?v=dQw4w9WgXcQ',mode:'embed'}]}})).status,400);assert.equal(bad.written,undefined);
});
test('All YouTube display modes render safely in static and browser articles',()=>{
 for(const mode of ['embed','url','mention','bookmark']){const html=renderBlock({type:'youtube',url:'https://youtu.be/dQw4w9WgXcQ',title:'<script>bad</script>',mode});assert.ok(!html.includes('<script>'));assert.equal(html.includes('<iframe'),mode==='embed');assert.equal(html.includes('i.ytimg.com'),mode==='bookmark')}
 assert.equal(renderBlock({type:'youtube',url:'javascript:alert(1)'}),'');
});
