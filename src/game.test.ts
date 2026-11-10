import { describe, expect, it } from 'vitest';
import {
  ANTIGUEDAD_MS,
  BUSINESSES,
  ESTRELLA_BONO,
  OFFLINE_CAP_MS,
  PROPINA_COSTO_MS,
  PROPINA_ESPERA_MS,
  PROPINA_MS,
  PROPINA_MULT,
  RECIPE_DIVISOR,
  UPGRADES,
  AUSENCIA_MS,
  LOGRO_BONO,
  MILESTONES,
  HERENCIA_MIN,
  RECETARIO,
} from './data';
import {
  applyOffline,
  buy,
  hitoEfecto,
  hitosCruzados,
  hitosVelocidad,
  hitosVentas,
  nextMilestone,
  buySound,
  buyUpgrade,
  canHireManager,
  cicloMs,
  getUpgrade,
  nextUpgrades,
  upgradeMultiplier,
  costOf,
  darPropina,
  emptyBiz,
  estrellas,
  getDef,
  hireManager,
  firstHireReady,
  hireableIds,
  maxAffordable,
  milestonesCrossed,
  newState,
  nextMode,
  pendingRecipes,
  incomePerSecond,
  propinaActiva,
  propinaCosto,
  propinaLista,
  PROPINA_TOTAL_MS,
  quantityFor,
  prestige,
  ingresoVuelta,
  revenuePerCycle,
  startCycle,
  tick,
  TRABAJADO_TOPE_MS,
  ventasPorSegundo,
  antiguedadInicialMs,
  buyRecetario,
  canBuyRecetario,
  getRecetario,
  heredarVale,
  nivelRecetario,
  offlineCapMs,
  propinaDuracionMs,
  PROPINA_TOTAL_MAX_MS,
  recetarioMultiplier,
  recetasActivas,
  recetasGastadas,
  siguienteNivel,
  tasaMaxima,
  arranqueDinero,
  type State,
} from './game';

const elotes = getDef('elotes');

/** Ventas de un carrito de elotes con empleado recién contratado durante `ms`: cada tramo con sus estrellas. */
function ventasConAntiguedad(ms: number): number {
  const cortes = [0, ...ANTIGUEDAD_MS, Infinity];
  let total = 0;
  for (let i = 0; i < cortes.length - 1; i++) {
    const tramo = Math.max(Math.min(ms, cortes[i + 1]!) - cortes[i]!, 0);
    total += (tramo / elotes.cycleMs) * elotes.baseRevenue * (1 + ESTRELLA_BONO * i);
  }
  return total;
}
const T0 = 1_700_000_000_000;

function withMoney(money: number, s: State = newState(T0)): State {
  return { ...s, money };
}

describe('costos', () => {
  it('costo geométrico, redondeado hacia arriba a entero', () => {
    expect(costOf(elotes, 0, 1)).toBe(elotes.baseCost);
    expect(costOf(elotes, 1, 1)).toBe(5); // 4 × 1.07 = 4.28 → $5
    expect(costOf(elotes, 3, 1)).toBe(Math.ceil(elotes.baseCost * elotes.growth ** 3));
  });

  it('compra múltiple ≈ suma de individuales (redondea el total, no cada unidad)', () => {
    let sum = 0;
    for (let i = 0; i < 10; i++) sum += costOf(elotes, 5 + i, 1);
    const bulk = costOf(elotes, 5, 10);
    expect(bulk).toBeLessThanOrEqual(sum);
    expect(sum - bulk).toBeLessThan(10);
  });

  it('bajo 1e6, el botón y el texto coinciden: alcanza ⇔ precio ≤ dinero mostrado', () => {
    for (const def of BUSINESSES) {
      for (const mode of [1, 10] as const) {
        for (let owned = 0; owned < 120; owned += 7) {
          const cost = costOf(def, owned, mode);
          if (cost >= 1e6) break;
          expect(Number.isInteger(cost)).toBe(true);
          for (const delta of [-1, -0.5, -0.01, -1e-9, 0, 1e-9, 0.01, 0.5, 0.99]) {
            const money = cost + delta;
            const s = withMoney(money);
            const st = { ...s, businesses: { ...s.businesses, [def.id]: { ...s.businesses[def.id]!, count: owned } } };
            const looks = cost <= Math.floor(money);
            expect(quantityFor(st, def.id, mode) > 0).toBe(looks);
            if (mode === 1) expect(quantityFor(st, def.id, 'max') > 0).toBe(looks);
          }
        }
      }
    }
  });

  it('precios fijos (gerentes, mejoras) son enteros y coherentes con dinero fraccionario', () => {
    for (const def of BUSINESSES) expect(Number.isInteger(def.manager.cost)).toBe(true);
    for (const u of UPGRADES) expect(Number.isInteger(u.cost)).toBe(true);
    const s = buy(withMoney(elotes.baseCost), 'elotes', 1);
    expect(canHireManager({ ...s, money: elotes.manager.cost - 1e-9 }, 'elotes')).toBe(false);
    expect(canHireManager({ ...s, money: elotes.manager.cost }, 'elotes')).toBe(true);
  });

  it('maxAffordable es exacto en el borde', () => {
    for (const def of BUSINESSES) {
      for (const owned of [0, 1, 37, 150]) {
        const exact = costOf(def, owned, 13);
        expect(maxAffordable(def, owned, exact)).toBe(13);
        expect(maxAffordable(def, owned, exact - 1)).toBe(12);
      }
    }
  });

  it('maxAffordable con dinero inválido → 0', () => {
    expect(maxAffordable(elotes, 0, 0)).toBe(0);
    expect(maxAffordable(elotes, 0, NaN)).toBe(0);
    expect(maxAffordable(elotes, 0, -5)).toBe(0);
  });
});

