/**
 * Apodo del ranking mundial. Mismas reglas en el cliente (formulario) y en el servidor (POST):
 * 3–16 caracteres, letras (con acentos y eñe), dígitos y espacios simples; nada más. Una lista
 * corta de palabras bloqueadas, comparadas como palabra entera sin acentos ni mayúsculas, para no
 * tumbar apodos legítimos ("diputado"). La moderación fina es el DELETE con token del servidor.
 */
export const APODO_MIN = 3;
export const APODO_MAX = 16;

const PERMITIDO = /^[\p{L}\p{N} ]+$/u;

/** Sin acentos y en minúsculas, como se comparan las bloqueadas. */
const BLOQUEADAS = new Set([
  'puta',
  'puto',
  'putas',
  'putos',
  'pendejo',
  'pendeja',
  'pendejos',
  'pendejas',
  'verga',
  'chingar',
  'chinga',
  'chingada',
  'mierda',
  'culero',
  'culera',
  'pinche',
  'cabron',
  'cabrona',
  'joto',
  'punal', // "puñal" tras plegar la eñe
  'nazi',
  'hitler',
  'fuck',
  'shit',
  'bitch',
  'nigger',
  'nigga',
  'cunt',
]);

function plegar(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

/** Apodo limpio, o null si no vale. */
export function normalizarApodo(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const apodo = raw.trim().replace(/\s+/g, ' ');
  if (apodo.length < APODO_MIN || apodo.length > APODO_MAX) return null;
  if (!PERMITIDO.test(apodo)) return null;
  for (const palabra of plegar(apodo).split(' ')) if (BLOQUEADAS.has(palabra)) return null;
  return apodo;
}
