import { describe, expect, it } from 'vitest';
import { RACHA_MIN_POR_DIA, RACHA_SEMANA } from '../data';
import { buyRecetario, hireManager, newState, prestige, tasaMaxima, tick, type State } from '../game';
import { manejar, type Peticion, type RedisMin, type Respuesta } from './ranking';

const T0 = 1_700_000_000_000;
const ID = '6f1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const ID2 = '11111111-2222-4333-8444-555555555555';
const SECRETO = '0123456789abcdef0123456789abcdef';

/** Redis en memoria con lo justo que usa el servidor; `tick` vence las claves con TTL. */
class RedisFalso implements RedisMin {
  zsets = new Map<string, Map<string, number>>();
  hashes = new Map<string, Map<string, string>>();
  strings = new Map<string, { valor: string; vence: number | null }>();
  comandos = 0;
  ahora = T0;

  tick(ms: number): void {
    this.ahora += ms;
    for (const [k, v] of this.strings) if (v.vence !== null && v.vence <= this.ahora) this.strings.delete(k);
  }
  private z(key: string): Map<string, number> {
    let m = this.zsets.get(key);
    if (!m) this.zsets.set(key, (m = new Map<string, number>()));
    return m;
  }
  private h(key: string): Map<string, string> {
    let m = this.hashes.get(key);
    if (!m) this.hashes.set(key, (m = new Map<string, string>()));
    return m;
  }
  private orden(key: string): [string, number][] {
    return [...this.z(key)].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }
  zadd(key: string, sm: { score: number; member: string }): Promise<unknown> {
    this.comandos++;
    this.z(key).set(sm.member, sm.score);
    return Promise.resolve(1);
  }
  zrange(key: string, start: number, stop: number): Promise<unknown[]> {
    this.comandos++;
    return Promise.resolve(
      this.orden(key)
        .slice(start, stop + 1)
        .flat(),
    );
  }
  zrevrank(key: string, member: string): Promise<number | null> {
    this.comandos++;
    const i = this.orden(key).findIndex(([m]) => m === member);
    return Promise.resolve(i < 0 ? null : i);
  }
  zcard(key: string): Promise<number> {
    this.comandos++;
    return Promise.resolve(this.z(key).size);
  }
  zrem(key: string, member: string): Promise<number> {
    this.comandos++;
    return Promise.resolve(this.z(key).delete(member) ? 1 : 0);
  }
  // Formas crudas de Upstash sin deserialización: lista plana y [] si falta; valores en orden y null si falta.
  hgetall(key: string): Promise<unknown[]> {
    this.comandos++;
    return Promise.resolve([...(this.hashes.get(key) ?? [])].flat());
  }
  hmget(key: string, ...fields: string[]): Promise<unknown[]> {
    this.comandos++;
    const m = this.h(key);
    return Promise.resolve(fields.map((f) => m.get(f) ?? null));
  }
  hset(key: string, kv: Record<string, string | number>): Promise<number> {
    this.comandos++;
    for (const [f, v] of Object.entries(kv)) this.h(key).set(f, String(v));
    return Promise.resolve(Object.keys(kv).length);
  }
  hdel(key: string, field: string): Promise<number> {
    this.comandos++;
    return Promise.resolve(this.h(key).delete(field) ? 1 : 0);
  }
  del(key: string): Promise<number> {
    this.comandos++;
    return Promise.resolve(this.hashes.delete(key) || this.strings.delete(key) ? 1 : 0);
  }
  set(key: string, value: string, opts: { nx: true; ex: number }): Promise<unknown> {
    this.comandos++;
    if (this.strings.has(key)) return Promise.resolve(null);
    this.strings.set(key, { valor: value, vence: this.ahora + opts.ex * 1000 });
    return Promise.resolve('OK');
  }
  incr(key: string): Promise<number> {
    this.comandos++;
    const s = this.strings.get(key);
    const n = (s ? Number(s.valor) : 0) + 1;
    this.strings.set(key, { valor: String(n), vence: s?.vence ?? null });
    return Promise.resolve(n);
  }
  expire(key: string, seconds: number): Promise<number> {
    this.comandos++;
    const s = this.strings.get(key);
    if (!s) return Promise.resolve(0);
    s.vence = this.ahora + seconds * 1000;
    return Promise.resolve(1);
  }
}

function jugador(money: number, extra: Partial<State> = {}, id = ID, apodo = 'Beto'): State {
  return { ...newState(T0), money, lifetimeEarned: money, ranking: { id, secreto: SECRETO, apodo }, ...extra };
}

function post(state: State | string, ip = '1.2.3.4'): Peticion {
  const save = typeof state === 'string' ? state : JSON.stringify(state);
  return { metodo: 'POST', url: '/api/ranking', body: JSON.stringify({ save }), ip, autorizacion: null };
}

const get = (): Peticion => ({ metodo: 'GET', url: '/api/ranking', body: null, ip: '9.9.9.9', autorizacion: null });