describe('comprar', () => {
  it('x1 descuenta y suma', () => {
    const s = buy(withMoney(100), 'elotes', 1);
    expect(s.businesses.elotes?.count).toBe(2);
    expect(s.money).toBeCloseTo(100 - costOf(elotes, 1, 1));
  });

  it('sin dinero suficiente no cambia nada', () => {
    const s0 = withMoney(1);
    expect(buy(s0, 'elotes', 1)).toBe(s0);
    expect(buy(s0, 'elotes', 10)).toBe(s0);
  });

  it('max nunca deja dinero negativo', () => {
    const s = buy(withMoney(123_456), 'elotes', 'max');
    expect(s.money).toBeGreaterThanOrEqual(0);
    expect(s.money).toBeLessThan(costOf(elotes, s.businesses.elotes!.count, 1));
  });
});

describe('buySound', () => {
  it('abrir, comprar o hito según lo que cambió la compra', () => {
    const rico = withMoney(1e12);
    expect(buySound(rico, buy(rico, 'aguas', 1), 'aguas')).toBe('open');
    expect(buySound(rico, buy(rico, 'elotes', 1), 'elotes')).toBe('buy');
    const conCarritos = (s: State, count: number): State => ({
      ...s,
      businesses: { ...s.businesses, elotes: emptyBiz(count) },
    });
    const casi = conCarritos(rico, 24);
    expect(buySound(casi, buy(casi, 'elotes', 1), 'elotes')).toBe('milestone');
    const abierto = buy(rico, 'aguas', 1);
    expect(buySound(abierto, buy(abierto, 'aguas', 10), 'aguas')).toBe('buy');
    // Máx desde cero puede abrir y cruzar el hito de golpe: el hito manda.
    expect(buySound(rico, buy(rico, 'aguas', 'max'), 'aguas')).toBe('milestone');
  });
});

describe('contratar', () => {
  it('hireableIds: solo negocios abiertos, sin gerente y con dinero', () => {
    // El carrito ya viene abierto: se contrata a su gerente y se prueba con las aguas.
    const aguas = getDef('aguas');
    const base = hireManager(withMoney(elotes.manager.cost), 'elotes');
    expect(hireableIds(withMoney(aguas.manager.cost, base))).toEqual([]);
    const abierto = buy(withMoney(aguas.baseCost, base), 'aguas', 1);
    expect(hireableIds(withMoney(aguas.manager.cost - 1, abierto))).toEqual([]);
    const conDinero = withMoney(aguas.manager.cost, abierto);
    expect(hireableIds(conDinero)).toEqual(['aguas']);
    expect(hireableIds(hireManager(conDinero, 'aguas'))).toEqual([]);
  });

  it('firstHireReady: solo la primera vez que alcanza para un empleado, sin recetas', () => {
    const cost = elotes.manager.cost;
    expect(firstHireReady(withMoney(cost - 1))).toBe(false);
    expect(firstHireReady(withMoney(cost))).toBe(true);
    expect(firstHireReady(hireManager(withMoney(cost), 'elotes'))).toBe(false);
    expect(firstHireReady({ ...withMoney(cost), recipes: 1 })).toBe(false);
  });
});

describe('hitos', () => {
  const withCount = (count: number): State => {
    const s = withMoney(0);
    return { ...s, businesses: { ...s.businesses, elotes: { ...s.businesses.elotes!, count } } };
  };

  it('milestonesCrossed cuenta los hitos cruzados entre dos estados', () => {
    expect(milestonesCrossed(withCount(24), withCount(25), 'elotes')).toBe(1);
    expect(milestonesCrossed(withCount(20), withCount(60), 'elotes')).toBe(2);
    expect(milestonesCrossed(withCount(26), withCount(30), 'elotes')).toBe(0);
    expect(milestonesCrossed(withCount(0), withCount(1), 'elotes')).toBe(0);
  });

  it('una compra con Máx que salta dos hitos los reporta', () => {
    const before = withCount(20);
    const after = buy({ ...before, money: costOf(elotes, 20, 40) }, 'elotes', 'max');
    expect(after.businesses.elotes!.count).toBe(60);
    expect(milestonesCrossed(before, after, 'elotes')).toBe(2);
  });
});

