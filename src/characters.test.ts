import { describe, expect, it } from 'vitest';
import { PORTRAITS } from './characters';
import { BUSINESSES, CHELO, fraseDe, MILESTONES, OFFLINE_CAP_MS, RECETARIO, type ManagerDef } from './data';
import { formatDuration } from './format';
import { bubbleVisible, textoNivel } from './ui';

const MAX_LEN = 70;
const PICTOGRAM = /\p{Extended_Pictographic}/u;
/** Tratamiento de género o rol hacia el jugador: fuera de la voz de los personajes. */
const GENDERED = /\b(patrón|patrona|jefe|jefa|mijo|mija|señor|señora)\b/i;

describe('personajes', () => {
  const managers = BUSINESSES.map((b) => b.manager);
  const frases = (m: ManagerDef): string[] => [m.says.hire, m.says.upgrade, m.says.estrella, ...m.says.milestone];

  it('cada gerente tiene nombre único, y los retratos son exactamente los gerentes más Chelo', () => {
    const names = managers.map((m) => m.name);
    expect(new Set(names).size).toBe(names.length);
    const ids = [CHELO.id, ...managers.map((m) => m.id)];
    expect(Object.keys(PORTRAITS).sort()).toEqual([...ids].sort());
    for (const m of managers) expect(['m', 'f']).toContain(m.genero);
  });

  it('las frases son cortas, sin pictogramas y sin tratamiento de género', () => {
    const lines = [...managers.flatMap(frases), ...Object.values(CHELO.says)];
    expect(lines.length).toBe(BUSINESSES.length * (3 + MILESTONES.length) + 10);
    for (const line of lines) {
      expect(line.trim().length).toBeGreaterThan(0);
      expect(line.length).toBeLessThanOrEqual(MAX_LEN);
      expect(line).not.toMatch(PICTOGRAM);
    }
    for (const m of managers) for (const line of frases(m)) expect(line).not.toMatch(GENDERED);
  });

  it('cada gerente tiene una frase distinta por hito, y fraseDe la elige por el hito alcanzado', () => {
    for (const m of managers) {
      expect(m.says.milestone.length).toBe(MILESTONES.length);
      expect(new Set(m.says.milestone).size).toBe(MILESTONES.length);
      expect(fraseDe(m, 'milestone', 1)).toBe(m.says.milestone[0]);
      expect(fraseDe(m, 'milestone', MILESTONES.length)).toBe(m.says.milestone[MILESTONES.length - 1]);
      expect(fraseDe(m, 'milestone', 99)).toBe(m.says.milestone[MILESTONES.length - 1]);
      expect(fraseDe(m, 'milestone', 0)).toBe(m.says.milestone[0]);
      expect(fraseDe(m, 'hire')).toBe(m.says.hire);
    }
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

  it('la variante chica de Chelo es WebP 240×240 con alfa y pesa como máximo 20 KB', async () => {
    const fs = await import('node:fs/promises');
    const bytes = await fs.readFile(new URL('./assets/personajes/chelo-240.webp', import.meta.url));
    expect(bytes.length).toBeLessThanOrEqual(20 * 1024);
    expect(String.fromCharCode(...bytes.subarray(12, 16))).toBe('VP8X');
    const at = (i: number) => bytes[i] ?? 0;
    expect(at(20) & 0x10).toBeTruthy();
    expect(1 + (at(24) | (at(25) << 8) | (at(26) << 16))).toBe(240);
    expect(1 + (at(27) | (at(28) << 8) | (at(29) << 16))).toBe(240);
  });
});

describe('cupones del recetario', () => {
  it('la Olla dice qué se cobra al volver, y Chelo dice el tope base en la pregunta del empleado', () => {
    const olla = RECETARIO.find((d) => d.id === 'olla')!;
    expect(textoNivel(olla, 1)).toBe('Al volver cobras hasta 12 h de ventas');
    expect(textoNivel(olla, 2)).toBe('Al volver cobras hasta 24 h de ventas');
    const empleado = CHELO.faq.find((f) => f.q === '¿Qué hace un empleado?');
    expect(empleado && 'a' in empleado && empleado.a).toContain(`hasta ${formatDuration(OFFLINE_CAP_MS)}`);
  });
});

describe('bocadillos', () => {
  it('bubbleVisible compara marcas de tiempo sin temporizadores', () => {
    expect(bubbleVisible(1000, 0)).toBe(false);
    expect(bubbleVisible(1000, 1000)).toBe(false);
    expect(bubbleVisible(1000, 1001)).toBe(true);
  });
});
