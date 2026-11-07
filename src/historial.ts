/**
 * Historial de avisos de la sesión: lo que announce() leyó en voz alta, para releerlo en el panel
 * Historial. Solo en memoria (no se guarda): la ausencia no genera entradas, así que al volver hay
 * una sola ("Ganaste $X mientras no estabas") y no tiene sentido persistirlo.
 */

export const HISTORIAL_MAX = 50;

export interface Entrada {
  /** Marca de tiempo (Date.now()). */
  hora: number;
  texto: string;
}

export interface Historial {
  /** Añade al frente; devuelve la entrada o null si el texto está vacío. */
  registrar(texto: string, ahora?: number): Entrada | null;
  /** Más reciente primero. */
  entradas(): readonly Entrada[];
}

export function crearHistorial(max = HISTORIAL_MAX): Historial {
  const lista: Entrada[] = [];
  return {
    registrar(texto, ahora = Date.now()) {
      if (texto.trim() === '') return null;
      const e: Entrada = { hora: ahora, texto };
      lista.unshift(e);
      if (lista.length > max) lista.length = max;
      return e;
    },
    entradas: () => lista,
  };
}

/** HH:MM en hora local, dos cifras; sin Intl para que sea igual en pruebas y navegador. */
export function formatHora(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
