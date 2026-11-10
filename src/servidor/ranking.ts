/**
 * Lógica del ranking mundial, sin HTTP ni Redis reales: `api/ranking.ts` la adapta a Vercel y a
 * Upstash. Vive bajo `src/` para que tsc, eslint y vitest la cubran como al resto del juego.
 *
 * Datos en Redis:
 *   ranking        ZSET  id del jugador → money (efectivo actual)
 *   apodos         HASH  id → apodo (un HMGET da los cien del top)
 *   jugador:<id>   HASH  secretoHash, money, actualizado (ms); `baneado` tras un DELETE de moderación
 *   rl:id:<id>     STR   un envío cada 30 s por jugador (SET NX EX)
 *   rl:ip:<ip>     STR   30 envíos por minuto por IP (INCR + EXPIRE)
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { normalizarApodo } from '../apodo';
import { RACHA_MIN_POR_DIA, RACHA_SEMANA } from '../data';
import { arranqueDinero, tasaMaxima, type State } from '../game';
import { MAX_IMPORT_CHARS, validate } from '../save';

export interface RedisMin {
  zadd(key: string, sm: { score: number; member: string }): Promise<unknown>;
  /** Con `rev` y `withScores`: lista plana [member, score, member, score…]. */
  zrange(key: string, start: number, stop: number, opts: { rev: true; withScores: true }): Promise<unknown[]>;
  zrevrank(key: string, member: string): Promise<number | null>;
  zcard(key: string): Promise<number>;
  zrem(key: string, member: string): Promise<number>;
  /**
   * Forma cruda de Upstash con `automaticDeserialization: false`: lista plana [campo, valor, …] y
   * `[]` si la clave no existe (con deserialización sería un objeto; el adaptador la apaga a propósito).
   */
  hgetall(key: string): Promise<unknown[]>;
  /** Forma cruda: un valor por campo, en orden, `null` donde falta. */
  hmget(key: string, ...fields: string[]): Promise<unknown[]>;
  hset(key: string, kv: Record<string, string | number>): Promise<number>;
  hdel(key: string, field: string): Promise<number>;
  del(key: string): Promise<number>;
  set(key: string, value: string, opts: { nx: true; ex: number }): Promise<unknown>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
}

export interface Peticion {
  metodo: string;
  /** Ruta con query, p. ej. `/api/ranking?id=…`. */
  url: string;
  body: string | null;
  ip: string;
  /** Header Authorization tal cual, o null. */
  autorizacion: string | null;
}

