import { describe, expect, it } from 'vitest';
import { formatDuration, formatMoney, formatNumber } from './format';

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
