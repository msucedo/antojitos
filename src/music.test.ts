import { describe, expect, it } from 'vitest';
import { LOOP_STEPS, SEQUENCE, STEP_SEC, STEPS_PER_BAR, BARS } from './music';

describe('música', () => {
  it('el loop dura 8 compases de 3/4 (~14 s a 100 bpm)', () => {
    expect(LOOP_STEPS).toBe(STEPS_PER_BAR * BARS);
    expect(LOOP_STEPS * STEP_SEC).toBeCloseTo(14.4, 5);
  });

  it('todas las notas caen dentro del loop', () => {
    for (const e of SEQUENCE) {
      expect(e.step).toBeGreaterThanOrEqual(0);
      expect(e.step + e.len).toBeLessThanOrEqual(LOOP_STEPS);
      expect(e.midi.length).toBeGreaterThan(0);
    }
  });

  it('la melodía no se encima consigo misma y cada compás cabe', () => {
    const melody = SEQUENCE.filter((e) => e.voice === 'melody').sort((a, b) => a.step - b.step);
    for (let i = 1; i < melody.length; i++) {
      expect(melody[i]!.step).toBeGreaterThanOrEqual(melody[i - 1]!.step + melody[i - 1]!.len);
    }
  });

  it('hay bajo y rasgueo en cada compás', () => {
    for (let bar = 0; bar < BARS; bar++) {
      const inBar = SEQUENCE.filter((e) => Math.floor(e.step / STEPS_PER_BAR) === bar);
      expect(inBar.some((e) => e.voice === 'bass')).toBe(true);
      expect(inBar.some((e) => e.voice === 'strum')).toBe(true);
    }
  });
});
