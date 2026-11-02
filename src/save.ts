import { BUSINESSES } from './data';
import { newState, SAVE_VERSION, type BizState, type State } from './game';

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
const MIGRATIONS: Record<number, (o: Raw) => Raw> = {};

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

function parseBiz(raw: unknown, cycleMs: number): BizState | null {
  if (raw === undefined) return { count: 0, progressMs: 0, running: false, manager: false };
  if (!isObj(raw)) return null;
  const { count, progressMs, running, manager } = raw;
  if (!isInt(count) || count > MAX_COUNT || !isNum(progressMs)) return null;
  if (typeof running !== 'boolean' || typeof manager !== 'boolean') return null;
  return { count, progressMs: Math.min(progressMs, cycleMs), running: running && count > 0, manager };
}

/** Valida y migra un objeto no confiable. Construye el estado desde cero: claves desconocidas se descartan. */
export function validate(input: unknown): State | null {
  if (!isObj(input)) return null;
  const o = migrate(input);
  if (!o) return null;
  const { money, runEarned, lifetimeEarned, recipes, lastSeen, businesses } = o;
  if (!isNum(money) || !isNum(runEarned) || !isNum(lifetimeEarned) || !isInt(recipes) || !isNum(lastSeen)) return null;
  if (!isObj(businesses)) return null;
  const out: Record<string, BizState> = {};
  for (const def of BUSINESSES) {
    const b = parseBiz(Object.hasOwn(businesses, def.id) ? businesses[def.id] : undefined, def.cycleMs);
    if (!b) return null;
    out[def.id] = b;
  }
  return { version: SAVE_VERSION, money, runEarned, lifetimeEarned, recipes, lastSeen, businesses: out };
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
  source: 'save' | 'backup' | 'new';
  /** Había datos pero no se pudieron leer: avisar al jugador. */
  problem: boolean;
}

export function load(kv: KV, now: number): Loaded {
  const main = safeGet(kv, SAVE_KEY);
  const fromMain = parseJson(main);
  if (fromMain) return { state: fromMain, source: 'save', problem: false };
  if (main !== null) safeSet(kv, UNREADABLE_KEY, main);
  const fromBak = parseJson(safeGet(kv, BACKUP_KEY));
  if (fromBak) return { state: fromBak, source: 'backup', problem: main !== null };
  return { state: newState(now), source: 'new', problem: main !== null };
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

export function importSave(text: string): State | null {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_IMPORT_CHARS) return null;
  try {
    const bin = atob(trimmed);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return validate(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  } catch {
    return null;
  }
}
