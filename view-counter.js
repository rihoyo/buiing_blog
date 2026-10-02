// One shared counter across public blog pages. No keys or paid plan required.
export function mountViewCounter() {
  const slot = document.querySelector('[data-view-counter]');
  const isPublicSite = location.hostname === 'rihoyo.github.io' && location.pathname.startsWith('/buiing_blog/');
  if (!isPublicSite || location.pathname.startsWith('/buiing_blog/admin/')) {
    if (slot) slot.textContent = '누적 조회수 · —';
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
      const target = document.querySelector('[data-view-counter]');
      if (target) target.replaceChildren(badge);
    });
    badge.addEventListener('error', () => {
      const target = document.querySelector('[data-view-counter]');
      if (target) target.textContent = '누적 조회수 · 잠시 확인할 수 없음';
    });
    // A single stable key aggregates home, articles, about and community views.
    badge.src = 'https://hits.sh/rihoyo.github.io/buiing_blog.svg?view=total&style=flat-square&label=%EB%88%84%EC%A0%81%20%EC%A1%B0%ED%9A%8C%EC%88%98&color=444444&labelColor=222222';
    const holder = document.createElement('div');
    holder.hidden = true;
    holder.append(badge);
    document.body.append(holder);
  }
  if (slot && badge.complete && badge.naturalWidth) slot.replaceChildren(badge);
}
