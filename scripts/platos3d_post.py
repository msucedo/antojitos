"""
Paso 2D de los platos de Blender (lo llama scripts/platos3d.py; Pillow, python3 del sistema).

    python3 scripts/platos3d_post.py <carpeta de renders> [ids...]

Por cada <id>.png (1024, alfa): cuadra, pone el contorno exterior de tinta (alfa dilatado) y la sombra
dura de tinta desplazada abajo a la derecha, como los platos raster, y escribe docs/refs/propuesta-platos/<id>.webp
(256×256, como src/assets/platos/). Luego arma la hoja de comparación hoja.png con el plato actual
frente al nuevo sobre el papel de su tarjeta (igual en claro y oscuro), a 256, 76 (móvil) y 72 px
(web), y en gris "sin abrir".
"""
import io
import math
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter

sys.dont_write_bytecode = True  # no dejar scripts/__pycache__ al importar retrato
sys.path.insert(0, str(Path(__file__).resolve().parent))
from retrato import QUALITY, cuadrar  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'docs' / 'refs' / 'propuesta-platos'
ACTUAL = ROOT / 'src' / 'assets' / 'platos'
INK = (0x1B, 0x2A, 0x3A)
LADO = 1024
MARGEN = 0.1    # deja sitio a contorno y sombra antes de recuadrar
CONTORNO = 26   # contorno exterior de tinta, px a 1024 (6.5 a 256), como los platos raster
SOMBRA = 20     # desplazamiento de la sombra a 1024
MAX_KB = 30
# ImageChops.offset enrolla: el margen debe cubrir contorno y sombra para que nada dé la vuelta
assert LADO * MARGEN / (1 + 2 * MARGEN) > CONTORNO + SOMBRA + 4  # margen real tras cuadrar

PAPEL = {'crema': '#fff6e5', 'rosa': '#f6c7cf', 'mostaza': '#f5c462', 'verde': '#c5dcc6'}
PAPEL_DE = {'elote': 'rosa', 'agua': 'crema', 'taco': 'verde', 'torta': 'rosa',
            'olla': 'crema', 'concha': 'mostaza', 'tienda': 'verde', 'camion': 'mostaza'}
ORDEN = ['elote', 'agua', 'taco', 'torta', 'olla', 'concha', 'tienda', 'camion']
# alternativas: se comparan contra el plato del negocio que podrían sustituir
ALTERNATIVA = {'tacos-plato': 'taco', 'taqueria': 'taco', 'trompo-mesa': 'taco', 'trompo-papel': 'taco', 'elote-papel': 'elote'}
# recorte de papel: borde blanco grueso y sombra suave, como despegado de la tarjeta
PAPEL_RECORTE = {'trompo-papel', 'elote-papel'}
BORDE_PAPEL = 34          # px a 1024
TRAZO_PAPEL = 9           # línea de tinta entre la figura y el papel, px a 1024
SOMBRA_PAPEL = (14, 22)   # desplazamiento a 1024
GIRO_PAPEL = 0            # grados (derecho, a pedido del user)
# composiciones 2D: (render, lado, x, y) de atrás hacia adelante, en un lienzo de 1024; cada capa lleva su
# contorno para separarse de la de atrás. Así cada pieza conserva su ángulo (trompo de perfil, plato desde arriba).
COMPUESTOS = {'taqueria': [('taco', 720, 304, 0), ('tacos-plato', 720, 0, 304)]}
BG = '#f1e6d0'  # --bg claro; el papel de la tarjeta es el mismo en los dos temas


def dilatar(alfa: Image.Image, r: int) -> Image.Image:
    """Dilatación redonda: máximo del alfa corrido por el borde de un disco de radio r."""
    out = alfa.copy()
    pasos = max(16, int(2 * math.pi * r / 1.5))
    for k in range(pasos):
        t = 2 * math.pi * k / pasos
        out = ImageChops.lighter(out, ImageChops.offset(alfa, round(r * math.cos(t)), round(r * math.sin(t))))
    return out


def tinta(alfa: Image.Image) -> Image.Image:
    im = Image.new('RGBA', alfa.size, INK + (0,))
    im.putalpha(alfa)
    return im


def con_contorno(im: Image.Image) -> Image.Image:
    capa = Image.new('RGBA', im.size, (0, 0, 0, 0))
    capa.alpha_composite(tinta(dilatar(im.getchannel('A'), CONTORNO)))
    capa.alpha_composite(im)
    return capa


def componer(carpeta: Path, capas: list) -> Image.Image:
    lienzo = Image.new('RGBA', (LADO, LADO), (0, 0, 0, 0))
    for rid, lado, x, y in capas:
        pieza = cuadrar(Image.open(carpeta / f'{rid}.png').convert('RGBA'), lado, MARGEN)
        hueco = Image.new('RGBA', (LADO, LADO), (0, 0, 0, 0))
        hueco.alpha_composite(pieza, (x, y))
        lienzo.alpha_composite(con_contorno(hueco))
    return lienzo


