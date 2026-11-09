#!/usr/bin/env python3
"""Gera as imagens dos produtos para a demonstração do Bagisto.

- Produtos com foto (Pexels): baixa a foto.
- Demais: desenha a ilustração do protótipo (ou o ícone da categoria) sobre fundo claro, como no protótipo.

Uso: python3 gerar-imagens.py catalogo-importfacil.json pasta-saida
Precisa de rsvg-convert (pacote librsvg2-bin). Falha de download não interrompe: o produto usa o desenho.
"""
import json, os, re, subprocess, sys, urllib.request

FUNDO, TRACO, LADO = '#F1EFE9', '#57534E', 800

def svg_quadro(svg):
    m = re.search(r'viewBox="([\d.\s-]+)"', svg)
    vb = m.group(1) if m else '0 0 24 24'
    corpo = re.sub(r'^<svg[^>]*>|</svg>\s*$', '', svg.strip())
    t = int(LADO * 0.56); o = (LADO - t) // 2
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{LADO}" height="{LADO}" viewBox="0 0 {LADO} {LADO}">'
            f'<rect width="{LADO}" height="{LADO}" fill="{FUNDO}"/>'
            f'<svg x="{o}" y="{o}" width="{t}" height="{t}" viewBox="{vb}" fill="none" stroke="{TRACO}" '
            f'stroke-width="{2.6 if vb.endswith("64") else 1.6}" stroke-linecap="round" stroke-linejoin="round" color="{TRACO}">{corpo}</svg></svg>')

def desenhar(svg, destino):
    tmp = destino + '.svg'
    with open(tmp, 'w', encoding='utf-8') as f: f.write(svg_quadro(svg))
    subprocess.run(['rsvg-convert', '-w', str(LADO), '-h', str(LADO), '-o', destino, tmp], check=True)
    os.remove(tmp)

def main(arq, saida):
    os.makedirs(saida, exist_ok=True)
    d = json.load(open(arq, encoding='utf-8'))
    ok_foto = ok_desenho = 0
    for p in d['produtos']:
        base = os.path.join(saida, str(p['id']))
        if p.get('foto'):
            try:
                req = urllib.request.Request(p['foto'], headers={'User-Agent': 'ImportFacil-demo/1.0'})
                with urllib.request.urlopen(req, timeout=30) as r, open(base + '.jpg', 'wb') as f: f.write(r.read())
                ok_foto += 1; continue
            except Exception as e:
                print('foto indisponível', p['codigo'], e, file=sys.stderr)
        if p.get('svg'):
            desenhar(p['svg'], base + '.png'); ok_desenho += 1
    print(f'{ok_foto} fotos baixadas, {ok_desenho} desenhos gerados')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
