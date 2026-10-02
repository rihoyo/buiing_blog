// One shared counter across public blog pages. No keys or paid plan required.
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
    // A single stable key aggregates home, articles, about and community views.
    badge.src = 'https://hits.sh/rihoyo.github.io/buiing_blog.svg?view=total&style=flat-square&label=&color=ffffff&labelColor=ffffff';
    const holder = document.createElement('div');
    holder.hidden = true;
    holder.append(badge);
    document.body.append(holder);
  }
  if (slot && badge.complete && badge.naturalWidth) slot.querySelector('.view-count').replaceChildren(badge);
}
