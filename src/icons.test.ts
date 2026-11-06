import { describe, expect, it } from 'vitest';
import sprite from './assets/icons.svg?raw';
import fondo from './assets/fondo.svg?raw';
import grano from './assets/grano.svg?raw';
import cursorFlecha from './assets/cursor-flecha.svg?raw';
import cursorMano from './assets/cursor-mano.svg?raw';
import cursorEspera from './assets/cursor-espera.svg?raw';
import { PORTRAITS } from './characters';
import { BUSINESSES } from './data';
import { ICON_NAMES } from './icons';

const symbols = [...sprite.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]);

describe('sprite de iconos', () => {
  it('cada nombre tiene su symbol y viceversa', () => {
    expect([...symbols].sort()).toEqual([...ICON_NAMES].sort());
  });

  it('los platos de los negocios son raster, no viven en el sprite', () => {
    for (const b of BUSINESSES) expect(symbols).not.toContain(b.icon);
  });

  it('los personajes viven en los retratos raster, no en el sprite', () => {
    for (const id of Object.keys(PORTRAITS)) expect(symbols).not.toContain(id);
  });

  it('sprite, fondo, grano y cursores compatibles con la CSP: sin style, script, handlers ni recursos externos', () => {
    // url(#id) es una referencia interna (el filtro del grano); la CSP no la bloquea.
    for (const svg of [sprite, fondo, grano, cursorFlecha, cursorMano, cursorEspera]) {
      expect(svg.replace(/<!--[\s\S]*?-->/g, '')).not.toMatch(
        /<style|style=|<script|\son\w+=|href=|xlink:|<image|url\((?!#)/i,
      );
    }
  });
});
