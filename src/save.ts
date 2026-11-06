import { BUSINESSES, RECIPE_DIVISOR, UPGRADES, type BusinessDef } from './data';
import {
  cicloMs,
  emptyBiz,
  emptyStats,
  newState,
  PROPINA_TOTAL_MS,
  SAVE_VERSION,
  TRABAJADO_TOPE_MS,
  type BizState,
  type Racha,
  type State,
  type Stats,
} from './game';
import { LOGRO_IDS } from './logros';
import { iniciarRacha } from './racha';

export const SAVE_KEY = 'antojitos.save';
export const BACKUP_KEY = 'antojitos.bak';
/** Copia intacta de un guardado ilegible, para no perderlo al sobrescribir. */
export const UNREADABLE_KEY = 'antojitos.unreadable';
export const MAX_IMPORT_CHARS = 10_240;
const MAX_COUNT = 1_000_000;

export type KV = Pick<Storage, 'getItem' | 'setItem'>;

type Raw = Record<string, unknown>;

const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const isInt = (v: unknown): v is number => isNum(v) && Number.isInteger(v);

/** Migraciones en cadena: MIGRATIONS[n] convierte un guardado v(n) en v(n+1). */
/** Divisor de recetas con el que se escribieron los guardados v1. */
const V1_RECIPE_DIVISOR = 3e10;

const MIGRATIONS: Record<number, (o: Raw) => Raw> = {
  // v2: mejoras, y el divisor de recetas pasó de 3e10 a RECIPE_DIVISOR. Se reescala
  // lifetimeEarned (solo define recetas) para que recipesFor dé lo mismo que en v1.
  1: (o) => ({
    ...o,
    version: 2,
    upgrades: [],
    lifetimeEarned: isNum(o.lifetimeEarned)
      ? Math.min(o.lifetimeEarned * (RECIPE_DIVISOR / V1_RECIPE_DIVISOR), Number.MAX_VALUE)
      : o.lifetimeEarned,
  }),
  // v3: propina y antigüedad de los empleados. Empiezan en 0; nada más cambia. Un negocio que no es
  // objeto se deja igual para que parseBiz lo rechace como antes.
  2: (o) => ({
    ...o,
    version: 3,
    businesses: isObj(o.businesses)
      ? Object.fromEntries(
          Object.entries(o.businesses).map(([id, b]) => [id, isObj(b) ? { propinaMs: 0, trabajadoMs: 0, ...b } : b]),
        )
      : o.businesses,
  }),
  // v4: contadores de la Libreta y logros. Todo empieza en cero; nada más cambia.
  3: (o) => ({ ...o, version: 4, stats: {}, logros: [], logrosVistos: 0 }),
  // v5: racha diaria y recetas de regalo. No añade campos: los faltantes los rellena validate (y
  // una semilla v3/v4 que ya traiga `racha` no se pisa); load/importSave inician la racha hoy.
  4: (o) => ({ ...o, version: 5 }),
};

const DIA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Faltante o raro → racha vacía (contador, no cuesta la partida). `dias` solo vale con un día válido. */
function parseRacha(raw: unknown): Racha {
  if (!isObj(raw)) return { dias: 0, ultimoDia: null };
  const ultimoDia = typeof raw.ultimoDia === 'string' && DIA_RE.test(raw.ultimoDia) ? raw.ultimoDia : null;
  const dias = ultimoDia !== null && isInt(raw.dias) ? Math.min(raw.dias, MAX_COUNT) : 0;
  return { dias, ultimoDia };
}

/** Ids conocidos, sin duplicados; cualquier otra cosa invalida el guardado. */
function parseUpgrades(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length > UPGRADES.length) return null;
  const known = new Set(UPGRADES.map((u) => u.id));
  const out: string[] = [];
  for (const id of raw) {
    if (typeof id !== 'string' || !known.has(id) || out.includes(id)) return null;
    out.push(id);
  }
  return out;
}

/** Faltantes valen 0 (una semilla a mano); de tipo incorrecto, se rechaza. Los conteos son enteros. */
function parseStats(raw: unknown): Stats | null {
  if (raw === undefined) return emptyStats();
  if (!isObj(raw)) return null;
  const out = emptyStats();
  for (const key of Object.keys(out) as (keyof Stats)[]) {
    const v = raw[key];
    // Faltante o null (Infinity tras JSON) vale 0: es un contador, no debe costar la partida.
    if (v === undefined || v === null) continue;
    const entero = key !== 'jugadoMs' && key !== 'maxPorSegundo';
    if (!isNum(v) || (entero && !Number.isInteger(v))) return null;
    out[key] = v;
  }
  return out;
}

/**
 * Ids de logro conocidos, en su orden, sin duplicados. Un id desconocido se descarta (a diferencia
 * de las mejoras): un logro retirado del catálogo no debe costar la partida.
 */
