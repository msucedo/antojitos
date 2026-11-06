import {
  ANTIGUEDAD_MS,
  BUSINESSES,
  ESTRELLA_BONO,
  MILESTONES,
  OFFLINE_CAP_MS,
  PROPINA_COSTO_MS,
  PROPINA_ESPERA_MS,
  PROPINA_MS,
  PROPINA_MULT,
  RECIPE_BONUS,
  RECIPE_DIVISOR,
  UPGRADES,
  type BusinessDef,
  type UpgradeDef,
} from './data';

export const SAVE_VERSION = 3;

export interface BizState {
  count: number;
  /** ms acumulados del ciclo en curso. */
  progressMs: number;
  /** Ciclo manual en curso (sin gerente). */
  running: boolean;
  manager: boolean;
  /**
   * Cuenta regresiva de la propina en tiempo de juego: por encima de PROPINA_ESPERA_MS el empleado
   * vende ×PROPINA_MULT; de ahí a 0 es la espera; en 0 se puede dar otra.
   */
  propinaMs: number;
  /** Tiempo trabajado con empleado (define las estrellas de antigüedad), con tope en la última. */
  trabajadoMs: number;
}

/** Cuenta regresiva completa de una propina: el doble más la espera. */
export const PROPINA_TOTAL_MS = PROPINA_MS + PROPINA_ESPERA_MS;
/** trabajadoMs no pasa de aquí: con la última estrella ya no cambia nada. */
export const TRABAJADO_TOPE_MS = ANTIGUEDAD_MS[ANTIGUEDAD_MS.length - 1] ?? 0;

