/**
 * Lado cliente del ranking mundial, sin red: identidad, cuerpo del envío, lectura defensiva de las
 * respuestas y la decisión de cuándo enviar. `main.ts` pone el fetch y los temporizadores.
 */
import type { Ranking, State } from './game';
import { MAX_IMPORT_CHARS } from './save';

export const RUTA_RANKING = '/api/ranking';
/** Envío automático: cada minuto, solo si cambió lo ganado o las recetas y la pestaña está visible. */
export const ENVIO_MS = 60_000;

export interface Fila {
  pos: number;
  apodo: string;
  /** Ganado en total (`lifetimeEarned`); el servidor lo sigue llamando `money`. */
  money: number;
  /** Recetas del jugador; null si la respuesta (cacheada, de antes) no las trae. */
  recetas: number | null;
}

export interface Top {
  top: Fila[];
  total: number;
}

export interface Puesto {
  pos: number;
  total: number;
  /** Apodo vigente en el servidor (fijo desde el alta); null si no vino. */
  apodo: string | null;
}

/** Lo que cuenta el servidor de un envío; `red` es que no respondió. */
export type ErrorEnvio = 'save' | 'apodo' | 'secreto' | 'salto' | 'limite' | 'baneado' | 'red';

/** Lo que se usa de `crypto`; en tests se sustituye por un azar fijo. */
interface Azar {
  randomUUID(): string;
  getRandomValues(a: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer>;
}

export function crearIdentidad(apodo: string, rng: Azar): Ranking {
  const bytes = rng.getRandomValues(new Uint8Array(16));
  const secreto = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return { id: rng.randomUUID(), secreto, apodo };
}

/** Body del POST, o null si el guardado no cabe (el servidor lo rechazaría igual). */
export function cuerpoEnvio(state: State): string | null {
  const save = JSON.stringify(state);
  if (save.length > MAX_IMPORT_CHARS) return null;
  return JSON.stringify({ save });
}

const esObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const esEntero = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const esMonto = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function parsearTop(json: unknown): Top | null {
  if (!esObj(json) || !Array.isArray(json.top) || !esEntero(json.total)) return null;
  const top: Fila[] = [];
  for (const f of json.top) {
    if (!esObj(f) || !esEntero(f.pos) || typeof f.apodo !== 'string' || !esMonto(f.money)) return null;
    if (f.recetas !== undefined && !esEntero(f.recetas)) return null;
    top.push({ pos: f.pos, apodo: f.apodo, money: f.money, recetas: f.recetas ?? null });
  }
  return { top, total: json.total };
}

export function parsearEnvio(json: unknown): Puesto | null {
  if (!esObj(json) || !esEntero(json.pos) || json.pos < 1 || !esEntero(json.total)) return null;
  return { pos: json.pos, total: json.total, apodo: typeof json.apodo === 'string' ? json.apodo : null };
}

export interface UltimoEnvio {
  en: number;
  ganado: number;
  recetas: number;
}

export const marcaEnvio = (state: State, en: number): UltimoEnvio => ({
  en,
  ganado: state.lifetimeEarned,
  recetas: state.recipes,
});

/** ¿Cambió algo de lo que muestra el ranking (lo ganado o las recetas) desde el último envío? */
export function cambioDesde(ultimo: UltimoEnvio, state: State): boolean {
  return state.lifetimeEarned !== ultimo.ganado || state.recipes !== ultimo.recetas;
}

/** Sin envío previo, sí; después, al minuto y solo si cambió lo ganado o las recetas. */
export function debeEnviar(ultimo: UltimoEnvio | null, state: State, now: number): boolean {
  if (!ultimo) return true;
  if (now - ultimo.en < ENVIO_MS) return false;
  return cambioDesde(ultimo, state);
}
