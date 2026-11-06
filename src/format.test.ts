import { describe, expect, it } from 'vitest';
import { formatDuration, formatMoney, formatNumber, formatReloj } from './format';

describe('formatMoney', () => {
  it('trunca a entero bajo 1e6: nunca muestra más de lo que hay', () => {
    expect(formatMoney(0)).toBe('$0');
    expect(formatMoney(4.99)).toBe('$4');
    expect(formatMoney(4.9999999999)).toBe('$4');
    expect(formatMoney(999_999.99)).toBe('$999,999');
    expect(formatMoney(1_500_000)).toBe('$1.50 millones');
  });

  it('valores exactos en todas las escalas: ni un escalón de menos', () => {
    for (const exp of [6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 39]) {
      for (let hundredths = 100; hundredths < 100_000; hundredths += 1237) {
        const n = (hundredths / 100) * 10 ** exp;
        expect(formatMoney(n).startsWith(`$${(hundredths / 100).toFixed(2)} `)).toBe(true);
      }
    }
  });

  it('desde 1e42 trunca la mantisa', () => {
    expect(formatMoney(1.996e42)).toBe('$1.99e42');
    expect(formatMoney(1e42)).toBe('$1.00e42');
  });

  it('no muestra "-0"', () => {
    expect(formatMoney(-1e-12)).toBe('$0');
  });
});

describe('formatNumber', () => {
  it('enteros con separador', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(12.9)).toBe('12');
    expect(formatNumber(999_999)).toBe('999,999');
  });

  it('escala larga en español', () => {
    expect(formatNumber(1_500_000)).toBe('1.50 millones');
    expect(formatNumber(2e9)).toBe('2.00 mil millones');
    expect(formatNumber(3e12)).toBe('3.00 billones');
    expect(formatNumber(4e18)).toBe('4.00 trillones');
  });

  it('no redondea hacia el siguiente escalón', () => {
    expect(formatNumber(999_999_999)).toBe('999.99 millones');
  });

  it('el error de punto flotante no deja "1,000.00" en un escalón', () => {
    expect(formatNumber(9.99999999999999e41)).toBe('1.00e42');
  });

  it('sin error de punto flotante y singular en 1', () => {
    expect(formatNumber(1.15e6)).toBe('1.15 millones');
    expect(formatNumber(2.3e6)).toBe('2.30 millones');
    expect(formatNumber(4.35e9)).toBe('4.35 mil millones');
    expect(formatNumber(1e6)).toBe('1.00 millón');
    expect(formatNumber(1e12)).toBe('1.00 billón');
  });

  it('valores extremos', () => {
    expect(formatNumber(Infinity)).toBe('∞');
    expect(formatNumber(NaN)).toBe('∞');
    expect(formatNumber(1.5e50)).toBe('1.50e50');
    expect(formatMoney(-1_000)).toBe('$-1,000');
  });
});

describe('formatDuration', () => {
  it('h, min, s', () => {
    expect(formatDuration(45_000)).toBe('45 s');
    expect(formatDuration(5 * 60_000)).toBe('5 min');
    expect(formatDuration(8 * 3_600_000)).toBe('8 h');
    expect(formatDuration(90 * 60_000)).toBe('1 h 30 min');
    expect(formatDuration(96_000)).toBe('1 min 36 s');
    expect(formatDuration(192_000)).toBe('3 min 12 s');
    expect(formatDuration(0)).toBe('0 s');
  });
});

describe('formatReloj', () => {
  it('m:ss redondeando hacia arriba', () => {
    expect(formatReloj(0)).toBe('0:00');
    expect(formatReloj(1)).toBe('0:01');
    expect(formatReloj(24_000)).toBe('0:24');
    expect(formatReloj(252_000)).toBe('4:12');
    expect(formatReloj(300_000)).toBe('5:00');
    expect(formatReloj(-5)).toBe('0:00');
  });
});
