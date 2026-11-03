import { describe, expect, it } from 'vitest';
import css from './style.css?raw';
import html from '../index.html?raw';
import viteConfig from '../vite.config.ts?raw';
import ofl from '../public/fonts/OFL-rye.txt?raw';

/** Ruta pública del único woff2 del proyecto: la que leen el preload, el @font-face y el SW. */
const RUTA = '/fonts/rye-v17-latin.woff2';
const MAX_BYTES = 60 * 1024;

const woff2 = import.meta.glob('../public/fonts/*.woff2', { query: '?url', import: 'default', eager: true });

describe('fuente de rótulo (Rye)', () => {
  it('el woff2 existe en public/fonts y es el único', () => {
    expect(Object.keys(woff2)).toEqual(['../public/fonts/rye-v17-latin.woff2']);
  });

  it('style.css, index.html y el SW apuntan a la misma ruta', () => {
    expect(css).toContain(`url('${RUTA}') format('woff2')`);
    expect(html).toContain(`href="${RUTA}" as="font" type="font/woff2" crossorigin`);
    expect(viteConfig).toMatch(/globPatterns: \['\*\*\/\*\.\{[^}]*woff2[^}]*\}'\]/);
  });

  it('@font-face con swap y subconjunto latino declarado', () => {
    expect(css).toMatch(
      /@font-face\s*\{[^}]*font-family: 'Rye'[^}]*font-display: swap[^}]*unicode-range:\s*U\+0000-00FF/,
    );
  });

  it('la licencia OFL acompaña al archivo', () => {
    expect(ofl).toContain('SIL OPEN FONT LICENSE');
    expect(ofl).toMatch(/Reserved Font Name\s+"?Rye"?/i);
  });

  it('pesa como máximo 60 KB', async () => {
    const fs = await import('node:fs/promises');
    const stat = await fs.stat(new URL('../public/fonts/rye-v17-latin.woff2', import.meta.url));
    expect(stat.size).toBeLessThanOrEqual(MAX_BYTES);
  });
});
