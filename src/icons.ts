import spriteUrl from './assets/icons.svg?url';

/** Debe coincidir con los <symbol id> de assets/icons.svg (lo comprueba icons.test.ts). */
export const ICON_NAMES = [
  'elote',
  'agua',
  'taco',
  'torta',
  'olla',
  'concha',
  'tienda',
  'camion',
  'chelo',
  'beto',
  'lupita',
  'guero',
  'tere',
  'chuy',
  'rosita',
  'perez',
  'jefa',
  'banderin',
  'sello',
  'upgrade',
  'recipe',
  'moneda',
  'monedas',
  'costal',
  'caja',
  'bocina',
  'bocina-off',
  'guitarra',
  'guitarra-off',
  'sound-on',
  'sound-off',
  'music-on',
  'music-off',
  'menu',
  'lock',
  'check',
] as const;

export type IconName = (typeof ICON_NAMES)[number];

const NS = 'http://www.w3.org/2000/svg';

/** `<use>` que apunta a un símbolo del sprite. */
export function use(name: IconName): SVGUseElement {
  const u = document.createElementNS(NS, 'use');
  u.setAttribute('href', `${spriteUrl}#${name}`);
  return u;
}

/** Icono decorativo: el nombre accesible lo pone el control que lo contiene. */
export function icon(name: IconName, className = 'icon'): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.append(use(name));
  return svg;
}

/** Cambia el icono de un <svg> creado con icon() sin recrear el nodo. */
export function setIcon(svg: SVGSVGElement, name: IconName): void {
  const use = svg.firstElementChild;
  const href = `${spriteUrl}#${name}`;
  if (use && use.getAttribute('href') !== href) use.setAttribute('href', href);
}
