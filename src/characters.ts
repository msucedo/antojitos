import beto from './assets/personajes/beto.webp?url';
import chelo from './assets/personajes/chelo.webp?url';
import chuy from './assets/personajes/chuy.webp?url';
import guero from './assets/personajes/guero.webp?url';
import jefa from './assets/personajes/jefa.webp?url';
import lupita from './assets/personajes/lupita.webp?url';
import perez from './assets/personajes/perez.webp?url';
import rosita from './assets/personajes/rosita.webp?url';
import tere from './assets/personajes/tere.webp?url';

/**
 * Retratos raster (estampilla ilustrada, 480×480 WebP con alfa; ver DESIGN.md "Retratos raster").
 * Única fuente de los ids de personaje: ManagerDef.id y CHELO.id son claves de este objeto.
 * characters.test.ts comprueba que cada archivo existe, es WebP con alfa y pesa como máximo 80 KB.
 */
export const PORTRAITS = { chelo, beto, lupita, guero, tere, chuy, rosita, perez, jefa };

export type CharacterId = keyof typeof PORTRAITS;

/**
 * Imagen del personaje. Decorativa (alt vacío): el nombre lo da el botón o el título que la rodea.
 * `lazy` para las que nacen fuera de la vista (cupones del panel cerrado, sellos de tarjeta sin
 * gerente): en la primera visita no compiten con la fuente; el service worker las precachea después.
 */
export function portrait(name: CharacterId, className: string, lazy = false): HTMLImageElement {
  const src = PORTRAITS[name];
  const img = document.createElement('img');
  img.className = className;
  img.src = src;
  img.alt = '';
  img.decoding = 'async';
  if (lazy) img.loading = 'lazy';
  img.width = 480;
  img.height = 480;
  return img;
}
