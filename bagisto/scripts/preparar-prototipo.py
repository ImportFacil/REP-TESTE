#!/usr/bin/env python3
"""Prepara o protótipo (index.html da raiz do repositório) para abrir dentro do app da loja, em /prototipo.

Uso: preparar-prototipo.py <index.html do protótipo> <tabela ncm.json> <pasta de saída>

- <base href="/prototipo/">: os arquivos do protótipo ficam em /prototipo/ na loja;
- tira o manifesto e o service worker próprios do protótipo (dentro do app vale o da loja,
  e assim o protótipo não vira um segundo app);
- põe um botão "Todas as páginas", que volta para /paginas (no app instalado não há barra do navegador).
"""
import os
import re
import shutil
import sys

origem, ncm, saida = sys.argv[1:4]
html = open(origem, encoding='utf-8').read()


def trocar(padrao, novo, texto, obrigatorio=True):
    resultado, n = re.subn(padrao, novo, texto, count=1, flags=re.S)
    if obrigatorio and n == 0:
        sys.exit(f'preparar-prototipo: não encontrei {padrao!r} no protótipo')
    return resultado


html = trocar(r'(<meta charset="UTF-8">)', r'\1\n<base href="/prototipo/">', html)
html = trocar(r'<link rel="manifest" href="prototipo-globo\.webmanifest">\n?', '', html)
html = trocar(r'href="prototipo-globo-apple\.png"', 'href="/importfacil/icone-apple.png"', html)
html = trocar(r'<script>\s*// App instalável \(PWA\).*?</script>\n?', '', html)

botao = """
<a href="/paginas" id="if-todas-paginas" aria-label="Todas as páginas do app">☰ Todas as páginas</a>
<style>
  #if-todas-paginas{position:fixed;z-index:2147483000;right:12px;bottom:calc(84px + env(safe-area-inset-bottom));
    background:#1D4ED8;color:#fff;font:600 13px/1 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-decoration:none;
    padding:10px 14px;border-radius:999px;box-shadow:0 4px 14px rgba(0,0,0,.25)}
  #if-todas-paginas:focus-visible{outline:3px solid #93C5FD;outline-offset:2px}
  @media (min-width:900px){#if-todas-paginas{bottom:20px}}
  @media print{#if-todas-paginas{display:none}}
</style>
"""
html = trocar(r'</body>', botao + '</body>', html)

os.makedirs(saida, exist_ok=True)
open(os.path.join(saida, 'index.html'), 'w', encoding='utf-8').write(html)
shutil.copyfile(ncm, os.path.join(saida, 'prototipo-ncm.json'))
print(f'Protótipo pronto em {saida} ({len(html) // 1024} KB)')
