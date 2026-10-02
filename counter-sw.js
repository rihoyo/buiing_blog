/* Only the view-counter image is intercepted; HTML, assets and APIs pass through. */
const CACHE = 'buiing-view-session-v1';
const SESSION_MS = 30 * 60 * 1000;
const META = new URL('__view-session', self.registration.scope).href;
const IMAGE = new URL('__view-image', self.registration.scope).href;
const COUNTER = 'https://hits.sh/rihoyo.github.io/buiing_blog.svg?view=total&style=flat-square&label=&color=ffffff&labelColor=ffffff';
let queue = Promise.resolve();
const unavailable = () => new Response('<svg xmlns="http://www.w3.org/2000/svg" width="22" height="20"><rect width="22" height="20" fill="white"/><text x="11" y="14" text-anchor="middle" font-family="monospace" font-size="11" fill="#777">—</text></svg>', {headers:{'Content-Type':'image/svg+xml','Cache-Control':'no-store'}});
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

async function sessionImage() {
  let cache;
  let previous;
  try {
    cache = await caches.open(CACHE);
    previous = await cache.match(IMAGE);
    const response = await cache.match(META);
    const meta = response ? await response.json() : null;
    const now = Date.now();
    const active = Number.isFinite(meta?.lastSeen) && now - meta.lastSeen < SESSION_MS;
    // Sliding inactivity window, shared by tabs and retained across browser restarts.
    // Reserve the session BEFORE networking, including on failure: never retry per reload.
    await cache.put(META, new Response(JSON.stringify({lastSeen:now}), {headers:{'Content-Type':'application/json'}}));
    if (active) return previous || unavailable();
  } catch {
    // Storage denied/full: do not fall back to counting every page request.
    return previous || unavailable();
  }
  try {
    const response = await fetch(COUNTER, {
      mode:'no-cors', credentials:'omit', referrerPolicy:'no-referrer',
      cache:'no-store', signal:AbortSignal.timeout(8000)
    });
    // Opaque cross-origin images can be stored without reading their contents.
    if (response.type !== 'opaque' && !response.ok) throw new Error('Counter unavailable');
    await cache.put(IMAGE, response.clone());
    return response;
  } catch {
    return previous || unavailable();
  }
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || event.request.destination !== 'image' || event.request.url !== COUNTER) return;
  // Serialize simultaneous first visits from multiple tabs to prevent duplicate hits.
  const task = queue.then(sessionImage, sessionImage);
  queue = task.then(() => undefined, () => undefined);
  event.respondWith(task);
  event.waitUntil(queue);
});
