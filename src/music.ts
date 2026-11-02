/**
 * Música de fondo original: 8 compases en 3/4 con aire de son (I–IV–V en Do), en loop.
 * Se sintetiza con Web Audio y se agenda con lookahead ("A Tale of Two Clocks"):
 * un temporizador corto agenda las notas un poco por delante con el reloj del audio,
 * así el ritmo no depende del hilo principal.
 */
export type Voice = 'bass' | 'strum' | 'melody';

export interface NoteEvent {
  /** Paso (corchea) dentro del loop. */
  step: number;
  /** Duración en pasos. */
  len: number;
  /** Notas MIDI (varias = acorde). */
  midi: readonly number[];
  voice: Voice;
}

export const BPM = 100; // negra
export const STEPS_PER_BAR = 6; // 3/4 en corcheas
export const BARS = 8;
export const LOOP_STEPS = STEPS_PER_BAR * BARS;
export const STEP_SEC = 60 / BPM / 2;

const CHORDS = {
  C: [60, 64, 67],
  F: [60, 65, 69],
  G: [59, 62, 67],
  G7: [59, 62, 65, 67],
} as const;
type Chord = keyof typeof CHORDS;
const BASS: Record<Chord, readonly [number, number]> = {
  C: [48, 55],
  F: [53, 48],
  G: [55, 50],
  G7: [55, 50],
};

const PROGRESSION: readonly Chord[] = ['C', 'F', 'G', 'C', 'C', 'F', 'G7', 'C'];

/** Melodía por compás: [midi | null (silencio), duración en pasos]; cada compás suma 6. */
const MELODY: readonly (readonly [number | null, number][])[] = [
  [
    [76, 2],
    [79, 1],
    [76, 1],
    [72, 2],
  ],
  [
    [77, 2],
    [81, 1],
    [77, 1],
    [72, 2],
  ],
  [
    [74, 2],
    [79, 1],
    [77, 1],
    [74, 2],
  ],
  [
    [76, 3],
    [null, 1],
    [67, 2],
  ],
  [
    [79, 2],
    [76, 1],
    [79, 1],
    [84, 2],
  ],
  [
    [81, 2],
    [77, 1],
    [81, 1],
    [84, 2],
  ],
  [
    [83, 1],
    [81, 1],
    [79, 1],
    [77, 1],
    [74, 2],
  ],
  [
    [72, 4],
    [null, 2],
  ],
];

/** Rasgueo con acento de son: pasos 0, 2, 3 y 4 del compás. */
const STRUM_STEPS = [0, 2, 3, 4] as const;

function buildSequence(): NoteEvent[] {
  const events: NoteEvent[] = [];
  PROGRESSION.forEach((chord, bar) => {
    const base = bar * STEPS_PER_BAR;
    const [root, fifth] = BASS[chord];
    events.push({ step: base, len: 3, midi: [root], voice: 'bass' });
    events.push({ step: base + 3, len: 3, midi: [fifth], voice: 'bass' });
    for (const s of STRUM_STEPS) events.push({ step: base + s, len: 1, midi: CHORDS[chord], voice: 'strum' });
    let at = base;
    for (const [midi, len] of MELODY[bar] ?? []) {
      if (midi !== null) events.push({ step: at, len, midi: [midi], voice: 'melody' });
      at += len;
    }
  });
  return events;
}

export const SEQUENCE: readonly NoteEvent[] = buildSequence();

const BY_STEP: readonly NoteEvent[][] = (() => {
  const out: NoteEvent[][] = Array.from({ length: LOOP_STEPS }, () => []);
  for (const e of SEQUENCE) out[e.step]?.push(e);
  return out;
})();

const midiToFreq = (m: number) => 440 * 2 ** ((m - 69) / 12);

const LOOKAHEAD_SEC = 0.15;
const TICK_MS = 25;
const FADE_SEC = 1;

function playEvent(ctx: AudioContext, out: AudioNode, e: NoteEvent, t: number): void {
  const dur = e.len * STEP_SEC;
  e.midi.forEach((m, i) => {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    let start = t;
    let peak: number;
    let end = t + dur * 0.9;
    if (e.voice === 'bass') {
      osc.type = 'triangle';
      peak = 0.55;
    } else if (e.voice === 'strum') {
      // Rasgueo: cuerdas escalonadas 12 ms, ataque y caída cortos.
      osc.type = 'triangle';
      start = t + i * 0.012;
      peak = 0.12;
      end = start + 0.16;
    } else {
      osc.type = 'sine';
      peak = 0.35;
      // Vibrato leve.
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = 5.5;
      depth.gain.value = 6; // cents
      lfo.connect(depth).connect(osc.detune);
      lfo.start(start);
      lfo.stop(end + 0.05);
    }
    osc.frequency.value = midiToFreq(m);
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(peak, start + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(env).connect(out);
    osc.start(start);
    osc.stop(end + 0.05);
  });
}

export interface Music {
  start(): void;
  stop(): void;
  playing(): boolean;
}

/** `bus` es la ganancia de música; aquí solo se hace el fade sobre ella. */
export function createMusic(ctx: AudioContext, bus: GainNode, volume: number): Music {
  let timer: ReturnType<typeof setInterval> | null = null;
  let step = 0;
  let nextTime = 0;

  const schedule = () => {
    // Si el contexto está suspendido, el reloj no avanza: no hay nada que agendar.
    while (nextTime < ctx.currentTime + LOOKAHEAD_SEC) {
      for (const e of BY_STEP[step] ?? []) playEvent(ctx, bus, e, nextTime);
      nextTime += STEP_SEC;
      step = (step + 1) % LOOP_STEPS;
    }
  };

  return {
    playing: () => timer !== null,
    start() {
      if (timer !== null) return;
      const now = ctx.currentTime;
      bus.gain.cancelScheduledValues(now);
      bus.gain.setValueAtTime(0.0001, now);
      bus.gain.exponentialRampToValueAtTime(volume, now + FADE_SEC);
      step = 0;
      nextTime = now + 0.05;
      schedule();
      timer = setInterval(schedule, TICK_MS);
    },
    stop() {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
      const now = ctx.currentTime;
      bus.gain.cancelScheduledValues(now);
      bus.gain.setValueAtTime(Math.max(bus.gain.value, 0.0001), now);
      bus.gain.exponentialRampToValueAtTime(0.0001, now + FADE_SEC / 2);
    },
  };
}
