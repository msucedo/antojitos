#!/usr/bin/env python3
"""
Retrato raster de un personaje: quita el fondo plano, recorta y exporta a WebP con alfa.

Uso:  python3 scripts/retrato.py chelo
      python3 scripts/retrato.py lupita --sujeto --abajo 985
      python3 scripts/retrato.py guero --version 2
      python3 scripts/retrato.py tere --recorte 20,140,420,640
Lee  docs/refs/<id>-v1.png (o .jpeg/.jpg; --version N lee <id>-vN) y escribe src/assets/personajes/<id>.webp (480×480).
Requiere Pillow (pip install pillow). El fondo debe ser un color plano: se rellena desde las
esquinas con tolerancia 28 (aguanta artefactos JPEG) y el alfa se suaviza con desenfoque 0.8.
--sujeto: el fondo es una escena; se recorta la figura con Vision de macOS (scripts/recorta.swift,
necesita Xcode Command Line Tools y macOS 14 o más). --recorte L,T,R,B se queda solo con esa caja
(píxeles de la imagen original): para cuando el modelo pinta varias variantes. --abajo N descarta las
filas desde el píxel N antes de cuadrar (N relativo a la imagen ya recortada por --recorte, si lo hay):
sirve para tirar rótulos pegados al busto.
"""
import argparse
import subprocess
import tempfile
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


def recortar_sujeto(im: Image.Image) -> Image.Image:
    """Figura con alfa vía Vision (VNGenerateForegroundInstanceMaskRequest)."""
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / 'entrada.png'
        out = Path(tmp) / 'sujeto.png'
        im.convert('RGB').save(src)
        try:
            subprocess.run(['swift', str(ROOT / 'scripts' / 'recorta.swift'), str(src), str(out)], check=True)
        except FileNotFoundError:
            raise SystemExit('--sujeto necesita swift: instala Xcode Command Line Tools (xcode-select --install)')
        except subprocess.CalledProcessError as e:
            raise SystemExit(f'recorta.swift falló (código {e.returncode}): ¿macOS 14+? ¿hay una figura en el recorte?')
        return Image.open(out).convert('RGBA').copy()


def caja(texto: str) -> tuple[int, int, int, int]:
    partes = texto.split(',')
    if len(partes) != 4:
        raise argparse.ArgumentTypeError('--recorte espera L,T,R,B (cuatro enteros)')
    l, t, r, b = (int(v) for v in partes)
    if not (l < r and t < b):
        raise argparse.ArgumentTypeError('--recorte: L < R y T < B')
    return l, t, r, b


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('id', help='personaje: nombre de docs/refs/<id>-vN.* y de src/assets/personajes/<id>.webp')
    ap.add_argument('--version', type=int, default=1, metavar='N', help='lee docs/refs/<id>-vN (default 1)')
    ap.add_argument('--sujeto', action='store_true', help='recorta la figura con Vision (fondo con escena)')
    ap.add_argument('--recorte', type=caja, metavar='L,T,R,B', help='caja de la imagen original a conservar')
    ap.add_argument('--abajo', type=int, metavar='N', help='descarta las filas desde N (tras --recorte)')
    a = ap.parse_args()
    pid, version, sujeto, recorte, abajo = a.id, a.version, a.sujeto, a.recorte, a.abajo
    refs = ROOT / 'docs' / 'refs'
    src = next((p for p in (refs / f'{pid}-v{version}{ext}' for ext in ('.png', '.jpeg', '.jpg')) if p.exists()), None)
    if src is None:
        raise SystemExit(f'no existe docs/refs/{pid}-v{version}.(png|jpeg|jpg)')
    im = Image.open(src)
    if recorte:
        im = im.crop(recorte)
    # Un PNG que ya trae transparencia real se respeta; si no, el fondo plano se quita.
    if sujeto:
        con_alfa = recortar_sujeto(im)
    elif 'A' in im.getbands() and im.getchannel('A').getextrema()[0] < 255:
        con_alfa = im.convert('RGBA')
    else:
        con_alfa = quitar_fondo(im.convert('RGB'))
    if abajo is not None:
        con_alfa = con_alfa.crop((0, 0, con_alfa.width, abajo))
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