describe('hitos 300 y 400 (mixtos)', () => {
  const def = (id: string) => getDef(id);
  const conCount = (id: string, count: number): State => {
    const s = withMoney(0);
    return { ...s, businesses: { ...s.businesses, [id]: { ...s.businesses[id]!, count } } };
  };
  /** Copia con `progressMs` y dinero, sin compartir `businesses` con el original. */
  const conProgresoDe = (s: State, progressMs: number, money: number, id = 'elotes'): State => ({
    ...s,
    money,
    businesses: { ...s.businesses, [id]: { ...s.businesses[id]!, progressMs } },
  });

  it('los cuatro primeros parten la vuelta en todos; después, solo mientras el negocio barre', () => {
    expect(MILESTONES).toEqual([25, 50, 100, 200, 300, 400, 500]);
    for (const d of BUSINESSES) for (let i = 0; i < 4; i++) expect(hitoEfecto(d, i)).toBe('velocidad');
    // Rápidos (ya en barra fija): ventas ×2.
    for (const id of ['elotes', 'aguas', 'tacos', 'tortas']) {
      expect(hitoEfecto(def(id), 4)).toBe('ventas');
      expect(hitoEfecto(def(id), 5)).toBe('ventas');
      expect(cicloMs(def(id), 400)).toBe(cicloMs(def(id), 200));
    }
    // Fonda (24 s): 300 la baja a 750 ms (fija), 400 ya es ventas.
    expect(hitoEfecto(def('fonda'), 4)).toBe('velocidad');
    expect(hitoEfecto(def('fonda'), 5)).toBe('ventas');
    expect(cicloMs(def('fonda'), 300)).toBe(750);
    expect(cicloMs(def('fonda'), 400)).toBe(750);
    // Panadería (48 s): las dos de velocidad → 750 ms.
    expect(hitoEfecto(def('panaderia'), 5)).toBe('velocidad');
    expect(cicloMs(def('panaderia'), 400)).toBe(750);
    expect(cicloMs(def('franquicia'), 400)).toBe(1500);
    expect(cicloMs(def('cadena'), 400)).toBe(3000);
    // Hito 500 (índice 6): ventas en los que ya barren; velocidad en franquicia (750 ms) y cadena (1.5 s).
    for (const id of ['elotes', 'aguas', 'tacos', 'tortas', 'fonda', 'panaderia']) {
      expect(hitoEfecto(def(id), 6)).toBe('ventas');
      expect(cicloMs(def(id), 500)).toBe(cicloMs(def(id), 400));
    }
    expect(hitoEfecto(def('franquicia'), 6)).toBe('velocidad');
    expect(cicloMs(def('franquicia'), 500)).toBe(750);
    expect(hitoEfecto(def('cadena'), 6)).toBe('velocidad');
    expect(cicloMs(def('cadena'), 500)).toBe(1500);
  });

  it('un hito de ventas dobla el ingreso por vuelta y no parte la vuelta ni la barra', () => {
    const antes = conCount('elotes', 299);
    const despues = {
      ...antes,
      businesses: { ...antes.businesses, elotes: { ...antes.businesses.elotes!, count: 300 } },
    };
    expect(hitosVentas(elotes, 299)).toBe(0);
    expect(hitosVentas(elotes, 300)).toBe(1);
    expect(hitosVelocidad(elotes, 300)).toBe(4);
    expect(revenuePerCycle(despues, 'elotes')).toBeCloseTo(revenuePerCycle(antes, 'elotes') * 2 * (300 / 299));
    expect(hitosCruzados(antes, despues, 'elotes')).toEqual({ velocidad: 0, ventas: 1 });
    // Comprar la 300.ª conserva progressMs tal cual (no se parte).
    const conProgreso = conProgresoDe(antes, 40, costOf(elotes, 299, 1));
    expect(buy(conProgreso, 'elotes', 1).businesses.elotes?.progressMs).toBe(40);
    // Y la 25.ª (velocidad) sí la parte.
    const a24 = conProgresoDe(conCount('elotes', 24), 400, costOf(elotes, 24, 1));
    expect(buy(a24, 'elotes', 1).businesses.elotes?.progressMs).toBe(200);
  });

  it('Máx cruzando 300 y 400 a la vez: dos de ventas en elotes (barra intacta), una y una en fonda (barra a la mitad)', () => {
    const elotes250 = conProgresoDe(conCount('elotes', 250), 40, costOf(elotes, 250, 150));
    const elotes400 = buy(elotes250, 'elotes', 'max');
    expect(elotes400.businesses.elotes?.count).toBe(400);
    expect(hitosCruzados(elotes250, elotes400, 'elotes')).toEqual({ velocidad: 0, ventas: 2 });
    expect(elotes400.businesses.elotes?.progressMs).toBe(40);
    const fonda250 = conProgresoDe(conCount('fonda', 250), 40, costOf(def('fonda'), 250, 150), 'fonda');
    const fonda400 = buy(fonda250, 'fonda', 'max');
    expect(fonda400.businesses.fonda?.count).toBe(400);
    expect(hitosCruzados(fonda250, fonda400, 'fonda')).toEqual({ velocidad: 1, ventas: 1 });
    expect(fonda400.businesses.fonda?.progressMs).toBe(20);
  });

  it('dos hitos de ventas (400 elotes) cuadruplican el ingreso por vuelta', () => {
    const a299 = conCount('elotes', 299);
    const a400 = conCount('elotes', 400);
    expect(revenuePerCycle(a400, 'elotes') / revenuePerCycle(a299, 'elotes')).toBeCloseTo((4 * 400) / 299);
    expect(cicloMs(elotes, 400)).toBe(cicloMs(elotes, 299));
  });

  it('nextMilestone trae el conteo y el efecto del siguiente hito', () => {
    expect(nextMilestone(elotes, 10)).toEqual({ count: 25, efecto: 'velocidad' });
    expect(nextMilestone(elotes, 250)).toEqual({ count: 300, efecto: 'ventas' });
    expect(nextMilestone(def('fonda'), 250)).toEqual({ count: 300, efecto: 'velocidad' });
    expect(nextMilestone(elotes, 400)).toEqual({ count: 500, efecto: 'ventas' });
    expect(nextMilestone(def('cadena'), 400)).toEqual({ count: 500, efecto: 'velocidad' });
    expect(nextMilestone(elotes, 500)).toBeNull();
  });
});

