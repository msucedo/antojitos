import { describe, expect, it } from 'vitest';
import { BUSINESSES, HERENCIA_MIN, RECETARIO, UPGRADES } from './data';
import { desbloquear, IMPERIO_UNIDADES, LOGROS, nuevos } from './logros';
import { claveDia, diaVecino } from './fecha';
import { cobrar } from './racha';
import {
  buy,
  buyRecetario,
  buyUpgrade,
  canBuyRecetario,
  canBuyUpgrade,
  cicloMs,
  canHireManager,
  costOf,
  getDef,
  heredarVale,
  hireManager,
  newState,
  pendingRecipes,
  prestige,
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
  /** Primera receta pendiente (desde aquí el botón Herencia se enciende). */
  firstRecipeMs: number | null;
  /** HERENCIA_MIN pendientes: cuando Chelo sugiere heredar. */
  firstPrestigeMs: number | null;
  unlockMs: Record<string, number>;
  upgradesBought: number;
  /** Estado al parar, para encadenar la segunda partida. */
  final: State;
}

function simulate(inicio: State = newState(0)): Result {
  let s = inicio;
  const idleSince: Record<string, number> = {};
  const res: Result = {
    firstManagerMs: null,
    firstRecipeMs: null,
    firstPrestigeMs: null,
    unlockMs: {},
    upgradesBought: 0,
    final: inicio,
  };
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
      if (res.firstRecipeMs === null && pendingRecipes(s) >= 1) res.firstRecipeMs = t;
      if (res.firstPrestigeMs === null && pendingRecipes(s) >= HERENCIA_MIN) {
        res.firstPrestigeMs = t;
        break;
      }
    }
    s = tick(s, STEP_MS);
  }
  res.final = s;
  return res;
}

/** Cocina todo lo que alcance, lo grande primero (el caldo dobla todo; lo demás acorta la partida). */
function cocinar(s: State): State {
  const orden = ['caldo', 'canasta', 'guardadito', 'molcajete', 'olla', 'cafecito'];
  for (const id of orden) while (canBuyRecetario(s, id)) s = buyRecetario(s, id);
  return s;
}

interface Larga {
  /** Minutos jugados hasta los 8 negocios con IMPERIO_UNIDADES (null si no llegó). */
  imperioMs: number | null;
  mejorasTodasMs: number | null;
  herencias: number;
  recetas: number;
  horasSimuladas: number;
}

/**
 * Varias partidas: hereda cuando Chelo lo sugiere (`heredarVale`), cocina el recetario y sigue
 * comprando por retorno. Paso de 100 ms mientras algún negocio abierto se atiende a mano; después
 * de 1 min (todo cerrado, el ingreso es continuo). Mide cuándo caen `imperio` y `mejoras-todas`.
 */
function simulateLarga(limitMs: number): Larga {
  let s = newState(0);
  const res: Larga = { imperioMs: null, mejorasTodasMs: null, herencias: 0, recetas: 0, horasSimuladas: 0 };
  const idleSince: Record<string, number> = {};
  let t = 0;
  let sinceDecide = 0;
  while (t <= limitMs) {
    let manual = false;
    for (const def of BUSINESSES) {
      const b = s.businesses[def.id]!;
      if (b.count > 0 && !b.manager) {
        manual = true;
        if (!b.running) {
          idleSince[def.id] ??= t;
          if (t - idleSince[def.id]! >= REACTION_MS) {
            s = startCycle(s, def.id);
            delete idleSince[def.id];
          }
        }
      }
    }
    if (sinceDecide >= DECIDE_EVERY_MS) {
      sinceDecide = 0;
      if (heredarVale(s)) {
        s = cocinar(prestige(s, t));
        res.herencias++;
      }
      for (let next = bestAction(s); next; next = bestAction(s)) s = next;
      s = desbloquear(s, nuevos(s));
      if (res.mejorasTodasMs === null && s.logros.includes('mejoras-todas')) res.mejorasTodasMs = t;
      if (s.logros.includes('imperio')) {
        res.imperioMs = t;
        break;
      }
    }
    const dt = manual ? STEP_MS : 60_000;
    s = tick(s, dt);
    t += dt;
    sinceDecide += dt;
  }
  res.recetas = s.recipes;
  res.horasSimuladas = t / 3_600_000;
  return res;
}

