/**
 * Fondo animado (DESIGN.md "Fondo animado"): papel picado al viento en el header y confeti que cae
 * por todo el fondo de la app. Canvas 2D, sin three. Una sola simulación en coordenadas del viewport
 * y dos superficies: `canvas.fondo-pagina` (fixed, bajo todo el contenido) y `canvas.fondo-header`
 * (dentro de `.top`, que es sticky y opaco: las tarjetas pasan por debajo al hacer scroll).
 *
 * Importarlo no toca el DOM (vitest corre en node): todo lo del navegador vive en montarFondo().
 */

/** `d` del símbolo `banderin` de assets/icons.svg (viewBox 24×28; lo comprueba fondo.test.ts). */
export const BANDERIN_D =
  'M0 0h24v22a4 4 0 0 1-8 0a4 4 0 0 1-8 0a4 4 0 0 1-8 0zM9.5 5.5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0zM12 17.5c-2.4-1.8-3.6-3-3.6-4.6a1.8 1.8 0 0 1 3.6-.5a1.8 1.8 0 0 1 3.6.5c0 1.6-1.2 2.8-3.6 4.6zM4 10.5l1.8 2.2L4 15l-1.8-2.2zM20 10.5l1.8 2.2L20 15l-1.8-2.2z';
const BANDERIN_W = 24;
const BANDERIN_H = 28;
/** El svg del picado trae 48 banderines (ui.ts papelPicado). */
const BANDERINES = 48;
/** Colores de los banderines y del confeti, en el orden de las clases f1–f4 del picado. */
const TOKENS = ['--primary-bright', '--corn', '--nopal', '--cielo'] as const;

const FPS = 30;
/** Píxeles de viewport por pieza de confeti, y tope. */
const AREA_POR_PIEZA = 9000;
const MAX_PIEZAS = 90;
/** Bajo el header: solo para que los banderines bajen al sacudirse (nunca confeti ahí). */
const COLA = 8;
/** Margen alrededor del texto donde el confeti empieza a ponerse de canto, y distancia en que desaparece. */
const CERCA = 12;
/** La cifra del dinero cambia de ancho con cada tick sin que cambie el layout: margen a su derecha. */
const MARGEN_DINERO = 32;
const SACUDIDA_MS = 220;

