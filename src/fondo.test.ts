import { describe, expect, it } from 'vitest';
import sprite from './assets/icons.svg?raw';
import { BANDERIN_D, crearPiezas, densidad, escalaCerca, escalaPicado, giroBanderin, posicion } from './fondo';

describe('fondo animado', () => {
  it('el banderín del canvas es el mismo del sprite', () => {
    const m = /<symbol id="banderin" viewBox="0 0 24 28">\s*<path[^>]* d="([^"]+)"/.exec(sprite);
    expect(m?.[1]).toBe(BANDERIN_D);
  });

  it('misma semilla, mismas piezas; otra semilla, otras', () => {
    expect(crearPiezas(5, 42)).toEqual(crearPiezas(5, 42));
    expect(crearPiezas(5, 42)).not.toEqual(crearPiezas(5, 43));
  });

  it('la posición depende solo de t: cae y vuelve a empezar por arriba', () => {
    const [p] = crearPiezas(1, 7);
    if (!p) throw new Error('sin pieza');
    const pieza = { ...p, v: 0, vel: 0.02 };
    expect(posicion(pieza, 1000, 400, 800)).toEqual(posicion(pieza, 1000, 400, 800));
    const a = posicion(pieza, 0, 400, 800);
    const b = posicion(pieza, 1000, 400, 800);
    expect(b.y - a.y).toBeCloseTo(20); // 0.02 px/ms × 1000 ms
    // Tras recorrer todo el tramo (alto + 2 × 12 de margen) vuelve al mismo sitio.
    expect(posicion(pieza, (800 + 24) / 0.02, 400, 800).y).toBeCloseTo(a.y);
    for (let t = 0; t < 60_000; t += 997) {
      const { y } = posicion(pieza, t, 400, 800);
      expect(y).toBeGreaterThanOrEqual(-12);
      expect(y).toBeLessThan(812);
    }
  });

  it('cerca del texto la pieza se encoge hasta desaparecer', () => {
    const cajas = [{ x: 100, y: 100, w: 50, h: 20 }];
    expect(escalaCerca(120, 110, cajas)).toBe(0); // encima
    expect(escalaCerca(152, 110, cajas)).toBe(0); // pegada
    expect(escalaCerca(158, 110, cajas)).toBeCloseTo(0.5);
    expect(escalaCerca(200, 110, cajas)).toBe(1);
    expect(escalaCerca(0, 0, [])).toBe(1);
  });

  it('densidad: una pieza por 9000 px², con tope', () => {
    expect(densidad(390, 844)).toBe(37);
    expect(densidad(1280, 800)).toBe(90);
    expect(densidad(0, 800)).toBe(0);
  });

  it('el picado escala como el svg (xMinYMin slice de 1152 × 28)', () => {
    expect(escalaPicado(358, 20)).toBeCloseTo(20 / 28); // móvil: manda el alto
    expect(escalaPicado(2000, 26)).toBeCloseTo(2000 / 1152); // más ancho que 48 banderines: manda el ancho
  });

  it('la sacudida decae y no existe antes de pedirla', () => {
    const quieto = giroBanderin(3, 5000, Infinity);
    expect(quieto.baja).toBe(0);
    expect(Math.abs(quieto.giro)).toBeLessThanOrEqual(0.12);
    expect(giroBanderin(3, 10_000, 5000).baja).toBeCloseTo(0);
  });
});
