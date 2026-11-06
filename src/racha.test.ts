import { describe, expect, it } from 'vitest';
import { RACHA_MIN_POR_DIA } from './data';
import { claveDia, diaVecino } from './fecha';
import { firstHireReady, heredadas, hireManager, newState, pendingRecipes, prestige, type State } from './game';
import { getLogro, nuevos } from './logros';
import { cobrar, diaDeSemana, diaSiguiente, estadoRacha, ingresoPorSegundo, iniciarRacha, regalo } from './racha';

/** Instante local: año, mes (1–12), día, hora. */
const local = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
const HOY = local(2026, 11, 6);
const AYER = claveDia(local(2026, 11, 5));
const base = (): State => newState(HOY);
const conRacha = (dias: number, ultimoDia: string | null, s = base()): State => ({ ...s, racha: { dias, ultimoDia } });

describe('fecha', () => {
  it('claveDia usa la fecha local con ceros', () => {
    expect(claveDia(local(2026, 1, 9))).toBe('2026-01-09');
    expect(claveDia(local(2026, 11, 6, 23))).toBe('2026-11-06');
    expect(claveDia(local(2026, 11, 7, 0))).toBe('2026-11-07');
  });

  it('diaVecino cruza mes y año como Date local (setDate, no 86 400 000 ms)', () => {
    expect(diaVecino('2026-03-01', -1)).toBe('2026-02-28');
    expect(diaVecino('2026-01-01', -1)).toBe('2025-12-31');
    expect(diaVecino('2026-12-31', 1)).toBe('2027-01-01');
    const esperado = new Date(2026, 2, 29 - 1);
    expect(diaVecino('2026-03-29', -1)).toBe(claveDia(esperado.getTime()));
  });
});

describe('estado de la racha', () => {
  it('partida nueva: vista hoy, sin regalo; mañana sigue con el día 1', () => {
    const s = base();
    expect(s.racha).toEqual({ dias: 0, ultimoDia: claveDia(HOY) });
    expect(estadoRacha(s, HOY)).toBe('cobrado');
    expect(cobrar(s, HOY)).toBeNull();
    const manana = local(2026, 11, 7);
    expect(estadoRacha(s, manana)).toBe('sigue');
    expect(diaSiguiente(s, manana)).toBe(1);
  });

  it('ayer sigue, antes rota, hoy o mañana cobrado, más adelante rota (reloj corregido)', () => {
    expect(estadoRacha(conRacha(3, AYER), HOY)).toBe('sigue');
    expect(diaSiguiente(conRacha(3, AYER), HOY)).toBe(4);
    expect(estadoRacha(conRacha(3, '2026-11-04'), HOY)).toBe('rota');
    expect(diaSiguiente(conRacha(3, '2026-11-04'), HOY)).toBe(1);
    expect(estadoRacha(conRacha(3, '2026-11-06'), HOY)).toBe('cobrado');
    expect(estadoRacha(conRacha(3, '2026-11-07'), HOY)).toBe('cobrado');
    expect(diaSiguiente(conRacha(3, '2026-11-07'), HOY)).toBe(3);
    expect(estadoRacha(conRacha(3, '2030-01-01'), HOY)).toBe('rota');
    expect(estadoRacha(conRacha(3, null), HOY)).toBe('rota');
  });

  it('iniciarRacha solo toca un guardado sin día', () => {
    const sin = conRacha(5, null);
    expect(iniciarRacha(sin, HOY).racha).toEqual({ dias: 0, ultimoDia: claveDia(HOY) });
    const con = conRacha(5, AYER);
    expect(iniciarRacha(con, HOY)).toBe(con);
  });

  it('un ultimoDia que pasa el formato pero no es fecha rompe la racha', () => {
    expect(estadoRacha(conRacha(3, '2026-13-45'), HOY)).toBe('rota');
    expect(diaSiguiente(conRacha(3, '2026-13-45'), HOY)).toBe(1);
  });

  it('diaDeSemana cicla de 1 a 7', () => {
    expect([1, 6, 7, 8, 14, 15].map(diaDeSemana)).toEqual([1, 6, 7, 1, 7, 1]);
  });
});

