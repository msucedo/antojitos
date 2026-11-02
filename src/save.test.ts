import { describe, expect, it } from 'vitest';
import { buy, newState, pendingRecipes, type State } from './game';
import {
  BACKUP_KEY,
  exportSave,
  importSave,
  load,
  MAX_IMPORT_CHARS,
  save,
  SAVE_KEY,
  UNREADABLE_KEY,
  validate,
  type KV,
} from './save';

const T0 = 1_700_000_000_000;

function memory(init: Record<string, string> = {}): KV & { data: Record<string, string> } {
  const data = { ...init };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
}

function played(): State {
  return buy({ ...newState(T0), money: 1_000 }, 'elotes', 10);
}

describe('validate', () => {
  it('acepta un estado válido sin cambios', () => {
    const s = played();
    expect(validate(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it.each([
    ['null', null],
    ['array', []],
    ['sin versión', { ...newState(T0), version: undefined }],
    ['versión futura', { ...newState(T0), version: 99 }],
    ['dinero negativo', { ...newState(T0), money: -1 }],
    ['dinero texto', { ...newState(T0), money: '1e9' }],
    ['recetas fraccionarias', { ...newState(T0), recipes: 1.5 }],
  ])('rechaza %s', (_, input) => {
    expect(validate(input)).toBeNull();
  });

  it('rechaza NaN/Infinity (JSON los vuelve null)', () => {
    const raw: unknown = JSON.parse(JSON.stringify({ ...newState(T0), money: NaN }));
    expect(validate(raw)).toBeNull();
    expect(validate({ ...newState(T0), lifetimeEarned: Infinity })).toBeNull();
  });

  it('rechaza negocio con campos inválidos', () => {
    const s = newState(T0);
    expect(validate({ ...s, businesses: { ...s.businesses, elotes: { count: -1 } } })).toBeNull();
    expect(
      validate({ ...s, businesses: { ...s.businesses, elotes: { ...s.businesses.elotes, manager: 'si' } } }),
    ).toBeNull();
  });

  it('descarta ids desconocidos y __proto__, rellena faltantes', () => {
    const s = newState(T0);
    const raw: unknown = JSON.parse(
      JSON.stringify({ ...s, businesses: { elotes: s.businesses.elotes, hackeo: { count: 5 } } }).replace(
        '"hackeo"',
        '"__proto__"',
      ),
    );
    const v = validate(raw);
    expect(v).not.toBeNull();
    expect(Object.keys(v!.businesses)).toEqual(Object.keys(s.businesses));
    expect(v!.businesses.tacos?.count).toBe(0);
    expect(({} as Record<string, unknown>).count).toBeUndefined();
  });

  it('limita progressMs al ciclo', () => {
    const s = newState(T0);
    const v = validate({ ...s, businesses: { ...s.businesses, elotes: { ...s.businesses.elotes, progressMs: 1e12 } } });
    expect(v!.businesses.elotes!.progressMs).toBeLessThanOrEqual(1_000);
  });
});

describe('load / save', () => {
  it('ida y vuelta', () => {
    const kv = memory();
    const s = played();
    save(kv, s);
    expect(load(kv, T0)).toEqual({ state: s, source: 'save', problem: false });
  });

  it('vacío → partida nueva sin aviso', () => {
    const r = load(memory(), T0);
    expect(r.source).toBe('new');
    expect(r.problem).toBe(false);
  });

  it('basura → respaldo, aviso, y guarda la copia ilegible', () => {
    const bak = played();
    const kv = memory({ [SAVE_KEY]: '{not json', [BACKUP_KEY]: JSON.stringify(bak) });
    const r = load(kv, T0);
    expect(r).toEqual({ state: bak, source: 'backup', problem: true });
    expect(kv.data[UNREADABLE_KEY]).toBe('{not json');
  });

  it('basura sin respaldo → nueva con aviso', () => {
    const r = load(memory({ [SAVE_KEY]: '"hola"' }), T0);
    expect(r.source).toBe('new');
    expect(r.problem).toBe(true);
  });

  it('storage que lanza error no rompe', () => {
    const broken: KV = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(load(broken, T0).source).toBe('new');
    expect(save(broken, newState(T0))).toBe(false);
  });
});

describe('export / import', () => {
  it('ida y vuelta', () => {
    const s = played();
    expect(importSave(exportSave(s))).toEqual(s);
  });

  it('rechaza texto inválido o enorme', () => {
    expect(importSave('')).toBeNull();
    expect(importSave('%%%')).toBeNull();
    expect(importSave(btoa('{"a":1}'))).toBeNull();
    expect(importSave('A'.repeat(MAX_IMPORT_CHARS + 1))).toBeNull();
  });
});

describe('v2: mejoras', () => {
  /** Guardado v1 tal como lo escribía el MVP1. */
  const v1 = {
    version: 1,
    money: 1234.5,
    runEarned: 5000,
    lifetimeEarned: 9000,
    recipes: 1,
    lastSeen: T0,
    businesses: {
      elotes: { count: 12, progressMs: 300, running: false, manager: true },
      aguas: { count: 2, progressMs: 0, running: true, manager: false },
    },
  };

  it('migra v1 → v2 sin perder nada', () => {
    const s = validate(JSON.parse(JSON.stringify(v1)));
    expect(s).not.toBeNull();
    expect(s!.version).toBe(2);
    expect(s!.upgrades).toEqual([]);
    expect(s!.money).toBe(1234.5);
    expect(s!.recipes).toBe(1);
    expect(s!.businesses.elotes).toEqual(v1.businesses.elotes);
    expect(s!.businesses.aguas).toEqual(v1.businesses.aguas);
  });

  it('migrar conserva recetas pendientes y la distancia a la siguiente', () => {
    // Con el divisor de v1 (3e10): 1e11 ganado → floor(sqrt(3.33)) = 1 receta pendiente.
    const pending = validate({ ...v1, recipes: 0, lifetimeEarned: 1e11 });
    expect(pendingRecipes(pending!)).toBe(1);
    // recipes = 3 y 4.7e11 ganado (v1: floor(sqrt(15.7)) = 3): aún sin la 4.ª…
    const near = validate({ ...v1, recipes: 3, lifetimeEarned: 4.7e11 });
    expect(pendingRecipes(near!)).toBe(0);
    // …y con 4.9e11 (v1: floor(sqrt(16.3)) = 4) ya la tiene, igual que en v1.
    const reached = validate({ ...v1, recipes: 3, lifetimeEarned: 4.9e11 });
    expect(pendingRecipes(reached!)).toBe(1);
  });

  it('carga un guardado v1 desde storage', () => {
    const r = load(memory({ [SAVE_KEY]: JSON.stringify(v1) }), T0);
    expect(r.source).toBe('save');
    expect(r.state.upgrades).toEqual([]);
  });

  it.each([
    ['no array', 'chile'],
    ['id desconocido', ['chile', 'hackeo']],
    ['duplicado', ['chile', 'chile']],
    ['no string', [1]],
    ['falta', undefined],
  ])('rechaza upgrades: %s', (_, upgrades) => {
    expect(validate({ ...newState(T0), upgrades })).toBeNull();
  });

  it('acepta mejoras válidas', () => {
    expect(validate({ ...newState(T0), upgrades: ['chile', 'comal'] })?.upgrades).toEqual(['chile', 'comal']);
  });
});
