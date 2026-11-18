// Service worker do FlyNotes: funcionamento offline (app shell + anexos em cache).
const SHELL = 'flynotes-shell-v5';
const FILES = 'flynotes-files';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/', '/manifest.webmanifest', '/icon.svg', '/icon-192.png'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('flynotes-shell-') && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (url.origin !== location.origin || req.method !== 'GET') return;

  // Anexos: cache primeiro (são imutáveis), depois rede
  if (url.pathname === '/api/file' && !url.searchParams.has('download')) {
    e.respondWith(
      caches.open(FILES).then(async (cache) => {
        const key = '/api/file?id=' + url.searchParams.get('id');
        const hit = await cache.match(key);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(key, res.clone());
        return res;
      }),
    );
    return;
  }
  if (url.pathname.startsWith('/api/')) return;

  // Navegação: rede com recurso à cache (para abrir offline)
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then((res) => {
        // Só guarda páginas válidas (nunca uma página de erro)
        if (res.ok && (res.headers.get('content-type') || '').includes('text/html')) {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put('/', copy));
        }
        return res;
      }).catch(() => caches.match('/')),
    );
    return;
  }

  // Recursos estáticos: cache, atualizada em segundo plano
  e.respondWith(
    caches.open(SHELL).then(async (cache) => {
      const hit = await cache.match(req);
      const net = fetch(req).then((res) => {
        // Um ficheiro antigo que já não existe pode ser respondido com a página HTML: isso nunca se guarda
        const isHtml = (res.headers.get('content-type') || '').includes('text/html');
        if (res.ok && !isHtml && (url.pathname.startsWith('/assets/') || /\.(png|svg|webmanifest|js|css|woff2?)$/.test(url.pathname))) cache.put(req, res.clone());
        return res;
      }).catch(() => hit);
      return hit || net;
    }),
  );
});

// Notificações push (lembretes com a app fechada)
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { title: 'FlyNotes', body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(data.title || 'FlyNotes', {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag,
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const c = list[0];
    if (c) { c.focus(); return c.navigate ? c.navigate(url) : undefined; }
    return self.clients.openWindow(url);
  }));
});