/** Rectángulo en px CSS del viewport. */
export interface Caja {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Pieza {
  /** Posición inicial en fracción del ancho y de la caída. */
  u: number;
  v: number;
  /** px/ms de caída. */
  vel: number;
  fase: number;
  w: number;
  h: number;
  /** Giro por eje en rad/ms. */
  rx: number;
  ry: number;
  rz: number;
  color: number;
}

/** PRNG con semilla (mulberry32): mismas piezas para la misma semilla. */
export function mulberry32(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function crearPiezas(n: number, semilla: number): Pieza[] {
  const r = mulberry32(semilla);
  return Array.from({ length: n }, (_, i) => ({
    u: r(),
    v: r(),
    vel: 0.012 + r() * 0.016,
    fase: r() * Math.PI * 2,
    w: 5 + r() * 3,
    h: 7 + r() * 4,
    rx: (r() - 0.5) * 0.006,
    ry: (r() - 0.5) * 0.006,
    rz: (r() - 0.5) * 0.002,
    color: i % TOKENS.length,
  }));
}

/** Cuántas piezas para un viewport de `w` × `h`. */
export function densidad(w: number, h: number): number {
  return Math.max(0, Math.min(MAX_PIEZAS, Math.round((w * h) / AREA_POR_PIEZA)));
}

/**
 * Centro de una pieza en el instante `t` (ms): función cerrada de `t`, sin integrar, para que dos
 * capturas en el mismo `t` salgan iguales. Cae de arriba abajo y vuelve a empezar por encima del borde.
 */
export function posicion(p: Pieza, t: number, w: number, h: number): { x: number; y: number } {
  const tramo = h + 2 * CERCA;
  const y = (((p.v * tramo + t * p.vel) % tramo) + tramo) % tramo;
  return { x: p.u * w + Math.sin(t * 0.001 + p.fase) * 8, y: y - CERCA };
}

function distancia(x: number, y: number, c: Caja): number {
  const dx = Math.max(c.x - x, 0, x - (c.x + c.w));
  const dy = Math.max(c.y - y, 0, y - (c.y + c.h));
  return Math.hypot(dx, dy);
}

/** Escala de una pieza según lo cerca que pasa del texto: 0 encima o pegada, 1 a `CERCA` o más. */
export function escalaCerca(x: number, y: number, cajas: readonly Caja[]): number {
  let d = Infinity;
  for (const c of cajas) d = Math.min(d, distancia(x, y, c));
  return Math.min(1, Math.max(0, (d - 2) / CERCA));
}

/** Escala de los banderines como el svg del picado (`xMinYMin slice` de un viewBox 1152 × 28). */
export function escalaPicado(ancho: number, alto: number): number {
  return Math.max(ancho / (BANDERINES * BANDERIN_W), alto / BANDERIN_H);
}

/** Giro del banderín `i` en rad: viento suave más la sacudida que decae desde `sacudidaEn`. */
export function giroBanderin(i: number, t: number, sacudidaEn: number): { giro: number; baja: number } {
  const fase = i * 0.9;
  const viento = Math.sin(t * 0.0016 + fase) * 0.6 + Math.sin(t * 0.0037 + fase * 1.7) * 0.4;
  const queda = t >= sacudidaEn ? Math.exp(-(t - sacudidaEn) / SACUDIDA_MS) : 0;
  return {
    giro: viento * 0.12 + Math.sin(t * 0.035 + fase) * 0.35 * queda,
    baja: Math.abs(Math.sin(t * 0.03 + fase)) * 5 * queda,
  };
}

// ---------- Navegador ----------

export interface Fondo {
  /** Sacude el picado (al heredar). Si está en pausa, se ve al reanudar. */
  sacudir(): void;
  /** Vuelve a animar si ya no hay pausa (al cerrar un diálogo). */
  reanudar(): void;
  destroy(): void;
}

function pausado(): boolean {
  return document.hidden || document.querySelector('dialog.modal[open]') !== null;
}

function caja(r: DOMRect): Caja {
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

function lienzo(clase: string): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.className = clase;
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Sin canvas 2D');
  return { canvas, ctx };
}

/**
 * Ajusta el bitmap al tamaño CSS (fraccionario, de getBoundingClientRect) por el DPR y devuelve la escala
 * real bitmap/CSS por eje: el redondeo del bitmap no desplaza lo dibujado (sin costura entre los canvas).
 */
function ajustar(canvas: HTMLCanvasElement, w: number, h: number, dpr: number): { kx: number; ky: number } {
  const bw = Math.max(1, Math.round(w * dpr));
  const bh = Math.max(1, Math.round(h * dpr));
  if (canvas.width !== bw) canvas.width = bw;
  if (canvas.height !== bh) canvas.height = bh;
  return { kx: w > 0 ? bw / w : dpr, ky: h > 0 ? bh / h : dpr };
}

/**
 * Monta el fondo: `top` es el header (`.top`), `picado` su svg. Pone `html[data-fondo]` tras el primer
 * cuadro (el CSS oculta entonces los banderines del svg) y lo quita antes de desmontar.
 */
export function montarFondo(top: HTMLElement, picado: SVGSVGElement): Fondo {
  const html = document.documentElement;
  const pagina = lienzo('fondo-pagina');
  const cabeza = lienzo('fondo-header');

  const banderin = new Path2D(BANDERIN_D);
  const piezas = crearPiezas(MAX_PIEZAS, Date.now());
  let colores: string[] = [];
  const leerColores = (): void => {
    const css = getComputedStyle(html);
    colores = TOKENS.map((t) => css.getPropertyValue(t).trim());
  };
  leerColores();

  // Medidas en px CSS del viewport; se rehacen cuando algo las ensucia (scroll, resize, fuentes, cada 1 s).
  let vw = 0;
  let vh = 0;
  let cab: Caja = { x: 0, y: 0, w: 0, h: 0 };
  let pic: Caja = { x: 0, y: 0, w: 0, h: 0 };
  let cajas: Caja[] = [];
  let n = 0;
  let sucio = true;
  let medidoEn = -Infinity;

  const textoDinero = document.createRange();
  const medir = (t: number): void => {
    sucio = false;
    medidoEn = t;
    cab = caja(top.getBoundingClientRect());
    const borde = parseFloat(getComputedStyle(picado).borderTopWidth) || 0;
    const p = picado.getBoundingClientRect();
    pic = { x: p.left, y: p.top + borde, w: p.width, h: p.height - borde };
    const lista: Caja[] = [];
    for (const el of top.querySelectorAll('h1, .icon-btn, .rate, .recipes')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0) lista.push(caja(r));
    }
    const dinero = top.querySelector('.money');
    if (dinero) {
      textoDinero.selectNodeContents(dinero);
      const r = textoDinero.getBoundingClientRect();
      if (r.width > 0) lista.push({ x: r.left, y: r.top, w: r.width + MARGEN_DINERO, h: r.height });
    }
    // Títulos de sección que caen sobre el patrón (DESIGN.md "Fondo": --muted ≥ 5:1).
    for (const el of document.querySelectorAll('.section-title')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.bottom > 0 && r.top < vh) lista.push(caja(r));
    }
    cajas = lista;
  };

