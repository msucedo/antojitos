import { BUSINESSES, UPGRADES, type Arte } from './data';
import { estrellas, heredadas, type State } from './game';

/** Arte de la estampilla: un plato, un retrato o un símbolo del sprite (nada nuevo que ilustrar). */
export type LogroIcono = Arte;

export interface LogroDef {
  readonly id: string;
  readonly nombre: string;
  /** Cómo se consigue; se muestra en la estampilla bloqueada. */
  readonly pista: string;
  /** Qué se logró, en pasado; sustituye a la pista al desbloquear (el +2 % lo dice el anuncio). */
  readonly logrado: string;
  readonly icono: LogroIcono;
  readonly cumple: (s: State) => boolean;
}

/**
 * Meta del logro final `imperio`: los 8 negocios con estas unidades. El costo por unidad es geométrico
 * (`growth` 1.07–1.15): a 350 el acumulado ronda $3e24 (17 días de juego óptimo); 1000 no se alcanza nunca.
 */
export const IMPERIO_UNIDADES = 350;

const negocios = (s: State) => BUSINESSES.map((d) => s.businesses[d.id]).filter((b) => b !== undefined);
const algunNegocio = (s: State, f: (count: number) => boolean) => negocios(s).some((b) => f(b.count));
const todosNegocios = (s: State, f: (count: number) => boolean) => negocios(s).every((b) => f(b.count));
const empleados = (s: State) => negocios(s).filter((b) => b.manager);

