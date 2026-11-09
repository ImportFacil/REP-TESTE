{{-- App instalável: manifesto, ícones e registro do service worker (todas as páginas da loja) --}}
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#1D4ED8">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="ImportFácil">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="apple-touch-icon" href="/importfacil/icone-apple.png">
<script>
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function () {}); });
  }
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); window.importfacilInstalar = e; document.dispatchEvent(new Event('importfacil:instalavel')); });
</script>
