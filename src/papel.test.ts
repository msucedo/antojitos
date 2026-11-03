import { describe, expect, it } from 'vitest';
import { BUSINESSES, PAPELES, type Papel } from './data';
import type { IconName } from './icons';

/**
 * Papeles donde el icono se perdería: comparten tono con su relleno principal
 * (decisión de DESIGN.md: el icono nunca va sobre papel de su propio matiz). Tabla a mano,
 * no derivada del sprite: guarda la decisión, no el hecho; al cambiar un relleno, revisarla.
 */
const PROHIBIDOS: Readonly<Partial<Record<IconName, readonly Papel[]>>> = {
  elote: ['mostaza'],
  agua: ['rosa'],
  taco: ['crema', 'mostaza'],
  torta: ['crema'],
  olla: ['mostaza'],
  concha: ['rosa'],
  tienda: ['crema', 'rosa'],
  camion: ['rosa'],
};

describe('papel de estampilla por negocio', () => {
  it('cada negocio tiene un papel del conjunto', () => {
    for (const b of BUSINESSES) expect(PAPELES, b.id).toContain(b.papel);
  });

  it('dos negocios vecinos nunca repiten papel', () => {
    for (let i = 1; i < BUSINESSES.length; i++) {
      expect(BUSINESSES[i]?.papel, BUSINESSES[i]?.id).not.toBe(BUSINESSES[i - 1]?.papel);
    }
  });

  it('cada papel se usa exactamente dos veces', () => {
    for (const p of PAPELES)
      expect(
        BUSINESSES.filter((b) => b.papel === p),
        p,
      ).toHaveLength(2);
  });

  it('el icono nunca cae sobre un papel de su propio matiz', () => {
    for (const b of BUSINESSES) expect(PROHIBIDOS[b.icon] ?? [], b.id).not.toContain(b.papel);
  });
});
