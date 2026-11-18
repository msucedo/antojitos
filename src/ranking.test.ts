import { describe, expect, it } from 'vitest';
import { newState } from './game';
import { MAX_IMPORT_CHARS } from './save';
import { crearIdentidad, cuerpoEnvio, debeEnviar, ENVIO_MS, marcaEnvio, parsearEnvio, parsearTop } from './ranking';

const T0 = 1_700_000_000_000;

describe('crearIdentidad', () => {
  it('id UUID y secreto de 32 hex desde el azar del navegador', () => {
    const rng = {
      randomUUID: () => '6f1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
      getRandomValues: (a: Uint8Array<ArrayBuffer>) => a.fill(0xab),
    };
    expect(crearIdentidad('Beto', rng)).toEqual({
      id: '6f1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
      secreto: 'ab'.repeat(16),
      apodo: 'Beto',
    });
  });
});

describe('cuerpoEnvio', () => {
  it('envuelve el guardado en { save } y respeta el tope del respaldo', () => {
    const s = newState(T0);
    const body = cuerpoEnvio(s);
    expect(body).not.toBeNull();
    const envuelto = JSON.parse(body!) as { save: string };
    expect(JSON.parse(envuelto.save)).toEqual(s);
    expect(cuerpoEnvio({ ...s, upgrades: Array.from({ length: 3_000 }, (_, i) => `m${i}`) })).toBeNull();
    expect(body!.length).toBeLessThan(MAX_IMPORT_CHARS + 20);
  });
});

describe('parsearTop / parsearEnvio', () => {
  it('acepta solo filas con apodo string y dinero finito; descarta lo demás', () => {
    const ok = { top: [{ pos: 1, apodo: 'Lupita', money: 5000, recetas: 4 }], total: 7 };
    expect(parsearTop(ok)).toEqual(ok);
    // Respuesta cacheada de antes de las recetas: se acepta sin ellas.
    expect(parsearTop({ top: [{ pos: 1, apodo: 'L', money: 1 }], total: 1 })?.top[0]?.recetas).toBeNull();
    expect(parsearTop({ top: [{ pos: 1, apodo: 'L', money: 1, recetas: -1 }], total: 1 })).toBeNull();
    expect(parsearTop({ top: [{ pos: 1, apodo: 'L', money: 1, recetas: '3' }], total: 1 })).toBeNull();
    expect(parsearTop({ top: [{ pos: 1, apodo: 'L', money: 'mucho' }], total: 1 })).toBeNull();
    expect(parsearTop({ top: [{ pos: 1, apodo: 7, money: 1 }], total: 1 })).toBeNull();
    expect(parsearTop({ top: 'nada', total: 1 })).toBeNull();
    expect(parsearTop(null)).toBeNull();
    expect(parsearTop({ top: [], total: Infinity })).toBeNull();
    expect(parsearEnvio({ pos: 3, total: 10 })).toEqual({ pos: 3, total: 10, apodo: null });
    expect(parsearEnvio({ pos: 3, total: 10, apodo: 'Beto' })).toEqual({ pos: 3, total: 10, apodo: 'Beto' });
    expect(parsearEnvio({ pos: 0, total: 10 })).toBeNull();
    expect(parsearEnvio({ error: 'salto' })).toBeNull();
  });
});

describe('debeEnviar', () => {
  const ranking = { id: '6f1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', secreto: 'a'.repeat(32), apodo: 'Beto' };
  const s = { ...newState(T0), money: 100, lifetimeEarned: 500, recipes: 2, ranking };
  it('sin envío previo, sí; luego solo al minuto y si cambió lo ganado o las recetas', () => {
    expect(debeEnviar(null, s, T0)).toBe(true);
    expect(debeEnviar({ en: T0, ganado: 400, recetas: 2 }, s, T0 + ENVIO_MS - 1)).toBe(false);
    expect(debeEnviar({ en: T0, ganado: 400, recetas: 2 }, s, T0 + ENVIO_MS)).toBe(true);
    expect(debeEnviar(marcaEnvio(s, T0), s, T0 + ENVIO_MS * 5)).toBe(false);
    // Heredar: lo ganado no cambia pero las recetas sí.
    expect(debeEnviar({ en: T0, ganado: 500, recetas: 1 }, s, T0 + ENVIO_MS)).toBe(true);
    // Gastar efectivo no cuenta: el ranking no lo muestra.
    expect(debeEnviar(marcaEnvio(s, T0), { ...s, money: 1 }, T0 + ENVIO_MS)).toBe(false);
  });
});
