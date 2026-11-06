import { describe, expect, it } from 'vitest';
import { BUSINESSES, LOGRO_BONO, UPGRADES } from './data';
import { hireManager, newState, revenuePerCycle, type State } from './game';
import { desbloquear, getLogro, LOGRO_IDS, LOGROS, nuevos, verLogros } from './logros';

const T0 = 1_700_000_000_000;
const base = (): State => newState(T0);
const conStats = (patch: Partial<State['stats']>): State => ({ ...base(), stats: { ...base().stats, ...patch } });
const conNegocios = (count: number, manager = false, trabajadoMs = 0): State => {
  const s = base();
  for (const d of BUSINESSES) s.businesses[d.id] = { ...s.businesses[d.id]!, count, manager, trabajadoMs };
  return s;
};

describe('catálogo', () => {
  it('25 logros con ids únicos, nombre y pista cortos, sin pictogramas', () => {
    expect(LOGROS.length).toBe(25);
    expect(LOGRO_IDS.size).toBe(LOGROS.length);
    for (const l of LOGROS) {
      expect(l.nombre.length).toBeLessThanOrEqual(22);
      expect(l.pista.length).toBeLessThanOrEqual(40);
      expect(l.nombre + l.pista).not.toMatch(/\p{Extended_Pictographic}/u);
    }
    expect(getLogro('venta').nombre).toBe('Primer elote');
    expect(() => getLogro('nada')).toThrow();
  });

  it('una partida nueva no cumple ninguno', () => {
    expect(nuevos(base())).toEqual([]);
  });
});

describe('predicados', () => {
  const ids = (s: State) => nuevos(s).map((l) => l.id);

  it('manuales y contadores', () => {
    expect(ids(conStats({ ventasManuales: 1 }))).toEqual(['venta']);
    expect(ids(conStats({ clics: 100 }))).toEqual(['clics-100']);
    expect(ids(conStats({ clics: 1000 }))).toEqual(['clics-100', 'clics-1000']);
    expect(ids(conStats({ contratados: 1 }))).toEqual(['empleado']);
    expect(ids(conStats({ propinas: 10 }))).toEqual(['propina', 'propinas-10']);
    expect(ids(conStats({ herencias: 5 }))).toEqual(['herencia', 'herencias-5']);
    expect(ids(conStats({ jugadoMs: 36_000_000 }))).toEqual(['jugado-1h', 'jugado-10h']);
    expect(ids(conStats({ jugadoMs: 3_599_999 }))).toEqual([]);
  });

  it('negocios, empleados y estrellas', () => {
    expect(ids(conNegocios(1))).toEqual(['negocios-8']);
    expect(ids(conNegocios(25))).toEqual(['negocios-8', 'unidades-25']);
    expect(ids(conNegocios(200))).toEqual(['negocios-8', 'unidades-25', 'unidades-200', 'todos-100']);
    expect(ids(conNegocios(1, true))).toEqual(['negocios-8', 'empleado', 'empleados-8']);
    expect(ids(conNegocios(1, true, 600_000))).toEqual([
      'negocios-8',
      'empleado',
      'empleados-8',
      'estrella',
      'todos-estrella',
    ]);
    expect(ids(conNegocios(1, true, 21_600_000))).toContain('estrellas-3');
    // Un solo empleado con estrella: no es "todos con estrella".
    const uno = base();
    uno.businesses.elotes = { ...uno.businesses.elotes!, manager: true, trabajadoMs: 600_000 };
    expect(ids(uno)).toEqual(['empleado', 'estrella']);
  });

  it('mejoras, recetas y dinero', () => {
    const s = { ...base(), upgrades: UPGRADES.map((u) => u.id) };
    expect(ids(s)).toEqual(['mejoras-todas']);
    expect(ids({ ...s, upgrades: s.upgrades.slice(1) })).toEqual([]);
    expect(ids({ ...base(), recipes: 50 })).toEqual(['herencia', 'recetas-10', 'recetas-50']); // recetas ⇒ ya heredó
    expect(ids({ ...base(), lifetimeEarned: 1e15 })).toEqual(['ganado-1e6', 'ganado-1e12', 'ganado-1e15']);
    expect(ids({ ...base(), lifetimeEarned: 999_999 })).toEqual([]);
  });
});

describe('desbloquear y ver', () => {
  it('añade al final en orden, nunca repite, y sin novedades devuelve el mismo estado', () => {
    const s0 = base();
    const s1 = desbloquear(s0, [getLogro('empleado'), getLogro('venta')]);
    expect(s1.logros).toEqual(['empleado', 'venta']);
    const s2 = desbloquear(s1, [getLogro('venta'), getLogro('propina')]);
    expect(s2.logros).toEqual(['empleado', 'venta', 'propina']);
    expect(desbloquear(s2, [getLogro('venta')])).toBe(s2);
    expect(desbloquear(s2, [])).toBe(s2);
  });

  it('nuevos() no devuelve lo ya desbloqueado', () => {
    const s = desbloquear(conStats({ clics: 100 }), [getLogro('clics-100')]);
    expect(nuevos(s)).toEqual([]);
  });

  it('verLogros marca todo como visto', () => {
    const s = desbloquear(base(), [getLogro('venta'), getLogro('empleado')]);
    expect(s.logrosVistos).toBe(0);
    const visto = verLogros(s);
    expect(visto.logrosVistos).toBe(2);
    expect(verLogros(visto)).toBe(visto);
  });

  it('cada logro suma LOGRO_BONO a las ventas', () => {
    const s = desbloquear(hireManager({ ...base(), money: 1e6 }, 'elotes'), [getLogro('empleado'), getLogro('venta')]);
    const sin = { ...s, logros: [] };
    expect(revenuePerCycle(s, 'elotes')).toBeCloseTo(revenuePerCycle(sin, 'elotes') * (1 + 2 * LOGRO_BONO));
  });
});
