/**
 * Audio del juego con Web Audio API: efectos y música sintetizados, sin archivos ni red.
 * Si el navegador no tiene AudioContext o lo bloquea, todo queda en silencio sin error.
 * El AudioContext solo se crea dentro de un gesto del usuario (unlock), como exigen iOS y Chrome.
 */
import { createMusic, type Music } from './music';

export type Sound = 'sell' | 'buy' | 'hire' | 'upgrade' | 'prestige';

export interface Prefs {
  sound: boolean;
  music: boolean;
}

const PREFS_KEY = 'antojitos.prefs';
const SFX_GAIN = 0.24;
const MUSIC_GAIN = 0.1; // por debajo de los efectos
/** Evita ráfagas cuando varios ciclos terminan en el mismo frame. */
const MIN_GAP_MS = 60;

interface Note {
  freq: number;
  at: number;
  dur: number;
  type: OscillatorType;
}

const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const C6 = 1046.5;

const SOUNDS: Record<Sound, readonly Note[]> = {
  sell: [
    { freq: 988, at: 0, dur: 0.06, type: 'triangle' },
    { freq: 1319, at: 0.06, dur: 0.1, type: 'triangle' },
  ],
  buy: [{ freq: 520, at: 0, dur: 0.07, type: 'triangle' }],
  hire: [
    { freq: E5, at: 0, dur: 0.12, type: 'sine' },
    { freq: G5, at: 0.08, dur: 0.12, type: 'sine' },
    { freq: C6, at: 0.16, dur: 0.2, type: 'sine' },
  ],
  upgrade: [
    { freq: G5, at: 0, dur: 0.1, type: 'sine' },
    { freq: C6, at: 0.08, dur: 0.22, type: 'sine' },
  ],
  prestige: [
    { freq: C5, at: 0, dur: 0.14, type: 'triangle' },
    { freq: E5, at: 0.14, dur: 0.14, type: 'triangle' },
    { freq: G5, at: 0.28, dur: 0.14, type: 'triangle' },
    { freq: C6, at: 0.42, dur: 0.4, type: 'triangle' },
  ],
};

/** Preferencias del dispositivo; lo que falte o no sea booleano vale false. */
export function loadPrefs(): Prefs {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null');
    const o = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
    return { sound: o.sound === true, music: o.music === true };
  } catch {
    return { sound: false, music: false };
  }
}

export function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    // Preferencia no persistente: no es crítica.
  }
}

export interface Audio {
  prefs(): Prefs;
  setSound(on: boolean): void;
  setMusic(on: boolean): void;
  /** Llamar dentro de un gesto del usuario. Idempotente. */
  unlock(): void;
  /** Pestaña oculta: suspende todo (sin sonido de fondo ni gasto de batería). */
  setVisible(visible: boolean): void;
  play(sound: Sound): void;
}

export function createAudio(initial: Prefs): Audio {
  const prefs: Prefs = { ...initial };
  let ctx: AudioContext | null = null;
  let sfx: GainNode | null = null;
  let music: Music | null = null;
  let visible = true;
  let lastPlay = 0;

  const ensureContext = (): AudioContext | null => {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext as typeof AudioContext | undefined;
      if (!AC) return null;
      const c = new AC();
      sfx = c.createGain();
      sfx.gain.value = SFX_GAIN;
      sfx.connect(c.destination);
      const musicBus = c.createGain();
      musicBus.gain.value = 0.0001;
      musicBus.connect(c.destination);
      music = createMusic(c, musicBus, MUSIC_GAIN);
      ctx = c;
    } catch {
      ctx = null;
    }
    return ctx;
  };

  /** Deja la música como dicen la preferencia y la visibilidad. */
  const syncMusic = () => {
    if (!music) return;
    if (prefs.music && visible) music.start();
    else music.stop();
  };

  const safe = (fn: () => void) => {
    try {
      fn();
    } catch {
      // Un fallo de audio nunca debe afectar al juego.
    }
  };

  return {
    prefs: () => ({ ...prefs }),

    setSound(on) {
      prefs.sound = on;
    },

    setMusic(on) {
      prefs.music = on;
      safe(syncMusic);
    },

    unlock() {
      if (!prefs.sound && !prefs.music) return;
      // Sin activación de usuario vigente el navegador crearía el contexto suspendido
      // (y avisa en consola); se espera al siguiente gesto real. Sin la API, se intenta.
      if (!ctx && navigator.userActivation && !navigator.userActivation.isActive) return;
      safe(() => {
        const c = ensureContext();
        if (!c) return;
        if (c.state === 'suspended' && visible) void c.resume().catch(() => undefined);
        syncMusic();
      });
    },

    setVisible(v) {
      visible = v;
      safe(() => {
        if (!ctx) return;
        syncMusic();
        if (v) void ctx.resume().catch(() => undefined);
        else void ctx.suspend().catch(() => undefined);
      });
    },

    play(sound) {
      if (!prefs.sound) return;
      const now = performance.now();
      if (now - lastPlay < MIN_GAP_MS) return;
      lastPlay = now;
      // Nunca crea el contexto aquí: solo unlock() lo hace, dentro de un gesto.
      const c = ctx;
      const out = sfx;
      if (!c || !out || c.state !== 'running') return;
      safe(() => {
        const t0 = c.currentTime;
        for (const n of SOUNDS[sound]) {
          const osc = c.createOscillator();
          const env = c.createGain();
          osc.type = n.type;
          osc.frequency.value = n.freq;
          // Envolvente corta: ataque rápido y caída exponencial (sin clics).
          env.gain.setValueAtTime(0.0001, t0 + n.at);
          env.gain.exponentialRampToValueAtTime(1, t0 + n.at + 0.01);
          env.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.dur);
          osc.connect(env).connect(out);
          osc.start(t0 + n.at);
          osc.stop(t0 + n.at + n.dur + 0.02);
        }
      });
    },
  };
}