describe('contadores (stats)', () => {
  it('cada acción suma su contador y nada más', () => {
    const base = withMoney(1e9);
    expect(startCycle(base, 'elotes').stats).toEqual({ ...base.stats, clics: 1 });
    expect(hireManager(base, 'elotes').stats).toEqual({ ...base.stats, contratados: 1 });
    expect(buyUpgrade(base, 'chile').stats).toEqual({ ...base.stats, mejoras: 1 });
    const conBeto = hireManager(base, 'elotes');
    expect(darPropina(conBeto, 'elotes').stats).toEqual({ ...conBeto.stats, propinas: 1 });
    // Acciones sin efecto no cuentan.
    expect(startCycle(hireManager(base, 'elotes'), 'elotes').stats.clics).toBe(0);
    expect(hireManager(withMoney(0), 'elotes').stats.contratados).toBe(0);
  });

  it('una vuelta manual cobrada cuenta como venta; el toque solo cuenta como clic', () => {
    const s = startCycle(withMoney(0), 'elotes');
    expect(s.stats).toMatchObject({ clics: 1, ventasManuales: 0 });
    expect(tick(s, elotes.cycleMs / 2).stats.ventasManuales).toBe(0);
    expect(tick(s, elotes.cycleMs).stats.ventasManuales).toBe(1);
  });

  it('maxPorSegundo guarda el mejor /s visto (con propina) y no baja', () => {
    const s = darPropina(hireManager(withMoney(1e6), 'elotes'), 'elotes');
    const conPropina = tick(s, 100);
    expect(conPropina.stats.maxPorSegundo).toBeCloseTo(incomePerSecond(s));
    expect(incomePerSecond(s)).toBeCloseTo(elotes.baseRevenue * PROPINA_MULT);
    const despues = tick(conPropina, PROPINA_MS + 1000);
    expect(incomePerSecond(despues)).toBeCloseTo(elotes.baseRevenue);
    expect(despues.stats.maxPorSegundo).toBe(conPropina.stats.maxPorSegundo);
  });

  it('jugadoMs solo suma con `jugando` y en tramos cortos', () => {
    const s = { ...newState(T0), lastSeen: T0 };
    expect(applyOffline(s, T0 + 16, true).state.stats.jugadoMs).toBe(16);
    expect(applyOffline(s, T0 + 16).state.stats.jugadoMs).toBe(0);
    expect(applyOffline(s, T0 + AUSENCIA_MS - 1, true).state.stats.jugadoMs).toBe(AUSENCIA_MS - 1);
    expect(applyOffline(s, T0 + AUSENCIA_MS, true).state.stats.jugadoMs).toBe(0);
    expect(applyOffline(s, T0 + 3_600_000, true).state.stats.jugadoMs).toBe(0);
    const dos = applyOffline(applyOffline(s, T0 + 16, true).state, T0 + 32, true);
    expect(dos.state.stats.jugadoMs).toBe(32);
  });

  it('la herencia conserva contadores y logros, y cuenta la herencia', () => {
    const earned = RECIPE_DIVISOR * 4;
    const s: State = {
      ...withMoney(earned),
      lifetimeEarned: earned,
      stats: { ...newState(T0).stats, clics: 9 },
      logros: ['venta'],
      logrosVistos: 1,
    };
    const p = prestige(s, T0 + 1);
    expect(p.stats).toEqual({ ...s.stats, herencias: 1 });
    expect(p.logros).toEqual(['venta']);
    expect(p.logrosVistos).toBe(1);
  });

  it('cada logro suma LOGRO_BONO a las ventas', () => {
    const s = { ...newState(T0), logros: ['venta', 'empleado', 'propina'] };
    expect(revenuePerCycle(s, 'elotes')).toBeCloseTo(elotes.baseRevenue * (1 + 3 * LOGRO_BONO));
  });
});

describe('ciclos', () => {
  it('sin gerente: un ciclo por toque', () => {
    let s = startCycle(newState(T0), 'elotes');
    s = tick(s, elotes.cycleMs * 50);
    expect(s.money).toBeCloseTo(elotes.baseRevenue);
    expect(s.businesses.elotes?.running).toBe(false);
  });

  it('sin tocar no gana', () => {
    expect(tick(newState(T0), 10_000).money).toBe(0);
  });

  it('con gerente: dt enorme en fórmula cerrada', () => {
    let s = hireManager(withMoney(elotes.manager.cost), 'elotes');
    expect(s.businesses.elotes?.manager).toBe(true);
    s = tick(s, elotes.cycleMs * 1e9 + 1);
    expect(s.money / ventasConAntiguedad(elotes.cycleMs * 1e9)).toBeCloseTo(1, 12);
    expect(s.businesses.elotes?.progressMs).toBeCloseTo(1);
  });

  it('dt inválido no rompe el estado', () => {
    const s = newState(T0);
    expect(tick(s, NaN)).toBe(s);
    expect(tick(s, -1)).toBe(s);
    expect(tick(s, Infinity)).toBe(s);
  });

  it('hitos parten la vuelta; el ingreso por vuelta no cambia y el /s se duplica', () => {
    const s = newState(T0);
    const con = (count: number): State => ({
      ...s,
      businesses: { ...s.businesses, elotes: { ...s.businesses.elotes!, count, manager: true } },
    });
    expect([24, 25, 50, 100, 200].map((n) => cicloMs(elotes, n))).toEqual([1000, 500, 250, 125, 62.5]);
    for (const n of [24, 25, 50, 200]) expect(revenuePerCycle(con(n), 'elotes') / n).toBe(1);
    expect(ventasPorSegundo(con(25), 'elotes') / 25).toBe(2);
    expect(ventasPorSegundo(con(200), 'elotes') / 200).toBe(16);
  });

  it('comprar y cruzar un hito conserva la fracción de la barra', () => {
    const base = withMoney(1e9);
    const con = (b: Partial<State['businesses'][string]>): State => ({
      ...base,
      businesses: { ...base.businesses, elotes: { ...base.businesses.elotes!, ...b } },
    });
    // Con empleado, 900/1000 → la 25 parte la vuelta: 450/500.
    const uno = buy(con({ count: 24, manager: true, progressMs: 900 }), 'elotes', 1).businesses.elotes!;
    expect(uno.progressMs).toBe(450);
    expect(uno.progressMs / cicloMs(elotes, uno.count)).toBe(0.9);
    // Máx cruza dos hitos (24 → ≥ 50): la fracción se conserva.
    const max = buy(con({ count: 24, running: true, progressMs: 600 }), 'elotes', 'max').businesses.elotes!;
    expect(max.count).toBeGreaterThanOrEqual(50);
    expect(max.progressMs / cicloMs(elotes, max.count)).toBe(0.6);
    // Sin hito, el progreso no se toca.
    expect(buy(con({ count: 10, running: true, progressMs: 300 }), 'elotes', 1).businesses.elotes!.progressMs).toBe(
      300,
    );
  });

  it('a mano, la vuelta dura el ciclo efectivo', () => {
    const s = startCycle(
      { ...withMoney(0), businesses: { ...newState(T0).businesses, elotes: { ...emptyBiz(25) } } },
      'elotes',
    );
    expect(tick(s, 499).businesses.elotes!.running).toBe(true);
    const fin = tick(s, 500);
    expect(fin.businesses.elotes!.running).toBe(false);
    expect(fin.money).toBe(25);
  });
});