def procesar(src: Path, capas: list | None = None) -> Image.Image:
    if capas:
        im = cuadrar(componer(src.parent, capas), LADO, MARGEN)  # ya trae los contornos
        borde = im.getchannel('A')
    else:
        im = cuadrar(Image.open(src).convert('RGBA'), LADO, MARGEN)
        borde = dilatar(im.getchannel('A'), CONTORNO)
    sombra = ImageChops.offset(borde, SOMBRA, SOMBRA)
    lienzo = Image.new('RGBA', im.size, (0, 0, 0, 0))
    lienzo.alpha_composite(tinta(sombra))
    lienzo.alpha_composite(tinta(borde))
    lienzo.alpha_composite(im)
    return cuadrar(lienzo, 256, 0.02)


def recorte(src: Path) -> Image.Image:
    im = cuadrar(Image.open(src).convert('RGBA'), LADO, MARGEN)
    alfa = im.getchannel('A')
    papel = Image.new('RGBA', im.size, (0xFF, 0xFF, 0xFF, 0))
    papel.putalpha(dilatar(alfa, BORDE_PAPEL))
    papel.alpha_composite(tinta(dilatar(alfa, TRAZO_PAPEL)))  # trazo del dibujo recortado
    papel.alpha_composite(im)
    papel = papel.rotate(GIRO_PAPEL, resample=Image.BICUBIC)
    sombra = ImageChops.offset(papel.getchannel('A'), *SOMBRA_PAPEL).point(lambda v: v * 45 // 100)
    sombra = sombra.filter(ImageFilter.GaussianBlur(6))
    lienzo = Image.new('RGBA', im.size, (0, 0, 0, 0))
    lienzo.alpha_composite(tinta(sombra))
    lienzo.alpha_composite(papel)
    return cuadrar(lienzo, 256, 0.02)


def guardar(im: Image.Image, dest: Path) -> None:
    buf = io.BytesIO()
    im.save(buf, 'WEBP', quality=QUALITY, method=6)
    kb = buf.tell() / 1024
    if kb > MAX_KB:
        raise SystemExit(f'{dest.name}: {kb:.1f} KB > {MAX_KB} KB')
    dest.write_bytes(buf.getvalue())
    print(f'{dest.relative_to(ROOT)}: {kb:.1f} KB')


def tarjeta(icono: Image.Image | None, papel: str, lado: int, gris: bool = False) -> Image.Image:
    pad = max(8, lado // 8)
    t = Image.new('RGBA', (lado + 2 * pad, lado + 2 * pad), (0, 0, 0, 0))
    ImageDraw.Draw(t).rounded_rectangle((0, 0, t.width - 1, t.height - 1), radius=pad, fill=PAPEL[papel],
                                        outline=INK, width=2)
    if icono is not None:
        ic = icono.resize((lado, lado), Image.LANCZOS)
        if gris:
            a = ic.getchannel('A').point(lambda v: int(v * 0.6))
            ic = ic.convert('L').convert('RGBA')
            ic.putalpha(a)
        t.alpha_composite(ic, (pad, pad))
    return t


def hoja(ids: list[str]) -> None:
    filas = []
    for pid in ids:
        base = ALTERNATIVA.get(pid, pid)
        papel = PAPEL_DE[base]
        act = ACTUAL / f'{base}.webp'
        actual = Image.open(act).convert('RGBA') if act.exists() else None
        nuevo = Image.open(OUT / f'{pid}.webp').convert('RGBA')
        grupo = [tarjeta(actual, papel, 256), tarjeta(nuevo, papel, 256)]
        chicas = [tarjeta(actual, papel, 76), tarjeta(nuevo, papel, 76),
                  tarjeta(actual, papel, 72), tarjeta(nuevo, papel, 72),
                  tarjeta(actual, papel, 76, gris=True), tarjeta(nuevo, papel, 76, gris=True)]
        fila = Image.new('RGBA', (sum(c.width for c in grupo) + 16 + 2 * (chicas[0].width + 8) + 32,
                                  grupo[0].height + 32), BG)
        x = 16
        for c in grupo:
            fila.alpha_composite(c, (x, 16))
            x += c.width + 8
        x += 8
        for i in range(0, 6, 2):
            y = 16 + (i // 2) * (chicas[0].height + 8)
            fila.alpha_composite(chicas[i], (x, y))
            fila.alpha_composite(chicas[i + 1], (x + chicas[i].width + 8, y))
        filas.append(fila)
    h = Image.new('RGBA', (max(f.width for f in filas), sum(f.height for f in filas)), BG)
    y = 0
    for f in filas:
        h.alpha_composite(f, (0, y))
        y += f.height
    nombre = 'hoja.png' if len(ids) == len(ORDEN) else f'hoja-{"-".join(ids)}.png'
    h.convert('RGB').save(OUT / nombre)
    print(f'{(OUT / nombre).relative_to(ROOT)}')


def main() -> None:
    carpeta = Path(sys.argv[1])
    ids = sys.argv[2:] or [p for p in ORDEN if (carpeta / f'{p}.png').exists()]
    OUT.mkdir(parents=True, exist_ok=True)
    for pid in ids:
        im = recorte(carpeta / f'{pid}.png') if pid in PAPEL_RECORTE else procesar(carpeta / f'{pid}.png', COMPUESTOS.get(pid))
        guardar(im, OUT / f'{pid}.webp')
    hechos = [p for p in ORDEN if (OUT / f'{p}.webp').exists()]
    if len(hechos) == len(ORDEN) and set(ids) <= set(ORDEN):
        hoja(ORDEN)
    else:
        hoja(ids)


if __name__ == '__main__':
    main()
