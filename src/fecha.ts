/**
 * Días de calendario en la zona LOCAL del aparato (la racha diaria no tiene servidor). Nunca
 * `toISOString` (UTC: a las 20:00 de México ya sería "mañana").
 */

const dos = (n: number) => String(n).padStart(2, '0');

/** "YYYY-MM-DD" local del instante `now`. Comparable como texto: los ceros mantienen el orden. */
export function claveDia(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

/** Clave del día anterior (−1) o siguiente (+1). Con `setDate`, no con 86 400 000 ms: cruza mes, año y DST. */
export function diaVecino(clave: string, delta: -1 | 1): string {
  const [y, m, d] = clave.split('-').map(Number);
  const fecha = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  fecha.setDate(fecha.getDate() + delta);
  return claveDia(fecha.getTime());
}
