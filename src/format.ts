/** Escala larga en español (billón = 1e12): [valor, singular, plural]. */
const SCALE: readonly [number, string, string][] = [
  [1e39, 'mil sextillones', 'mil sextillones'],
  [1e36, 'sextillón', 'sextillones'],
  [1e33, 'mil quintillones', 'mil quintillones'],
  [1e30, 'quintillón', 'quintillones'],
  [1e27, 'mil cuatrillones', 'mil cuatrillones'],
  [1e24, 'cuatrillón', 'cuatrillones'],
  [1e21, 'mil trillones', 'mil trillones'],
  [1e18, 'trillón', 'trillones'],
  [1e15, 'mil billones', 'mil billones'],
  [1e12, 'billón', 'billones'],
  [1e9, 'mil millones', 'mil millones'],
  [1e6, 'millón', 'millones'],
];

const integer = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Trunca a 2 decimales. El épsilon absorbe el error de la división
 * (1.15e6 / 1e6 * 100 = 114.999…); a cambio, un valor a menos de ~1e-11 relativo de
 * un escalón se muestra en ese escalón (solo desde 1e6, donde el botón decide).
 */
function hundredths(x: number): number {
  return Math.floor(x * 100 + 1e-9) / 100;
}

/**
 * Trunca (ver `hundredths`). Los precios son enteros desde la lógica (`costOf`), así que bajo 1e6
 * "alcanza" ⇔ precio mostrado ≤ dinero mostrado; arriba, el estado del botón decide.
 */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  if (n < 0) {
    const abs = formatNumber(-n);
    return abs === '0' ? abs : `-${abs}`;
  }
  if (n >= 1e42) {
    let exp = Math.floor(Math.log10(n));
    let mantissa = hundredths(n / 10 ** exp);
    if (mantissa >= 10) [mantissa, exp] = [hundredths(mantissa / 10), exp + 1];
    return `${mantissa.toFixed(2)}e${exp}`;
  }
  for (const [i, [value, singular, plural]] of SCALE.entries()) {
    if (n >= value) {
      const scaled = hundredths(n / value);
      // El épsilon puede llegar a 1000: se muestra en el escalón siguiente.
      if (scaled >= 1000) return formatNumber(SCALE[i - 1]?.[0] ?? 1e42);
      return `${decimal.format(scaled)} ${scaled === 1 ? singular : plural}`;
    }
  }
  // Enteros exactos: sin épsilon, para que $4.9999 nunca se vea como $5.
  return integer.format(Math.floor(n));
}

export function formatMoney(n: number): string {
  return `$${formatNumber(n)}`;
}

/** Hasta dos unidades, sin perder segundos: 96 s → "1 min 36 s". */
export function formatDuration(ms: number): string {
  const total = Math.floor(Math.max(ms, 0) / 1000);
  const parts: [number, string][] = [
    [Math.floor(total / 3600), 'h'],
    [Math.floor((total % 3600) / 60), 'min'],
    [total % 60, 's'],
  ];
  const first = parts.findIndex(([v]) => v > 0);
  if (first === -1) return '0 s';
  return parts
    .slice(first, first + 2)
    .filter(([v]) => v > 0)
    .map(([v, unit]) => `${v} ${unit}`)
    .join(' ');
}