function parseLogros(raw: unknown): string[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const id of raw) {
    if (typeof id !== 'string') return null;
    if (LOGRO_IDS.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

function migrate(o: Raw): Raw | null {
  let cur = o;
  let v = cur.version;
  if (!isInt(v) || v < 1 || v > SAVE_VERSION) return null;
  while (v < SAVE_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) return null;
    cur = step(cur);
    v++;
  }
  return cur;
}

function parseBiz(raw: unknown, def: BusinessDef): BizState | null {
  if (raw === undefined) return emptyBiz();
  if (!isObj(raw)) return null;
  const { count, progressMs, running, manager, propinaMs, trabajadoMs } = raw;
  if (!isInt(count) || count > MAX_COUNT || !isNum(progressMs)) return null;
  if (typeof running !== 'boolean' || typeof manager !== 'boolean') return null;
  // Faltantes valen 0 (un v3 escrito a mano o una semilla); de tipo incorrecto, se rechaza.
  const propina = propinaMs === undefined ? 0 : propinaMs;
  const trabajado = trabajadoMs === undefined ? 0 : trabajadoMs;
  if (!isNum(propina) || !isNum(trabajado)) return null;
  // Fuera de rango se recorta en vez de rechazar: un campo raro no debe costar la partida.
  return {
    count,
    progressMs: Math.min(progressMs, cicloMs(def, count)), // ciclo efectivo: con hitos es más corto
    running: running && count > 0,
    manager,
    propinaMs: manager ? Math.min(propina, PROPINA_TOTAL_MS) : 0,
    trabajadoMs: manager ? Math.min(trabajado, TRABAJADO_TOPE_MS) : 0,
  };
}

/** Valida y migra un objeto no confiable. Construye el estado desde cero: claves desconocidas se descartan. */
export function validate(input: unknown): State | null {
  if (!isObj(input)) return null;
  const o = migrate(input);
  if (!o) return null;
  const { money, runEarned, lifetimeEarned, recipes, lastSeen, businesses } = o;
  const upgrades = parseUpgrades(o.upgrades);
  const stats = parseStats(o.stats);
  const logros = parseLogros(o.logros);
  if (!upgrades || !stats || !logros) return null;
  if (!isNum(money) || !isNum(runEarned) || !isNum(lifetimeEarned) || !isInt(recipes) || !isNum(lastSeen)) return null;
  const vistos = o.logrosVistos ?? 0; // faltante o null (Infinity tras JSON) vale 0, como en stats
  if (!isInt(vistos)) return null;
  const regaladas = o.recetasRegalo ?? 0;
  if (!isInt(regaladas)) return null;
  if (!isObj(businesses)) return null;
  const out: Record<string, BizState> = {};
  for (const def of BUSINESSES) {
    const b = parseBiz(Object.hasOwn(businesses, def.id) ? businesses[def.id] : undefined, def);
    if (!b) return null;
    out[def.id] = b;
  }
  return {
    version: SAVE_VERSION,
    money,
    runEarned,
    lifetimeEarned,
    recipes,
    lastSeen,
    businesses: out,
    upgrades,
    stats,
    logros,
    logrosVistos: Math.min(vistos, logros.length), // fuera de rango se recorta, como el resto
    racha: parseRacha(o.racha),
    recetasRegalo: Math.min(regaladas, recipes), // no puede haber más regaladas que recetas
  };
}

function parseJson(text: string | null): State | null {
  if (text === null) return null;
  try {
    return validate(JSON.parse(text));
  } catch {
    return null;
  }
}

function safeGet(kv: KV, key: string): string | null {
  try {
    return kv.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(kv: KV, key: string, value: string): boolean {
  try {
    kv.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export interface Loaded {
  state: State;
  /** `newer`: el guardado es de una versión más nueva del juego; se juega sin guardar (ver main.ts). */
  source: 'save' | 'backup' | 'new' | 'newer';
  /** Había datos pero no se pudieron leer: avisar al jugador. */
  problem: boolean;
  /** Con `newer`: el texto del guardado más nuevo, para exportarlo tal cual desde Respaldo. */
  crudo: string | null;
}

/** Código de respaldo de un guardado tal cual (sin validar): el formato que `importSave` acepta. */
export function exportCrudo(texto: string): string {
  const bytes = new TextEncoder().encode(texto);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Versión declarada por un guardado, o null si no se puede leer. */
function versionDe(text: string | null): number | null {
  if (text === null) return null;
  try {
    const o: unknown = JSON.parse(text);
    return isObj(o) && isInt(o.version) ? o.version : null;
  } catch {
    return null;
  }
}

export function load(kv: KV, now: number): Loaded {
  const main = safeGet(kv, SAVE_KEY);
  // Build viejo en caché con una partida más nueva: no se toca nada (ni UNREADABLE ni autosave).
  if ((versionDe(main) ?? 0) > SAVE_VERSION)
    return { state: newState(now), source: 'newer', problem: false, crudo: main };
  const fromMain = parseJson(main);
  if (fromMain) return { state: iniciarRacha(fromMain, now), source: 'save', problem: false, crudo: null };
  const bak = safeGet(kv, BACKUP_KEY);
  // Principal ilegible o ausente pero respaldo más nuevo: tampoco se pisa (el respaldo se reescribe cada minuto).
  if ((versionDe(bak) ?? 0) > SAVE_VERSION)
    return { state: newState(now), source: 'newer', problem: main !== null, crudo: bak };
  if (main !== null) safeSet(kv, UNREADABLE_KEY, main);
  const fromBak = parseJson(bak);
  if (fromBak) return { state: iniciarRacha(fromBak, now), source: 'backup', problem: main !== null, crudo: null };
  return { state: newState(now), source: 'new', problem: main !== null, crudo: null };
}

export function save(kv: KV, state: State): boolean {
  return safeSet(kv, SAVE_KEY, JSON.stringify(state));
}

/** Respaldo desde el estado en memoria (ya válido); se llama con menos frecuencia que save. */
export function backup(kv: KV, state: State): boolean {
  return safeSet(kv, BACKUP_KEY, JSON.stringify(state));
}

export function exportSave(state: State): string {
  const bytes = new TextEncoder().encode(JSON.stringify(state));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function importSave(text: string, now: number): State | null {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_IMPORT_CHARS) return null;
  try {
    const bin = atob(trimmed);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const s = validate(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
    return s && iniciarRacha(s, now);
  } catch {
    return null;
  }
}