export interface Respuesta {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

export interface Entorno {
  adminToken: string | null;
}

export type ErrorRanking = 'save' | 'apodo' | 'secreto' | 'salto' | 'limite' | 'baneado';

export interface Fila {
  pos: number;
  apodo: string;
  money: number;
}

export const TOP_N = 100;
/** Un envío por jugador cada tanto; el cliente envía cada 60 s. */
export const ENVIO_CADA_S = 30;
export const IP_POR_MINUTO = 30;
/** El body trae el save (≤ MAX_IMPORT_CHARS) envuelto en JSON; algo de aire para las comillas escapadas. */
export const MAX_BODY_CHARS = MAX_IMPORT_CHARS + 2_048;
/**
 * Holgura de la cota de dinero: el regalo de racha más grande (día 6) vale RACHA_MIN_POR_DIA × 6
 * minutos de ventas, y entra de golpe sin que pase tiempo.
 */
export const HOLGURA_RACHA_S = RACHA_MIN_POR_DIA * 60 * (RACHA_SEMANA - 1);

const K_RANKING = 'ranking';
const K_APODOS = 'apodos';
const kJugador = (id: string) => `jugador:${id}`;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SIN_CACHE = { 'Cache-Control': 'no-store' };
const CACHE_TOP = { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' };

const responder = (status: number, body: unknown, headers: Record<string, string> = SIN_CACHE): Respuesta => ({
  status,
  body,
  headers,
});
const fallo = (status: number, error: ErrorRanking): Respuesta => responder(status, { error });

/** Lo que devuelve Redis es texto o número; cualquier otra cosa vale ''. */
const texto = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

function sha256(texto: string): string {
  return createHash('sha256').update(texto, 'utf8').digest('hex');
}

const HEX64_RE = /^[0-9a-f]{64}$/i;

/** Compara dos hex de sha256 en tiempo constante; lo que no sea hex de 64 es "no" (nunca lanza). */
function mismoHash(a: string, b: string): boolean {
  if (!HEX64_RE.test(a) || !HEX64_RE.test(b)) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

/** Lista plana de HGETALL → objeto; null si la clave no existe. */
function aHash(plano: unknown[]): Record<string, string> | null {
  if (plano.length === 0) return null;
  const out: Record<string, string> = {};
  for (let i = 0; i + 1 < plano.length; i += 2) out[texto(plano[i])] = texto(plano[i + 1]);
  return out;
}

/**
 * ¿Puede un jugador honesto tener este dinero? Siempre: todo el dinero nace en ventas y regalos,
 * que suman también a `lifetimeEarned`; solo el Guardadito sube `money` aparte. Con registro previo:
 * desde el último envío pudo vender a lo más `tasaMaxima` por segundo (×2 de margen por relojes y
 * compras que suben la tasa), más el regalo de racha, más el Guardadito.
 */
export function plausible(state: State, previo: { money: number; actualizado: number } | null, now: number): boolean {
  const guardadito = arranqueDinero(state);
  if (state.money > state.lifetimeEarned + guardadito + 1) return false;
  if (!previo) return true;
  const dt = Math.max(now - previo.actualizado, 0) / 1000;
  return state.money <= previo.money + tasaMaxima(state) * (2 * dt + HOLGURA_RACHA_S) + guardadito + 1;
}

function parsearSave(body: string | null): State | null {
  if (body === null) return null;
  try {
    const o: unknown = JSON.parse(body);
    if (typeof o !== 'object' || o === null || !('save' in o) || typeof o.save !== 'string') return null;
    if (o.save.length > MAX_IMPORT_CHARS) return null;
    return validate(JSON.parse(o.save));
  } catch {
    return null;
  }
}

async function top(redis: RedisMin): Promise<Respuesta> {
  const plano = await redis.zrange(K_RANKING, 0, TOP_N - 1, { rev: true, withScores: true });
  const ids: string[] = [];
  const money: number[] = [];
  for (let i = 0; i + 1 < plano.length; i += 2) {
    ids.push(texto(plano[i]));
    money.push(Number(plano[i + 1]));
  }
  const apodos = ids.length > 0 ? await redis.hmget(K_APODOS, ...ids) : [];
  const total = await redis.zcard(K_RANKING);
  const filas: Fila[] = ids.map((_, i) => ({
    pos: i + 1,
    apodo: texto(apodos[i]) || '¿?',
    money: Number.isFinite(money[i]) ? money[i]! : 0,
  }));
  return responder(200, { top: filas, total }, CACHE_TOP);
}

async function enviar(p: Peticion, redis: RedisMin, now: number): Promise<Respuesta> {
  if ((p.body?.length ?? 0) > MAX_BODY_CHARS) return fallo(413, 'save');
  const state = parsearSave(p.body);
  if (!state?.ranking) return fallo(400, 'save');
  const { id, secreto } = state.ranking;
  const apodo = normalizarApodo(state.ranking.apodo);
  if (!apodo) return fallo(400, 'apodo');

  // Primero la IP: si el rechazo fuera por IP, un SET NX previo gastaría el turno del jugador.
  const porIp = await redis.incr(`rl:ip:${p.ip}`);
  if (porIp === 1) await redis.expire(`rl:ip:${p.ip}`, 60);
  if (porIp > IP_POR_MINUTO) return fallo(429, 'limite');
  if ((await redis.set(`rl:id:${id}`, '1', { nx: true, ex: ENVIO_CADA_S })) === null) return fallo(429, 'limite');

  const hash = sha256(secreto);
  const previo = aHash(await redis.hgetall(kJugador(id)));
  let anterior: { money: number; actualizado: number } | null = null;
  if (previo) {
    if (previo.baneado) return fallo(403, 'baneado');
    if (!mismoHash(previo.secretoHash ?? '', hash)) return fallo(403, 'secreto');
    anterior = { money: Number(previo.money) || 0, actualizado: Number(previo.actualizado) || 0 };
  }
  if (!plausible(state, anterior, now)) return fallo(400, 'salto');

  await redis.zadd(K_RANKING, { score: state.money, member: id });
  await redis.hset(K_APODOS, { [id]: apodo });
  await redis.hset(kJugador(id), { secretoHash: hash, money: state.money, actualizado: now });
  const rank = await redis.zrevrank(K_RANKING, id);
  const total = await redis.zcard(K_RANKING);
  return responder(200, { pos: (rank ?? 0) + 1, total });
}

async function borrar(p: Peticion, redis: RedisMin, entorno: Entorno): Promise<Respuesta> {
  if (!entorno.adminToken) return responder(404, { error: 'no' });
  const token = p.autorizacion?.replace(/^Bearer\s+/i, '') ?? '';
  if (!mismoHash(sha256(token), sha256(entorno.adminToken))) return responder(403, { error: 'token' });
  const id = new URL(p.url, 'http://x').searchParams.get('id') ?? '';
  if (!UUID_RE.test(id)) return responder(400, { error: 'id' });
  await redis.zrem(K_RANKING, id);
  await redis.hdel(K_APODOS, id);
  await redis.del(kJugador(id));
  // Sin esto el cliente lo daría de alta otra vez en el siguiente envío, con el mismo apodo.
  await redis.hset(kJugador(id), { baneado: 1 });
  return responder(200, { ok: true });
}

export async function manejar(p: Peticion, redis: RedisMin, entorno: Entorno, now: number): Promise<Respuesta> {
  switch (p.metodo) {
    case 'GET':
      return top(redis);
    case 'POST':
      return enviar(p, redis, now);
    case 'DELETE':
      return borrar(p, redis, entorno);
    default:
      return responder(405, { error: 'metodo' });
  }
}
