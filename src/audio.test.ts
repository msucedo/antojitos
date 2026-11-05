import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAudio, SOUNDS } from './audio';

describe('efectos de sonido', () => {
  it('cada efecto tiene notas cortas con frecuencias válidas para la rampa exponencial', () => {
    for (const [kind, notes] of Object.entries(SOUNDS)) {
      expect(notes.length, kind).toBeGreaterThan(0);
      for (const n of notes) {
        expect(n.freq, kind).toBeGreaterThan(0);
        expect(n.dur, kind).toBeGreaterThan(0);
        expect(n.at + n.dur, kind).toBeLessThanOrEqual(1);
        if (n.to !== undefined) expect(n.to, kind).toBeGreaterThan(0);
        if (n.level !== undefined) {
          expect(n.level, kind).toBeGreaterThan(0);
          expect(n.level, kind).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('el deslizar sube al abrir y baja al cerrar', () => {
    const [open] = SOUNDS.slideOpen;
    expect(open?.to).toBeGreaterThan(open?.freq ?? 0);
    const close = SOUNDS.slideClose;
    expect(close.at(-1)?.freq).toBeLessThan(close[0]?.freq ?? 0);
  });
});

/** AudioContext falso: registra osciladores y automatizaciones; vitest corre en node. */
type Call = { param: string; method: string; args: number[] };
function fakeContext(calls: Call[], oscillators: { freq: number }[], created: { ctx: { state: string } | null }) {
  const param = (name: string) => {
    const p = { value: 0 } as Record<string, unknown>;
    for (const m of ['setValueAtTime', 'exponentialRampToValueAtTime', 'linearRampToValueAtTime']) {
      p[m] = (...args: number[]) => calls.push({ param: name, method: m, args });
    }
    return p;
  };
  const node = (extra: Record<string, unknown>) => ({ connect: (t: unknown) => t, ...extra });
  return class {
    state = 'running';
    currentTime = 10;
    destination = {};
    constructor() {
      created.ctx = this;
    }
    createGain() {
      return node({ gain: param('gain') });
    }
    createOscillator() {
      const osc = node({ type: 'sine', frequency: param('frequency'), start: () => undefined, stop: () => undefined });
      oscillators.push({ freq: 0 });
      return osc;
    }
    resume() {
      this.state = 'running';
      return Promise.resolve();
    }
  };
}

describe('play()', () => {
  const calls: Call[] = [];
  const oscillators: { freq: number }[] = [];
  const created: { ctx: { state: string } | null } = { ctx: null };
  let now = 1_000;
  beforeEach(() => {
    calls.length = 0;
    oscillators.length = 0;
    created.ctx = null;
    vi.stubGlobal('window', { AudioContext: fakeContext(calls, oscillators, created) });
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function audioOn() {
    const audio = createAudio({ sound: true, music: false });
    audio.unlock();
    return audio;
  }

  it('el hueco anti-ráfaga de 60 ms es por tipo: dos iguales se funden, dos distintos suenan', () => {
    const audio = audioOn();
    audio.play('sell');
    audio.play('sell');
    expect(oscillators.length).toBe(SOUNDS.sell.length);
    audio.play('buy');
    expect(oscillators.length).toBe(SOUNDS.sell.length + SOUNDS.buy.length);
    now += 60;
    audio.play('sell');
    expect(oscillators.length).toBe(2 * SOUNDS.sell.length + SOUNDS.buy.length);
  });

  it('el deslizar programa el barrido de frecuencia y una caída lineal', () => {
    const audio = audioOn();
    audio.play('slideOpen');
    const [n] = SOUNDS.slideOpen;
    const freq = calls.filter((c) => c.param === 'frequency');
    expect(freq).toEqual([
      { param: 'frequency', method: 'setValueAtTime', args: [n?.freq, 10] },
      { param: 'frequency', method: 'exponentialRampToValueAtTime', args: [n?.to, 10 + (n?.dur ?? 0)] },
    ]);
    const gain = calls.filter((c) => c.param === 'gain' && c.method !== 'setValueAtTime');
    expect(gain.map((c) => c.method)).toEqual(['exponentialRampToValueAtTime', 'linearRampToValueAtTime']);
    expect(gain[0]?.args[0]).toBe(n?.level);
  });

  it('con el contexto suspendido y la pestaña visible, reanuda y toca al resolver', async () => {
    const audio = audioOn();
    const c = created.ctx;
    if (!c) throw new Error('sin contexto');
    c.state = 'suspended';
    audio.play('welcome');
    expect(oscillators.length).toBe(0);
    await Promise.resolve();
    expect(oscillators.length).toBe(SOUNDS.welcome.length);
    expect(c.state).toBe('running');
  });

  it('sin barrido la caída sigue siendo exponencial', () => {
    audioOn().play('buy');
    const gain = calls.filter((c) => c.param === 'gain' && c.method !== 'setValueAtTime');
    expect(gain.map((c) => c.method)).toEqual(['exponentialRampToValueAtTime', 'exponentialRampToValueAtTime']);
    expect(calls.some((c) => c.param === 'frequency' && c.method === 'exponentialRampToValueAtTime')).toBe(false);
  });
});
