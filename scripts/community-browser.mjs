import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const context=await browser.newContext();const page=await context.newPage({viewport:{width:1200,height:900}});
const base=process.env.BLOG_TEST_URL||'http://localhost:3000/buiing_blog/';const id='00000000-0000-4000-8000-000000000001';const errors=[];page.on('pageerror',e=>errors.push(e.message));
const jwt=['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:id,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'test'].join('.');
let entries=[],settings={blocked_words:[],filter_mode:'reject'},loggedIn=false;
await context.route('**/config.json',r=>r.fulfill({json:{supabaseUrl:'https://test.supabase.co',supabasePublishableKey:'test-public-key'}}));
await context.route('https://test.supabase.co/**',async r=>{const path=new URL(r.request().url()).pathname;let body;try{body=r.request().postDataJSON()}catch{};const send=json=>r.fulfill({json});
 if(path.endsWith('/otp'))return send({});
 if(path.endsWith('/verify')){loggedIn=true;return send({access_token:jwt,refresh_token:'test-refresh',token_type:'bearer',expires_in:3600,user:{id,email:'admin@example.com',aud:'authenticated',role:'authenticated',user_metadata:{display_name:'관리자'},app_metadata:{provider:'email'}}})}
 if(path.endsWith('/logout')){loggedIn=false;return send({})}
 if(path.endsWith('/rpc/is_admin'))return send(loggedIn);
 if(path.endsWith('/rpc/create_entry')){const e={id:crypto.randomUUID(),author_id:id,author_name:'관리자',kind:body.p_kind,title:body.p_title,body:body.p_body,blog_slug:body.p_blog_slug,thread_id:body.p_thread_id,created_at:new Date().toISOString(),deleted_at:null};entries.unshift(e);return send(e.id)}
 if(path.endsWith('/rpc/delete_entry')){entries=entries.filter(e=>e.id!==body.p_id);return send(null)}
 if(path.endsWith('/rpc/admin_state'))return send({settings,bans:[],audit:[]});
 if(path.endsWith('/rpc/admin_settings')){settings={blocked_words:body.p_words,filter_mode:body.p_mode};return send(null)}
 if(path.endsWith('/entries')){const u=new URL(r.request().url());let rows=entries;for(const key of ['id','kind','thread_id','blog_slug']){const q=u.searchParams.get(key);if(q?.startsWith('eq.'))rows=rows.filter(e=>e[key]===q.slice(3))}return send(r.request().headers().accept?.includes('object')?(rows[0]||null):rows)}
 return r.fulfill({status:400,json:{message:'Unexpected request '+path}});
});
try{
 await page.goto(base+'community/');await page.getByRole('button',{name:'로그인 / 가입'}).click();await page.locator('#login-form input[name=name]').fill('관리자');await page.locator('#login-form input[name=email]').fill('admin@example.com');await page.locator('#login-form button').click();await page.locator('#verify-form input').fill('123456');await page.locator('#verify-form button').click();await expect(page.locator('#compose-form')).toBeVisible();
 await page.locator('#compose-form input').fill('커뮤니티 테스트');await page.locator('#compose-form textarea').fill('<script>alert("unsafe")</script>');await page.locator('#compose-form button').click();await expect(page.locator('.visitor-entry h3')).toHaveText('커뮤니티 테스트');await expect(page.locator('.visitor-body')).toHaveText('<script>alert("unsafe")</script>');
 await page.locator('.visitor-entry h3 a').click();await expect(page.locator('#compose-form')).toBeVisible();await page.locator('#compose-form textarea').fill('방문자 댓글');await page.locator('#compose-form button').click();await expect(page.locator('#thread-comments')).toContainText('방문자 댓글');
 await page.goto(base+'admin/');await expect(page.locator('#filter-form')).toBeVisible();await page.locator('#filter-form textarea').fill('금칙어\n광고문자');await page.locator('#filter-form select').selectOption('mask');await page.locator('#filter-form button').click();await expect(page.locator('#filter-status')).toHaveText('설정을 저장했습니다.');assert.deepEqual(settings.blocked_words,['금칙어','광고문자']);
 page.on('dialog',d=>d.accept());await page.locator('[data-delete]').first().click();await expect(page.locator('#admin-entries .visitor-entry')).toHaveCount(1);
 await page.goto(base+'posts/react-thinking/');await expect(page.locator('#comments #compose-form')).toBeVisible();await page.locator('#compose-form textarea').fill('블로그 댓글');await page.locator('#compose-form button').click();await expect(page.locator('#comment-list')).toContainText('블로그 댓글');
 await page.setViewportSize({width:390,height:844});await page.goto(base+'community/');await expect(page.locator('#compose-form')).toBeVisible();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'/tmp/community-mobile.png',fullPage:true});
 await page.locator('#auth-button').click();await page.goto(base+'admin/');await expect(page.locator('#admin-content')).toContainText('관리자 계정으로 로그인');assert.equal(await page.locator('#filter-form').count(),0);
 const nojs=await browser.newContext({javaScriptEnabled:false});const crawler=await nojs.newPage();await crawler.goto(base+'posts/react-thinking/');await expect(crawler.locator('h1')).toContainText('컴포넌트');await expect(crawler.locator('.article-body')).toContainText('함께 바뀌는');assert.equal(await crawler.locator('link[rel=canonical]').getAttribute('href'),'https://rihoyo.github.io/buiing_blog/posts/react-thinking/');await nojs.close();assert.deepEqual(errors,[]);console.log('Community UI with mocked service: OTP, thread, replies, blog comments, moderation, filter, mobile and admin gate passed; no-JS article SEO passed.');
}finally{await browser.close()}
