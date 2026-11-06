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
} from './data';
import {
  applyOffline,
  buy,
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
  revenuePerCycle,
  startCycle,
  tick,
  TRABAJADO_TOPE_MS,
  ventasPorSegundo,
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
    expect(JSON.stringify(s)).not.toContain('null');
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
