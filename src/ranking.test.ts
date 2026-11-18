import { describe, expect, it } from 'vitest';
import { newState } from './game';
import { MAX_IMPORT_CHARS } from './save';
import {
  crearIdentidad,
  cuerpoEnvio,
  debeEnviar,
  ENVIO_MS,
  enVuelo,
  haceTexto,
  leerPuestoGuardado,
  marcaEnvio,
  parsearEnvio,
  parsearTop,
  puestoDesdeTop,
  REINTENTO_MS,
  serializarPuesto,
} from './ranking';

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
    expect(debeEnviar({ en: T0, ganado: 400, recetas: 2, resultado: 'ok' as const }, s, T0 + ENVIO_MS - 1)).toBe(false);
    expect(debeEnviar({ en: T0, ganado: 400, recetas: 2, resultado: 'ok' as const }, s, T0 + ENVIO_MS)).toBe(true);
    expect(debeEnviar({ ...marcaEnvio(s, T0), resultado: 'ok' }, s, T0 + ENVIO_MS * 5)).toBe(false);
    // Heredar: lo ganado no cambia pero las recetas sí.
    expect(debeEnviar({ en: T0, ganado: 500, recetas: 1, resultado: 'ok' as const }, s, T0 + ENVIO_MS)).toBe(true);
    // Gastar efectivo no cuenta: el ranking no lo muestra.
    expect(debeEnviar({ ...marcaEnvio(s, T0), resultado: 'ok' }, { ...s, money: 1 }, T0 + ENVIO_MS)).toBe(false);
  });

  it('429 y sin red se reintentan a los 30 s aunque nada cambie; salto a los 60 s; uno fijo no', () => {
    for (const resultado of ['limite', 'red'] as const) {
      const u = { ...marcaEnvio(s, T0), resultado };
      expect(debeEnviar(u, s, T0 + REINTENTO_MS - 1)).toBe(false);
      expect(debeEnviar(u, s, T0 + REINTENTO_MS)).toBe(true);
    }
    const salto = { ...marcaEnvio(s, T0), resultado: 'salto' as const };
    expect(debeEnviar(salto, s, T0 + ENVIO_MS - 1)).toBe(false);
    expect(debeEnviar(salto, s, T0 + ENVIO_MS)).toBe(true);
    expect(debeEnviar({ ...marcaEnvio(s, T0), resultado: 'baneado' }, s, T0 + ENVIO_MS * 5)).toBe(false);
  });

  it('con un envío en vuelo no se manda otro; uno colgado vence a los 30 s', () => {
    const vuelo = marcaEnvio({ ...s, lifetimeEarned: 1 }, T0); // aunque haya cambiado lo ganado
    expect(enVuelo(vuelo, T0 + REINTENTO_MS - 1)).toBe(true);
    expect(debeEnviar(vuelo, s, T0 + REINTENTO_MS - 1)).toBe(false);
    expect(enVuelo(vuelo, T0 + REINTENTO_MS)).toBe(false);
    expect(debeEnviar(vuelo, s, T0 + REINTENTO_MS)).toBe(true);
    expect(enVuelo(null, T0)).toBe(false);
  });
});

describe('puesto al instante', () => {
  const ID = '6f1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
  const fila = (pos: number, apodo: string, money: number) => ({ pos, apodo, money, recetas: 0 });

  it('puestoDesdeTop: tu fila por apodo y una cifra posible (entre lo último aceptado y lo ganado aquí)', () => {
    const top = { top: [fila(1, 'Lupita', 900), fila(2, 'Beto', 500), fila(3, 'Chuy', 100)], total: 40 };
    expect(puestoDesdeTop(top, 'Beto', 400, 600, T0)).toEqual({
      puesto: { pos: 2, total: 40, en: T0, guardado: false },
      ganado: 500,
    });
    // Mismo apodo que otro jugador: solo cuenta la fila cuya cifra cabe.
    const dobles = { top: [fila(1, 'Beto', 9_000), fila(2, 'Beto', 500)], total: 2 };
    expect(puestoDesdeTop(dobles, 'Beto', 400, 600, T0)?.puesto.pos).toBe(2);
    // Fuera del Top (o la fila es de otro Beto más rico): sin puesto, nunca el ajeno.
    expect(puestoDesdeTop({ top: [fila(1, 'Beto', 9_000)], total: 300 }, 'Beto', 400, 600, T0)).toBeNull();
    // Dos candidatas posibles: ambiguo, sin puesto.
    expect(
      puestoDesdeTop({ top: [fila(1, 'Beto', 550), fila(2, 'Beto', 500)], total: 2 }, 'Beto', 0, 600, T0),
    ).toBeNull();
    expect(puestoDesdeTop({ top: [], total: 0 }, 'Beto', 0, 600, T0)).toBeNull();
  });

  it('caché: ida y vuelta, solo para la misma identidad, y basura vale null', () => {
    const p = { pos: 3, total: 12, en: T0, guardado: false };
    const texto = serializarPuesto(ID, p, 500);
    expect(leerPuestoGuardado(texto, ID)).toEqual({ puesto: { ...p, guardado: true }, ganado: 500 });
    expect(leerPuestoGuardado(texto, '11111111-2222-4333-8444-555555555555')).toBeNull();
    expect(leerPuestoGuardado(null, ID)).toBeNull();
    expect(leerPuestoGuardado('', ID)).toBeNull();
    expect(leerPuestoGuardado('{no json', ID)).toBeNull();
    expect(leerPuestoGuardado(JSON.stringify({ id: ID, pos: 0, total: 1, en: T0, ganado: 1 }), ID)).toBeNull();
    expect(leerPuestoGuardado(JSON.stringify({ id: ID, pos: 5, total: 2, en: T0, ganado: 1 }), ID)).toBeNull();
    expect(leerPuestoGuardado(JSON.stringify({ id: ID, pos: 1, total: 2, en: 'ayer', ganado: 1 }), ID)).toBeNull();
    expect(leerPuestoGuardado(JSON.stringify({ id: ID, pos: 1, total: 2, en: T0, ganado: -1 }), ID)).toBeNull();
  });

  it('haceTexto: minutos, horas y días', () => {
    expect(haceTexto(0)).toBe('hace 1 min');
    expect(haceTexto(5 * 60_000)).toBe('hace 5 min');
    expect(haceTexto(3 * 3_600_000)).toBe('hace 3 h');
    expect(haceTexto(3 * 86_400_000)).toBe('hace 3 días');
  });
});
