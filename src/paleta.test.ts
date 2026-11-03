import { describe, expect, it } from 'vitest';
import { PAPELES as PAPELES_DATA } from './data';
import css from './style.css?raw';

/** Tokens `--nombre: #hex` de un bloque `:root { ... }`. */
function tokens(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [, name, hex] of block.matchAll(/(--[\w-]+):\s*(#[0-9a-f]{6})\b/gi)) {
    if (name && hex) out[name] = hex.toLowerCase();
  }
  return out;
}

const rootBlocks = [...css.matchAll(/:root\s*\{([^}]*)\}/g)].map((m) => m[1] ?? '');
const light = tokens(rootBlocks[0] ?? '');
// El bloque oscuro solo redefine: lo que no toca hereda del claro.
const dark = { ...light, ...tokens(rootBlocks[1] ?? '') };

function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Ratio de contraste WCAG 2 entre dos hex. */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const TEXTO = 4.5;
const UI = 3;

/** [primer plano, fondo, mínimo] por tema. */
const PARES_TEMA: [string, string, number][] = [
  ['--text', '--bg', TEXTO],
  ['--muted', '--bg', TEXTO],
  ['--text', '--card', TEXTO],
  ['--muted', '--card', TEXTO],
  ['--on-primary', '--primary', TEXTO],
  ['--on-corn', '--corn', TEXTO],
  ['--on-nopal', '--nopal', TEXTO],
  ['--primary', '--bg', UI],
  ['--focus', '--bg', UI],
  ['--border', '--bg', UI],
];

/** Pares fijos de la isla de papel (no dependen del tema). */
const PARES_TINTA: [string, string, number][] = [
  ['--on-tinta', '--tinta-rosa', TEXTO],
  ['--on-tinta', '--tinta-nopal', TEXTO],
];

/* Derivado de data.ts: un papel nuevo sin token en CSS falla aquí. */
const PAPELES = PAPELES_DATA.map((p) => `--papel-${p}`);

/** Tintas sobre cada papel: fijas en ambos temas. */
const PARES_PAPEL: [string, number][] = [
  ['--tinta', TEXTO],
  ['--tinta-suave', TEXTO],
  ['--tinta-rosa', UI],
  ['--tinta-nopal', UI],
];

describe('paleta: contraste WCAG AA', () => {
  it('encuentra los bloques :root claro y oscuro', () => {
    expect(rootBlocks.length).toBeGreaterThanOrEqual(2);
  });

  for (const [nombre, tema] of [
    ['claro', light],
    ['oscuro', dark],
  ] as const) {
    describe(nombre, () => {
      for (const [fg, bg, min] of PARES_TEMA) {
        it(`${fg} sobre ${bg} ≥ ${min}`, () => {
          const f = tema[fg];
          const b = tema[bg];
          expect(f, fg).toBeDefined();
          expect(b, bg).toBeDefined();
          expect(contrast(f ?? '', b ?? '')).toBeGreaterThanOrEqual(min);
        });
      }
    });
  }

  describe('papel de estampilla (fijo en ambos temas)', () => {
    for (const papel of PAPELES) {
      for (const [tinta, min] of PARES_PAPEL) {
        it(`${tinta} sobre ${papel} ≥ ${min}`, () => {
          const p = light[papel];
          const t = light[tinta];
          expect(p, papel).toBeDefined();
          expect(t, tinta).toBeDefined();
          expect(contrast(t ?? '', p ?? '')).toBeGreaterThanOrEqual(min);
        });
      }
    }

    for (const [fg, bg, min] of PARES_TINTA) {
      it(`${fg} sobre ${bg} ≥ ${min}`, () => {
        const f = light[fg];
        const b = light[bg];
        expect(f, fg).toBeDefined();
        expect(b, bg).toBeDefined();
        expect(contrast(f ?? '', b ?? '')).toBeGreaterThanOrEqual(min);
      });
    }

    it('el bloque oscuro no redefine papeles ni tintas', () => {
      const d = tokens(rootBlocks[1] ?? '');
      for (const t of [...PAPELES, ...PARES_PAPEL.map(([t]) => t)]) expect(d[t], t).toBeUndefined();
    });
  });
});
