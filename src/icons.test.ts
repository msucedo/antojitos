import { describe, expect, it } from 'vitest';
import sprite from './assets/icons.svg?raw';
import { BUSINESSES } from './data';
import { ICON_NAMES } from './icons';

const symbols = [...sprite.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]);

describe('sprite de iconos', () => {
  it('cada nombre tiene su symbol y viceversa', () => {
    expect([...symbols].sort()).toEqual([...ICON_NAMES].sort());
  });

  it('todos los negocios y gerentes usan un icono existente', () => {
    for (const b of BUSINESSES) {
      expect(ICON_NAMES).toContain(b.icon);
      expect(ICON_NAMES).toContain(b.manager.icon);
    }
  });

  it('compatible con la CSP: sin style, script, handlers ni recursos externos', () => {
    expect(sprite.replace(/<!--[\s\S]*?-->/g, '')).not.toMatch(
      /<style|style=|<script|\son\w+=|href=|xlink:|<image|url\(/i,
    );
  });
});