describe('regalo', () => {
  it('días 1–6 dan d × minutos de ventas; 7 y 14 dan receta', () => {
    const s = base(); // 1 elote a mano: $1 por segundo
    expect(ingresoPorSegundo(s)).toBeCloseTo(1);
    expect(regalo(s, 1)).toEqual({ tipo: 'dinero', monto: 60 * RACHA_MIN_POR_DIA });
    expect(regalo(s, 6)).toEqual({ tipo: 'dinero', monto: 6 * 60 * RACHA_MIN_POR_DIA });
    expect(regalo(s, 7)).toEqual({ tipo: 'receta' });
    expect(regalo(s, 8)).toEqual(regalo(s, 1));
    expect(regalo(s, 14)).toEqual({ tipo: 'receta' });
  });

  it('con empleado usa sus ventas sin propina; sin negocios abiertos, 0', () => {
    const conBeto = hireManager({ ...base(), money: 1e6 }, 'elotes');
    expect(ingresoPorSegundo(conBeto)).toBeCloseTo(1);
    const conPropina = {
      ...conBeto,
      businesses: { ...conBeto.businesses, elotes: { ...conBeto.businesses.elotes!, propinaMs: 330_000 } },
    };
    expect(ingresoPorSegundo(conPropina)).toBeCloseTo(1); // sin el ×1.5
    const vacio = {
      ...base(),
      businesses: { ...base().businesses, elotes: { ...base().businesses.elotes!, count: 0 } },
    };
    expect(ingresoPorSegundo(vacio)).toBe(0);
    expect(regalo(vacio, 1)).toEqual({ tipo: 'dinero', monto: 0 });
  });
});

describe('cobrar', () => {
  it('día de dinero: suma a caja y acumulados, avanza la racha y cuenta el regalo', () => {
    const r = cobrar(conRacha(2, AYER), HOY);
    expect(r?.dia).toBe(3);
    expect(r?.regalo).toEqual({ tipo: 'dinero', monto: 360 });
    expect(r?.state.money).toBe(360);
    expect(r?.state.runEarned).toBe(360);
    expect(r?.state.lifetimeEarned).toBe(360);
    expect(r?.state.racha).toEqual({ dias: 3, ultimoDia: claveDia(HOY) });
    expect(r?.state.stats.regalos).toBe(1);
    expect(cobrar(r!.state, HOY)).toBeNull(); // idempotente el mismo día
    const tope = cobrar({ ...conRacha(2, AYER), money: Number.MAX_VALUE }, HOY);
    expect(tope?.state.money).toBe(Number.MAX_VALUE);
  });

  it('medianoche: el día ofrecido se cobra aunque se pulse pasadas las 12; ultimoDia es el día del clic', () => {
    const s = conRacha(5, AYER); // ofrecido el día 6 a las 23:59 de hoy
    const mostradoEn = local(2026, 11, 6, 23);
    const clic = local(2026, 11, 7, 0);
    const r = cobrar(s, clic, mostradoEn);
    expect(r?.dia).toBe(6);
    expect(r?.state.racha).toEqual({ dias: 6, ultimoDia: '2026-11-07' });
    expect(cobrar(r!.state, clic)).toBeNull(); // ya cobrado hoy (7): no hay segundo regalo
    // Sin hora de muestra, pasada la medianoche la racha se habría roto: era el bug.
    expect(cobrar(s, clic)?.dia).toBe(1);
  });

  it('día 7: receta de regalo que no gasta las pendientes ni cuenta como herencia', () => {
    const r = cobrar(conRacha(6, AYER), HOY);
    expect(r?.regalo).toEqual({ tipo: 'receta' });
    expect(r?.state.recipes).toBe(1);
    expect(r?.state.recetasRegalo).toBe(1);
    expect(r?.state.money).toBe(0);
    expect(pendingRecipes(r!.state)).toBe(0);
    expect(heredadas(r!.state)).toBe(0);
    // La lección de Chelo sigue disponible y "Primera herencia" no se desbloquea.
    expect(firstHireReady({ ...r!.state, money: 500 })).toBe(true);
    expect(nuevos(r!.state).map((l) => l.id)).not.toContain('herencia');
    // Con una receta ganada de verdad, sí.
    const heredo = { ...r!.state, recipes: 2 };
    expect(heredadas(heredo)).toBe(1);
    expect(firstHireReady({ ...heredo, money: 500 })).toBe(false);
    expect(nuevos(heredo).map((l) => l.id)).toContain('herencia');
  });

  it('racha rota vuelve al día 1; la herencia conserva racha y recetas de regalo', () => {
    const r = cobrar(conRacha(9, '2026-11-01'), HOY);
    expect(r?.dia).toBe(1);
    const s = { ...r!.state, lifetimeEarned: 4e12, recetasRegalo: 1, recipes: 1 };
    expect(pendingRecipes(s)).toBe(2); // 2 ganadas + 1 regalo − 1 que tiene
    const p = prestige(s, HOY);
    expect(p.racha).toEqual(s.racha);
    expect(p.recetasRegalo).toBe(1);
    expect(p.recipes).toBe(3);
  });

  it('siete seguidos desbloquea el logro y la racha sobrevive a la herencia', () => {
    const r = cobrar(conRacha(6, AYER), HOY);
    expect(nuevos(r!.state)).toContain(getLogro('racha-7'));
    const heredado = prestige({ ...r!.state, lifetimeEarned: 1e12 }, HOY);
    expect(heredado.racha).toEqual(r!.state.racha);
  });
});
