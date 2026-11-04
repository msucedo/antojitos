#!/usr/bin/env python3
"""
Retrato raster de un personaje: quita el fondo plano, recorta y exporta a WebP con alfa.

Uso:  python3 scripts/retrato.py chelo
Lee  docs/refs/<id>-v1.png (o .jpeg/.jpg) y escribe src/assets/personajes/<id>.webp (480×480).
Requiere Pillow (pip install pillow). El fondo debe ser un color plano: se rellena desde las
esquinas con tolerancia 28 (aguanta artefactos JPEG) y el alfa se suaviza con desenfoque 0.8.
"""
import sys
from collections import deque
from pathlib import Path

try:
    from PIL import Image, ImageFilter
except ImportError:
    raise SystemExit('Falta Pillow: pip install pillow')

ROOT = Path(__file__).resolve().parents[1]

SIZE = 480
TOL = 28
MARGIN = 0.04
QUALITY = 85
MAX_KB = 80


def quitar_fondo(im: Image.Image) -> Image.Image:
    w, h = im.size
    px = im.load()
    bg = px[2, 2]

    def es_fondo(c):
        return all(abs(c[i] - bg[i]) <= TOL for i in range(3))

    mask = Image.new('L', (w, h), 255)
    mp = mask.load()
    seen = bytearray(w * h)
    q = deque()
    for x, y in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (0, h // 2), (w - 1, h // 2)]:
        if es_fondo(px[x, y]):
            q.append((x, y))
            seen[y * w + x] = 1
    while q:
        x, y = q.popleft()
        mp[x, y] = 0
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and es_fondo(px[nx, ny]):
                seen[ny * w + nx] = 1
                q.append((nx, ny))
    mask = mask.filter(ImageFilter.GaussianBlur(0.8))
    out = im.convert('RGBA')
    out.putalpha(mask)
    return out


def cuadrar(im: Image.Image) -> Image.Image:
    box = im.getchannel('A').getbbox()
    if box is None:
        raise SystemExit('la imagen quedó vacía: ¿el fondo no es plano?')
    l, t, r, b = box
    side = max(r - l, b - t)
    pad = int(side * MARGIN)
    side += 2 * pad
    cx, cy = (l + r) // 2, (t + b) // 2
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(im, (side // 2 - cx, side // 2 - cy), im)
    return canvas.resize((SIZE, SIZE), Image.LANCZOS)


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    pid = sys.argv[1]
    refs = ROOT / 'docs' / 'refs'
    src = next((p for p in (refs / f'{pid}-v1{ext}' for ext in ('.png', '.jpeg', '.jpg')) if p.exists()), None)
    if src is None:
        raise SystemExit(f'no existe docs/refs/{pid}-v1.(png|jpeg|jpg)')
    im = Image.open(src)
    # Un PNG que ya trae transparencia real se respeta; si no, el fondo plano se quita.
    if 'A' in im.getbands() and im.getchannel('A').getextrema()[0] < 255:
        con_alfa = im.convert('RGBA')
    else:
        con_alfa = quitar_fondo(im.convert('RGB'))
    out = cuadrar(con_alfa)
    dest = ROOT / 'src' / 'assets' / 'personajes' / f'{pid}.webp'
    dest.parent.mkdir(parents=True, exist_ok=True)
    out.save(dest, 'WEBP', quality=QUALITY, method=6)
    kb = dest.stat().st_size / 1024
    print(f'{dest} {out.size[0]}×{out.size[1]} {kb:.0f} KB')
    if kb > MAX_KB:
        raise SystemExit(f'pesa más de {MAX_KB} KB: baja QUALITY o simplifica la imagen')


if __name__ == '__main__':
    main()