describe('balance', () => {
  const r = simulate();
  const min = (ms: number | null | undefined) => (ms == null ? '—' : `${(ms / 60_000).toFixed(1)} min`);
  console.info(
    [
      `primer gerente: ${min(r.firstManagerMs)}`,
      `primera receta pendiente: ${min(r.firstRecipeMs)}`,
      `herencia sugerida (${HERENCIA_MIN} recetas): ${min(r.firstPrestigeMs)}`,
      `mejoras compradas: ${r.upgradesBought}/${UPGRADES.length}`,
      ...BUSINESSES.map((d) => `  ${getDef(d.id).name}: ${min(r.unlockMs[d.id])}`),
    ].join('\n'),
  );

  it('primer gerente en ~2 min', () => {
    expect(r.firstManagerMs).not.toBeNull();
    expect(r.firstManagerMs!).toBeGreaterThanOrEqual(60_000);
    expect(r.firstManagerMs!).toBeLessThanOrEqual(4 * 60_000);
  });

  it('herencia sugerida en 1–2 h, con HERENCIA_MIN recetas; la primera pendiente llega antes', () => {
    expect(r.firstPrestigeMs).not.toBeNull();
    expect(r.firstPrestigeMs!).toBeGreaterThanOrEqual(60 * 60_000);
    expect(r.firstPrestigeMs!).toBeLessThanOrEqual(120 * 60_000);
    expect(pendingRecipes(r.final)).toBe(HERENCIA_MIN);
    expect(r.firstRecipeMs!).toBeLessThan(r.firstPrestigeMs!);
  });

  it('se desbloquean los 8 negocios antes de la herencia', () => {
    for (const def of BUSINESSES) expect(r.unlockMs[def.id]).toBeDefined();
  });

  it('segunda partida: con canasta y guardadito arranca con 25 elotes y $500, contrata en segundos y vuelve a sugerir la herencia antes de 2 h', () => {
    let p = prestige(r.final, r.firstPrestigeMs!);
    p = buyRecetario(buyRecetario(p, 'canasta'), 'guardadito');
    expect(p.money).toBe(500);
    expect(p.businesses.elotes?.count).toBe(25);
    expect(p.recipes).toBe(HERENCIA_MIN);
    const r2 = simulate(p);
    console.info(`segunda partida: gerente ${min(r2.firstManagerMs)}, herencia sugerida ${min(r2.firstPrestigeMs)}`);
    expect(r2.firstManagerMs!).toBeLessThanOrEqual(60_000);
    expect(r2.firstPrestigeMs).not.toBeNull();
    expect(r2.firstPrestigeMs!).toBeLessThanOrEqual(120 * 60_000);
  });
});

describe('progresión larga (varias herencias)', () => {
  const LIMITE_H = 24 * 60; // 60 días jugados
  const l = simulateLarga(LIMITE_H * 3_600_000);
  const dias = (ms: number | null) => (ms == null ? '—' : `${(ms / 86_400_000).toFixed(1)} días`);
  console.info(
    [
      `imperio (${IMPERIO_UNIDADES}): ${dias(l.imperioMs)}`,
      `mejoras-todas (${UPGRADES.length}): ${dias(l.mejorasTodasMs)}`,
      `herencias: ${l.herencias}, recetas: ${l.recetas}, simulado: ${(l.horasSimuladas / 24).toFixed(1)} días`,
    ].join('\n'),
  );

  it('imperio (350) cae entre 1 y 5 semanas de juego óptimo; mejoras-todas y el recetario entero, antes', () => {
    // Medido: imperio 17.0 días, mejoras-todas 1.6 días (PLAN.md MVP4). Un jugador real tarda 2 a 4 veces más.
    expect(l.imperioMs).not.toBeNull();
    expect(l.imperioMs!).toBeGreaterThanOrEqual(7 * 86_400_000);
    expect(l.imperioMs!).toBeLessThanOrEqual(35 * 86_400_000);
    expect(l.mejorasTodasMs).not.toBeNull();
    expect(l.mejorasTodasMs!).toBeLessThanOrEqual(7 * 86_400_000);
    expect(RECETARIO.flatMap((r) => r.niveles).reduce((a, n) => a + n.costo, 0)).toBeLessThan(l.recetas);
    expect(LOGROS.some((d) => d.id === 'imperio')).toBe(true);
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