export function emptyBiz(count = 0): BizState {
  return { count, progressMs: 0, running: false, manager: false, propinaMs: 0, trabajadoMs: 0 };
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

/** Orden del selector de cantidad; el botón del lateral cicla por aquí. */
export const MODES: readonly BuyMode[] = [1, 10, 'max'];

export function nextMode(m: BuyMode): BuyMode {
  return MODES[(MODES.indexOf(m) + 1) % MODES.length] ?? 1;
}

function freshBusinesses(): Record<string, BizState> {
  const out: Record<string, BizState> = {};
  BUSINESSES.forEach((def, i) => {
    out[def.id] = emptyBiz(i === 0 ? 1 : 0);
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

/** Sonido de una compra que ya pasó: hito si cruzó uno, abrir si el negocio nacía, si no compra. */
export function buySound(before: State, after: State, id: string): 'buy' | 'open' | 'milestone' {
  if (milestonesCrossed(before, after, id) > 0) return 'milestone';
  return biz(before, id).count === 0 ? 'open' : 'buy';
}

/** Siguiente hito no alcanzado, o null si ya están todos. */
export function nextMilestone(count: number): number | null {
  return MILESTONES.find((m) => count < m) ?? null;
}

export function revenuePerCycle(state: State, id: string): number {
  return revenueWithStars(state, id, estrellas(biz(state, id)));
}

/** Ingreso por vuelta con `stars` estrellas (advance cambia de estrellas a mitad de un dt). */
function revenueWithStars(state: State, id: string, stars: number): number {
  const def = getDef(id);
  const { count } = biz(state, id);
  return Math.min(
    def.baseRevenue *
      count *
      2 ** milestonesReached(count) *
      (1 + RECIPE_BONUS * state.recipes) *
      (1 + ESTRELLA_BONO * stars) *
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

/** Negocios cuyo gerente se puede contratar ahora mismo (badge del menú Empleados). */
export function hireableIds(state: State): string[] {
  return BUSINESSES.filter((d) => canHireManager(state, d.id)).map((d) => d.id);
}

/**
 * Momento de la lección de Chelo: por primera vez alcanza para un empleado. Nunca tras heredar
 * (quien tiene recetas ya contrató antes) ni con alguno contratado.
 */
export function firstHireReady(state: State): boolean {
  if (state.recipes > 0) return false;
  if (BUSINESSES.some((d) => biz(state, d.id).manager)) return false;
  return hireableIds(state).length > 0;
}

export function hireManager(state: State, id: string): State {
  if (!canHireManager(state, id)) return state;
  const b = biz(state, id);
  return withBiz({ ...state, money: state.money - getDef(id).manager.cost }, id, {
    manager: true,
    running: false,
    progressMs: b.running ? b.progressMs : 0,
    propinaMs: 0,
    trabajadoMs: 0,
  });
}

/** Estrellas de antigüedad (0 a 3) según el tiempo trabajado con empleado. */
export function estrellas(b: BizState): number {
  return ANTIGUEDAD_MS.filter((ms) => b.trabajadoMs >= ms).length;
}

/** El negocio vende ×PROPINA_MULT ahora mismo. */
export function propinaActiva(b: BizState): boolean {
  return b.propinaMs > PROPINA_ESPERA_MS;
}

export function propinaLista(b: BizState): boolean {
  return b.manager && b.count > 0 && b.propinaMs === 0;
}

/** Lo que vende el negocio por segundo (con empleado; base del /s y de la propina). */
export function ventasPorSegundo(state: State, id: string): number {
  return (revenuePerCycle(state, id) * 1000) / getDef(id).cycleMs;
}

/** Precio de la propina: lo que el negocio vende en PROPINA_COSTO_MS. Entero, como costOf. */
export function propinaCosto(state: State, id: string): number {
  return Math.ceil((ventasPorSegundo(state, id) * PROPINA_COSTO_MS) / 1000);
}

export function puedeDarPropina(state: State, id: string): boolean {
  return propinaLista(biz(state, id)) && state.money >= propinaCosto(state, id);
}

/** Paga la propina: ×PROPINA_MULT de ventas durante PROPINA_MS y luego la espera. Sin efecto si no se puede. */
export function darPropina(state: State, id: string): State {
  if (!puedeDarPropina(state, id)) return state;
  return withBiz({ ...state, money: state.money - propinaCosto(state, id) }, id, { propinaMs: PROPINA_TOTAL_MS });
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
    if (b.manager) {
      const r = advanceManaged(state, def, b, dtMs);
      earned = capAdd(earned, r.earned);
      businesses[def.id] = r.biz;
      continue;
    }
    const total = b.progressMs + dtMs;
    const cycles = Math.floor(total / def.cycleMs);
    const perCycle = revenuePerCycle(state, def.id);
    if (cycles >= 1) {
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

/**
 * Negocio con empleado: corta `dt` en los umbrales de antigüedad (a lo más 4 tramos) para que cada
 * tramo cobre con sus estrellas, igual que si la pestaña hubiera seguido abierta. También corta al
 * terminar la propina: dentro de su ventana el tramo suma el extra de ventas; la barra no cambia.
 */
function advanceManaged(state: State, def: BusinessDef, b: BizState, dtMs: number): { biz: BizState; earned: number } {
  let { progressMs, propinaMs, trabajadoMs } = b;
  let earned = 0;
  let left = dtMs;
  while (left > 0) {
    // Tramo hasta el siguiente corte: umbral de antigüedad o fin de la ventana de la propina.
    const ventana = Math.max(propinaMs - PROPINA_ESPERA_MS, 0);
    const next = ANTIGUEDAD_MS.find((ms) => ms > trabajadoMs);
    let seg = next === undefined ? left : Math.min(left, next - trabajadoMs);
    if (ventana > 0) seg = Math.min(seg, ventana);
    const total = progressMs + seg;
    const cycles = Math.floor(total / def.cycleMs);
    const perCycle = revenueWithStars(state, def.id, estrellas({ ...b, trabajadoMs }));
    earned = capAdd(earned, cycles * perCycle);
    // Propina: extra continuo al dinero (no por vueltas), así un negocio lento cobra igual que uno rápido.
    if (ventana > 0) earned = capAdd(earned, ((PROPINA_MULT - 1) * perCycle * seg) / def.cycleMs);
    progressMs = total - cycles * def.cycleMs;
    propinaMs = Math.max(propinaMs - seg, 0);
    trabajadoMs = Math.min(trabajadoMs + seg, TRABAJADO_TOPE_MS);
    left -= seg;
  }
  return { biz: { ...b, progressMs, propinaMs, trabajadoMs }, earned };
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
    if (b.manager && b.count > 0) total += ventasPorSegundo(state, def.id) * (propinaActiva(b) ? PROPINA_MULT : 1);
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
