import { describe, expect, it } from 'vitest';
import { BUSINESSES, OFFLINE_CAP_MS, RECIPE_DIVISOR, UPGRADES } from './data';
import {
  applyOffline,
  buy,
  buyUpgrade,
  canHireManager,
  getUpgrade,
  nextUpgrades,
  upgradeMultiplier,
  costOf,
  getDef,
  hireManager,
  maxAffordable,
  newState,
  pendingRecipes,
  quantityFor,
  prestige,
  revenuePerCycle,
  startCycle,
  tick,
  type State,
} from './game';

const elotes = getDef('elotes');
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
    for (const def of BUSINESSES) expect(Number.isInteger(def.managerCost)).toBe(true);
    for (const u of UPGRADES) expect(Number.isInteger(u.cost)).toBe(true);
    const s = buy(withMoney(elotes.baseCost), 'elotes', 1);
    expect(canHireManager({ ...s, money: elotes.managerCost - 1e-9 }, 'elotes')).toBe(false);
    expect(canHireManager({ ...s, money: elotes.managerCost }, 'elotes')).toBe(true);
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
    let s = hireManager(withMoney(elotes.managerCost), 'elotes');
    expect(s.businesses.elotes?.manager).toBe(true);
    s = tick(s, elotes.cycleMs * 1e9 + 1);
    expect(s.money).toBeCloseTo(elotes.baseRevenue * 1e9);
    expect(s.businesses.elotes?.progressMs).toBeCloseTo(1);
  });

  it('dt inválido no rompe el estado', () => {
    const s = newState(T0);
    expect(tick(s, NaN)).toBe(s);
    expect(tick(s, -1)).toBe(s);
    expect(tick(s, Infinity)).toBe(s);
  });

  it('hitos duplican el ingreso', () => {
    const s = newState(T0);
    const at = (count: number) =>
      revenuePerCycle({ ...s, businesses: { ...s.businesses, elotes: { ...s.businesses.elotes!, count } } }, 'elotes') /
      count;
    expect(at(24)).toBe(1);
    expect(at(25)).toBe(2);
    expect(at(50)).toBe(4);
    expect(at(200)).toBe(16);
  });
});

describe('offline', () => {
  const managed = (): State => ({ ...hireManager(withMoney(elotes.managerCost), 'elotes'), lastSeen: T0 });

  it('gana por el tiempo fuera', () => {
    const { earned } = applyOffline(managed(), T0 + 60_000);
    expect(earned).toBeCloseTo(60 * elotes.baseRevenue);
  });

  it('tope de 8 h', () => {
    const { earned, elapsedMs } = applyOffline(managed(), T0 + OFFLINE_CAP_MS * 10);
    expect(elapsedMs).toBe(OFFLINE_CAP_MS);
    expect(earned).toBeCloseTo((OFFLINE_CAP_MS / elotes.cycleMs) * elotes.baseRevenue);
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
    let s = hireManager(withMoney(elotes.managerCost), 'elotes');
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
