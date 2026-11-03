import { describe, expect, it } from 'vitest';
import { BUSINESSES, CHELO } from './data';
import { ICON_NAMES } from './icons';
import { bubbleVisible } from './ui';

const MAX_LEN = 70;
const PICTOGRAM = /\p{Extended_Pictographic}/u;
/** Tratamiento de género o rol hacia el jugador: fuera de la voz de los personajes. */
const GENDERED = /\b(patrón|patrona|jefe|jefa|mijo|mija|señor|señora)\b/i;

describe('personajes', () => {
  const managers = BUSINESSES.map((b) => b.manager);

  it('cada negocio tiene gerente con nombre único y avatar en el sprite', () => {
    const names = managers.map((m) => m.name);
    expect(new Set(names).size).toBe(names.length);
    for (const m of managers) expect(ICON_NAMES).toContain(m.icon);
    expect(ICON_NAMES).toContain(CHELO.icon);
  });

  it('las frases son cortas, sin pictogramas y sin tratamiento de género', () => {
    const lines = [...managers.flatMap((m) => Object.values(m.says)), ...Object.values(CHELO.says)];
    expect(lines.length).toBe(BUSINESSES.length * 3 + 4);
    for (const line of lines) {
      expect(line.trim().length).toBeGreaterThan(0);
      expect(line.length).toBeLessThanOrEqual(MAX_LEN);
      expect(line).not.toMatch(PICTOGRAM);
    }
    for (const m of managers) for (const line of Object.values(m.says)) expect(line).not.toMatch(GENDERED);
  });

  it('el costo del gerente es entero y positivo', () => {
    for (const m of managers) {
      expect(Number.isInteger(m.cost)).toBe(true);
      expect(m.cost).toBeGreaterThan(0);
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
