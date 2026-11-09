/* Service worker do protótipo: deixa instalável e funcionando sem internet
   (o protótipo guarda tudo no próprio aparelho). A versão nova entra na próxima abertura. */
const VERSAO = 'prototipo-v13';
const ARQUIVOS = ['./', './index.html', './prototipo-globo.webmanifest', './prototipo-globo-192.png', './prototipo-globo-512.png', './prototipo-globo-apple.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== VERSAO).map((x) => caches.delete(x)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  // Rede primeiro (sempre a versão mais nova); sem conexão, a cópia guardada.
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        const copia = r.clone();
        caches.open(VERSAO).then((c) => c.put(e.request, copia));
        return r;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html'))),
  );
});
