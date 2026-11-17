/**
 * "Atrás" del navegador (gesto de borde en Safari/Brave iOS, botón en Android) cierra el diálogo de arriba
 * en vez de salir del juego. Una web no puede bloquear ese gesto: lo que sí puede es tener una entrada
 * propia en el historial por diálogo abierto (DESIGN.md "Diálogo").
 *
 * Cada entrada guarda su profundidad (cuántos diálogos con entrada había al abrirlo). La profundidad
 * deseada es la de los diálogos abiertos con entrada; cuando difiere de la del historial se corrige con un
 * solo `go(n)` a la vez (el siguiente sale al llegar su `popstate`). Así:
 * - Cerrar con el botón, Esc o desde el código consume su entrada (varios cierres, en uno o más `go`).
 * - Atrás del jugador cierra lo que quedó por encima de la nueva profundidad, también los avisos sin
 *   entrada que estuvieran encima.
 * - Adelante no abre ni cierra nada: vuelve atrás solo.
 * - Recargar con diálogos abiertos regresa a la entrada base.
 * - Solo empuja entrada una apertura con gesto (`conGesto`): Chrome salta las entradas sin gesto, y un
 *   diálogo que abre solo (racha, bienvenida) haría que atrás saliera del juego. Con un `go` en curso
 *   tampoco empuja (la entrada caería en el sitio equivocado); ese diálogo queda sin entrada.
 * - Sin diálogos, atrás sale del juego como siempre.
 */

export interface Historial {
  readonly state: unknown;
  pushState(data: unknown, unused: string): void;
  go(delta: number): void;
}

export interface Cerrable {
  close(): void;
  addEventListener(type: 'close', listener: () => void): void;
}

export interface Atras {
  /** Tras `showModal` de cualquier diálogo; si vino de un gesto, gana su entrada en el historial. */
  abierto(d: Cerrable): void;
  /** Para `window` `popstate`, con `event.state`. */
  popstate(state: unknown): void;
}

const MARCA = 'antojitosDialogo';

const profundidadDe = (state: unknown): number => {
  const n = typeof state === 'object' && state !== null ? (state as Record<string, unknown>)[MARCA] : undefined;
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : 0;
};

export function crearAtras(hist: Historial, conGesto: () => boolean): Atras {
  const abiertos: { d: Cerrable; entrada: boolean }[] = [];
  /** Profundidad de la entrada actual del historial, según lo último que supimos. */
  let profundidad = profundidadDe(hist.state);
  /** Profundidad a la que va un `go` propio en curso. */
  let enCurso: number | null = null;
  /** Cerrando por un atrás del jugador: los cierres no piden `go` (el historial ya se movió). */
  let siguiendo = false;

  const deseada = () => abiertos.filter((a) => a.entrada).length;

  function ajustar(): void {
    if (enCurso !== null || siguiendo) return;
    const objetivo = deseada();
    if (objetivo === profundidad) return;
    enCurso = objetivo;
    hist.go(objetivo - profundidad);
  }

  ajustar(); // recarga con diálogos abiertos: de vuelta a la entrada base

  return {
    abierto(d) {
      const entrada = conGesto() && enCurso === null && profundidad === deseada();
      const a = { d, entrada };
      abiertos.push(a);
      if (entrada) {
        profundidad++;
        hist.pushState({ [MARCA]: profundidad }, '');
      }
      d.addEventListener('close', () => {
        const i = abiertos.indexOf(a);
        if (i < 0) return;
        abiertos.splice(i, 1);
        ajustar();
      });
    },
    popstate(state) {
      profundidad = profundidadDe(state);
      if (enCurso !== null && profundidad === enCurso) {
        enCurso = null; // el nuestro
      } else {
        enCurso = null;
        // Atrás del jugador: cierra de arriba abajo hasta quedar a la nueva profundidad.
        siguiendo = true;
        try {
          // Se saca de la lista antes de cerrar: el evento close del <dialog> llega en otra tarea.
          while (deseada() > profundidad) abiertos.pop()?.d.close();
        } finally {
          siguiendo = false;
        }
      }
      ajustar(); // adelante, o cierres que llegaron mientras iba el go anterior
    },
  };
}
