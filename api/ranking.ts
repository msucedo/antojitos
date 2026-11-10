// Vercel Function (runtime Node, firma Web estándar) del ranking mundial. Solo adapta: la lógica
// está en src/servidor/ranking.ts y la prueba vitest con un Redis en memoria.
import { Redis } from '@upstash/redis';
import { manejar, type Peticion, type RedisMin } from '../src/servidor/ranking';

function redis(): RedisMin {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('Falta KV_REST_API_URL / KV_REST_API_TOKEN');
  // Sin deserialización automática: un apodo "1e5" o un hash de puros dígitos volverían como número.
  // Con ella apagada, HGETALL y HMGET devuelven listas planas (así lo documenta el paquete) aunque sus
  // tipos sigan prometiendo objetos: aquí se declara la forma real, que es la que RedisMin espera.
  const r = new Redis({ url, token, automaticDeserialization: false });
  return {
    zadd: (key, sm) => r.zadd(key, sm),
    zrange: (key, start, stop, opts) => r.zrange(key, start, stop, opts),
    zrevrank: (key, member) => r.zrevrank(key, member),
    zcard: (key) => r.zcard(key),
    zrem: (key, member) => r.zrem(key, member),
    hgetall: (key) => r.hgetall(key) as unknown as Promise<unknown[]>,
    hmget: (key, ...fields) => r.hmget(key, ...fields) as unknown as Promise<unknown[]>,
    hset: (key, kv) => r.hset(key, kv),
    hdel: (key, field) => r.hdel(key, field),
    del: (key) => r.del(key),
    set: (key, value, opts) => r.set(key, value, opts),
    incr: (key) => r.incr(key),
    expire: (key, seconds) => r.expire(key, seconds),
  };
}

async function atender(request: Request): Promise<Response> {
  const p: Peticion = {
    metodo: request.method,
    url: new URL(request.url).pathname + new URL(request.url).search,
    body: request.method === 'POST' ? await request.text() : null,
    ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'desconocida',
    autorizacion: request.headers.get('authorization'),
  };
  const r = await manejar(p, redis(), { adminToken: process.env.ADMIN_TOKEN ?? null }, Date.now());
  return Response.json(r.body, { status: r.status, headers: r.headers });
}

export const GET = atender;
export const POST = atender;
export const DELETE = atender;
