import { describe, expect, it } from 'vitest';
import { PORTRAITS } from './characters';
import { BUSINESSES, CHELO } from './data';
import { bubbleVisible } from './ui';

const MAX_LEN = 70;
const PICTOGRAM = /\p{Extended_Pictographic}/u;
/** Tratamiento de género o rol hacia el jugador: fuera de la voz de los personajes. */
const GENDERED = /\b(patrón|patrona|jefe|jefa|mijo|mija|señor|señora)\b/i;

describe('personajes', () => {
  const managers = BUSINESSES.map((b) => b.manager);

  it('cada gerente tiene nombre único, y los retratos son exactamente los gerentes más Chelo', () => {
    const names = managers.map((m) => m.name);
    expect(new Set(names).size).toBe(names.length);
    const ids = [CHELO.id, ...managers.map((m) => m.id)];
    expect(Object.keys(PORTRAITS).sort()).toEqual([...ids].sort());
    for (const m of managers) expect(['m', 'f']).toContain(m.genero);
  });

  it('las frases son cortas, sin pictogramas y sin tratamiento de género', () => {
    const lines = [...managers.flatMap((m) => Object.values(m.says)), ...Object.values(CHELO.says)];
    expect(lines.length).toBe(BUSINESSES.length * 4 + 5);
    for (const line of lines) {
      expect(line.trim().length).toBeGreaterThan(0);
      expect(line.length).toBeLessThanOrEqual(MAX_LEN);
      expect(line).not.toMatch(PICTOGRAM);
    }
    for (const m of managers) for (const line of Object.values(m.says)) expect(line).not.toMatch(GENDERED);
  });

  it('Chelo: reposo corto y preguntas fijas con respuestas de hasta 140 caracteres', () => {
    expect(CHELO.idle.length).toBeLessThanOrEqual(MAX_LEN);
    expect(CHELO.idle).not.toMatch(PICTOGRAM);
    expect(CHELO.faq.length).toBeGreaterThanOrEqual(3);
    expect(CHELO.faq.filter((f) => 'id' in f && f.id === 'ahora').length).toBe(1);
    for (const f of CHELO.faq) {
      expect(f.q.length).toBeLessThanOrEqual(40);
      expect(f.q).not.toMatch(PICTOGRAM);
      if ('a' in f) {
        expect(f.a.trim().length).toBeGreaterThan(0);
        expect(f.a.length).toBeLessThanOrEqual(140);
        expect(f.a).not.toMatch(PICTOGRAM);
      }
    }
  });

  it('el costo del gerente es entero y positivo', () => {
    for (const m of managers) {
      expect(Number.isInteger(m.cost)).toBe(true);
      expect(m.cost).toBeGreaterThan(0);
    }
  });
});

describe('retratos raster', () => {
  it('cada retrato es WebP 480×480 con alfa y pesa como máximo 80 KB', async () => {
    const fs = await import('node:fs/promises');
    const ascii = (b: Uint8Array, from: number) => String.fromCharCode(...b.subarray(from, from + 4));
    for (const [id, url] of Object.entries(PORTRAITS)) {
      expect(url).toMatch(new RegExp(`/${id}\\.webp$`)); // cada clave apunta a su propio archivo
      const bytes = await fs.readFile(new URL(`./assets/personajes/${id}.webp`, import.meta.url));
      expect(bytes.length).toBeLessThanOrEqual(80 * 1024);
      expect(ascii(bytes, 0)).toBe('RIFF');
      expect(ascii(bytes, 8)).toBe('WEBP');
      expect(ascii(bytes, 12)).toBe('VP8X');
      const at = (i: number) => bytes[i] ?? 0;
      expect(at(20) & 0x10).toBeTruthy(); // flag de alfa
      // VP8X: ancho y alto en 24 bits, menos uno.
      const w = 1 + (at(24) | (at(25) << 8) | (at(26) << 16));
      const h = 1 + (at(27) | (at(28) << 8) | (at(29) << 16));
      expect([w, h]).toEqual([480, 480]);
    }
  });
});

describe('bocadillos', () => {
  it('bubbleVisible compara marcas de tiempo sin temporizadores', () => {
    expect(bubbleVisible(1000, 0)).toBe(false);
    expect(bubbleVisible(1000, 1000)).toBe(false);
    expect(bubbleVisible(1000, 1001)).toBe(true);
  });
});
