import {loadPrivatePost} from './assets/private-posts.js';
import {renderBlock} from './assets/post-content.js';
import {renderCover} from './assets/post-cover.js';
import {mountCodeTools} from './assets/code-content.js';
import {createClient} from '@supabase/supabase-js';
import {escapeHTML as esc} from './assets/helpers.js';
let client,user,admin=false,identityVersion=0;let initPromise;let refresh=()=>{};let loginMethods=['google'];
const $=s=>document.querySelector(s);
const messages={LOGIN_REQUIRED:'로그인한 후 작성할 수 있습니다.',ACCOUNT_BANNED:'작성 권한이 제한된 계정입니다.',RATE_LIMIT:'연속 등록을 제한하고 있습니다. 30초 후 다시 시도하세요.',BLOCKED_WORD:'제목 또는 본문에 허용되지 않는 문자가 포함되어 있습니다.',INVALID_CONTENT:'입력 길이와 내용을 확인하세요.',FORBIDDEN:'이 작업을 수행할 권한이 없습니다.',ADMIN_CANNOT_BE_BANNED:'관리자 계정은 차단할 수 없습니다.',INVALID_WORD:'금칙어는 1~40자, 최대 100개입니다. ＊ 문자는 사용할 수 없습니다.',THREAD_NOT_FOUND:'삭제되었거나 존재하지 않는 글입니다.',VERIFIED_EMAIL_REQUIRED:'계정의 이메일 인증을 먼저 완료해 주세요.'};
function errorText(e){return Object.entries(messages).find(([key])=>String(e?.message).includes(key))?.[1]||'요청을 처리하지 못했습니다. 연결과 입력 내용을 확인하고 다시 시도하세요.'}
const displayName=()=>user?.user_metadata?.display_name||user?.user_metadata?.user_name||user?.user_metadata?.full_name||'회원';
function clearAdminUI(){document.querySelectorAll('[data-admin-private],#editor-dialog').forEach(n=>n.remove());}
function syncHeader(){
  document.querySelectorAll('#write-button,.admin-link,.owner-edit').forEach(n=>{n.hidden=!admin});
  const account=$('#account-button');if(account){account.textContent=user?'로그아웃':'로그인';account.onclick=()=>user?signOut():showLogin();}
  if(!admin)clearAdminUI();
}
async function readRole(){
  const version=identityVersion,uid=user?.id;
  if(!uid){admin=false;syncHeader();return false;}
  const {data,error}=await client.rpc('is_admin');
  if(version!==identityVersion||uid!==user?.id)return false;
  admin=!error&&data===true;syncHeader();return admin;
}
async function init(){
  if(initPromise)return initPromise;
  initPromise=(async()=>{
    const r=await fetch('config.json');if(!r.ok)throw Error('CONFIG');const config=await r.json();
    loginMethods=Array.isArray(config.loginMethods)?config.loginMethods.filter(m=>['google','email'].includes(m)):['google'];
    if(!config.supabaseUrl||!config.supabasePublishableKey){syncHeader();return false;}
    client=createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{flowType:'pkce'}});
    const {data,error}=await client.auth.getSession();if(error)throw error;user=data.session?.user;
    await readRole();
    client.auth.onAuthStateChange((event,session)=>{
      const changed=user?.id!==session?.user?.id;
      user=session?.user;
      if(event==='INITIAL_SESSION')return;
      if(changed||event==='SIGNED_OUT'){identityVersion++;admin=false;syncHeader();}
      // Do not await Supabase calls inside its auth callback.
      if(changed||['SIGNED_OUT','TOKEN_REFRESHED','USER_UPDATED'].includes(event)){
        setTimeout(async()=>{try{const wasAdmin=admin;await readRole();if(!$('#auth-dialog')?.open&&(changed||event==='SIGNED_OUT'||wasAdmin!==admin))await refresh();}catch{admin=false;syncHeader();}},0);
      }
    });
    return true;
  })();
  try{return await initPromise}catch(e){initPromise=null;admin=false;syncHeader();throw e;}
}
export async function initializeIdentity(){try{await init();syncHeader()}catch{syncHeader()}}
async function requireAdminAccess(){try{return await init()&&await readRole()}catch{admin=false;syncHeader();return false}}
async function signOut(){
  // Clear private screen content immediately, including an open editor.
  identityVersion++;admin=false;syncHeader();
  const {error}=await client.auth.signOut();
  if(error){alert('로그아웃을 완료하지 못했습니다. 다시 시도해 주세요.');await refresh();return;}
  user=null;syncHeader();await refresh();
}
const date=s=>new Date(s).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium',timeStyle:'short'});
function authBar(ownerOnly=false){return `<div class="auth-bar"><span>${user?`${esc(displayName())}님${admin?' · 관리자':''}`:'댓글과 커뮤니티 글은 로그인 후 작성할 수 있습니다.'}</span><button class="outline-btn" id="auth-button">${user?'로그아웃':ownerOnly?'관리자 로그인':'로그인 / 가입'}</button></div>`}
function bindAuth(){const b=$('#auth-button');if(b)b.onclick=()=>user?signOut():showLogin()}
function showLogin(){
 let d=$('#auth-dialog');if(!d){d=document.createElement('dialog');d.id='auth-dialog';document.body.append(d)}
 d.innerHTML=`<div class="dialog-head"><h2>로그인</h2><button type="button" class="icon-btn" id="auth-close" aria-label="닫기">✕</button></div>${client?`<p class="editor-note">회원은 댓글과 커뮤니티 글을 남길 수 있습니다.<br>블로그 글 작성과 관리는 운영자 전용입니다.</p>${loginMethods.includes('google')?'<button id="google-login" class="black-btn oauth-button">Google 계정으로 계속하기 ↗</button>':''}${loginMethods.includes('email')?'<form id="login-form" class="stack-form"><label>표시 이름<input name="name" required maxlength="40" autocomplete="nickname"></label><label>이메일<input type="email" name="email" required autocomplete="email"></label><button class="black-btn">인증 코드 받기</button></form><form id="verify-form" class="stack-form" hidden><label>이메일로 받은 인증 코드<input name="code" required inputmode="numeric" pattern="[0-9]{6,10}" autocomplete="one-time-code"></label><button class="black-btn">인증하고 로그인</button></form>':''}`:'<p class="editor-note">회원 로그인 연결을 준비하고 있습니다. 공개된 블로그 글은 로그인 없이 읽을 수 있습니다.</p>'}<p id="auth-status" role="status"></p>`;
 d.showModal();$('#auth-close').onclick=()=>d.close();
 const google=$('#google-login');if(google)google.onclick=async()=>{
  google.disabled=true;
  const redirectTo=new URL(location.pathname,location.origin).href;
  const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo}});
  if(error){$('#auth-status').textContent='Google 로그인을 시작하지 못했습니다. 잠시 후 다시 시도하세요.';google.disabled=false;}
 };
 let email='';const form=$('#login-form');if(!form)return;
 form.onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;email=e.target.email.value.trim();try{const {error}=await client.auth.signInWithOtp({email,options:{data:{display_name:e.target.elements.namedItem('name').value.trim()}}});if(error)throw error;$('#verify-form').hidden=false;$('#auth-status').textContent='이메일로 보낸 코드를 입력하세요.';b.textContent='인증 코드 다시 받기';}catch(err){$('#auth-status').textContent=errorText(err)}finally{b.disabled=false}};
 $('#verify-form').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;try{const {data,error}=await client.auth.verifyOtp({email,token:e.target.code.value.trim(),type:'email'});if(error)throw error;identityVersion++;user=data.user;await readRole();d.close();await refresh();}catch{if($('#auth-status'))$('#auth-status').textContent='인증을 완료하지 못했습니다. 코드를 확인하고 다시 시도하세요.'}finally{b.disabled=false}};
}
// Re-check a private screen when returning to it; no background polling.
window.addEventListener('focus',()=>{if(location.pathname.endsWith('/admin/')&&client)void requireAdminAccess().then(allowed=>{if(!allowed)void mountAdmin()})});
let adminRenderVersion=0;
function unavailable(node){node.innerHTML='<div class="service-notice"><h2>커뮤니티 오픈 준비 중</h2><p>회원 인증과 저장소 연결을 준비하고 있습니다. 연결이 완료되면 글과 댓글을 남길 수 있습니다.</p></div>'}
async function ready(node){try{if(!await init()){unavailable(node);return false;}return true}catch{node.innerHTML='<p role="alert">커뮤니티 서버에 연결하지 못했습니다. 잠시 후 새로고침해 주세요.</p>';return false}}
async function rpc(name,args){const {data,error}=await client.rpc(name,args);if(error)throw error;return data}
function entry(e,thread=false){return `<article class="visitor-entry" data-entry="${esc(e.id)}"><div class="entry-meta"><strong>${esc(e.author_name)}</strong><time>${esc(date(e.created_at))}</time>${e.deleted_at?'<span class="tag">삭제됨</span>':''}</div>${thread?`<h3><a href="community/?thread=${encodeURIComponent(e.id)}">${esc(e.title)}</a></h3>`:''}<p class="visitor-body">${esc(e.body)}</p>${user&&(user.id===e.author_id||admin)?`<div class="entry-actions"><button data-delete="${esc(e.id)}">삭제</button>${admin&&user.id!==e.author_id?`<button data-ban="${esc(e.author_id)}">작성자 차단</button>`:''}</div>`:''}</article>`}
function bindActions(node){node.querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{if(!confirm('이 글을 삭제하시겠어요? 게시판 글을 삭제하면 해당 댓글도 함께 숨겨집니다.'))return;try{await rpc('delete_entry',{p_id:b.dataset.delete});await refresh()}catch(e){alert(errorText(e))}});node.querySelectorAll('[data-ban]').forEach(b=>b.onclick=async()=>{const reason=prompt('차단 사유를 입력하세요. 이 계정은 글과 댓글을 새로 작성할 수 없습니다.');if(reason===null)return;try{await rpc('admin_ban',{p_user_id:b.dataset.ban,p_reason:reason,p_banned:true});alert('계정을 차단했습니다. 기존 글은 개별 삭제할 수 있습니다.');await refresh()}catch(e){alert(errorText(e))}})}
function compose(kind){return user?`<form id="compose-form" class="stack-form compose-form">${kind==='thread'?'<label>제목<input name="title" required maxlength="160" placeholder="함께 나누고 싶은 이야기는?"></label>':''}<label>${kind==='thread'?'내용':'댓글'}<textarea name="body" required maxlength="10000" rows="4" placeholder="서로를 존중하며 이야기를 나눠주세요."></textarea></label><div><button class="black-btn">${kind==='thread'?'글 등록':'댓글 등록'} ↗</button></div><p role="status" id="compose-status"></p></form>`:'<p class="editor-note">로그인하면 글과 댓글을 작성할 수 있습니다.</p>'}
function bindCompose(kind,blog=null,thread=null){const f=$('#compose-form');if(!f)return;f.onsubmit=async e=>{e.preventDefault();const b=f.querySelector('button');b.disabled=true;try{await rpc('create_entry',{p_kind:kind,p_title:f.elements.title?.value||'',p_body:f.elements.body.value,p_blog_slug:blog,p_thread_id:thread});f.reset();await refresh()}catch(err){$('#compose-status').textContent=errorText(err)}finally{b.disabled=false}}}
async function listEntries(query){const {data,error}=await query;if(error)throw error;return data}
export async function mountComments(slug){const node=$('#comments');if(!node)return;refresh=()=>mountComments(slug);if(!await ready(node))return;node.innerHTML='<h2>댓글</h2>'+authBar()+compose('comment')+'<div id="comment-list" aria-live="polite">댓글을 불러오는 중입니다.</div><button class="outline-btn" id="more-comments" hidden>이전 댓글 더 보기</button>';bindAuth();bindCompose('comment',slug);let offset=0;const load=async()=>{const target=$('#comment-list');const more=$('#more-comments');more.disabled=true;try{const rows=await listEntries(client.from('entries').select('*').eq('blog_slug',slug).is('deleted_at',null).order('created_at',{ascending:false}).range(offset,offset+19));if(offset===0)target.innerHTML=rows.length?'':'<p class="empty">첫 번째 댓글을 남겨보세요.</p>';target.insertAdjacentHTML('beforeend',rows.map(e=>entry(e)).join(''));offset+=rows.length;more.hidden=rows.length<20;bindActions(node)}catch{target.textContent='댓글을 불러오지 못했습니다. 새로고침해 주세요.'}finally{more.disabled=false}};$('#more-comments').onclick=load;await load()}
export async function mountCommunity(){const main=$('#main');main.innerHTML='<section class="community-page"><span class="eyebrow">LEARN TOGETHER</span><h1>Community<span>.</span></h1><p class="page-intro">작은 질문도, 새로운 발견도. 함께 나누면 더 멀리 갑니다.</p><div id="community-content"></div></section>';const node=$('#community-content');refresh=mountCommunity;if(!await ready(node))return;const thread=new URLSearchParams(location.search).get('thread');if(thread){if(!/^[\da-f-]{36}$/i.test(thread)){node.textContent='올바르지 않은 글 주소입니다.';return}try{const {data:t,error}=await client.from('entries').select('*').eq('id',thread).eq('kind','thread').is('deleted_at',null).maybeSingle();if(error)throw error;if(!t){node.innerHTML='<p>삭제되었거나 존재하지 않는 글입니다.</p><a href="community/">목록으로</a>';return}node.innerHTML='<a class="back-link" href="community/">← 커뮤니티 목록</a>'+authBar()+entry(t,true)+'<h2>댓글</h2>'+compose('comment')+'<div id="thread-comments"></div><button class="outline-btn" id="more-replies" hidden>댓글 더 보기</button>';bindAuth();bindCompose('comment',null,thread);let offset=0;const load=async()=>{const rows=await listEntries(client.from('entries').select('*').eq('thread_id',thread).is('deleted_at',null).order('created_at').range(offset,offset+19));$('#thread-comments').insertAdjacentHTML('beforeend',rows.map(e=>entry(e)).join('')||(!offset?'<p class="empty">첫 댓글을 남겨보세요.</p>':''));offset+=rows.length;$('#more-replies').hidden=rows.length<20;bindActions(node)};$('#more-replies').onclick=async()=>{try{await load()}catch{alert('댓글을 불러오지 못했습니다.')}};await load()}catch{node.innerHTML='<p>글을 불러오지 못했습니다. 새로고침해 주세요.</p>'}return}
node.innerHTML=authBar()+compose('thread')+'<div id="thread-list"></div><button class="outline-btn" id="more-threads" hidden>글 더 보기</button>';bindAuth();bindCompose('thread');let offset=0;const load=async()=>{const b=$('#more-threads');b.disabled=true;try{const rows=await listEntries(client.from('entries').select('*').eq('kind','thread').is('deleted_at',null).order('created_at',{ascending:false}).range(offset,offset+19));$('#thread-list').insertAdjacentHTML('beforeend',rows.map(e=>entry(e,true)).join('')||(!offset?'<p class="empty">아직 게시글이 없습니다. 첫 이야기를 시작해 보세요.</p>':''));offset+=rows.length;b.hidden=rows.length<20;bindActions(node)}catch{$('#thread-list').textContent='목록을 불러오지 못했습니다. 새로고침해 주세요.'}finally{b.disabled=false}};$('#more-threads').onclick=load;await load();}
export async function mountWrite(){
 const main=$('#main');refresh=mountWrite;
 main.innerHTML='<section class="write-page"><div id="write-content"><p class="editor-note">글쓰기 권한을 확인하고 있습니다.</p></div></section>';
 const node=$('#write-content');
 try{if(!await init()){node.innerHTML='<div class="access-gate"><h1>글쓰기 준비 중</h1><p>로그인 연결을 확인해 주세요.</p></div>';return}await readRole()}catch{node.innerHTML='<p role="alert">글쓰기 권한을 확인하지 못했습니다. 새로고침해 주세요.</p>';return}
 if(!admin){node.innerHTML='<div class="access-gate"><h1>운영자 전용 글쓰기</h1><p>운영자 계정으로 로그인해야 글을 작성할 수 있습니다.</p><button class="outline-btn" id="write-login">로그인</button></div>';$('#write-login').onclick=()=>showLogin();return}
 const {mountBlogEditor}=await import('./blog-editor.js');
 await mountBlogEditor({authorize:requireAdminAccess,onDenied:mountWrite,userId:user.id,client,inline:true});
}
export async function mountAdmin(){
const renderId=++adminRenderVersion;const main=$('#main');
main.innerHTML='<section class="community-page admin-page"><span class="eyebrow">OWNER ACCESS</span><h1>관리자<span>.</span></h1><div id="admin-content"><p class="editor-note">접근 권한을 확인하고 있습니다.</p></div></section>';
const node=$('#admin-content');refresh=mountAdmin;
try{if(!await init()){node.innerHTML='<div class="access-gate"><span class="eyebrow">SETUP PENDING</span><h2>관리자 로그인 준비 중</h2><p>로그인 연결이 완료되면 운영자 계정으로 이용할 수 있습니다.</p><a class="outline-btn" href="./">블로그로 돌아가기</a></div>';return}}catch{node.innerHTML='<p role="alert">접근 권한을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.</p>';return}
await readRole();if(renderId!==adminRenderVersion)return;
node.innerHTML=authBar(true);bindAuth();
if(!admin){node.insertAdjacentHTML('beforeend',user?'<div class="access-gate"><span class="eyebrow">ACCESS DENIED</span><h2>접근 권한이 없습니다.</h2><p>관리자 페이지는 블로그 운영자만 이용할 수 있습니다.</p><a class="outline-btn" href="community/">커뮤니티로 이동</a></div>':'<div class="access-gate"><span class="eyebrow">SIGN IN REQUIRED</span><h2>관리자 계정으로 로그인해 주세요.</h2><p>운영자로 등록된 계정만 블로그 작성과 관리 기능에 접근할 수 있습니다.</p></div>');return}
const version=identityVersion;
try{const state=await rpc('admin_state');if(!admin||version!==identityVersion||renderId!==adminRenderVersion)return;
node.insertAdjacentHTML('beforeend',`<div data-admin-private><section class="admin-workspace"><div><span class="eyebrow">BLOG WORKSPACE</span><h2>나의 기록, 나의 공간.</h2><p>블로그 글은 운영자만 작성합니다.<br>회원의 글은 커뮤니티에서 별도로 관리합니다.</p></div><a class="black-btn" id="admin-write-button" href="write/">블로그 글 작성 ↗</a></section><div class="permission-summary"><div><strong>블로그</strong><span>운영자만 작성 · 누구나 읽기</span></div><div><strong>댓글 / 커뮤니티</strong><span>로그인한 회원만 작성</span></div><div><strong>관리</strong><span>운영자만 삭제·차단·필터 변경</span></div></div><p class="editor-note">글쓰기에서 게시하고, 각 게시글의 수정 버튼으로 내용을 변경할 수 있습니다.</p><section class="admin-panel"><h2>문자 / 금칙어 필터</h2><p class="editor-note">한 줄에 하나씩 입력합니다. 대소문자를 구분하지 않고 제목·본문의 포함 여부를 검사합니다. 저장 후 새 글과 댓글부터 적용됩니다.</p><form id="filter-form" class="stack-form"><label>금칙어<textarea name="words" rows="5">${esc(state.settings.blocked_words.join('\n'))}</textarea></label><label>처리 방식<select name="mode"><option value="reject" ${state.settings.filter_mode==='reject'?'selected':''}>등록 차단</option><option value="mask" ${state.settings.filter_mode==='mask'?'selected':''}>해당 문자를 ＊로 가리기</option></select></label><button class="black-btn">설정 저장</button><p id="filter-status" role="status"></p></form></section><section class="admin-panel"><h2>차단된 계정 <span class="count">${state.bans.length}</span></h2>${state.bans.map(b=>`<div class="ban-row"><div><code>${esc(b.user_id)}</code><p>${esc(b.reason||'사유 없음')}</p></div><button class="outline-btn" data-unban="${esc(b.user_id)}">차단 해제</button></div>`).join('')||'<p class="editor-note">차단된 계정이 없습니다.</p>'}</section><section class="admin-panel"><h2>게시글 및 댓글 관리</h2><div id="admin-entries"></div><button class="outline-btn" id="admin-more" hidden>더 보기</button></section><section class="admin-panel"><h2>최근 관리 기록</h2>${state.audit.map(a=>`<p class="audit-line">${esc(date(a.created_at))} · ${esc(({ban:'계정 차단',unban:'차단 해제',delete_entry:'게시물 삭제',update_filter:'필터 변경'})[a.action]||a.action)} · ${esc(a.target||'')}</p>`).join('')||'<p>아직 관리 기록이 없습니다.</p>'}</section></div>`);$('#filter-form').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;try{await rpc('admin_settings',{p_words:e.target.words.value.split('\n').map(x=>x.trim()).filter(Boolean),p_mode:e.target.mode.value});$('#filter-status').textContent='설정을 저장했습니다.'}catch(err){$('#filter-status').textContent=errorText(err)}finally{b.disabled=false}};node.querySelectorAll('[data-unban]').forEach(b=>b.onclick=async()=>{if(!confirm('이 계정의 차단을 해제할까요?'))return;try{await rpc('admin_ban',{p_user_id:b.dataset.unban,p_banned:false});await refresh()}catch(e){alert(errorText(e))}});let offset=0;const load=async()=>{const rows=await listEntries(client.from('entries').select('*').order('created_at',{ascending:false}).range(offset,offset+29));$('#admin-entries').insertAdjacentHTML('beforeend',rows.map(e=>`<span class="tag">${e.kind==='thread'?'커뮤니티':e.blog_slug?'블로그 댓글':'게시판 댓글'}</span>`+entry(e,e.kind==='thread')).join(''));offset+=rows.length;$('#admin-more').hidden=rows.length<30;bindActions(node)};$('#admin-more').onclick=async()=>{try{await load()}catch{alert('목록을 불러오지 못했습니다.')}};await load();

}catch{clearAdminUI();node.insertAdjacentHTML('beforeend','<p role="alert">관리 정보를 불러오지 못했습니다. 다시 로그인하거나 연결 상태를 확인해 주세요.</p>')}}

