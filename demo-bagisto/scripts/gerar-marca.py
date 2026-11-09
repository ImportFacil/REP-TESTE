#!/usr/bin/env python3
"""Gera logo, favicon e banners da página inicial da demonstração (rsvg-convert + DejaVu Sans).

Uso: python3 gerar-marca.py pasta-marca   (lê pasta-marca/globo.png e grava os PNGs na mesma pasta)
"""
import base64, os, subprocess, sys

def png(svg, destino, w, h):
    tmp = destino + '.svg'
    open(tmp, 'w', encoding='utf-8').write(svg)
    subprocess.run(['rsvg-convert', '-w', str(w), '-h', str(h), '-o', destino, tmp], check=True)
    os.remove(tmp)

def main(pasta):
    g = 'data:image/png;base64,' + base64.b64encode(open(os.path.join(pasta, 'globo.png'), 'rb').read()).decode()
    fonte = "font-family=\"DejaVu Sans, Arial, sans-serif\""
    # logo do cabeçalho: globo + nome (proporção ~4,5:1, como o logo padrão do Bagisto)
    png(f'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="540" height="120" viewBox="0 0 540 120">
      <image x="4" y="6" width="108" height="108" xlink:href="{g}"/>
      <text x="128" y="80" {fonte} font-size="58" font-weight="bold" fill="#18181B">ImportFácil</text></svg>''',
        os.path.join(pasta, 'logo.png'), 540, 120)
    png(f'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="64" height="64"><image width="64" height="64" xlink:href="{g}"/></svg>''',
        os.path.join(pasta, 'favicon.png'), 64, 64)
    slides = [
        ('#1D4ED8', 'Compre direto da importadora', 'Preço de empresa para cooperativas, distribuidoras,', 'revendas, construtoras e hospitais.'),
        ('#18181B', 'Importação sob encomenda', 'Precisa de algo fora do catálogo? A gente importa', 'e acompanha a ordem até a sua empresa.'),
        ('#B45309', 'Pague como preferir', 'Pix com 3% de desconto, boleto em 30/60/90/120 dias', 'após o crédito ou cartão em até 12×.'),
    ]
    for i, (cor, t, l1, l2) in enumerate(slides, 1):
        png(f'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1920" height="640" viewBox="0 0 1920 640">
          <rect width="1920" height="640" fill="{cor}"/>
          <image x="1460" y="140" width="360" height="360" xlink:href="{g}"/>
          <text x="140" y="250" {fonte} font-size="68" font-weight="bold" fill="#ffffff">{t}</text>
          <text x="140" y="340" {fonte} font-size="40" fill="#ffffff" opacity="0.92">{l1}</text>
          <text x="140" y="395" {fonte} font-size="40" fill="#ffffff" opacity="0.92">{l2}</text>
          <rect x="140" y="450" width="330" height="76" rx="14" fill="#ffffff"/>
          <text x="305" y="500" {fonte} font-size="32" font-weight="bold" fill="{cor}" text-anchor="middle">Ver catálogo</text></svg>''',
            os.path.join(pasta, f'banner-{i}.png'), 1920, 640)
    print('logo, favicon e 3 banners gerados em', pasta)

if __name__ == '__main__':
    main(sys.argv[1])