  const dprPagina = (): number => Math.min(window.devicePixelRatio || 1, 2);
  const dprCabeza = (): number => window.devicePixelRatio || 1;

  let sacudidaEn = -Infinity;
  /** Sacudida pedida en pausa: arranca con el primer cuadro animado (si no, ya habría decaído). */
  let sacudidaPendiente = false;
  /**
   * Reloj propio de la animación (ms): solo avanza mientras anima, así al cerrar un diálogo o volver a
   * la pestaña el confeti sigue donde estaba en vez de saltar. Las posiciones son función cerrada de él.
   */
  let ultimoT = 0;
  let ultimoReal = 0;
  /** Escala bitmap/CSS de cada canvas (ver ajustar()). */
  let kPagina = { kx: 1, ky: 1 };
  let kCabeza = { kx: 1, ky: 1 };

  const pintarConfeti = (ctx: CanvasRenderingContext2D, ox: number, oy: number, alto: number): void => {
    for (let i = 0; i < n; i++) {
      const p = piezas[i];
      if (!p) continue;
      const { x, y } = posicion(p, ultimoT, vw, vh);
      if (y < oy - CERCA || y > oy + alto + CERCA) continue;
      const s = escalaCerca(x, y, cajas);
      if (s <= 0) continue;
      const giro = p.fase + ultimoT * p.rz;
      const sx = Math.cos(p.fase + ultimoT * p.rx) * s;
      const sy = Math.cos(p.fase * 1.3 + ultimoT * p.ry) * s;
      const c = Math.cos(giro);
      const sn = Math.sin(giro);
      ctx.fillStyle = colores[p.color] ?? '#fff';
      ctx.save();
      ctx.transform(c * sx, sn * sx, -sn * sy, c * sy, x - ox, y - oy);
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
  };

  const pintarPicado = (ctx: CanvasRenderingContext2D): void => {
    const e = escalaPicado(pic.w, pic.h);
    const ancho = BANDERIN_W * e;
    const cuantos = Math.min(BANDERINES, Math.ceil(pic.w / ancho));
    const x0 = pic.x - cab.x;
    const y0 = pic.y - cab.y;
    for (let i = 0; i < cuantos; i++) {
      const { giro, baja } = giroBanderin(i, ultimoT, sacudidaEn);
      ctx.fillStyle = colores[i % TOKENS.length] ?? '#fff';
      // Cuelga de la cuerda por el centro de su borde superior: gira y se tuerce desde ahí.
      ctx.save();
      ctx.translate(x0 + ancho * (i + 0.5), y0 + baja);
      ctx.rotate(giro);
      ctx.transform(1, 0, giro * 0.5, 1, 0, 0);
      ctx.scale(e, e);
      ctx.translate(-BANDERIN_W / 2, 0);
      ctx.fill(banderin, 'evenodd');
      ctx.restore();
    }
  };

  const dibujar = (): void => {
    if (sucio || ultimoT - medidoEn > 1000) medir(ultimoT);
    // Página: todo el viewport (lo que cae bajo el header no se ve: el header es opaco). Se dibuja en px CSS.
    const p = pagina.ctx;
    p.setTransform(1, 0, 0, 1, 0, 0);
    p.clearRect(0, 0, pagina.canvas.width, pagina.canvas.height);
    p.setTransform(kPagina.kx, 0, 0, kPagina.ky, 0, 0);
    pintarConfeti(p, 0, 0, vh);
    // Header: el confeti de su franja (recortado a su alto: la cola es solo para los banderines) y el picado.
    const c = cabeza.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, cabeza.canvas.width, cabeza.canvas.height);
    c.setTransform(kCabeza.kx, 0, 0, kCabeza.ky, 0, 0);
    c.save();
    c.beginPath();
    c.rect(0, 0, cab.w, cab.h);
    c.clip();
    pintarConfeti(c, cab.x, cab.y, cab.h);
    c.restore();
    pintarPicado(c);
  };

