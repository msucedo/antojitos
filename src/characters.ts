import chelo from './assets/personajes/chelo.webp?url';
import { icon, type IconName } from './icons';

/**
 * Retratos raster (estampilla ilustrada, 480×480 WebP con alfa; ver DESIGN.md "Retratos raster").
 * Los personajes sin retrato siguen usando su símbolo del sprite. characters.test.ts comprueba
 * que cada archivo existe, es WebP con alfa y pesa como máximo 80 KB.
 */
export const PORTRAITS: Partial<Record<IconName, string>> = { chelo };

/** Imagen del personaje: <img> si hay retrato raster, si no el icono SVG. Decorativa (alt vacío). */
export function portrait(name: IconName, className: string): HTMLElement | SVGSVGElement {
  const src = PORTRAITS[name];
  if (!src) return icon(name, className);
  const img = document.createElement('img');
  img.className = className;
  img.src = src;
  img.alt = '';
  img.decoding = 'async';
  img.width = 480;
  img.height = 480;
  return img;
}
