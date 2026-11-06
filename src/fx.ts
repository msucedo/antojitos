/**
 * Efectos visuales efímeros con Web Animations API. Solo transform/opacity.
 * Con prefers-reduced-motion no se crea nada. Los nodos se quitan al terminar.
 */
const MAX_COINS = 8;
const CONFETTI_PIECES = 40;
const CONFETTI_COLORS = ['fx-pink', 'fx-corn', 'fx-nopal'] as const;

let activeCoins = 0;
let confettiActive = false;

function reducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function done(anim: Animation, cleanup: () => void): void {
  anim.finished.then(cleanup, cleanup);
}

/** "+$X" que sube desde `anchor`. */
export function coin(anchor: Element, text: string): void {
  if (reducedMotion() || activeCoins >= MAX_COINS) return;
  const r = anchor.getBoundingClientRect();
  const el = document.createElement('span');
  el.className = 'fx-coin';
  el.textContent = text;
  el.setAttribute('aria-hidden', 'true');
  el.style.left = `${r.left + r.width / 2}px`;
  el.style.top = `${r.top}px`;
  document.body.append(el);
  activeCoins++;
  const anim = el.animate(
    [
      { transform: 'translate(-50%, 0) scale(0.9)', opacity: 0 },
      { transform: 'translate(-50%, -12px) scale(1)', opacity: 1, offset: 0.2 },
      { transform: 'translate(-50%, -56px) scale(1)', opacity: 0 },
    ],
    { duration: 900, easing: 'ease-out' },
  );
  done(anim, () => {
    el.remove();
    activeCoins--;
  });
}

/** Entrada de un bocadillo: aparece con un pequeño salto. */
export function pop(el: Element): void {
  if (reducedMotion()) return;
  el.animate(
    [
      { transform: 'scale(0.9)', opacity: 0 },
      { transform: 'scale(1)', opacity: 1 },
    ],
    { duration: 180, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1.2)' },
  );
}

/** Rebote corto para confirmar una acción. */
export function pulse(el: Element): void {
  if (reducedMotion()) return;
  el.animate([{ transform: 'scale(1)' }, { transform: 'scale(0.93)' }, { transform: 'scale(1)' }], {
    duration: 180,
    easing: 'ease-out',
  });
}

/** Lluvia de papel picado. */
export function confetti(): void {
  if (reducedMotion() || confettiActive) return;
  confettiActive = true;
  const layer = document.createElement('div');
  layer.className = 'fx-layer';
  layer.setAttribute('aria-hidden', 'true');
  document.body.append(layer);
  const w = window.innerWidth;
  const h = window.innerHeight;
  const anims: Promise<unknown>[] = [];
  for (let i = 0; i < CONFETTI_PIECES; i++) {
    const p = document.createElement('span');
    p.className = `fx-piece ${CONFETTI_COLORS[i % CONFETTI_COLORS.length]}`;
    layer.append(p);
    const x = Math.random() * w;
    const drift = (Math.random() - 0.5) * 120;
    const spin = (Math.random() - 0.5) * 720;
    const anim = p.animate(
      [
        { transform: `translate(${x}px, -20px) rotate(0deg)`, opacity: 1 },
        { transform: `translate(${x + drift}px, ${h + 20}px) rotate(${spin}deg)`, opacity: 0.9 },
      ],
      { duration: 1600 + Math.random() * 900, delay: Math.random() * 300, easing: 'cubic-bezier(.2,.6,.4,1)' },
    );
    anims.push(anim.finished.catch(() => undefined));
  }
  void Promise.all(anims).then(() => {
    layer.remove();
    confettiActive = false;
  });
}

/**
 * Golpe de sello: el retrato del gerente cae sobre la tarjeta (más grande y girado, luego asienta).
 * Termina en los valores del CSS de .card-mark para que no salte al soltar.
 */
export function stamp(el: Element): void {
  if (reducedMotion()) return;
  const opacity = getComputedStyle(el).opacity;
  el.animate(
    [
      { transform: 'rotate(-14deg) scale(1.35)', opacity: 0 },
      { transform: 'rotate(-6deg) scale(1)', opacity },
    ],
    { duration: 220, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
  );
}

/** La cara nueva de un disco entra girando sobre el eje horizontal (el contenido ya cambió). */
export function flip(el: Element): void {
  if (reducedMotion()) return;
  el.animate([{ transform: 'perspective(240px) rotateX(90deg)' }, { transform: 'perspective(240px) rotateX(0)' }], {
    duration: 220,
    easing: 'cubic-bezier(0.2, 0.8, 0.2, 1.2)',
  });
}

/**
 * Recompensa del icono de vender: se tilda a la derecha y vuelve. `suave` (ciclos muy cortos, que
 * tildan cada segundo) baja el ángulo y la duración. Un tilt nuevo reemplaza al que corre.
 */
export function tilt(el: Element, suave = false): void {
  if (reducedMotion()) return;
  for (const a of el.getAnimations()) if (a.id === 'tilt') a.cancel();
  const deg = suave ? 4 : 8;
  const anim = el.animate(
    [{ transform: 'rotate(0)' }, { transform: `rotate(${deg}deg)`, offset: 0.35 }, { transform: 'rotate(0)' }],
    { duration: suave ? 200 : 320, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1.2)' },
  );
  anim.id = 'tilt';
}

/**
 * Cierre de una vuelta de la barra: el relleno, todavía lleno, se desvanece en un solo gesto y se
 * queda invisible (`fill: 'forwards'`) hasta que quien lo llamó lo cancela en el mismo frame en que
 * la barra salta a su progreso real; así no asoma lleno entre el final y el salto. Uno nuevo
 * reemplaza al que corre.
 */
export function completar(fill: Element, ms: number): void {
  if (reducedMotion()) return;
  for (const a of fill.getAnimations()) if (a.id === 'completar') a.cancel();
  const anim = fill.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: ms,
    easing: 'ease-in-out',
    fill: 'forwards',
  });
  anim.id = 'completar';
}

/** Tras el cierre, el relleno reaparece suave en su progreso (vuelta de empleado: ya avanzó un poco). */
export function aparecer(fill: Element): void {
  if (reducedMotion()) return;
  const anim = fill.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
  anim.id = 'completar';
}

/** Contenido de una pestaña que entra desde el lado por el que se cambió (`dir` 1 = derecha). */
export function deslizar(el: Element, dir: 1 | -1): void {
  if (reducedMotion()) return;
  el.animate(
    [
      { transform: `translateX(${dir * 28}px)`, opacity: 0 },
      { transform: 'translateX(0)', opacity: 1 },
    ],
    { duration: 320, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
  );
}
