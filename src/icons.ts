import spriteUrl from './assets/icons.svg?url';

/** Debe coincidir con los <symbol id> de assets/icons.svg (lo comprueba icons.test.ts). */
export const ICON_NAMES = [
  'banderin',
  'upgrade',
  'recipe',
  'moneda',
  'monedas',
  'pilas',
  'caja',
  'personajes',
  'gente',
  'bocina',
  'bocina-off',
  'nota',
  'nota-off',
  'engrane',
  'ajustes',
  'lock',
  'clavo',
  'estrella',
  'estrella-off',
  'album',
  'logo',
  'historial',
  'historial-sil',
  'trofeo-sil',
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

/**
 * Tabla del letrero de la tarjeta: un rect al 100 % × 100 % que se estira con el texto sin deformar
 * esquinas ni trazo (color y grosor en style.css, .tabla). El nombre lo pone el h2 que lo contiene.
 */
export function tabla(): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'tabla');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const rect = document.createElementNS(NS, 'rect');
  rect.setAttribute('width', '100%');
  rect.setAttribute('height', '100%');
  rect.setAttribute('rx', '6');
  svg.append(rect);
  return svg;
}
