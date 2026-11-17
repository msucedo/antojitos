import { describe, expect, it } from 'vitest';
import { crearAtras, type Cerrable, type Historial } from './atras';

/**
 * Historial falso como el del navegador: `go` es asíncrono (el `popstate` llega en otra tarea, al llamar
 * `correr()`), varios `go` seguidos se encolan, y atrás/adelante del jugador también.
 */
function historial(inicial: unknown[] = [null]) {
  const entradas = [...inicial];
  let i = entradas.length - 1;
  const cola: number[] = [];
  const gos: number[] = [];
  let onPop: (state: unknown) => void = () => {};
  const hist = {
    get state() {
      return entradas[i];
    },
    pushState(data: unknown) {
      entradas.splice(i + 1);
      entradas.push(data);
      i++;
    },
    go(delta: number) {
      gos.push(delta);
      cola.push(delta);
    },
    gos,
    largo: () => entradas.length,
    indice: () => i,
    atras: () => cola.push(-1),
    adelante: () => cola.push(1),
    alPop(fn: (state: unknown) => void) {
      onPop = fn;
    },
    /** Procesa eventos close y la cola de go hasta vaciarlas (cada paso puede encolar más). */
    correr() {
      avisar();
      while (cola.length > 0) {
        const delta = cola.shift() ?? 0;
        const j = Math.min(Math.max(0, i + delta), entradas.length - 1);
        if (j === i) continue;
        i = j;
        onPop(entradas[i]);
        avisar();
      }
    },
  } satisfies Historial & Record<string, unknown>;
  return hist;
}

/** Diálogo falso; como el <dialog> real, el evento close llega en otra tarea (`avisar()`). */
const pendientes: (() => void)[] = [];
const avisar = () => pendientes.splice(0).forEach((f) => f());

function dialogo(): Cerrable & { abierto: boolean } {
  const oyentes: (() => void)[] = [];
  const d = {
    abierto: true,
    close() {
      if (!d.abierto) return;
      d.abierto = false;
      pendientes.push(() => oyentes.forEach((f) => f()));
    },
    addEventListener(_: 'close', f: () => void) {
      oyentes.push(f);
    },
  };
  return d;
}

function montar(gesto = true, inicial?: unknown[]) {
  const hist = historial(inicial);
  const a = crearAtras(hist, () => gesto);
  hist.alPop((s) => a.popstate(s));
  return { hist, a };
}

describe('atras', () => {
  it('atrás cierra el diálogo abierto con gesto y no sale del juego', () => {
    const { hist, a } = montar();
    const d = dialogo();
    a.abierto(d);
    expect(hist.indice()).toBe(1);
    hist.atras();
    hist.correr();
    expect(d.abierto).toBe(false);
    expect(hist.indice()).toBe(0);
    expect(hist.gos).toEqual([]); // no hubo un go propio de más
  });

  it('sin gesto no hay entrada: el diálogo que abre solo no toca el historial', () => {
    const { hist, a } = montar(false);
    a.abierto(dialogo());
    expect(hist.largo()).toBe(1);
  });

  it('cerrar con el botón consume su entrada y no cierra al de abajo', () => {
    const { hist, a } = montar();
    const fondo = dialogo();
    const d = dialogo();
    a.abierto(fondo);
    a.abierto(d);
    d.close();
    hist.correr();
    expect(hist.indice()).toBe(1);
    expect(fondo.abierto).toBe(true);
    hist.atras();
    hist.correr();
    expect(fondo.abierto).toBe(false);
    expect(hist.indice()).toBe(0);
  });

  it('cierres en tareas distintas: un go a la vez y el historial termina en la base', () => {
    const { hist, a } = montar();
    const herencia = dialogo();
    const confirmar = dialogo();
    a.abierto(herencia);
    a.abierto(confirmar);
    confirmar.close();
    avisar(); // tarea 1: su close
    herencia.close();
    avisar(); // tarea 2: su close, antes de que llegue el popstate del primer go
    expect(hist.gos).toEqual([-1]);
    hist.correr();
    expect(hist.indice()).toBe(0);
    expect(hist.state).toBeNull();
  });

  it('diálogos apilados: cada atrás cierra el de arriba', () => {
    const { hist, a } = montar();
    const album = dialogo();
    const vitrina = dialogo();
    a.abierto(album);
    a.abierto(vitrina);
    hist.atras();
    hist.correr();
    expect([album.abierto, vitrina.abierto]).toEqual([true, false]);
    hist.atras();
    hist.correr();
    expect(album.abierto).toBe(false);
    expect(hist.indice()).toBe(0);
  });

  it('adelante no cierra nada: vuelve atrás solo', () => {
    const { hist, a } = montar();
    const album = dialogo();
    const vitrina = dialogo();
    a.abierto(album);
    a.abierto(vitrina);
    hist.atras();
    hist.correr();
    hist.adelante();
    hist.correr();
    expect(album.abierto).toBe(true);
    expect(hist.indice()).toBe(1);
    hist.atras();
    hist.correr();
    expect(album.abierto).toBe(false);
  });

  it('un aviso sin entrada encima: atrás lo cierra junto con el de abajo', () => {
    const hist = historial();
    let gesto = true;
    const a = crearAtras(hist, () => gesto);
    hist.alPop((s) => a.popstate(s));
    const album = dialogo();
    a.abierto(album);
    gesto = false;
    const aviso = dialogo();
    a.abierto(aviso);
    hist.atras();
    hist.correr();
    expect([album.abierto, aviso.abierto]).toEqual([false, false]);
    expect(hist.indice()).toBe(0);
  });

  it('al recargar sobre entradas de diálogo, vuelve a la base', () => {
    const { hist } = montar(true, [null, { antojitosDialogo: 1 }, { antojitosDialogo: 2 }]);
    expect(hist.gos).toEqual([-2]);
    hist.correr();
    expect(hist.indice()).toBe(0);
  });
});