describe('offline', () => {
  const managed = (): State => ({ ...hireManager(withMoney(elotes.manager.cost), 'elotes'), lastSeen: T0 });

  it('gana por el tiempo fuera', () => {
    const { earned } = applyOffline(managed(), T0 + 60_000);
    expect(earned).toBeCloseTo(60 * elotes.baseRevenue);
  });

  it('tope de 8 h', () => {
    const { earned, elapsedMs } = applyOffline(managed(), T0 + OFFLINE_CAP_MS * 10);
    expect(elapsedMs).toBe(OFFLINE_CAP_MS);
    // Cada tramo cobra con sus estrellas, como con la pestaña abierta: 600 + 3000·1.1 + 18000·1.2 + 7200·1.3.
    expect(earned).toBeCloseTo(ventasConAntiguedad(OFFLINE_CAP_MS));
    expect(ventasConAntiguedad(OFFLINE_CAP_MS)).toBeCloseTo(34_860);
  });

  it('reloj atrasado → 0', () => {
    const { earned, state } = applyOffline(managed(), T0 - 1_000_000);
    expect(earned).toBe(0);
    expect(state.lastSeen).toBe(T0 - 1_000_000);
  });

  it('earned exacto con mucho dinero (no resta dineros)', () => {
    // Con recetas el ingreso es fraccionario y (money + earned) - money pierde precisión.
    const s = { ...managed(), money: 836_214.3777, recipes: 1 };
    const { earned } = applyOffline(s, T0 + 60_000);
    expect(earned).toBe(60 * revenuePerCycle(s, 'elotes'));
  });

  it('sin gerente no gana offline', () => {
    expect(applyOffline({ ...newState(T0) }, T0 + 3_600_000).earned).toBe(0);
  });
});

describe('herencia', () => {
  it('sin recetas pendientes no reinicia', () => {
    const s = withMoney(1e6);
    expect(prestige(s, T0)).toBe(s);
  });

  it('reinicia y conserva recetas y ganancia total', () => {
    const earned = RECIPE_DIVISOR * 4;
    const s = { ...withMoney(earned), lifetimeEarned: earned, runEarned: earned };
    expect(pendingRecipes(s)).toBe(2);
    const p = prestige(s, T0 + 1);
    expect(p.recipes).toBe(2);
    expect(p.money).toBe(0);
    expect(p.lifetimeEarned).toBe(earned);
    expect(p.businesses.elotes?.count).toBe(1);
    expect(pendingRecipes(p)).toBe(0);
  });

  it('recetas suben el ingreso 2% cada una', () => {
    const s = { ...newState(T0), recipes: 10 };
    expect(revenuePerCycle(s, 'elotes')).toBeCloseTo(1.2);
  });
});

describe('desborde', () => {
  it('ganancias enormes se topan en MAX_VALUE y el estado sigue serializable', () => {
    let s = hireManager(withMoney(elotes.manager.cost), 'elotes');
    s = { ...s, lifetimeEarned: 1.797e308, recipes: 5e306 };
    s = tick(s, 1_000);
    expect(Number.isFinite(s.lifetimeEarned)).toBe(true);
    expect(Number.isFinite(s.money)).toBe(true);
    // Ningún número se volvió Infinity (JSON lo escribe como null); `ranking: null` es legítimo y se aparta.
    expect(JSON.stringify({ ...s, ranking: undefined })).not.toContain('null');
  });
});

describe('mejoras', () => {
  const chile = getUpgrade('chile');

  it('comprar descuenta, registra y multiplica solo su negocio', () => {
    const s0 = { ...withMoney(chile.cost), businesses: { ...newState(T0).businesses } };
    s0.businesses.aguas = { ...s0.businesses.aguas!, count: 1 };
    const before = { elotes: revenuePerCycle(s0, 'elotes'), aguas: revenuePerCycle(s0, 'aguas') };
    const s = buyUpgrade(s0, 'chile');
    expect(s.money).toBe(0);
    expect(s.upgrades).toEqual(['chile']);
    expect(revenuePerCycle(s, 'elotes')).toBe(before.elotes * chile.multiplier);
    expect(revenuePerCycle(s, 'aguas')).toBe(before.aguas);
  });

  it('globales multiplican todo y se acumulan', () => {
    const s = { ...newState(T0), upgrades: ['chile', 'comal'] };
    expect(upgradeMultiplier(s, 'elotes')).toBe(6);
    expect(upgradeMultiplier(s, 'cadena')).toBe(2);
  });

  it('sin dinero o ya comprada no cambia nada', () => {
    const poor = withMoney(chile.cost - 1);
    expect(buyUpgrade(poor, 'chile')).toBe(poor);
    const owned = buyUpgrade(withMoney(chile.cost * 2), 'chile');
    expect(buyUpgrade(owned, 'chile')).toBe(owned);
  });

  it('nextUpgrades da las más baratas sin comprar', () => {
    const s = { ...newState(T0), upgrades: ['chile'] };
    const next = nextUpgrades(s, 3);
    expect(next).toHaveLength(3);
    expect(next.map((u) => u.id)).not.toContain('chile');
    expect(next[0]!.cost).toBeLessThanOrEqual(next[1]!.cost);
  });

  it('nextUpgrades no ofrece mejoras de negocios sin abrir', () => {
    const ids = nextUpgrades(newState(T0), UPGRADES.length).map((u) => u.id);
    expect(ids).toContain('chile');
    expect(ids).toContain('comal');
    expect(ids).not.toContain('hielo');
  });

  it('la herencia las reinicia', () => {
    const earned = RECIPE_DIVISOR * 4;
    const s = { ...withMoney(earned), lifetimeEarned: earned, upgrades: ['chile', 'comal'] };
    expect(prestige(s, T0).upgrades).toEqual([]);
  });

  it('catálogo válido: ids únicos y objetivos existentes', () => {
    const ids = UPGRADES.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const u of UPGRADES) {
      expect(u.target === 'all' || BUSINESSES.some((b) => b.id === u.target)).toBe(true);
      expect(u.cost).toBeGreaterThan(0);
      expect(u.multiplier).toBeGreaterThan(1);
    }
  });
});

describe('nextMode', () => {
  it('cicla ×1 → ×10 → Máx → ×1', () => {
    expect(nextMode(1)).toBe(10);
    expect(nextMode(10)).toBe('max');
    expect(nextMode('max')).toBe(1);
  });
});

