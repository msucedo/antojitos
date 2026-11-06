import { describe, expect, it } from 'vitest';
import {
  buy,
  darPropina,
  hireManager,
  newState,
  pendingRecipes,
  PROPINA_TOTAL_MS,
  tick,
  TRABAJADO_TOPE_MS,
  type State,
  SAVE_VERSION,
  emptyStats,
} from './game';
import { claveDia } from './fecha';
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

  it('limita progressMs al ciclo efectivo (los hitos lo parten)', () => {
    const s = newState(T0);
    const elotes = { ...s.businesses.elotes!, count: 25, progressMs: 1e12 };
    const v = validate({ ...s, businesses: { ...s.businesses, elotes } });
    expect(v!.businesses.elotes!.progressMs).toBe(500);
  });
});

describe('load / save', () => {
  it('ida y vuelta', () => {
    const kv = memory();
    const s = played();
    save(kv, s);
    expect(load(kv, T0)).toEqual({ state: s, source: 'save', problem: false, crudo: null });
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
    expect(r).toEqual({ state: bak, source: 'backup', problem: true, crudo: null });
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
    expect(importSave(exportSave(s), T0)).toEqual(s);
  });

  it('rechaza texto inválido o enorme', () => {
    expect(importSave('', T0)).toBeNull();
    expect(importSave('%%%', T0)).toBeNull();
    expect(importSave(btoa('{"a":1}'), T0)).toBeNull();
    expect(importSave('A'.repeat(MAX_IMPORT_CHARS + 1), T0)).toBeNull();
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

  it('migra v1 → actual (en cadena) sin perder nada', () => {
    const s = validate(JSON.parse(JSON.stringify(v1)));
    expect(s).not.toBeNull();
    expect(s!.version).toBe(SAVE_VERSION);
    expect(s!.upgrades).toEqual([]);
    expect(s!.money).toBe(1234.5);
    expect(s!.recipes).toBe(1);
    expect(s!.businesses.elotes).toEqual({ ...v1.businesses.elotes, propinaMs: 0, trabajadoMs: 0 });
    expect(s!.businesses.aguas).toEqual({ ...v1.businesses.aguas, propinaMs: 0, trabajadoMs: 0 });
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

describe('v3: propina y antigüedad', () => {
  /** Elotes con empleado, propina dada y 20 min trabajados. */
  function conBeto(): State {
    return tick(darPropina(hireManager({ ...newState(T0), money: 1e6 }, 'elotes'), 'elotes'), 1_200_000);
  }
  const v2 = {
    version: 2,
    money: 10,
    runEarned: 10,
    lifetimeEarned: 10,
    recipes: 0,
    lastSeen: T0,
    upgrades: [],
    businesses: { elotes: { count: 3, progressMs: 100, running: false, manager: true } },
  };

  it('migra v2 → v3 con propina y antigüedad en 0', () => {
    const s = validate(JSON.parse(JSON.stringify(v2)));
    expect(s?.version).toBe(SAVE_VERSION);
    expect(s?.businesses.elotes).toEqual({ ...v2.businesses.elotes, propinaMs: 0, trabajadoMs: 0 });
    expect(s?.businesses.aguas).toEqual({
      count: 0,
      progressMs: 0,
      running: false,
      manager: false,
      propinaMs: 0,
      trabajadoMs: 0,
    });
  });

  it.each([
    ['propinaMs texto', { propinaMs: '5' }],
    ['propinaMs negativo', { propinaMs: -1 }],
    ['trabajadoMs nulo', { trabajadoMs: null }],
  ])('rechaza %s', (_, patch) => {
    const s = conBeto();
    const elotes = { ...s.businesses.elotes, ...patch };
    expect(validate(JSON.parse(JSON.stringify({ ...s, businesses: { ...s.businesses, elotes } })))).toBeNull();
  });

  it('un campo faltante vale 0', () => {
    const s = conBeto();
    const sinTrabajado: Record<string, unknown> = { ...s.businesses.elotes };
    delete sinTrabajado.trabajadoMs;
    const r = validate(JSON.parse(JSON.stringify({ ...s, businesses: { ...s.businesses, elotes: sinTrabajado } })));
    expect(r?.businesses.elotes?.trabajadoMs).toBe(0);
    expect(r?.businesses.elotes?.propinaMs).toBe(s.businesses.elotes!.propinaMs);
  });

  it('recorta valores fuera de rango y los anula sin empleado', () => {
    const s = conBeto();
    const fuera = { ...s.businesses.elotes!, propinaMs: 9e9, trabajadoMs: 9e12 };
    const r = validate({ ...s, businesses: { ...s.businesses, elotes: fuera } });
    expect(r?.businesses.elotes?.propinaMs).toBe(PROPINA_TOTAL_MS);
    expect(r?.businesses.elotes?.trabajadoMs).toBe(TRABAJADO_TOPE_MS);
    const sin = validate({ ...s, businesses: { ...s.businesses, elotes: { ...fuera, manager: false } } });
    expect(sin?.businesses.elotes?.propinaMs).toBe(0);
    expect(sin?.businesses.elotes?.trabajadoMs).toBe(0);
  });

  it('export / import conserva propina y antigüedad', () => {
    const s = conBeto();
    expect(importSave(exportSave(s), T0)?.businesses.elotes).toEqual(s.businesses.elotes);
  });

  it('un guardado de una versión futura no se pierde: se deja intacto y se juega sin guardar (ver v5)', () => {
    const futuro = JSON.stringify({ ...conBeto(), version: SAVE_VERSION + 1 });
    const kv = memory({ [SAVE_KEY]: futuro });
    expect(load(kv, T0).source).toBe('newer');
    expect(kv.data[SAVE_KEY]).toBe(futuro);
  });
});

describe('v4: contadores y logros', () => {
  const v3 = {
    version: 3,
    money: 10,
    runEarned: 10,
    lifetimeEarned: 10,
    recipes: 0,
    lastSeen: T0,
    upgrades: [],
    businesses: { elotes: { count: 3, progressMs: 100, running: false, manager: true, propinaMs: 0, trabajadoMs: 0 } },
  };

  it('migra v3 → actual con contadores en cero y sin logros', () => {
    const s = validate(JSON.parse(JSON.stringify(v3)));
    expect(s?.version).toBe(SAVE_VERSION);
    expect(s?.stats).toEqual(emptyStats());
    expect(s?.logros).toEqual([]);
    expect(s?.logrosVistos).toBe(0);
    expect(s?.businesses.elotes).toEqual(v3.businesses.elotes);
  });

  it('una semilla v4 sin stats ni logros vale: faltantes a cero', () => {
    const sinCampos: Record<string, unknown> = { ...newState(T0) };
    delete sinCampos.stats;
    delete sinCampos.logros;
    delete sinCampos.logrosVistos;
    const s = validate(sinCampos);
    expect(s?.stats).toEqual(emptyStats());
    expect(s?.logros).toEqual([]);
    expect(s?.logrosVistos).toBe(0);
  });

  it('un campo de stats que falta vale 0; de tipo incorrecto o fraccionario en un conteo, se rechaza', () => {
    const base = newState(T0);
    expect(validate({ ...base, stats: { clics: 5 } })?.stats).toEqual({ ...emptyStats(), clics: 5 });
    expect(validate({ ...base, stats: { clics: 1.5 } })).toBeNull();
    expect(validate({ ...base, stats: { clics: '5' } })).toBeNull();
    expect(validate({ ...base, stats: { jugadoMs: 1.5, maxPorSegundo: 0.25 } })?.stats).toEqual({
      ...emptyStats(),
      jugadoMs: 1.5,
      maxPorSegundo: 0.25,
    });
    expect(validate({ ...base, stats: [] })).toBeNull();
    expect(validate({ ...base, stats: null })).toBeNull();
    // Infinity se escribe como null en JSON: vale 0 en vez de costar la partida.
    expect(validate({ ...base, stats: { maxPorSegundo: null, clics: 2 } })?.stats).toEqual({
      ...emptyStats(),
      clics: 2,
    });
  });

  it('logros: ids desconocidos y duplicados se descartan, no strings se rechazan, y logrosVistos se recorta', () => {
    const base = newState(T0);
    expect(validate({ ...base, logros: ['venta', 'retirado', 'venta', 'empleado'], logrosVistos: 9 })).toMatchObject({
      logros: ['venta', 'empleado'],
      logrosVistos: 2,
    });
    expect(validate({ ...base, logros: [1] })).toBeNull();
    expect(validate({ ...base, logros: 'venta' })).toBeNull();
    expect(validate({ ...base, logros: null })).toBeNull();
    expect(validate({ ...base, logrosVistos: 1.5 })).toBeNull();
    expect(validate({ ...base, logrosVistos: -1 })).toBeNull();
  });

  it('export / import conserva contadores y logros en su orden', () => {
    const s = {
      ...newState(T0),
      stats: { ...emptyStats(), clics: 7, jugadoMs: 1234.5 },
      logros: ['empleado', 'venta'],
      logrosVistos: 1,
    };
    const back = importSave(exportSave(s), T0);
    expect(back?.stats).toEqual(s.stats);
    expect(back?.logros).toEqual(['empleado', 'venta']);
    expect(back?.logrosVistos).toBe(1);
  });
});

describe('v5: racha diaria y recetas de regalo', () => {
  const HOY = claveDia(T0);

  it('migra v4 → v5: racha vista hoy sin regalo y 0 recetas de regalo', () => {
    const v4: Record<string, unknown> = { ...newState(T0), version: 4 };
    delete v4.racha;
    delete v4.recetasRegalo;
    const kv = memory({ [SAVE_KEY]: JSON.stringify(v4) });
    const { state, source } = load(kv, T0);
    expect(source).toBe('save');
    expect(state.version).toBe(5);
    expect(state.racha).toEqual({ dias: 0, ultimoDia: HOY });
    expect(state.recetasRegalo).toBe(0);
    expect(state.stats.regalos).toBe(0);
  });

  it('validate: racha rara vale vacía; dias solo con día válido; recetasRegalo se recorta a recipes', () => {
    const base = newState(T0);
    expect(validate({ ...base, racha: { dias: 3, ultimoDia: '2026-11-05' } })?.racha).toEqual({
      dias: 3,
      ultimoDia: '2026-11-05',
    });
    expect(validate({ ...base, racha: { dias: 3, ultimoDia: null } })?.racha).toEqual({ dias: 0, ultimoDia: null });
    expect(validate({ ...base, racha: { dias: 3, ultimoDia: 20261105 } })?.racha).toEqual({ dias: 0, ultimoDia: null });
    expect(validate({ ...base, racha: { dias: -1, ultimoDia: '2026-11-05' } })?.racha).toEqual({
      dias: 0,
      ultimoDia: '2026-11-05',
    });
    expect(validate({ ...base, racha: null })?.racha).toEqual({ dias: 0, ultimoDia: null });
    expect(validate({ ...base, racha: { dias: 1e300, ultimoDia: '2026-11-05' } })?.racha.dias).toBe(1_000_000);
    expect(validate({ ...base, logrosVistos: null, recetasRegalo: null })).not.toBeNull();
    expect(validate({ ...base, racha: { dias: 1.5, ultimoDia: '2026-11-05' } })?.racha).toEqual({
      dias: 0,
      ultimoDia: '2026-11-05',
    });
    expect(validate({ ...base, recipes: 1, recetasRegalo: 5 })?.recetasRegalo).toBe(1);
    expect(validate({ ...base, recetasRegalo: 1.5 })).toBeNull();
  });

  it('una semilla sin racha queda vista hoy al cargar; con racha propia se respeta', () => {
    const sin: Record<string, unknown> = { ...newState(T0) };
    delete sin.racha;
    expect(load(memory({ [SAVE_KEY]: JSON.stringify(sin) }), T0).state.racha).toEqual({ dias: 0, ultimoDia: HOY });
    const ayer = { ...newState(T0), racha: { dias: 4, ultimoDia: '2026-11-13' } };
    expect(load(memory({ [SAVE_KEY]: JSON.stringify(ayer) }), T0).state.racha).toEqual(ayer.racha);
    expect(importSave(exportSave({ ...newState(T0), racha: { dias: 0, ultimoDia: null } }), T0)?.racha).toEqual({
      dias: 0,
      ultimoDia: HOY,
    });
  });

  it('un guardado de una versión más nueva se deja intacto: partida nueva en memoria, sin copia ilegible', () => {
    const futuro = JSON.stringify({ ...newState(T0), version: SAVE_VERSION + 1 });
    const kv = memory({ [SAVE_KEY]: futuro });
    const { state, source, problem } = load(kv, T0);
    expect(source).toBe('newer');
    expect(problem).toBe(false);
    expect(state.money).toBe(0);
    expect(kv.data[SAVE_KEY]).toBe(futuro);
    expect(kv.data[UNREADABLE_KEY]).toBeUndefined();
  });

  it('principal ilegible pero respaldo de una versión más nueva: tampoco se pisa', () => {
    const futuro = JSON.stringify({ ...newState(T0), version: SAVE_VERSION + 1 });
    const kv = memory({ [SAVE_KEY]: '{basura', [BACKUP_KEY]: futuro });
    const { source, problem } = load(kv, T0);
    expect(source).toBe('newer');
    expect(problem).toBe(true);
    expect(kv.data[BACKUP_KEY]).toBe(futuro);
  });
});
