import { describe, expect, it } from 'vitest';
import { BUSINESSES } from './data';
import { PLATOS } from './platos';

describe('platos raster', () => {
  it('cada negocio tiene plato y cada plato es de un negocio', () => {
    expect(Object.keys(PLATOS).sort()).toEqual(BUSINESSES.map((b) => b.icon).sort());
  });

  it('cada plato apunta a su archivo y es WebP 256×256 con alfa de máximo 30 KB', async () => {
    const fs = await import('node:fs/promises');
    const ascii = (b: Uint8Array, from: number) => String.fromCharCode(...b.subarray(from, from + 4));
    for (const [id, url] of Object.entries(PLATOS)) {
      expect(url).toMatch(new RegExp(`/${id}\\.webp$`));
      const bytes = await fs.readFile(new URL(`./assets/platos/${id}.webp`, import.meta.url));
      expect(bytes.length, id).toBeLessThanOrEqual(30 * 1024);
      expect(ascii(bytes, 0)).toBe('RIFF');
      expect(ascii(bytes, 8)).toBe('WEBP');
      expect(ascii(bytes, 12)).toBe('VP8X');
      const at = (i: number) => bytes[i] ?? 0;
      expect(at(20) & 0x10).toBeTruthy(); // flag de alfa
      const w = 1 + (at(24) | (at(25) << 8) | (at(26) << 16));
      const h = 1 + (at(27) | (at(28) << 8) | (at(29) << 16));
      expect([w, h]).toEqual([256, 256]);
    }
  });
});