describe('propina y antigüedad', () => {
  /** Elotes con empleado y $1,000 de sobra para propinas; la barra empieza en 0. */
  const conBeto = (): State => hireManager(withMoney(elotes.manager.cost + 1_000), 'elotes');
  const b = (s: State) => s.businesses.elotes!;

  it('cuesta 10 s de ventas; solo con empleado, con dinero y cuando la espera terminó', () => {
    expect(darPropina(withMoney(1e6), 'elotes')).toEqual(withMoney(1e6));
    const s0 = conBeto();
    const costo = propinaCosto(s0, 'elotes');
    expect(costo).toBe(Math.ceil((ventasPorSegundo(s0, 'elotes') * PROPINA_COSTO_MS) / 1000));
    expect(darPropina({ ...s0, money: costo - 1 }, 'elotes').money).toBe(costo - 1);
    const s = darPropina(s0, 'elotes');
    expect(s.money).toBe(s0.money - costo);
    expect(b(s).propinaMs).toBe(PROPINA_TOTAL_MS);
    expect(propinaActiva(b(s))).toBe(true);
    expect(darPropina(s, 'elotes')).toBe(s);
    const casi = tick(s, PROPINA_TOTAL_MS - 1);
    expect(propinaActiva(b(casi))).toBe(false);
    expect(propinaLista(b(casi))).toBe(false);
    expect(propinaLista(b(tick(casi, 1)))).toBe(true);
  });

  it('ingresoVuelta es lo de una vuelta, ×PROPINA_MULT solo con la propina activa', () => {
    const s0 = conBeto();
    expect(ingresoVuelta(s0, 'elotes')).toBe(revenuePerCycle(s0, 'elotes'));
    const s = darPropina(s0, 'elotes');
    expect(ingresoVuelta(s, 'elotes')).toBe(revenuePerCycle(s, 'elotes') * PROPINA_MULT);
    expect(ingresoVuelta(tick(s, PROPINA_TOTAL_MS), 'elotes')).toBe(revenuePerCycle(s, 'elotes'));
  });

  it('×1.5 de ventas solo en su ventana; la barra va al ritmo de siempre', () => {
    const s = darPropina(conBeto(), 'elotes');
    const base = revenuePerCycle(s, 'elotes');
    // 40 s: 40 vueltas normales + extra de 0.5 × 30 s de ventas.
    const r = applyOffline(s, s.lastSeen + 40_000);
    expect(r.earned).toBeCloseTo(40 * base + (PROPINA_MULT - 1) * 30 * base);
    expect(b(r.state).progressMs).toBe(b(tick(conBeto(), 40_000)).progressMs);
    expect(b(r.state).propinaMs).toBe(PROPINA_TOTAL_MS - 40_000);
    expect(b(r.state).trabajadoMs).toBe(40_000);
  });

  it('un negocio lento cobra el mismo extra aunque no cierre vuelta en los 30 s', () => {
    const cadena = getDef('cadena');
    const base0 = withMoney(1e15);
    const s0: State = {
      ...base0,
      businesses: { ...base0.businesses, cadena: { ...emptyBiz(1), manager: true } },
    };
    const s = darPropina(s0, 'cadena');
    const extra = applyOffline(s, s.lastSeen + 30_000).earned;
    expect(extra).toBeCloseTo((PROPINA_MULT - 1) * ventasPorSegundo(s, 'cadena') * 30);
    expect(cicloMs(cadena, 1)).toBeGreaterThan(30_000);
  });

  it('con hitos, la propina suma el mismo extra continuo aunque cierre varias vueltas', () => {
    const cadena = getDef('cadena');
    const base0 = withMoney(1e30);
    const s0: State = {
      ...base0,
      businesses: { ...base0.businesses, cadena: { ...emptyBiz(200), manager: true } },
    };
    expect(cicloMs(cadena, 200)).toBe(12_000);
    const s = darPropina(s0, 'cadena');
    const r = applyOffline(s, s.lastSeen + 30_000);
    // 2 vueltas de 12 s + 0.5 × 30 s de ventas por segundo.
    const porVuelta = revenuePerCycle(s, 'cadena');
    expect(r.earned).toBeCloseTo(2 * porVuelta + (PROPINA_MULT - 1) * ventasPorSegundo(s, 'cadena') * 30);
    expect(r.state.businesses.cadena!.progressMs).toBe(6_000);
  });

  it('el /s cuenta la propina mientras dura', () => {
    const s0 = conBeto();
    const s = darPropina(s0, 'elotes');
    expect(incomePerSecond(s)).toBeCloseTo(incomePerSecond(s0) * PROPINA_MULT);
    expect(incomePerSecond(tick(s, PROPINA_MS))).toBeCloseTo(incomePerSecond(s0));
  });

  it('una ausencia que cruza estrellas cobra lo mismo que la pestaña abierta', () => {
    const s = conBeto();
    const fuera = applyOffline(s, s.lastSeen + 4 * 3_600_000).state;
    let abierta = s;
    for (let i = 0; i < 4 * 3600; i++) abierta = tick(abierta, 1_000);
    expect(fuera.money).toBeCloseTo(abierta.money, 6);
    expect(fuera.businesses.elotes).toEqual(abierta.businesses.elotes);
  });

  it('con 4 hitos (62.5 ms) y propina, la ausencia cobra lo mismo que la pestaña abierta', () => {
    const base = conBeto();
    const s = darPropina(
      { ...base, businesses: { ...base.businesses, elotes: { ...b(base), count: 200 } }, money: 1e9 },
      'elotes',
    );
    expect(cicloMs(elotes, 200)).toBe(62.5);
    const fuera = applyOffline(s, s.lastSeen + 4 * 3_600_000);
    let abierta = s;
    for (let i = 0; i < 4 * 3600; i++) abierta = tick(abierta, 1_000);
    expect(fuera.state.money).toBeCloseTo(abierta.money, 2);
    expect(fuera.state.businesses.elotes).toEqual(abierta.businesses.elotes);
    // Frames de 60 Hz (no diádicos): error de punto flotante mínimo.
    let frames = s;
    for (let i = 0; i < 60 * 60; i++) frames = tick(frames, 1000 / 60);
    const minuto = applyOffline(s, s.lastSeen + 60_000).state;
    expect(frames.money / minuto.money).toBeCloseTo(1, 9);
  });

  it('el reloj atrasado no avanza la propina', () => {
    const s = darPropina(conBeto(), 'elotes');
    const r = applyOffline(s, s.lastSeen - 60_000);
    expect(b(r.state).propinaMs).toBe(PROPINA_TOTAL_MS);
  });

  it('estrellas a 10 min, 1 h y 6 h; +10 % de ventas cada una; tope en la última', () => {
    expect(ANTIGUEDAD_MS).toEqual([600_000, 3_600_000, 21_600_000]);
    const s = conBeto();
    const base = revenuePerCycle(s, 'elotes');
    expect(estrellas(b(tick(s, 599_999)))).toBe(0);
    const una = tick(s, 600_000);
    expect(estrellas(b(una))).toBe(1);
    expect(revenuePerCycle(una, 'elotes')).toBeCloseTo(base * (1 + ESTRELLA_BONO));
    const todas = tick(s, OFFLINE_CAP_MS);
    expect(estrellas(b(todas))).toBe(3);
    expect(b(todas).trabajadoMs).toBe(TRABAJADO_TOPE_MS);
  });

  it('sin empleado no hay antigüedad; contratar y heredar reinician todo', () => {
    const sin = startCycle(buy(withMoney(100), 'elotes', 1), 'elotes');
    expect(b(tick(sin, 10_000)).trabajadoMs).toBe(0);
    const viejo = darPropina(tick(conBeto(), 700_000), 'elotes');
    const heredado = prestige({ ...viejo, lifetimeEarned: RECIPE_DIVISOR * 10 }, T0);
    expect(b(heredado)).toEqual(emptyBiz(1));
    expect(PROPINA_TOTAL_MS).toBe(PROPINA_MS + PROPINA_ESPERA_MS);
  });
});

