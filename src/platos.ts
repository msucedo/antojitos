import agua from './assets/platos/agua.webp?url';
import camion from './assets/platos/camion.webp?url';
import concha from './assets/platos/concha.webp?url';
import elote from './assets/platos/elote.webp?url';
import olla from './assets/platos/olla.webp?url';
import puestos from './assets/platos/puestos.webp?url';
import taco from './assets/platos/taco.webp?url';
import tienda from './assets/platos/tienda.webp?url';
import torta from './assets/platos/torta.webp?url';

/** Id del plato raster de cada negocio (`BusinessDef.icon`). */
export type PlatoId = 'elote' | 'agua' | 'taco' | 'torta' | 'olla' | 'concha' | 'tienda' | 'camion';

/**
 * Iconos raster de los platos (estilo de icono de juego: contorno grueso, sombra desplazada y
 * brillo; ver DESIGN.md "Platos raster"). 256×256 WebP con alfa, generados con
 * docs/platos-prompt.md y scripts/retrato.py --plato. platos.test.ts comprueba cada archivo.
 */
export const PLATOS: Readonly<Record<PlatoId, string>> = { elote, agua, taco, torta, olla, concha, tienda, camion };

/** Todo el arte raster del mismo estilo: los platos más `puestos` (tres toldos de tianguis), el cupón "Todos los negocios". */
export type RasterId = PlatoId | 'puestos';

export const RASTER: Readonly<Record<RasterId, string>> = { ...PLATOS, puestos };

/** Imagen del plato. Decorativa: el nombre lo pone el control que la contiene. */
export function plato(name: RasterId, className: string): HTMLImageElement {
  const img = document.createElement('img');
  img.className = className;
  img.src = RASTER[name];
  img.alt = '';
  img.decoding = 'async';
  img.width = 256;
  img.height = 256;
  return img;
}
