/**
 * Lado cliente del ranking mundial, sin red: identidad, cuerpo del envío, lectura defensiva de las
 * respuestas y la decisión de cuándo enviar. `main.ts` pone el fetch y los temporizadores.
 */
import type { Ranking, State } from './game';
import { MAX_IMPORT_CHARS } from './save';

export const RUTA_RANKING = '/api/ranking';
/** Envío automático: cada minuto, solo si cambió lo ganado o las recetas y la pestaña está visible. */
export const ENVIO_MS = 60_000;
/** Tras un 429 o sin red: reintento a los 30 s, el límite del servidor por jugador. También vence un envío colgado. */
export const REINTENTO_MS = 30_000;
/**
 * Fallos que se curan solos y cuándo reintentarlos aunque nada cambie. `salto` a 60 s: la cota del
 * servidor crece con el tiempo y no hace falta golpearlo más seguido. Los demás (baneado, secreto,
 * save, apodo) esperan a que cambie lo ganado o las recetas.
 */
const REINTENTO: Partial<Record<ErrorEnvio, number>> = { limite: REINTENTO_MS, red: REINTENTO_MS, salto: ENVIO_MS };

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

/** Lo que contesta el servidor a un envío aceptado. */
export interface RespuestaEnvio {
  pos: number;
  total: number;
  /** Apodo vigente en el servidor (fijo desde el alta); null si no vino. */
  apodo: string | null;
}

/** Tu puesto conocido: del servidor en esta sesión, de tu fila del Top, o del caché local (`guardado`). */
export interface Puesto {
  pos: number;
  total: number;
  /** Cuándo se supo (ms). */
  en: number;
  /** true si viene de una sesión anterior: se muestra como "hace N min" hasta que llegue uno nuevo. */
  guardado: boolean;
}

/** Clave de localStorage del último puesto conocido (aparte del save: no viaja al servidor ni a los respaldos). */
export const CLAVE_PUESTO = 'antojitos.puesto';

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

export function parsearEnvio(json: unknown): RespuestaEnvio | null {
  if (!esObj(json) || !esEntero(json.pos) || json.pos < 1 || !esEntero(json.total)) return null;
  return { pos: json.pos, total: json.total, apodo: typeof json.apodo === 'string' ? json.apodo : null };
}

export interface UltimoEnvio {
  en: number;
  ganado: number;
  recetas: number;
  /** Respuesta del servidor; null mientras el envío está en vuelo. */
  resultado: 'ok' | ErrorEnvio | null;
}

export const marcaEnvio = (state: State, en: number): UltimoEnvio => ({
  en,
  ganado: state.lifetimeEarned,
  recetas: state.recipes,
  resultado: null,
});

/** ¿Cambió algo de lo que muestra el ranking (lo ganado o las recetas) desde el último envío? */
export function cambioDesde(ultimo: UltimoEnvio, state: State): boolean {
  return state.lifetimeEarned !== ultimo.ganado || state.recipes !== ultimo.recetas;
}

/** ¿Hay un envío sin respuesta? Pasados REINTENTO_MS se da por perdido (un fetch colgado no bloquea para siempre). */
export function enVuelo(ultimo: UltimoEnvio | null, now: number): boolean {
  return ultimo !== null && ultimo.resultado === null && now - ultimo.en < REINTENTO_MS;
}

/**
 * Sin envío previo, sí; con uno en vuelo, no (el segundo chocaría con el 429 del servidor). Si el
 * último falló por algo pasajero, se reintenta aunque nada cambie (si no, un jugador quieto nunca
 * recibe su puesto). Si no, al minuto y solo si cambió lo ganado o las recetas.
 */
export function debeEnviar(ultimo: UltimoEnvio | null, state: State, now: number): boolean {
  if (!ultimo) return true;
  if (ultimo.resultado === null) return !enVuelo(ultimo, now);
  const espera = ultimo.resultado === 'ok' ? undefined : REINTENTO[ultimo.resultado];
  if (espera !== undefined) return now - ultimo.en >= espera;
  if (now - ultimo.en < ENVIO_MS) return false;
  return cambioDesde(ultimo, state);
}

/**
 * Tu puesto sacado de tu fila del Top. Los apodos no son únicos, así que una fila cuenta como tuya
 * solo si además su cifra cabe en lo posible: el servidor nunca baja el score (ZADD GT), así que no
 * es menor que lo último que te aceptó (`piso`), ni mayor que lo ganado en este aparato (`techo`).
 * Con dos candidatas o ninguna, null (mejor sin puesto que con el de otro). Devuelve también la
 * cifra de la fila: es el nuevo piso.
 */
export function puestoDesdeTop(
  top: Top,
  apodo: string,
  piso: number,
  techo: number,
  now: number,
): { puesto: Puesto; ganado: number } | null {
  const mias = top.top.filter((f) => f.apodo === apodo && f.money >= piso && f.money <= techo);
  if (mias.length !== 1) return null;
  const f = mias[0]!;
  return { puesto: { pos: f.pos, total: top.total, en: now, guardado: false }, ganado: f.money };
}

export function serializarPuesto(id: string, puesto: Puesto, ganado: number): string {
  return JSON.stringify({ id, pos: puesto.pos, total: puesto.total, en: puesto.en, ganado });
}

/** Lee el caché del puesto; null si no es de esta identidad o no cuadra (nunca lanza). */
export function leerPuestoGuardado(texto: string | null, id: string): { puesto: Puesto; ganado: number } | null {
  if (!texto) return null;
  let o: unknown;
  try {
    o = JSON.parse(texto);
  } catch {
    return null;
  }
  if (!esObj(o) || o.id !== id || !esEntero(o.pos) || o.pos < 1 || !esEntero(o.total) || o.total < o.pos) return null;
  if (!esMonto(o.en) || !esMonto(o.ganado) || o.ganado < 0) return null;
  return { puesto: { pos: o.pos, total: o.total, en: o.en, guardado: true }, ganado: o.ganado };
}

/** "hace 5 min", "hace 3 h", "hace 2 días": cuánto tiene el puesto guardado. */
export function haceTexto(ms: number): string {
  const min = Math.max(Math.floor(ms / 60_000), 1);
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} días`;
}