  // ---------- Ciclo ----------
  let raf = 0;
  let ultimoCuadro = -Infinity;
  const estado = (): void => {
    html.dataset['fondo'] = pausado() ? 'pausa' : 'activo';
  };
  const cuadro = (t: number): void => {
    raf = 0;
    if (pausado()) {
      estado();
      return; // sin otro rAF: reanudar() lo pide al cerrar el diálogo o volver a la pestaña
    }
    if (t - ultimoCuadro >= 1000 / FPS - 2) {
      ultimoCuadro = t;
      ultimoT += ultimoReal ? Math.min(t - ultimoReal, 100) : 0;
      ultimoReal = t;
      if (sacudidaPendiente) {
        sacudidaPendiente = false;
        sacudidaEn = ultimoT;
      }
      dibujar();
    }
    raf = requestAnimationFrame(cuadro);
  };
  const reanudar = (): void => {
    if (!html.dataset['fondo']) return; // aún sin el primer cuadro o ya desmontado
    estado();
    if (!raf && !pausado()) {
      ultimoReal = 0; // el tiempo en pausa no cuenta
      raf = requestAnimationFrame(cuadro);
    }
  };
  /** Cuadro quieto: cambiar el tamaño del canvas lo borra, y en pausa nadie volvería a pintarlo. */
  const repintar = (): void => {
    sucio = true;
    dibujar();
  };

  const tamPagina = (): void => {
    const r = pagina.canvas.getBoundingClientRect();
    vw = r.width;
    vh = r.height;
    n = densidad(vw, vh);
    kPagina = ajustar(pagina.canvas, vw, vh, dprPagina());
  };
  const tamCabeza = (): void => {
    const r = top.getBoundingClientRect();
    kCabeza = ajustar(cabeza.canvas, r.width, r.height + COLA, dprCabeza());
  };
  const roPagina = new ResizeObserver(() => {
    tamPagina();
    repintar();
  });
  const roCabeza = new ResizeObserver(() => {
    tamCabeza();
    repintar();
  });
  const ensuciar = (): void => {
    sucio = true;
  };
  const alVolver = (): void => reanudar();
  const tema = window.matchMedia('(prefers-color-scheme: dark)');
  const alTema = (): void => {
    leerColores();
    repintar();
  };
  // Cambio de DPR sin cambio de tamaño (otra pantalla, zoom): el ResizeObserver no salta.
  let resolucion: MediaQueryList | null = null;
  const alResolucion = (): void => {
    resolucion?.removeEventListener('change', alResolucion);
    resolucion = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    resolucion.addEventListener('change', alResolucion);
    if (!html.dataset['fondo']) return; // al registrar: aún no hay nada que redimensionar
    tamPagina();
    tamCabeza();
    repintar();
  };

  // Al DOM al final: si algo de arriba falla, no quedan canvas huérfanos.
  document.body.prepend(pagina.canvas);
  top.prepend(cabeza.canvas);
  alResolucion();
  tamPagina();
  tamCabeza();
  roPagina.observe(pagina.canvas);
  roCabeza.observe(top);
  window.addEventListener('scroll', ensuciar, { passive: true });
  window.addEventListener('resize', ensuciar);
  document.addEventListener('visibilitychange', alVolver);
  tema.addEventListener('change', alTema);
  pagina.canvas.addEventListener('contextrestored', repintar);
  cabeza.canvas.addEventListener('contextrestored', repintar);
  void document.fonts?.ready.then(ensuciar);

  // Primer cuadro (también si se monta en pausa, p. ej. al encenderlo desde Ajustes) y luego el estado.
  repintar();
  estado();
  if (!pausado()) raf = requestAnimationFrame(cuadro);

  return {
    sacudir() {
      if (pausado()) sacudidaPendiente = true;
      else sacudidaEn = ultimoT;
    },
    reanudar,
    destroy() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      delete html.dataset['fondo']; // primero: vuelven los banderines del svg
      roPagina.disconnect();
      roCabeza.disconnect();
      window.removeEventListener('scroll', ensuciar);
      window.removeEventListener('resize', ensuciar);
      document.removeEventListener('visibilitychange', alVolver);
      tema.removeEventListener('change', alTema);
      resolucion?.removeEventListener('change', alResolucion);
      for (const { canvas } of [pagina, cabeza]) {
        canvas.width = 0; // WebKit tarda en soltar la memoria de un canvas quitado
        canvas.height = 0;
        canvas.remove();
      }
    },
  };
}
