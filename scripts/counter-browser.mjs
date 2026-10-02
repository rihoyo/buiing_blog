import {chromium,expect} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const COUNTER='https://hits.sh/rihoyo.github.io/buiing_blog.svg?view=total&style=flat-square&label=&color=ffffff&labelColor=ffffff';
// Serve the real module/worker over localhost (a browser secure context).
// Only the production hostname guard is substituted, so development remains excluded.
const moduleSource=(await readFile('view-counter.js','utf8')).replace("location.hostname === 'rihoyo.github.io'", "location.hostname === 'localhost'");
const server=createServer(async(req,res)=>{const path=new URL(req.url,'http://localhost').pathname;try{if(path.endsWith('/counter-sw.js')){res.setHeader('Content-Type','text/javascript');res.end(await readFile('counter-sw.js'));}else if(path.endsWith('/view-counter.js')){res.setHeader('Content-Type','text/javascript');res.end(moduleSource);}else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><head><base href="/buiing_blog/"></head><body><div data-view-counter></div><script type="module">import {mountViewCounter} from "./view-counter.js";mountViewCounter();window.remount=mountViewCounter;</script>');}}catch{res.writeHead(500).end()}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://localhost:${server.address().port}/buiing_blog/`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
let context;
try {
 context=await browser.newContext({serviceWorkers:'allow'});let requests=0,fail=false;const modes=[];
 await context.route('https://hits.sh/**',route=>{requests++;modes.push(route.request().serviceWorker()!==null);return fail?route.abort():route.fulfill({contentType:'image/svg+xml',headers:{'Cache-Control':'no-store'},body:`<svg xmlns="http://www.w3.org/2000/svg" width="28" height="20"><rect width="28" height="20" fill="white"/><text x="4" y="14">${requests}</text></svg>`})});
 const a=await context.newPage(),b=await context.newPage();
 const loaded=page=>page.waitForFunction(()=>{const img=document.querySelector('.view-count img');return img?.complete&&img.naturalWidth>0});
 const visit=async(page,path='')=>{await page.goto(base+path);await loaded(page)};
 // Simultaneous first visits, including initial worker installation.
 await Promise.all([visit(a),visit(b)]);assert.equal(requests,1);
 const metadata=()=>a.evaluate(async()=>{const c=await caches.open('buiing-view-session-v1');return (await c.match(new URL('__view-session',document.baseURI).href)).json()});
 const age=minutes=>a.evaluate(async minutes=>{const c=await caches.open('buiing-view-session-v1');await c.put(new URL('__view-session',document.baseURI).href,new Response(JSON.stringify({lastSeen:Date.now()-minutes*60000})));},minutes);
 await age(29);await visit(a);assert.equal(requests,1);assert.ok(Date.now()-(await metadata()).lastSeen<5000);
 await visit(a,'posts/react-thinking/');await visit(b);assert.equal(requests,1);
 await a.evaluate(()=>window.remount());assert.equal(requests,1);
 // 31 idle minutes start one new session even if two tabs return together.
 await age(31);await Promise.all([visit(a),visit(b)]);assert.equal(requests,2);
 // Closing/reopening a tab keeps the same browser session.
 await b.close();const c=await context.newPage();await visit(c);assert.equal(requests,2);
 // Admin traffic is excluded and does not extend the session.
 const before=(await metadata()).lastSeen;await c.goto(base+'admin/');await c.waitForFunction(()=>typeof window.remount==='function');assert.equal(requests,2);assert.equal((await metadata()).lastSeen,before);
 // A failed new session reuses the old image and never retries on each reload.
 fail=true;await age(31);await visit(a);assert.equal(requests,3);await visit(a);assert.equal(requests,3);
 // Explicitly clearing site storage creates a new session (documented limitation).
 fail=false;await a.evaluate(()=>caches.delete('buiing-view-session-v1'));await visit(a);assert.equal(requests,4);
 // If Cache Storage is unavailable, fail closed without a request to Hits.
 const worker=context.serviceWorkers()[0];await worker.evaluate(()=>{self.originalCacheOpen=caches.open;caches.open=()=>Promise.reject(new Error('storage denied'));});await visit(a);assert.equal(requests,4);await visit(a);assert.equal(requests,4);
 await worker.evaluate(()=>{caches.open=self.originalCacheOpen;});
 assert.ok(modes.every(Boolean),'All counter requests must originate from the service worker');
 assert.equal((await context.cookies()).length,0);
 console.log('PASS: concurrent tabs, reloads, navigation, sliding 30-minute expiry, reopen, admin exclusion, failed request backoff, cleared storage, denied storage, and no cookies.');
 await context.close();context=null;
 // No service-worker support: no unprotected direct-image fallback.
 const blocked=await browser.newContext({serviceWorkers:'block'});let fallbackRequests=0;await blocked.route('https://hits.sh/**',r=>{fallbackRequests++;return r.abort()});const p=await blocked.newPage();await p.goto(base);await expect(p.locator('[data-view-counter]')).toContainText('views');await p.waitForFunction(()=>document.querySelector('[data-view-counter]').title.includes('집계를 건너뛰었습니다'));assert.equal(fallbackRequests,0);await blocked.close();
 console.log('PASS: unsupported/blocked service worker never falls back to per-page counting.');
}finally{if(context)await context.close();await browser.close();await new Promise(resolve=>server.close(resolve))}