const sinAdmin = { adminToken: null };

async function envia(redis: RedisFalso, state: State, ip?: string): Promise<Respuesta> {
  return manejar(post(state, ip), redis, sinAdmin, redis.ahora);
}

describe('GET /api/ranking', () => {
  it('vacío: lista vacía, total 0, cacheable 30 s', async () => {
    const r = await manejar(get(), new RedisFalso(), sinAdmin, T0);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ top: [], total: 0 });
    expect(r.headers['Cache-Control']).toBe('public, s-maxage=30, stale-while-revalidate=60');
  });

  it('top ordenado por dinero con posición y apodo; pocos comandos', async () => {
    const redis = new RedisFalso();
    await envia(redis, jugador(100));
    redis.tick(31_000);
    await envia(redis, jugador(5_000, {}, ID2, 'Lupita'), '5.5.5.5');
    redis.comandos = 0;
    const r = await manejar(get(), redis, sinAdmin, redis.ahora);
    expect(r.body).toEqual({
      top: [
        { pos: 1, apodo: 'Lupita', money: 5_000 },
        { pos: 2, apodo: 'Beto', money: 100 },
      ],
      total: 2,
    });
    expect(redis.comandos).toBeLessThanOrEqual(3);
  });
});

describe('POST /api/ranking', () => {
  it('alta: guarda dinero y apodo, devuelve puesto y total, no guarda el secreto en claro', async () => {
    const redis = new RedisFalso();
    const r = await envia(redis, jugador(100));
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ pos: 1, total: 1 });
    expect(r.headers['Cache-Control']).toBe('no-store');
    expect(JSON.stringify([...redis.hashes])).not.toContain(SECRETO);
    // INCR, EXPIRE (solo el primero del minuto por IP), SET NX, HGETALL, ZADD, HSET ×2, ZREVRANK, ZCARD.
    expect(redis.comandos).toBe(9);
  });

  it('actualiza: el dinero nuevo sustituye al viejo y el puesto cambia', async () => {
    const redis = new RedisFalso();
    await envia(redis, jugador(100));
    redis.tick(31_000);
    await envia(redis, jugador(5_000, {}, ID2, 'Lupita'), '5.5.5.5');
    redis.tick(31_000);
    // Un elote con empleado vende poco: 60 s × tasa × 2 no llega a 5,000. Baja de dinero siempre pasa.
    const r = await envia(redis, jugador(50));
    expect(r.body).toEqual({ pos: 2, total: 2 });
  });

  it('secreto distinto al del alta: 403 y no toca el ranking', async () => {
    const redis = new RedisFalso();
    await envia(redis, jugador(100));
    redis.tick(31_000);
    const s = jugador(120);
    s.ranking = { ...s.ranking!, secreto: 'f'.repeat(32) };
    const r = await envia(redis, s);
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ error: 'secreto' });
    expect(redis.zsets.get('ranking')?.get(ID)).toBe(100);
  });

  it('salto imposible para el tiempo transcurrido: 400 salto, sin actualizar', async () => {
    const redis = new RedisFalso();
    const base = hireManager({ ...jugador(1_000), money: 1_000 }, 'elotes');
    await envia(redis, base);
    redis.tick(60_000);
    const tramposo = { ...base, money: 1e9, lifetimeEarned: 1e9 };
    const r = await envia(redis, tramposo);
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'salto' });
    expect(redis.zsets.get('ranking')?.get(ID)).toBe(base.money);
  });

  it('lo que de verdad vende un minuto entra; el regalo de racha del día 6 también', async () => {
    const redis = new RedisFalso();
    const base = hireManager({ ...jugador(1_000), money: 1_000 }, 'elotes');
    await envia(redis, base);
    redis.tick(60_000);
    const jugado = tick(base, 60_000);
    expect(jugado.money).toBeGreaterThan(base.money);
    expect((await envia(redis, jugado)).status).toBe(200);
    redis.tick(60_000);
    const regalo = tasaMaxima(jugado) * 60 * RACHA_MIN_POR_DIA * (RACHA_SEMANA - 1);
    const conRegalo = { ...jugado, money: jugado.money + regalo, lifetimeEarned: jugado.lifetimeEarned + regalo };
    expect((await envia(redis, conRegalo)).status).toBe(200);
  });

  it('el Guardadito tras heredar sube el dinero sin tocar lo ganado y se acepta', async () => {
    const redis = new RedisFalso();
    const rico = { ...jugador(1e13), recipes: 10 };
    await envia(redis, rico);
    redis.tick(31_000);
    const heredado = prestige(buyRecetario(buyRecetario(rico, 'guardadito'), 'guardadito'), redis.ahora);
    expect(heredado.money).toBe(10_000);
    expect(heredado.ranking?.id).toBe(ID);
    const r = await envia(redis, heredado);
    expect(r.status).toBe(200);
    expect(redis.zsets.get('ranking')?.get(ID)).toBe(10_000);
  });

  it('dinero por encima de lo ganado más el Guardadito: 400 salto, también en el alta', async () => {
    const r = await envia(new RedisFalso(), { ...jugador(100), lifetimeEarned: 10 });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'salto' });
  });

  it('save inválido, sin ranking o con apodo malo: 400', async () => {
    const redis = new RedisFalso();
    expect((await manejar(post('{"a":'), redis, sinAdmin, T0)).body).toEqual({ error: 'save' });
    expect((await manejar(post(JSON.stringify({ version: 7 })), redis, sinAdmin, T0)).body).toEqual({ error: 'save' });
    expect((await envia(redis, newState(T0))).body).toEqual({ error: 'save' });
    const malo = await envia(redis, jugador(1, {}, ID, 'x'));
    expect(malo.status).toBe(400);
    expect(malo.body).toEqual({ error: 'apodo' });
    const sinCuerpo: Peticion = { ...post(jugador(1)), body: 'no es json' };
    expect((await manejar(sinCuerpo, redis, sinAdmin, T0)).status).toBe(400);
  });

  it('el apodo se guarda limpio (espacios juntos) y uno que parece número vuelve como texto', async () => {
    const redis = new RedisFalso();
    await envia(redis, jugador(1, {}, ID, '  Don   Beto '));
    expect(redis.hashes.get('apodos')?.get(ID)).toBe('Don Beto');
    redis.tick(31_000);
    await envia(redis, jugador(2, {}, ID2, '1e5'), '5.5.5.5');
    const r = await manejar(get(), redis, sinAdmin, redis.ahora);
    expect((r.body as { top: { apodo: unknown }[] }).top[0]?.apodo).toBe('1e5');
  });

  it('body gigante: 413', async () => {
    const p = post(jugador(1));
    p.body = JSON.stringify({ save: 'x'.repeat(20_000) });
    expect((await manejar(p, new RedisFalso(), sinAdmin, T0)).status).toBe(413);
  });

  it('un envío cada 30 s por jugador: el segundo da 429 y pasa al vencer', async () => {
    const redis = new RedisFalso();
    await envia(redis, jugador(100));
    const r = await envia(redis, jugador(100));
    expect(r.status).toBe(429);
    expect(r.body).toEqual({ error: 'limite' });
    redis.tick(30_000);
    expect((await envia(redis, jugador(100))).status).toBe(200);
  });

  it('30 envíos por minuto por IP; el 31 da 429 aunque sean jugadores distintos', async () => {
    const redis = new RedisFalso();
    for (let i = 0; i < 30; i++) {
      const id = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
      expect((await envia(redis, jugador(1, {}, id, `J ${i}`), '7.7.7.7')).status).toBe(200);
    }
    expect((await envia(redis, jugador(1, {}, ID2, 'Otro'), '7.7.7.7')).status).toBe(429);
    expect((await envia(redis, jugador(1, {}, ID2, 'Otro'), '8.8.8.8')).status).toBe(200);
  });
});