describe('recetario de la abuela', () => {
  const conRecetas = (recipes: number, recetario: Record<string, number> = {}): State => ({
    ...newState(T0),
    recipes,
    recetario,
  });

  it('el catálogo tiene ids únicos, un cupón por efecto y niveles de costo creciente', () => {
    expect(new Set(RECETARIO.map((r) => r.id)).size).toBe(RECETARIO.length);
    expect(new Set(RECETARIO.map((r) => r.efecto)).size).toBe(RECETARIO.length);
    for (const r of RECETARIO) {
      expect(r.niveles.length).toBeGreaterThan(0);
      for (let i = 1; i < r.niveles.length; i++) expect(r.niveles[i]!.costo).toBeGreaterThan(r.niveles[i - 1]!.costo);
    }
    expect(RECETARIO.flatMap((r) => r.niveles).reduce((a, n) => a + n.costo, 0)).toBe(88);
  });

  it('las gastadas se derivan del recetario y solo las activas suben el ingreso', () => {
    expect(recetasGastadas(conRecetas(10))).toBe(0);
    expect(recetasGastadas(conRecetas(10, { canasta: 2, guardadito: 1 }))).toBe(1 + 2 + 1);
    expect(recetasActivas(conRecetas(10, { canasta: 2, guardadito: 1 }))).toBe(6);
    expect(revenuePerCycle(conRecetas(10, { canasta: 2, guardadito: 1 }), 'elotes')).toBeCloseTo(1.12);
    // Un recetario que cuesta más que las recetas (semilla a mano) no regala bono.
    expect(recetasActivas(conRecetas(1, { caldo: 1 }))).toBe(0);
    expect(revenuePerCycle(conRecetas(1, { caldo: 1 }), 'elotes')).toBeCloseTo(2); // ×2 del caldo, +0 % de recetas
  });

  it('cocinar: solo con recetas activas suficientes, nivel a nivel, y al tope ya no hay siguiente', () => {
    const s = conRecetas(3);
    expect(siguienteNivel(s, 'canasta')).toEqual({ costo: 1, valor: 25 });
    expect(canBuyRecetario(s, 'caldo')).toBe(false);
    expect(buyRecetario(s, 'caldo')).toBe(s);
    const n1 = buyRecetario(s, 'canasta');
    expect(nivelRecetario(n1, 'canasta')).toBe(1);
    expect(recetasActivas(n1)).toBe(2);
    const n2 = buyRecetario(n1, 'canasta');
    expect(nivelRecetario(n2, 'canasta')).toBe(2);
    expect(recetasActivas(n2)).toBe(0);
    expect(canBuyRecetario(n2, 'canasta')).toBe(false);
    const tope = buyRecetario(conRecetas(6, { canasta: 2 }), 'canasta');
    expect(nivelRecetario(tope, 'canasta')).toBe(3);
    expect(siguienteNivel(tope, 'canasta')).toBeNull();
    const rico = { ...tope, recipes: 99 };
    expect(buyRecetario(rico, 'canasta')).toBe(rico);
    expect(() => getRecetario('nada')).toThrow();
  });

  it('olla sube el tope de ausencia; sin cupón sigue en 8 h', () => {
    const managed = { ...hireManager(withMoney(elotes.manager.cost), 'elotes'), lastSeen: T0 };
    expect(offlineCapMs(managed)).toBe(OFFLINE_CAP_MS);
    expect(applyOffline(managed, T0 + 10 * 3_600_000).elapsedMs).toBe(OFFLINE_CAP_MS);
    const conOlla = { ...managed, recipes: 2, recetario: { olla: 1 } };
    expect(offlineCapMs(conOlla)).toBe(12 * 3_600_000);
    expect(applyOffline(conOlla, T0 + 10 * 3_600_000).elapsedMs).toBe(10 * 3_600_000);
    expect(offlineCapMs({ ...conOlla, recetario: { olla: 2 } })).toBe(24 * 3_600_000);
  });

  it('cafecito alarga la propina y el tope de la cuenta regresiva lo cubre', () => {
    const base = hireManager(withMoney(elotes.manager.cost + 1_000), 'elotes');
    expect(propinaDuracionMs(base)).toBe(PROPINA_MS);
    expect(darPropina(base, 'elotes').businesses.elotes?.propinaMs).toBe(PROPINA_TOTAL_MS);
    const conCafe = { ...base, recipes: 1, recetario: { cafecito: 1 } };
    expect(propinaDuracionMs(conCafe)).toBe(45_000);
    expect(darPropina(conCafe, 'elotes').businesses.elotes?.propinaMs).toBe(45_000 + PROPINA_ESPERA_MS);
    expect(PROPINA_TOTAL_MAX_MS).toBe(90_000 + PROPINA_ESPERA_MS);
    expect(PROPINA_TOTAL_MAX_MS).toBeGreaterThanOrEqual(PROPINA_TOTAL_MS);
  });

  it('molcajete: los empleados nuevos arrancan con antigüedad', () => {
    const s = { ...withMoney(elotes.manager.cost), recipes: 2, recetario: { molcajete: 1 } };
    expect(antiguedadInicialMs(newState(T0))).toBe(0);
    expect(antiguedadInicialMs(s)).toBe(ANTIGUEDAD_MS[0]);
    const b = hireManager(s, 'elotes').businesses.elotes!;
    expect(b.trabajadoMs).toBe(ANTIGUEDAD_MS[0]);
    expect(estrellas(b)).toBe(1);
  });

  it('caldo multiplica todas las ventas y sobrevive la herencia; la herencia conserva el recetario y arranca con él', () => {
    const earned = RECIPE_DIVISOR * 25 ** 2; // 25 recetas ganadas en total
    const s: State = {
      ...withMoney(earned),
      lifetimeEarned: earned,
      runEarned: earned,
      recipes: 20,
      recetario: { canasta: 1, guardadito: 1, caldo: 1 },
    };
    expect(recetarioMultiplier(s)).toBe(2);
    expect(revenuePerCycle(s, 'elotes')).toBeCloseTo(2 * (1 + 0.02 * (20 - 17)));
    const p = prestige(s, T0 + 1);
    expect(p.recetario).toEqual(s.recetario);
    expect(p.recipes).toBe(25 - 20 + 20); // 25 ganadas en total − 20 que ya tenía = 5 nuevas
    expect(p.money).toBe(500);
    expect(p.businesses.elotes?.count).toBe(25);
    expect(p.businesses.elotes?.manager).toBe(false);
    expect(recetarioMultiplier(p)).toBe(2);
    expect(newState(T0).recetario).toEqual({});
  });

  it('canasta y guardadito se notan al cocinar: suben hasta el valor, nunca bajan, y parten el progreso como buy', () => {
    const pobre = startCycle({ ...conRecetas(3), businesses: { ...newState(T0).businesses } }, 'elotes');
    pobre.businesses.elotes = { ...pobre.businesses.elotes!, count: 10, progressMs: 400 };
    const con25 = buyRecetario(pobre, 'canasta');
    expect(con25.businesses.elotes?.count).toBe(25);
    expect(con25.businesses.elotes?.progressMs).toBe(200); // cruzó el hito 25
    expect(con25.businesses.elotes?.running).toBe(true);
    expect(buyRecetario(con25, 'guardadito').money).toBe(500);
    const rico = { ...conRecetas(3), money: 1e6 };
    rico.businesses.elotes = { ...rico.businesses.elotes!, count: 300 };
    const sigueRico = buyRecetario(buyRecetario(rico, 'canasta'), 'guardadito');
    expect(sigueRico.businesses.elotes?.count).toBe(300);
    expect(sigueRico.money).toBe(1e6);
  });

  it('heredarVale: al menos HERENCIA_MIN pendientes y al menos la mitad de las activas', () => {
    const con = (pendientes: number, activas: number): State => ({
      ...newState(T0),
      recipes: activas,
      lifetimeEarned: RECIPE_DIVISOR * (pendientes + activas) ** 2,
    });
    expect(HERENCIA_MIN).toBe(5);
    expect(heredarVale(con(4, 0))).toBe(false);
    expect(heredarVale(con(5, 0))).toBe(true);
    expect(heredarVale(con(20, 60))).toBe(false);
    expect(heredarVale(con(30, 60))).toBe(true);
    expect(heredarVale(con(5, 9))).toBe(true);
    expect(heredarVale(con(5, 11))).toBe(false);
  });
});

