// Cache the external image in a service worker so reloads do not contact Hits.
let setup;
function prepareSessionCounter() {
  if (setup) return setup;
  setup = (async () => {
    if (!('serviceWorker' in navigator) || !('caches' in window)) throw new Error('Storage unavailable');
    const script = new URL('counter-sw.js', document.baseURI);
    const scope = new URL('./', script).href;
    const existing = await navigator.serviceWorker.getRegistration(scope);
    const registration = existing || await navigator.serviceWorker.register(script.href, {scope});
    // Do not send an image before this worker controls the page: the first load
    // must also go through the session gate, not increment once outside it.
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller?.scriptURL !== script.href) {
      await new Promise((resolve, reject) => {
        const finish = () => {
          if (navigator.serviceWorker.controller?.scriptURL === script.href) {
            clearTimeout(timer);
            navigator.serviceWorker.removeEventListener('controllerchange', finish);
            resolve();
          }
        };
        const timer = setTimeout(() => {
          navigator.serviceWorker.removeEventListener('controllerchange', finish);
          reject(new Error('Counter worker unavailable'));
        }, 10000);
        navigator.serviceWorker.addEventListener('controllerchange', finish);
        finish();
      });
    }
    return registration;
  })();
  const attempt = setup;
  setup = new Promise((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error('Counter setup timed out')), 12000);
    attempt.then(resolve, reject).finally(() => clearTimeout(deadline));
  });
  return setup;
}
// A restored back/forward-cache page is a visit too; pass it through the same gate.
window.addEventListener('pageshow', event => {
  if (!event.persisted) return;
  document.getElementById('blog-view-counter')?.remove();
  mountViewCounter();
});
export function mountViewCounter() {
  const slot = document.querySelector('[data-view-counter]');
  if (slot && !slot.querySelector('.view-count')) {
    slot.innerHTML = '<span class="views-label">views</span><span class="views-divider" aria-hidden="true">/</span><span class="view-count">—</span>';
  }
  const isPublicSite = location.hostname === 'rihoyo.github.io' && location.pathname.startsWith('/buiing_blog/');
  if (!isPublicSite || location.pathname.startsWith('/buiing_blog/admin/')) {
    if (slot) slot.title = '개발 환경에서는 조회수를 집계하지 않습니다.';
    return;
  }
  // Reuse the same image if the page is rendered again. Filters do not add hits.
  let badge = document.getElementById('blog-view-counter');
  if (!badge) {
    badge = document.createElement('img');
    badge.id = 'blog-view-counter';
    badge.alt = '누적 조회수';
    badge.height = 20;
    badge.referrerPolicy = 'no-referrer';
    badge.addEventListener('load', () => {
      const target = document.querySelector('[data-view-counter] .view-count');
      if (target) target.replaceChildren(badge);
    });
    badge.addEventListener('error', () => {
      const target = document.querySelector('[data-view-counter]');
      if (target) {
        target.querySelector('.view-count').textContent = '—';
        target.title = '조회수를 잠시 확인할 수 없습니다.';
      }
    });
    // One external request per 30-minute inactivity session, across all public pages.
    void prepareSessionCounter().then(() => {
      badge.src = 'https://hits.sh/rihoyo.github.io/buiing_blog.svg?view=total&style=flat-square&label=&color=ffffff&labelColor=ffffff';
    }).catch(() => {
      const target = document.querySelector('[data-view-counter]');
      if (target) target.title = '브라우저 저장소를 사용할 수 없어 집계를 건너뛰었습니다.';
    });
    const holder = document.createElement('div');
    holder.hidden = true;
    holder.append(badge);
    document.body.append(holder);
  }
  if (slot && badge.complete && badge.naturalWidth) slot.querySelector('.view-count').replaceChildren(badge);
}
