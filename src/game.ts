import {
  BUSINESSES,
  MILESTONES,
  OFFLINE_CAP_MS,
  RECIPE_BONUS,
  RECIPE_DIVISOR,
  UPGRADES,
  type BusinessDef,
  type UpgradeDef,
} from './data';

export const SAVE_VERSION = 2;

export interface BizState {
  count: number;
  /** ms acumulados del ciclo en curso. */
  progressMs: number;
  /** Ciclo manual en curso (sin gerente). */
  running: boolean;
  manager: boolean;
}

export interface State {
  version: typeof SAVE_VERSION;
  money: number;
  /** Ganado en esta partida (se reinicia con la herencia). */
  runEarned: number;
  /** Ganado en todas las partidas; define las recetas. */
  lifetimeEarned: number;
  recipes: number;
  businesses: Record<string, BizState>;
  /** Ids de mejoras compradas en esta partida (se reinician con la herencia). */
  upgrades: string[];
  /** Date.now() de la última vez que se guardó/actualizó. */
  lastSeen: number;
}

export type BuyMode = 1 | 10 | 'max';

function freshBusinesses(): Record<string, BizState> {
  const out: Record<string, BizState> = {};
  BUSINESSES.forEach((def, i) => {
    out[def.id] = { count: i === 0 ? 1 : 0, progressMs: 0, running: false, manager: false };
  });
  return out;
}

export function newState(now: number): State {
  return {
    version: SAVE_VERSION,
    money: 0,
    runEarned: 0,
    lifetimeEarned: 0,
    recipes: 0,
    businesses: freshBusinesses(),
    upgrades: [],
    lastSeen: now,
  };
}

export function getDef(id: string): BusinessDef {
  const def = BUSINESSES.find((b) => b.id === id);
  if (!def) throw new Error(`Negocio desconocido: ${id}`);
  return def;
}

function biz(state: State, id: string): BizState {
  const b = state.businesses[id];
  if (!b) throw new Error(`Negocio sin estado: ${id}`);
  return b;
}

function withBiz(state: State, id: string, patch: Partial<BizState>): State {
  return { ...state, businesses: { ...state.businesses, [id]: { ...biz(state, id), ...patch } } };
}

export function milestonesReached(count: number): number {
  return MILESTONES.filter((m) => count >= m).length;
}

/** Hitos cruzados por un negocio entre dos estados (Máx puede cruzar varios de golpe). */
export function milestonesCrossed(before: State, after: State, id: string): number {
  return milestonesReached(biz(after, id).count) - milestonesReached(biz(before, id).count);
}

/** Siguiente hito no alcanzado, o null si ya están todos. */
export function nextMilestone(count: number): number | null {
  return MILESTONES.find((m) => count < m) ?? null;
}

export function revenuePerCycle(state: State, id: string): number {
  const def = getDef(id);
  const { count } = biz(state, id);
  return Math.min(
    def.baseRevenue *
      count *
      2 ** milestonesReached(count) *
      (1 + RECIPE_BONUS * state.recipes) *
      upgradeMultiplier(state, id),
    Number.MAX_VALUE,
  );
}

/** Suma con tope: Infinity no sobrevive a JSON y destruiría el guardado. */
function capAdd(a: number, b: number): number {
  return Math.min(a + b, Number.MAX_VALUE);
}

/**
 * Costo de comprar `k` unidades teniendo ya `owned`. Entero (hacia arriba, como
 * Cookie Clicker): así lo que se muestra es exactamente lo que se compara con el dinero.
 */
export function costOf(def: BusinessDef, owned: number, k: number): number {
  if (k <= 0) return 0;
  const r = def.growth;
  return Math.ceil((def.baseCost * r ** owned * (r ** k - 1)) / (r - 1));
}

/** Cuántas unidades alcanza `money`, con corrección por error de punto flotante. */
export function maxAffordable(def: BusinessDef, owned: number, money: number): number {
  if (!(money > 0)) return 0;
  const r = def.growth;
  const first = def.baseCost * r ** owned;
  let k = Math.floor(Math.log((money * (r - 1)) / first + 1) / Math.log(r));
  if (!Number.isFinite(k) || k < 0) k = 0;
  while (k > 0 && costOf(def, owned, k) > money) k--;
  while (costOf(def, owned, k + 1) <= money) k++;
  return k;
}

/** Unidades que compraría el modo actual (0 si no alcanza). */
export function quantityFor(state: State, id: string, mode: BuyMode): number {
  const def = getDef(id);
  const { count } = biz(state, id);
  if (mode === 'max') return maxAffordable(def, count, state.money);
  return costOf(def, count, mode) <= state.money ? mode : 0;
}

export function buy(state: State, id: string, mode: BuyMode): State {
  const k = quantityFor(state, id, mode);
  if (k === 0) return state;
  const b = biz(state, id);
  const cost = costOf(getDef(id), b.count, k);
  return withBiz({ ...state, money: state.money - cost }, id, { count: b.count + k });
}

