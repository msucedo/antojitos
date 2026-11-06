import { describe, expect, it } from 'vitest';
import { BUSINESSES, UPGRADES } from './data';
import { desbloquear, nuevos } from './logros';
import { claveDia, diaVecino } from './fecha';
import { cobrar } from './racha';
import {
  buy,
  buyUpgrade,
  canBuyUpgrade,
  cicloMs,
  canHireManager,
  costOf,
  getDef,
  hireManager,
  newState,
  pendingRecipes,
  revenuePerCycle,
  startCycle,
  tick,
  type State,
} from './game';

/** Tiempo que tarda un jugador en volver a tocar un negocio sin gerente. */
const REACTION_MS = 1_000;
const STEP_MS = 100;
const DECIDE_EVERY_MS = 1_000;
const LIMIT_MS = 4 * 3_600_000;

function efficiency(cycleMs: number, manager: boolean): number {
  return manager ? 1 : cycleMs / (cycleMs + REACTION_MS);
}

/**
 * Ingreso por segundo de un negocio en `s` con el ciclo efectivo (los hitos lo parten). Una compra
 * puede cambiar el ciclo, así que la ganancia es rate(después) − rate(antes), no Δingreso / ciclo.
 */
function rate(s: State, id: string): number {
  const def = getDef(id);
  const b = s.businesses[id]!;
  const c = cicloMs(def, b.count);
  return (revenuePerCycle(s, id) * 1000 * efficiency(c, b.manager)) / c;
}

/** Mejor compra por retorno (ingreso/s ganado ÷ costo) entre las que alcanza. */
function bestAction(s: State): State | null {
  let best: { score: number; apply: () => State } | null = null;
  for (const def of BUSINESSES) {
    const b = s.businesses[def.id]!;
    const cost = costOf(def, b.count, 1);
    if (cost <= s.money) {
      const after = { ...s, businesses: { ...s.businesses, [def.id]: { ...b, count: b.count + 1 } } };
      const gain = rate(after, def.id) - rate(s, def.id);
      const score = gain / cost;
      if (!best || score > best.score) best = { score, apply: () => buy(s, def.id, 1) };
    }
    if (canHireManager(s, def.id)) {
      const c = cicloMs(def, b.count);
      const gain = ((revenuePerCycle(s, def.id) * 1000) / c) * (1 - efficiency(c, false));
      const score = gain / def.manager.cost;
      if (!best || score > best.score) best = { score, apply: () => hireManager(s, def.id) };
    }
  }
  for (const u of UPGRADES) {
    if (!canBuyUpgrade(s, u.id)) continue;
    const after = { ...s, upgrades: [...s.upgrades, u.id] };
    let gain = 0;
    for (const def of BUSINESSES) gain += rate(after, def.id) - rate(s, def.id);
    const score = gain / u.cost;
    if (!best || score > best.score) best = { score, apply: () => buyUpgrade(s, u.id) };
  }
  return best ? best.apply() : null;
}

interface Result {
  firstManagerMs: number | null;
  firstPrestigeMs: number | null;
  unlockMs: Record<string, number>;
  upgradesBought: number;
}

function simulate(inicio: State = newState(0)): Result {
  let s = inicio;
  const idleSince: Record<string, number> = {};
  const res: Result = { firstManagerMs: null, firstPrestigeMs: null, unlockMs: {}, upgradesBought: 0 };
  for (let t = 0; t <= LIMIT_MS; t += STEP_MS) {
    for (const def of BUSINESSES) {
      const b = s.businesses[def.id]!;
      if (b.count > 0 && !b.manager && !b.running) {
        idleSince[def.id] ??= t;
        if (t - idleSince[def.id]! >= REACTION_MS) {
          s = startCycle(s, def.id);
          delete idleSince[def.id];
        }
      }
    }
    if (t % DECIDE_EVERY_MS === 0) {
      for (let next = bestAction(s); next; next = bestAction(s)) s = next;
      s = desbloquear(s, nuevos(s)); // el bono de logros entra en la simulación, como en el juego
      for (const def of BUSINESSES) {
        const b = s.businesses[def.id]!;
        if (b.count > 0) res.unlockMs[def.id] ??= t;
        if (b.manager && res.firstManagerMs === null) res.firstManagerMs = t;
      }
      res.upgradesBought = s.upgrades.length;
      if (res.firstPrestigeMs === null && pendingRecipes(s) >= 1) {
        res.firstPrestigeMs = t;
        break;
      }
    }
    s = tick(s, STEP_MS);
  }
  return res;
}

describe('balance', () => {
  const r = simulate();
  const min = (ms: number | null | undefined) => (ms == null ? '—' : `${(ms / 60_000).toFixed(1)} min`);
  console.info(
    [
      `primer gerente: ${min(r.firstManagerMs)}`,
      `primera herencia: ${min(r.firstPrestigeMs)}`,
      `mejoras compradas: ${r.upgradesBought}/${UPGRADES.length}`,
      ...BUSINESSES.map((d) => `  ${getDef(d.id).name}: ${min(r.unlockMs[d.id])}`),
    ].join('\n'),
  );

  it('primer gerente en ~2 min', () => {
    expect(r.firstManagerMs).not.toBeNull();
    expect(r.firstManagerMs!).toBeGreaterThanOrEqual(60_000);
    expect(r.firstManagerMs!).toBeLessThanOrEqual(4 * 60_000);
  });

  it('primera herencia en 1–2 h', () => {
    expect(r.firstPrestigeMs).not.toBeNull();
    expect(r.firstPrestigeMs!).toBeGreaterThanOrEqual(60 * 60_000);
    expect(r.firstPrestigeMs!).toBeLessThanOrEqual(120 * 60_000);
  });

  it('se desbloquean los 8 negocios antes de la herencia', () => {
    for (const def of BUSINESSES) expect(r.unlockMs[def.id]).toBeDefined();
  });
});

describe('balance con el regalo del día 1 de racha', () => {
  // Partida de ayer (1 elote, sin dinero) que vuelve hoy y cobra el día 1: 2 min de ventas = $120.
  const HOY = 1_700_000_000_000;
  const ayer = { ...newState(HOY), racha: { dias: 0, ultimoDia: diaVecino(claveDia(HOY), -1) } };
  const cobrado = cobrar(ayer, HOY);
  const r = simulate(cobrado!.state);

  it('regala $120: adelanta el primer gerente (≈ 25 s en vez de 1.7 min) sin mover la herencia de 1–2 h', () => {
    expect(cobrado?.state.money).toBe(120);
    expect(r.firstManagerMs).not.toBeNull();
    expect(r.firstManagerMs!).toBeLessThanOrEqual(4 * 60_000);
    expect(r.firstPrestigeMs!).toBeGreaterThanOrEqual(60 * 60_000);
    expect(r.firstPrestigeMs!).toBeLessThanOrEqual(120 * 60_000);
  });
});