describe('ranking: identidad en el estado', () => {
  const ranking = { id: '6f1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', secreto: 'a'.repeat(32), apodo: 'Beto' };

  it('una partida nueva no participa', () => {
    expect(newState(T0).ranking).toBeNull();
  });

  it('la herencia conserva la identidad del ranking', () => {
    const earned = RECIPE_DIVISOR * 4;
    const s = { ...withMoney(earned), lifetimeEarned: earned, runEarned: earned, ranking };
    expect(prestige(s, T0 + 1).ranking).toEqual(ranking);
  });
});

describe('ranking: cotas de plausibilidad', () => {
  it('tasaMaxima cuenta todo negocio abierto, con o sin empleado, con la propina activa', () => {
    const s = buy(withMoney(1e6), 'elotes', 10); // sin empleado: a mano sigue vendiendo
    expect(incomePerSecond(s)).toBe(0);
    expect(tasaMaxima(s)).toBeCloseTo((revenuePerCycle(s, 'elotes') / cicloMs(elotes, 11)) * 1000 * PROPINA_MULT);
    const con = hireManager(s, 'elotes');
    expect(tasaMaxima(con)).toBeGreaterThanOrEqual(incomePerSecond(con));
    expect(tasaMaxima(con)).toBeCloseTo(incomePerSecond(con) * PROPINA_MULT);
    expect(tasaMaxima(newState(T0))).toBeGreaterThan(0); // el primer elote siempre está abierto
  });

  it('arranqueDinero es el Guardadito del nivel cocinado, 0 sin cupón', () => {
    expect(arranqueDinero(newState(T0))).toBe(0);
    expect(arranqueDinero({ ...newState(T0), recetario: { guardadito: 2 } })).toBe(10_000);
  });
});
