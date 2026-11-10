import { describe, expect, it } from 'vitest';
import { newState } from './game';
import { MAX_IMPORT_CHARS } from './save';
import { crearIdentidad, cuerpoEnvio, debeEnviar, ENVIO_MS, parsearEnvio, parsearTop } from './ranking';

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
    const ok = { top: [{ pos: 1, apodo: 'Lupita', money: 5000 }], total: 7 };
    expect(parsearTop(ok)).toEqual(ok);
    expect(parsearTop({ top: [{ pos: 1, apodo: 'L', money: 'mucho' }], total: 1 })).toBeNull();
    expect(parsearTop({ top: [{ pos: 1, apodo: 7, money: 1 }], total: 1 })).toBeNull();
    expect(parsearTop({ top: 'nada', total: 1 })).toBeNull();
    expect(parsearTop(null)).toBeNull();
    expect(parsearTop({ top: [], total: Infinity })).toBeNull();
    expect(parsearEnvio({ pos: 3, total: 10 })).toEqual({ pos: 3, total: 10 });
    expect(parsearEnvio({ pos: 0, total: 10 })).toBeNull();
    expect(parsearEnvio({ error: 'salto' })).toBeNull();
  });
});

describe('debeEnviar', () => {
  const ranking = { id: '6f1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', secreto: 'a'.repeat(32), apodo: 'Beto' };
  const s = { ...newState(T0), money: 100, ranking };
  it('sin envío previo, sí; luego solo al minuto y si cambió el dinero o el apodo', () => {
    expect(debeEnviar(null, s, T0)).toBe(true);
    expect(debeEnviar({ en: T0, money: 50, apodo: 'Beto' }, s, T0 + ENVIO_MS - 1)).toBe(false);
    expect(debeEnviar({ en: T0, money: 50, apodo: 'Beto' }, s, T0 + ENVIO_MS)).toBe(true);
    expect(debeEnviar({ en: T0, money: 100, apodo: 'Beto' }, s, T0 + ENVIO_MS * 5)).toBe(false);
    expect(debeEnviar({ en: T0, money: 100, apodo: 'Viejo' }, s, T0 + ENVIO_MS)).toBe(true);
  });
});