export async function mountPrivateArticle(){refresh=mountPrivateArticle;const main=$('#main');document.title='비공개 글 — BUIING';main.innerHTML='<section class="article"><h1>비공개 글</h1><div id="private-content">본인 인증을 확인하고 있습니다.</div></section>';const node=$('#private-content');if(!await ready(node))return;await readRole();node.innerHTML=authBar();bindAuth();if(!admin){node.insertAdjacentHTML('beforeend','<p>작성자 계정으로 로그인해야 볼 수 있습니다.</p>');return}const version=identityVersion;try{const id=new URLSearchParams(location.search).get('id');const {post:p}=await loadPrivatePost(client,id);if(version!==identityVersion||!admin||!node.isConnected)return;node.insertAdjacentHTML('beforeend',`<article data-admin-private><span class="pill">🔒 나만 보기</span><h1>${esc(p.title)}</h1><a class="outline-btn" href="write/?private=${encodeURIComponent(p.id)}">게시글 수정 ↗</a>${renderCover(p)}<div class="article-body">${p.blocks.map(renderBlock).join('')}</div></article>`);mountCodeTools(node)}catch{if(version===identityVersion&&node.isConnected)node.insertAdjacentHTML('beforeend','<p>글이 없거나 조회 권한이 없습니다. 비공개 기능 설치도 확인해 주세요.</p>')}}