/** Catálogo fijo, en el orden del Álbum. Predicados puros sobre el estado (incluye `stats`). */
export const LOGROS: readonly LogroDef[] = [
  {
    id: 'venta',
    nombre: 'Primer elote',
    pista: 'Vende una vez a mano',
    logrado: 'Vendiste a mano por primera vez',
    icono: { plato: 'elote' },
    cumple: (s) => s.stats.ventasManuales >= 1,
  },
  {
    id: 'clics-100',
    nombre: 'Mano caliente',
    pista: 'Toca el plato 100 veces',
    logrado: 'Tocaste el plato 100 veces',
    icono: { sprite: 'moneda' },
    cumple: (s) => s.stats.clics >= 100,
  },
  {
    id: 'clics-1000',
    nombre: 'Callo en el dedo',
    pista: 'Toca el plato 1,000 veces',
    logrado: 'Tocaste el plato 1,000 veces',
    icono: { sprite: 'monedas' },
    cumple: (s) => s.stats.clics >= 1000,
  },
  {
    id: 'negocios-8',
    nombre: 'Imperio completo',
    pista: 'Abre los 8 negocios',
    logrado: 'Abriste los 8 negocios',
    icono: { plato: 'tienda' },
    cumple: (s) => todosNegocios(s, (n) => n > 0),
  },
  {
    id: 'unidades-25',
    nombre: 'Primer hito',
    pista: 'Un negocio con 25 unidades',
    logrado: 'Un negocio llegó a 25 unidades',
    icono: { plato: 'taco' },
    cumple: (s) => algunNegocio(s, (n) => n >= 25),
  },
  {
    id: 'unidades-200',
    nombre: 'Cuadra entera',
    pista: 'Un negocio con 200 unidades',
    logrado: 'Un negocio llegó a 200 unidades',
    icono: { plato: 'torta' },
    cumple: (s) => algunNegocio(s, (n) => n >= 200),
  },
  {
    id: 'todos-100',
    nombre: 'Cien de cada',
    pista: 'Los 8 negocios con 100 unidades',
    logrado: 'Los 8 negocios llegaron a 100',
    icono: { plato: 'camion' },
    cumple: (s) => todosNegocios(s, (n) => n >= 100),
  },
  {
    id: 'empleado',
    nombre: 'Primer empleado',
    pista: 'Contrata a alguien',
    logrado: 'Contrataste a tu primer empleado',
    icono: { retrato: 'beto' },
    cumple: (s) => s.stats.contratados >= 1 || empleados(s).length >= 1, // partidas de antes de los contadores
  },
  {
    id: 'empleados-8',
    nombre: 'Plantilla completa',
    pista: 'Los 8 empleados a la vez',
    logrado: 'Los 8 empleados trabajando a la vez',
    icono: { sprite: 'personajes' },
    cumple: (s) => empleados(s).length === BUSINESSES.length,
  },
  {
    id: 'estrella',
    nombre: 'Primera estrella',
    pista: 'Un empleado con una estrella',
    logrado: 'Un empleado ganó su primera estrella',
    icono: { sprite: 'estrella' },
    cumple: (s) => empleados(s).some((b) => estrellas(b) >= 1),
  },
  {
    id: 'estrellas-3',
    nombre: 'Tres estrellas',
    pista: 'Un empleado con tres estrellas',
    logrado: 'Un empleado llegó a tres estrellas',
    icono: { sprite: 'estrella' },
    cumple: (s) => empleados(s).some((b) => estrellas(b) >= 3),
  },
  {
    id: 'todos-estrella',
    nombre: 'Equipo con estrella',
    pista: 'Los 8 empleados con una estrella',
    logrado: 'Los 8 empleados con estrella',
    icono: { retrato: 'jefa' },
    cumple: (s) => empleados(s).length === BUSINESSES.length && empleados(s).every((b) => estrellas(b) >= 1),
  },
  {
    id: 'propina',
    nombre: 'Primera propina',
    pista: 'Da una propina',
    logrado: 'Diste tu primera propina',
    icono: { retrato: 'lupita' },
    cumple: (s) => s.stats.propinas >= 1,
  },
  {
    id: 'propinas-10',
    nombre: 'Mano generosa',
    pista: 'Da 10 propinas',
    logrado: 'Diste 10 propinas',
    icono: { sprite: 'pilas' },
    cumple: (s) => s.stats.propinas >= 10,
  },
  {
    id: 'mejoras-todas',
    nombre: 'Todo mejorado',
    pista: `Compra las ${UPGRADES.length} mejoras en una partida`,
    logrado: 'Compraste todas las mejoras',
    icono: { sprite: 'upgrade' },
    cumple: (s) => s.upgrades.length === UPGRADES.length,
  },
  {
    id: 'herencia',
    nombre: 'Primera herencia',
    pista: 'Hereda una vez',
    logrado: 'Heredaste por primera vez',
    icono: { sprite: 'recipe' },
    cumple: (s) => s.stats.herencias >= 1 || heredadas(s) >= 1, // partidas de antes de los contadores
  },
  {
    id: 'herencias-5',
    nombre: 'Tradición familiar',
    pista: 'Hereda 5 veces',
    logrado: 'Heredaste 5 veces',
    icono: { sprite: 'recipe' },
    cumple: (s) => s.stats.herencias >= 5,
  },
  {
    id: 'recetas-10',
    nombre: 'Diez recetas',
    pista: 'Junta 10 recetas',
    logrado: 'Juntaste 10 recetas',
    icono: { plato: 'concha' },
    cumple: (s) => s.recipes >= 10,
  },
  {
    id: 'recetas-50',
    nombre: 'Recetario',
    pista: 'Junta 50 recetas',
    logrado: 'Juntaste 50 recetas',
    icono: { plato: 'olla' },
    cumple: (s) => s.recipes >= 50,
  },
  {
    id: 'ganado-1e6',
    nombre: 'Primer millón',
    pista: 'Gana $1 millón en total',
    logrado: 'Ganaste $1 millón en total',
    icono: { sprite: 'pilas' },
    cumple: (s) => s.lifetimeEarned >= 1e6,
  },
  {
    id: 'ganado-1e12',
    nombre: 'Un billón',
    pista: 'Gana $1 billón en total',
    logrado: 'Ganaste $1 billón en total',
    icono: { sprite: 'caja' },
    cumple: (s) => s.lifetimeEarned >= 1e12,
  },
  {
    id: 'ganado-1e15',
    nombre: 'Mil billones',
    pista: 'Gana $1 mil billones en total',
    logrado: 'Ganaste $1 mil billones en total',
    icono: { retrato: 'perez' },
    cumple: (s) => s.lifetimeEarned >= 1e15,
  },
  {
    id: 'jugado-1h',
    nombre: 'Una hora',
    pista: 'Juega una hora',
    logrado: 'Jugaste una hora',
    icono: { retrato: 'chelo' },
    cumple: (s) => s.stats.jugadoMs >= 3_600_000,
  },
  {
    id: 'jugado-10h',
    nombre: 'Diez horas',
    pista: 'Juega diez horas',
    logrado: 'Jugaste diez horas',
    icono: { retrato: 'chelo' },
    cumple: (s) => s.stats.jugadoMs >= 36_000_000,
  },
  {
    id: 'racha-7',
    nombre: 'Siete seguidos',
    pista: 'Vuelve 7 días seguidos',
    logrado: 'Volviste 7 días seguidos',
    icono: { sprite: 'recipe' },
    cumple: (s) => s.racha.dias >= 7,
  },
  // Siempre al final: el Álbum conserva su orden para quien ya tiene las estampillas anteriores.
  {
    id: 'imperio',
    nombre: 'Corona del imperio',
    pista: `Los 8 negocios con ${IMPERIO_UNIDADES} unidades`,
    logrado: `Los 8 negocios llegaron a ${IMPERIO_UNIDADES}`,
    icono: { sprite: 'logo' },
    cumple: (s) => todosNegocios(s, (n) => n >= IMPERIO_UNIDADES),
  },
];

export const LOGRO_IDS: ReadonlySet<string> = new Set(LOGROS.map((l) => l.id));

/** Todas las estampillas pegadas: el letrero "Álbum completo" y la última frase de Chelo. */
export function albumCompleto(s: State): boolean {
  return s.logros.length === LOGROS.length;
}

export function getLogro(id: string): LogroDef {
  const def = LOGROS.find((l) => l.id === id);
  if (!def) throw new Error(`Logro desconocido: ${id}`);
  return def;
}

/** Logros que el estado ya cumple y aún no tiene, en el orden del catálogo. */
export function nuevos(s: State): LogroDef[] {
  return LOGROS.filter((l) => !s.logros.includes(l.id) && l.cumple(s));
}

/** Añade logros al final (el badge cuenta desde `logrosVistos`, así que el orden nunca cambia). */
export function desbloquear(s: State, defs: readonly LogroDef[]): State {
  const ids = defs.map((l) => l.id).filter((id) => !s.logros.includes(id));
  return ids.length === 0 ? s : { ...s, logros: [...s.logros, ...ids] };
}

/** Marca todo lo desbloqueado como visto (al abrir el Álbum). */
export function verLogros(s: State): State {
  return s.logrosVistos === s.logros.length ? s : { ...s, logrosVistos: s.logros.length };
}