describe('DELETE /api/ranking', () => {
  const del = (id: string, auth: string | null): Peticion => ({
    metodo: 'DELETE',
    url: `/api/ranking?id=${id}`,
    body: null,
    ip: '1.1.1.1',
    autorizacion: auth,
  });

  it('sin ADMIN_TOKEN configurado: 404', async () => {
    expect((await manejar(del(ID, 'Bearer x'), new RedisFalso(), sinAdmin, T0)).status).toBe(404);
  });

  it('con token correcto borra al jugador; con token malo 403; id raro 400', async () => {
    const redis = new RedisFalso();
    await envia(redis, jugador(100));
    const admin = { adminToken: 'secreto-admin' };
    expect((await manejar(del(ID, 'Bearer otro'), redis, admin, T0)).status).toBe(403);
    expect((await manejar(del('nope', 'Bearer secreto-admin'), redis, admin, T0)).status).toBe(400);
    const r = await manejar(del(ID, 'Bearer secreto-admin'), redis, admin, T0);
    expect(r.status).toBe(200);
    expect(redis.zsets.get('ranking')?.has(ID)).toBe(false);
    expect(redis.hashes.get('apodos')?.has(ID)).toBe(false);
    // Queda baneado: el cliente reintenta cada minuto y no debe volver a entrar.
    redis.tick(31_000);
    const otra = await envia(redis, jugador(100));
    expect(otra.status).toBe(403);
    expect(otra.body).toEqual({ error: 'baneado' });
    expect(redis.zsets.get('ranking')?.has(ID)).toBe(false);
  });
});

it('método no permitido: 405', async () => {
  const p: Peticion = { metodo: 'PUT', url: '/api/ranking', body: null, ip: '1.1.1.1', autorizacion: null };
  expect((await manejar(p, new RedisFalso(), sinAdmin, T0)).status).toBe(405);
});
