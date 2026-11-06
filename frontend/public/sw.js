/* Service worker da ImportFácil: deixa o site instalável e abre mais rápido.
   Nunca guarda respostas da API nem o config.json (dados sempre atuais). */
const VERSAO = 'importfacil-v2';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(['/', '/manifest.webmanifest', '/icone-192.png'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((chaves) => Promise.all(chaves.filter((k) => k !== VERSAO).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname === '/config.json') return;
  // Arquivos com hash no nome: do cache primeiro.
  if (url.pathname.startsWith('/_next/static/')) {
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then((resp) => {
      const copia = resp.clone();
      caches.open(VERSAO).then((c) => c.put(e.request, copia));
      return resp;
    })));
    return;
  }
  // Páginas: da rede primeiro; sem conexão, a última versão guardada.
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then((resp) => {
      const copia = resp.clone();
      caches.open(VERSAO).then((c) => c.put(e.request, copia));
      return resp;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('/'))));
  }
});
