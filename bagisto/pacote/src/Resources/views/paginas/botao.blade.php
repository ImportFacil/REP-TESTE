{{-- Botão "Todas as páginas", em todas as páginas da loja e do Painel (no app instalado não há barra do navegador).
     Só estilos na própria tag: este trecho fica dentro do app Vue do Bagisto, que descarta <style> e <script>. --}}
@unless (request()->is('paginas'))
    <a href="/paginas" id="if-todas-paginas" aria-label="Todas as páginas do app"
       style="position:fixed;z-index:10050;right:12px;bottom:calc(16px + env(safe-area-inset-bottom));background:#1D4ED8;color:#fff;font:600 13px/1 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;text-decoration:none;padding:10px 14px;border-radius:999px;box-shadow:0 4px 14px rgba(0,0,0,.25)">☰ Todas as páginas</a>
@endunless
