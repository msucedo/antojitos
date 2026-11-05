import agua from './assets/platos/agua.webp?url';
import camion from './assets/platos/camion.webp?url';
import concha from './assets/platos/concha.webp?url';
import elote from './assets/platos/elote.webp?url';
import olla from './assets/platos/olla.webp?url';
import taco from './assets/platos/taco.webp?url';
import tienda from './assets/platos/tienda.webp?url';
import torta from './assets/platos/torta.webp?url';
import { icon, type IconName } from './icons';

/**
 * Iconos raster de los platos (estilo de icono de juego: contorno grueso, sombra desplazada y
 * brillo; ver DESIGN.md "Platos raster"). 256×256 WebP con alfa, generados con
 * docs/platos-prompt.md y scripts/retrato.py --plato. Los negocios sin raster siguen usando su
 * símbolo del sprite hasta que estén los ocho. platos.test.ts comprueba cada archivo.
 */
export const PLATOS: Partial<Record<IconName, string>> = { elote, agua, taco, torta, olla, concha, tienda, camion };

/** Imagen del plato: <img> si hay raster, si no el icono SVG (con su halo .sticker). Decorativa. */
export function plato(name: IconName, className: string): HTMLImageElement | SVGSVGElement {
  const src = PLATOS[name];
  if (!src) return icon(name, `${className} sticker`);
  const img = document.createElement('img');
  img.className = className;
  img.src = src;
  img.alt = '';
  img.decoding = 'async';
  img.width = 256;
  img.height = 256;
  return img;
}
