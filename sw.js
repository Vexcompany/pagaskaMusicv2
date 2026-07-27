const SW_VERSION  = 'pagaska-v4';
const SHELL_CACHE = `${SW_VERSION}-shell`;
const IMAGE_CACHE = `${SW_VERSION}-images`;

const SHELL_FILES = [
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

const NEVER_CACHE = ['/', '/index.html', '/login.html', '/dashboard.html'];

const NETWORK_ONLY_PATTERNS = [
  'supabase.co',
  'api.nexray.eu.cc',
  'api.ferdev.my.id',
  'itunes.apple.com',
  'music.apple.com',
  'lrclib.net',
  'api.telegram.org',
  'theresav.biz.id',
  'vex.web.id',
  'r2.cloudflarestorage.com',
  'r2.dev',
  'cloudflarestorage.com',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => Promise.allSettled(
        SHELL_FILES.map(url => cache.add(url).catch(e =>
          console.warn('[SW] Shell miss:', url, e.message)
        ))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys
        .filter(k => k.startsWith('pagaska-') && !k.startsWith(SW_VERSION))
        .map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  const { type } = event.data || {};
  if (type === 'SKIP_WAITING') self.skipWaiting();
  if (type === 'GET_CACHE_STATS') {
    getCacheStats().then(stats =>
      event.source.postMessage({ type: 'CACHE_STATS', stats })
    );
  }
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (!url.protocol.startsWith('http')) return;

  if (NETWORK_ONLY_PATTERNS.some(p => url.hostname.includes(p))) {
    event.respondWith(fetch(req));
    return;
  }

  const isAudio = /\.(mp3|m4a|aac|ogg|opus|wav)(\?|$)/i.test(url.pathname);
  if (isAudio) {
    event.respondWith(fetch(req));
    return;
  }

  const isImage = /\.(jpg|jpeg|png|webp|gif|svg)(\?|$)/i.test(url.pathname)
    || url.hostname.includes('mzstatic.com')
    || url.hostname.includes('i.scdn.co');

  if (isImage) {
    event.respondWith(imageCacheStrategy(req));
    return;
  }

  event.respondWith(shellCacheStrategy(req));
});

async function shellCacheStrategy(request) {
  const url = new URL(request.url);
  const isNeverCache = NEVER_CACHE.some(p => url.pathname === p);
  const cache = await caches.open(SHELL_CACHE);

  try {
    const response = await fetch(request);
    if (response.ok && !isNeverCache) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response('Offline', { status: 503 });
  }
}

async function imageCacheStrategy(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return new Response(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
      { headers: { 'Content-Type': 'image/svg+xml' } }
    );
  }
}

async function getCacheStats() {
  try {
    const shellCache = await caches.open(SHELL_CACHE);
    const imageCache = await caches.open(IMAGE_CACHE);
    const shellKeys = await shellCache.keys();
    const imageKeys = await imageCache.keys();
    return {
      shell:  { count: shellKeys.length },
      images: { count: imageKeys.length },
      audio:  { count: 0, sizeMB: '0.0', note: 'Audio tidak di-cache (di-serve oleh Cloudflare CDN)' },
    };
  } catch (e) {
    return { error: e.message };
  }
}

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}
  const title = data.title || 'Pagaska Music';
  const body  = data.body  || 'Ada pesan baru dari admin!';
  const icon  = data.icon  || '/icons/icon-192.png';
  const badge = data.badge || '/icons/icon-192.png';
  const tag   = data.tag   || 'pagaska-notif-' + Date.now();
  const url   = data.url   || '/index.html';
  event.waitUntil(
    self.registration.showNotification(title, {
      body, icon, badge, tag,
      data: { url },
      vibrate: [200, 100, 200],
      requireInteraction: false,
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/index.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes(self.location.origin) && 'focus' in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