export function startCycle(state: State, id: string): State {
  const b = biz(state, id);
  if (b.count === 0 || b.running || b.manager) return state;
  return withBiz(state, id, { running: true, progressMs: 0 });
}

export function canHireManager(state: State, id: string): boolean {
  const b = biz(state, id);
  return !b.manager && b.count > 0 && state.money >= getDef(id).manager.cost;
}

export function hireManager(state: State, id: string): State {
  if (!canHireManager(state, id)) return state;
  const b = biz(state, id);
  return withBiz({ ...state, money: state.money - getDef(id).manager.cost }, id, {
    manager: true,
    running: false,
    progressMs: b.running ? b.progressMs : 0,
  });
}

/**
 * Avanza el tiempo `dtMs`. Fórmula cerrada: un dt enorme cuesta lo mismo que uno chico.
 * Con gerente: ciclos continuos. Sin gerente: termina como mucho el ciclo en curso.
 */
export function tick(state: State, dtMs: number): State {
  return advance(state, dtMs).state;
}

/** `tick` más lo ganado, calculado directo (restar dos dineros arrastra error de punto flotante). */
function advance(state: State, dtMs: number): { state: State; earned: number } {
  if (!(dtMs > 0) || !Number.isFinite(dtMs)) return { state, earned: 0 };
  let earned = 0;
  const businesses: Record<string, BizState> = {};
  for (const def of BUSINESSES) {
    const b = biz(state, def.id);
    if (b.count === 0 || (!b.manager && !b.running)) {
      businesses[def.id] = b;
      continue;
    }
    const total = b.progressMs + dtMs;
    const cycles = Math.floor(total / def.cycleMs);
    const perCycle = revenuePerCycle(state, def.id);
    if (b.manager) {
      earned = capAdd(earned, cycles * perCycle);
      businesses[def.id] = { ...b, progressMs: total - cycles * def.cycleMs };
    } else if (cycles >= 1) {
      earned = capAdd(earned, perCycle);
      businesses[def.id] = { ...b, progressMs: 0, running: false };
    } else {
      businesses[def.id] = { ...b, progressMs: total };
    }
  }
  return {
    state: {
      ...state,
      businesses,
      money: capAdd(state.money, earned),
      runEarned: capAdd(state.runEarned, earned),
      lifetimeEarned: capAdd(state.lifetimeEarned, earned),
    },
    earned,
  };
}

/** Aplica el tiempo fuera desde `lastSeen` (tope 8 h, reloj atrasado → 0). */
export function applyOffline(state: State, now: number): { state: State; earned: number; elapsedMs: number } {
  const elapsedMs = Math.min(Math.max(now - state.lastSeen, 0), OFFLINE_CAP_MS);
  const { state: advanced, earned } = advance(state, elapsedMs);
  return { state: { ...advanced, lastSeen: now }, earned, elapsedMs };
}

export function incomePerSecond(state: State): number {
  let total = 0;
  for (const def of BUSINESSES) {
    const b = biz(state, def.id);
    if (b.manager && b.count > 0) total += (revenuePerCycle(state, def.id) * 1000) / def.cycleMs;
  }
  return total;
}

export function recipesFor(lifetimeEarned: number): number {
  return Math.floor(Math.sqrt(Math.max(lifetimeEarned, 0) / RECIPE_DIVISOR));
}

export function pendingRecipes(state: State): number {
  return Math.max(recipesFor(state.lifetimeEarned) - state.recipes, 0);
}

export function getUpgrade(id: string): UpgradeDef {
  const def = UPGRADES.find((u) => u.id === id);
  if (!def) throw new Error(`Mejora desconocida: ${id}`);
  return def;
}

/** Producto de los multiplicadores comprados que aplican a este negocio. */
export function upgradeMultiplier(state: State, bizId: string): number {
  let m = 1;
  for (const id of state.upgrades) {
    const u = getUpgrade(id);
    if (u.target === 'all' || u.target === bizId) m *= u.multiplier;
  }
  return m;
}

export function canBuyUpgrade(state: State, id: string): boolean {
  return !state.upgrades.includes(id) && state.money >= getUpgrade(id).cost;
}

export function buyUpgrade(state: State, id: string): State {
  if (!canBuyUpgrade(state, id)) return state;
  return { ...state, money: state.money - getUpgrade(id).cost, upgrades: [...state.upgrades, id] };
}

/** Las `n` mejoras más baratas sin comprar, de negocios ya abiertos o globales. */
export function nextUpgrades(state: State, n: number): UpgradeDef[] {
  return UPGRADES.filter(
    (u) => !state.upgrades.includes(u.id) && (u.target === 'all' || (state.businesses[u.target]?.count ?? 0) > 0),
  )
    .sort((a, b) => a.cost - b.cost)
    .slice(0, n);
}

/** Herencia: reinicia la partida y suma las recetas pendientes. */
export function prestige(state: State, now: number): State {
  const gained = pendingRecipes(state);
  if (gained === 0) return state;
  return {
    ...newState(now),
    lifetimeEarned: state.lifetimeEarned,
    recipes: state.recipes + gained,
  };
}
