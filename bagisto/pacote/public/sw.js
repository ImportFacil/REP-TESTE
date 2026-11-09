/* App instalável ImportFácil (Bagisto): rede primeiro para as páginas, com a página offline de reserva;
   arquivos estáticos (temas, ícones, imagens em cache) ficam guardados no aparelho. */
const VERSAO = 'importfacil-bagisto-v1';
const ESSENCIAL = ['/offline', '/importfacil/icone-192.png', '/importfacil/icone-512.png', '/manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ESSENCIAL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  const u = new URL(r.url);
  if (r.mode === 'navigate') {
    e.respondWith(fetch(r).catch(() => caches.match('/offline')));
    return;
  }
  if (/^\/(themes|importfacil|cache|storage)\//.test(u.pathname)) {
    e.respondWith(caches.match(r).then(hit => hit || fetch(r).then(resp => {
      if (resp.ok) { const copia = resp.clone(); caches.open(VERSAO).then(c => c.put(r, copia)); }
      return resp;
    })));
  }
});
