import { BUSINESSES, RACHA_MIN_POR_DIA, RACHA_SEMANA } from './data';
import { claveDia, diaVecino } from './fecha';
import { capAdd, cicloMs, getDef, revenuePerCycle, ventasPorSegundo, type State } from './game';

/** Regalo del día: dinero (días 1–6 de cada semana de racha) o una receta (día 7, 14, 21…). */
export type Regalo = { tipo: 'dinero'; monto: number } | { tipo: 'receta' };

/**
 * `cobrado`: hoy ya se cobró (o `ultimoDia` es mañana: reloj adelantado una unidad, se tolera como
 * el "ayer"). `sigue`: se cobró ayer, la racha continúa. `rota`: más atrás, o más de un día en el
 * futuro (un reloj que estuvo en 2030 y se corrigió no congela la racha).
 */
export type EstadoRacha = 'cobrado' | 'sigue' | 'rota';

export function estadoRacha(s: State, now: number): EstadoRacha {
  const hoy = claveDia(now);
  const { ultimoDia } = s.racha;
  if (ultimoDia === hoy || ultimoDia === diaVecino(hoy, 1)) return 'cobrado';
  if (ultimoDia === diaVecino(hoy, -1)) return 'sigue';
  return 'rota';
}

/** Día de racha que tocaría cobrar hoy (el actual si ya se cobró). */
export function diaSiguiente(s: State, now: number): number {
  const estado = estadoRacha(s, now);
  if (estado === 'cobrado') return s.racha.dias;
  return estado === 'sigue' ? s.racha.dias + 1 : 1;
}

/** Posición dentro de la semana de racha: 1–7. */
export function diaDeSemana(dia: number): number {
  return ((Math.max(dia, 1) - 1) % RACHA_SEMANA) + 1;
}

/**
 * Base del regalo: ventas por segundo de los negocios con empleado, sin propina (si no, el monto
 * oscilaría ×1.5 según el instante). Sin empleados, lo que deja el mejor negocio abierto a mano.
 */
export function ingresoPorSegundo(s: State): number {
  let conEmpleado = 0;
  let aMano = 0;
  for (const def of BUSINESSES) {
    const b = s.businesses[def.id];
    if (!b || b.count === 0) continue;
    if (b.manager) conEmpleado += ventasPorSegundo(s, def.id);
    else aMano = Math.max(aMano, (revenuePerCycle(s, def.id) * 1000) / cicloMs(getDef(def.id), b.count));
  }
  return conEmpleado > 0 ? conEmpleado : aMano;
}

/** Regalo del día `dia` con el estado actual. Entero hacia arriba, como los precios. */
export function regalo(s: State, dia: number): Regalo {
  const semana = diaDeSemana(dia);
  if (semana === RACHA_SEMANA) return { tipo: 'receta' };
  return { tipo: 'dinero', monto: capAdd(0, Math.ceil(ingresoPorSegundo(s) * 60 * RACHA_MIN_POR_DIA * semana)) };
}

/**
 * Un estado recién creado, cargado o importado sin día de racha queda "visto hoy": el día que
 * empiezas (o migras) no regala; la racha arranca al volver mañana.
 */
export function iniciarRacha(s: State, now: number): State {
  return s.racha.ultimoDia === null ? { ...s, racha: { dias: 0, ultimoDia: claveDia(now) } } : s;
}

/**
 * Cobra el regalo de hoy. `null` si hoy ya se cobró (doble clic, dos botones). Lo que se cobra se
 * calcula aquí, con el estado y la hora del clic: es lo que se anuncia.
 */
export function cobrar(s: State, now: number): { state: State; dia: number; regalo: Regalo } | null {
  if (estadoRacha(s, now) === 'cobrado') return null;
  const dia = diaSiguiente(s, now);
  const r = regalo(s, dia);
  const base: State = {
    ...s,
    racha: { dias: dia, ultimoDia: claveDia(now) },
    stats: { ...s.stats, regalos: s.stats.regalos + 1 },
  };
  const state: State =
    r.tipo === 'receta'
      ? { ...base, recipes: base.recipes + 1, recetasRegalo: base.recetasRegalo + 1 }
      : {
          ...base,
          money: capAdd(base.money, r.monto),
          runEarned: capAdd(base.runEarned, r.monto),
          lifetimeEarned: capAdd(base.lifetimeEarned, r.monto),
        };
  return { state, dia, regalo: r };
}
