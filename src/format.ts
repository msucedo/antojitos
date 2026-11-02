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

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  if (n < 0) return `-${formatNumber(-n)}`;
  if (n >= 1e42) return n.toExponential(2).replace('+', '');
  for (const [value, singular, plural] of SCALE) {
    if (n >= value) {
      // Trunca a 2 decimales (nunca muestra de más); el épsilon absorbe el error de
      // punto flotante de la división (1.15e6 / 1e6 * 100 = 114.999…).
      const scaled = Math.floor((n / value) * 100 + 1e-9) / 100;
      return `${decimal.format(scaled)} ${scaled === 1 ? singular : plural}`;
    }
  }
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
