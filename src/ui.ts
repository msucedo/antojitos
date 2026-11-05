import { BUSINESSES, CHELO, type BusinessDef, type CheloEvent, type ManagerEvent } from './data';
import {
  canBuyUpgrade,
  canHireManager,
  costOf,
  getDef,
  getUpgrade,
  firstHireReady,
  hireableIds,
  incomePerSecond,
  nextMilestone,
  MODES,
  nextMode,
  nextUpgrades,
  pendingRecipes,
  quantityFor,
  revenuePerCycle,
  type BuyMode,
  type State,
} from './game';
import { formatDuration, formatMoney, formatNumber } from './format';
import { icon, setIcon, use, type IconName } from './icons';
import { portrait } from './characters';
import { coin, confetti, flip, pop, pulse, stamp } from './fx';

export interface Handlers {
  onStart(id: string): void;
  onBuy(id: string): void;
  onHire(id: string): void;
  onUpgrade(id: string): void;
  onMode(mode: BuyMode): void;
  onPrestige(): void;
  onToggleSound(): void;
  onToggleMusic(): void;
  /** Un panel del lateral se desliza (abre o cierra); main.ts le pone sonido. */
  onSlide(open: boolean): void;
  onImport(text: string): boolean;
  getExport(): string;
}

type Props = Partial<{
  class: string;
  text: string;
  type: string;
  label: string;
  hidden: boolean;
  onclick: () => void;
}>;

/** createElement + textContent: nunca HTML desde strings. */
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  children: Node[] = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  if (props.type) el.setAttribute('type', props.type);
  if (props.label) el.setAttribute('aria-label', props.label);
  if (props.hidden) el.hidden = true;
  if (props.onclick) el.addEventListener('click', props.onclick);
  el.append(...children);
  return el;
}

/** Escribe solo si cambió (evita trabajo de layout a 10 Hz). */
function setText(el: Element, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

function setDisabled(el: HTMLButtonElement, disabled: boolean): void {
  if (el.disabled !== disabled) el.disabled = disabled;
}

function setHidden(el: HTMLElement, hidden: boolean): void {
  if (el.hidden !== hidden) el.hidden = hidden;
}

function setPressed(el: Element, on: boolean): void {
  const v = String(on);
  if (el.getAttribute('aria-pressed') !== v) el.setAttribute('aria-pressed', v);
}

function setAttr(el: Element, name: string, value: string): void {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

/** Botón del menú lateral (solo visible en web): disco matasellos con icono y etiqueta debajo. */
function latBtn(
  label: string,
  name: IconName,
  onclick: () => void,
): { btn: HTMLButtonElement; ic: SVGSVGElement; disc: HTMLSpanElement; label: HTMLSpanElement } {
  const ic = icon(name);
  const disc = h('span', { class: 'lat-disc' }, [ic]);
  const text = h('span', { class: 'lat-label', text: label });
  const btn = h('button', { class: 'lat-btn', type: 'button', onclick }, [disc, text]);
  return { btn, ic, disc, label: text };
}

interface Card {
  def: BusinessDef;
  root: HTMLElement;
  sell: HTMLButtonElement;
  count: HTMLElement;
  fill: HTMLElement;
  info: HTMLElement;
  buy: HTMLButtonElement;
  /** Sello del gerente a todo el alto de la tarjeta; solo se ve con .managed. */
  mark: Element;
  bubble: HTMLElement;
  /** performance.now() hasta el que se ve el bocadillo (0 = oculto). */
  bubbleUntil: number;
}

interface UpgradeSlot {
  root: HTMLElement;
  art: SVGSVGElement;
  name: HTMLElement;
  effect: HTMLElement;
  buy: HTMLButtonElement;
  id: string | null;
}

/** Cupón de un gerente en el menú Empleados: ahí se contrata, no en la tarjeta. */
interface CharSlot {
  def: BusinessDef;
  root: HTMLElement;
  buy: HTMLButtonElement;
  state: HTMLElement;
}

/** Tiempo que un bocadillo queda a la vista. Sin temporizadores: lo decide render(). */
export const BUBBLE_MS = 6_000;
/** Banderines del papel picado: 48 × 24 px cubren hasta 1152 px de ancho. */
const FLAGS = 48;
const FLAG_W = 24;
const FLAG_H = 28;
const FLAG_COLORS = 4;

export function bubbleVisible(now: number, until: number): boolean {
  return now < until;
}

const modeLabel = (m: BuyMode) => (m === 'max' ? 'Máx' : `×${m}`);
const modeIcon = (m: BuyMode): IconName => (m === 'max' ? 'costal' : m === 10 ? 'monedas' : 'moneda');
const UPGRADE_SLOTS = 4;
const UPGRADE_LOCK_MS = 500;

function tipFor(s: State): string | null {
  const elotes = s.businesses.elotes;
  const managers = BUSINESSES.filter((d) => s.businesses[d.id]?.manager).length;
  if (pendingRecipes(s) > 0 && s.recipes === 0)
    return 'Ya puedes heredar: vuelves a empezar, pero con recetas que suben todas tus ventas.';
  if (s.lifetimeEarned > 0 || s.recipes > 0) {
    if (managers === 0 && canHireManager(s, 'elotes'))
      return `En Empleados contrata a ${getDef('elotes').manager.name}; ya te alcanza.`;
    if (managers === 0 && (elotes?.count ?? 0) < 5) return 'Compra más carritos: cada uno vende más por vuelta.';
    if (managers === 1 && (s.businesses.aguas?.count ?? 0) === 0)
      return 'Junta para un puesto de aguas frescas; deja más por vuelta.';
    if (s.upgrades.length === 0 && nextUpgrades(s, 1).some((u) => canBuyUpgrade(s, u.id)))
      return 'Ya te alcanza para una mejora: multiplica lo que vende un negocio.';
    return null;
  }
  return '¡Ándale, mijo! Toca el elote para hacer tu primera venta.';
}

function upgradeTarget(target: string): { art: IconName; label: string } {
  if (target === 'all') return { art: 'upgrade', label: 'Todos los negocios' };
  const def = getDef(target);
  return { art: def.icon, label: def.name };
}

export interface UI {
  render(s: State, mode: BuyMode, audio: { sound: boolean; music: boolean }): void;
  renderBars(s: State): void;
  announce(text: string): void;
  /** El gerente del negocio dice su frase del evento (bocadillo, 6 s). */
  say(id: string, kind: ManagerEvent): void;
  /** Doña Chelo reemplaza su tip por la frase del evento (6 s). */
  cheloSays(kind: CheloEvent): void;
  /** Efectos de confirmación (sin efecto con reduced-motion). */
  sold(id: string, amount: number): void;
  confirm(kind: 'buy' | 'hire' | 'upgrade', id: string): void;
  celebrate(): void;
  showOffline(earned: number, elapsedMs: number): void;
  showProblem(): void;
  showNoSave(): void;
  showUpdate(onReload: () => void): void;
}

export function showLocked(root: HTMLElement): void {
  root.replaceChildren(
    h('section', { class: 'locked' }, [
      icon('lock', 'icon locked-icon'),
      h('h1', { text: 'Ya está abierto en otra pestaña' }),
      h('p', { text: 'Cierra la otra pestaña y recarga esta para seguir jugando.' }),
      h('button', { class: 'btn primary', type: 'button', text: 'Recargar', onclick: () => location.reload() }),
    ]),
  );
}

/** Hilera de papel picado: un solo <svg> que se recorta a lo ancho sin deformar los banderines. */
function papelPicado(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'picado');
  svg.setAttribute('viewBox', `0 0 ${FLAGS * FLAG_W} ${FLAG_H}`);
  svg.setAttribute('preserveAspectRatio', 'xMinYMin slice');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (let i = 0; i < FLAGS; i++) {
    const u = use('banderin');
    u.setAttribute('x', String(i * FLAG_W));
    u.setAttribute('width', String(FLAG_W));
    u.setAttribute('height', String(FLAG_H));
    u.setAttribute('class', `f${(i % FLAG_COLORS) + 1}`);
    svg.append(u);
  }
  return svg;
}

function dialog(title: string, body: Node[], actions: HTMLButtonElement[] = []): HTMLDialogElement {
  // dialog: sombra y marco exterior; .modal-paper: la estampilla con la máscara perforada.
  const d = h('dialog', { class: 'modal' });
  const close = h('button', { class: 'btn', type: 'button', text: 'Cerrar', onclick: () => d.close() });
  d.append(
    h('div', { class: 'modal-paper' }, [
      h('h2', {}, [icon('banderin', 'icon flag sticker'), h('span', { text: title })]),
      ...body,
      h('div', { class: 'actions' }, [...actions, close]),
    ]),
  );
  d.setAttribute('aria-label', title);
  d.addEventListener('close', () => d.remove());
  document.body.append(d);
  // <dialog> nativo: atrapa el foco, inerte el fondo y cierra con Esc.
  d.showModal();
  return d;
}

/**
 * Mueve `body` a un diálogo modal y enfoca su h2: sin eso showModal enfoca "Cerrar" (o el primer
 * botón habilitado) y el diálogo abre desplazado al final. Al cerrar, `body` vuelve detrás de
 * `anchor` (su sitio en línea) y se avisa con `onClose`. Devuelve el h2, que el llamador guarda
 * como "diálogo abierto" y usa para el foco.
 */
function openInDialog(title: string, body: HTMLElement, anchor: HTMLElement, onClose: () => void): HTMLElement | null {
  const d = dialog(title, [body]);
  const h2 = d.querySelector('h2');
  if (h2) {
    h2.tabIndex = -1;
    h2.focus({ preventScroll: true });
    d.scrollTop = 0;
  }
  d.addEventListener('close', () => {
    anchor.after(body);
    onClose();
  });
  return h2;
}

export function createUI(root: HTMLElement, handlers: Handlers): UI {
  const money = h('p', { class: 'money' });
  const rate = h('p', { class: 'rate' });
  const recipesText = h('span');
  const recipes = h('p', { class: 'recipes', hidden: true }, [icon('recipe', 'icon icon-sm'), recipesText]);

  const soundIcon = icon('sound-off');
  const sound = h(
    'button',
    { class: 'icon-btn', type: 'button', label: 'Efectos de sonido', onclick: () => handlers.onToggleSound() },
    [soundIcon],
  );
  const musicIcon = icon('music-off');
  const musicBtn = h(
    'button',
    { class: 'icon-btn', type: 'button', label: 'Música', onclick: () => handlers.onToggleMusic() },
    [musicIcon],
  );
  const menu = h('button', { class: 'icon-btn', type: 'button', label: 'Respaldo', onclick: openMenu }, [icon('menu')]);
  // Personajes en móvil: icono en el header que abre la lista en un diálogo.
  const charsBadge = h('span', { class: 'lat-badge', hidden: true });
  charsBadge.setAttribute('aria-hidden', 'true');
  const charsBtn = h('button', { class: 'icon-btn', type: 'button', label: 'Empleados', onclick: openChars }, [
    icon('gente'),
    charsBadge,
  ]);

  // Menú lateral (web): copias de los controles del header y la barra; render() las sincroniza.
  const mq = window.matchMedia('(min-width: 900px)');
  const latUp = latBtn('Mejoras', 'upgrade', () => upPanel.toggle());
  const latChars = latBtn('Empleados', 'personajes', () => charsPanel.toggle());
  const latCharsBadge = h('span', { class: 'lat-badge', hidden: true });
  latCharsBadge.setAttribute('aria-hidden', 'true');
  latChars.disc.append(latCharsBadge);
  const latHeir = latBtn('Herencia', 'recipe', confirmPrestige);
  const latHeirBadge = h('span', { class: 'lat-badge', hidden: true });
  latHeir.disc.append(latHeirBadge);
  // Cantidad: un solo botón que cicla ×1 → ×10 → Máx; render() lo sincroniza con el segmentado móvil.
  let currentMode: BuyMode = 1; // mismo arranque que `mode` en main.ts: el primer render no hace flip
  const latModo = latBtn(modeLabel(currentMode), modeIcon(currentMode), () => handlers.onMode(nextMode(currentMode)));
  latModo.btn.setAttribute('aria-label', `Cantidad a comprar: ${modeLabel(currentMode)}`);
  const latMenu = latBtn('Respaldo', 'caja', openMenu);
  const latSound = latBtn('Sonido', 'bocina-off', () => handlers.onToggleSound());
  const latMusic = latBtn('Música', 'guitarra-off', () => handlers.onToggleMusic());
  /** [botón, icono, canal, icono encendido, icono apagado]: header y lateral, sincronizados en render(). */
  const audioBtns: [Element, SVGSVGElement, 'sound' | 'music', IconName, IconName][] = [
    [sound, soundIcon, 'sound', 'sound-on', 'sound-off'],
    [latSound.btn, latSound.ic, 'sound', 'bocina', 'bocina-off'],
    [musicBtn, musicIcon, 'music', 'music-on', 'music-off'],
    [latMusic.btn, latMusic.ic, 'music', 'guitarra', 'guitarra-off'],
  ];
  // Doña Chelo: disco con su retrato y punto de "consejo nuevo"; renderChelo() los sincroniza.
  const latCheloDot = h('span', { class: 'lat-dot', hidden: true });
  latCheloDot.setAttribute('aria-hidden', 'true');
  const latChelo = h('button', { class: 'lat-btn', type: 'button', label: CHELO.name, onclick: () => cheloPanel.toggle() }, [
    h('span', { class: 'lat-disc' }, [portrait(CHELO.id, 'lat-retrato'), latCheloDot]),
    h('span', { class: 'lat-label', text: 'Chelo' }),
  ]);
  const lateral = h('nav', { class: 'lateral', label: 'Menú' }, [
    latChelo,
    latUp.btn,
    latChars.btn,
    latModo.btn,
    latHeir.btn,
    latMenu.btn,
    latSound.btn,
    latMusic.btn,
  ]);

  const modeButtons = MODES.map((m) => {
    const b = h('button', { class: 'seg', type: 'button', text: modeLabel(m), onclick: () => handlers.onMode(m) });
    return { m, b };
  });
  const segmented = h(
    'div',
    { class: 'segmented', label: 'Cantidad a comprar' },
    modeButtons.map((x) => x.b),
  );
  segmented.setAttribute('role', 'group');

  const live = h('p', { class: 'sr-only' });
  live.setAttribute('aria-live', 'polite');

  // Doña Chelo: panel propio. renderChelo() decide el texto: frase de evento (6 s) > respuesta
  // elegida > consejo según la partida > reposo. Sin aria-live: announce() ya lee eventos y respuestas.
  let eventText = '';
  let eventUntil = 0;
  let answer: string | null = null;
  let lastTip: string | null = null;
  let unread = false;
  let autoCloseAt = 0; // panel abierto por un evento: se cierra solo salvo clic dentro
  let welcomed = false;
  let taught = false; // lección del primer empleado
  let guiaDialogTitle: HTMLElement | null = null;
  const guiaTexto = h('p', { class: 'guia-texto' });
  const guiaFaq = h(
    'ul',
    { class: 'guia-faq' },
    CHELO.faq.map((f) =>
      h('li', {}, [
        h('button', {
          class: 'btn',
          type: 'button',
          text: f.q,
          onclick: () => {
            eventUntil = 0; // la pregunta manda sobre la frase de evento en curso
            if ('id' in f) answer = null;
            else {
              answer = f.a;
              live.textContent = f.a;
            }
          },
        }),
      ]),
    ),
  );
  const guiaBody = h('div', { class: 'guia-body' }, [portrait(CHELO.id, 'guia-retrato'), guiaTexto, guiaFaq]);
  const guiaTitle = h('h2', { class: 'section-title', text: CHELO.name });
  guiaTitle.id = 'chelo-title';
  guiaTitle.tabIndex = -1;
  const guia = h('section', { class: 'guia panel' }, [guiaTitle, guiaBody]);
  guia.setAttribute('aria-labelledby', 'chelo-title');
  guia.id = 'chelo';
  // Clic o foco dentro (teclado): el jugador lo quiere ver, ya no se cierra solo.
  guia.addEventListener('click', () => (autoCloseAt = 0));
  guia.addEventListener('focusin', () => (autoCloseAt = 0));
  // Móvil: botón en la barra inferior que abre la guía en un diálogo.
  const guiaBtnDot = h('span', { class: 'lat-dot', hidden: true });
  guiaBtnDot.setAttribute('aria-hidden', 'true');
  const guiaBtn = h('button', { class: 'guia-btn', type: 'button', label: CHELO.name, onclick: openGuia }, [
    portrait(CHELO.id, 'lat-retrato'),
    guiaBtnDot,
  ]);
  const toast = h('div', { class: 'toast', hidden: true });
  toast.setAttribute('role', 'status');

  const cards: Card[] = BUSINESSES.map((def) => {
    const sell = h(
      'button',
      { class: 'sell', type: 'button', label: `Vender: ${def.name}`, onclick: () => handlers.onStart(def.id) },
      [icon('sello', 'icon sello sticker'), icon(def.icon, 'icon sell-icon sticker')],
    );
    const count = h('span', { class: 'count' });
    const fill = h('div', { class: 'fill' });
    const bar = h('div', { class: 'bar' }, [fill]);
    bar.setAttribute('aria-hidden', 'true');
    const info = h('p', { class: 'info' });
    const buy = h('button', { class: 'btn primary', type: 'button', onclick: () => handlers.onBuy(def.id) });
    // Sello del gerente: va al final del papel para quedar bajo el contenido (z-index -1 en la máscara).
    const mark = portrait(def.manager.id, 'icon card-mark', true);
    // Overlay: no entra en el flujo, así la tarjeta no crece ni se mueven los botones.
    const bubble = h('div', { class: 'bubble', hidden: true });
    bubble.setAttribute('aria-hidden', 'true');
    // li: sombra y ancla del bocadillo; .paper: la estampilla con la máscara perforada.
    const cardRoot = h('li', { class: 'card' }, [
      h('div', { class: 'paper' }, [
        sell,
        h('div', { class: 'body' }, [
          h('h2', { text: def.name }, [count]),
          bar,
          info,
          h('div', { class: 'row' }, [buy]),
        ]),
        mark,
      ]),
      bubble,
    ]);
    cardRoot.dataset.papel = def.papel;
    return { def, root: cardRoot, sell, count, fill, info, buy, mark, bubble, bubbleUntil: 0 };
  });

  const appTitle = h('h1', { text: 'Imperio de Antojitos' });
  appTitle.tabIndex = -1;
  let upgradeLockUntil = 0;
  let refocusAfterUpgrade = false;

  const slots: UpgradeSlot[] = Array.from({ length: UPGRADE_SLOTS }, () => {
    const art = icon('upgrade', 'icon up-icon sticker');
    const name = h('h3', { class: 'up-name' });
    const effect = h('p', { class: 'up-effect' });
    const slot: UpgradeSlot = { root: h('li'), art, name, effect, buy: h('button'), id: null };
    slot.buy = h('button', {
      class: 'btn primary',
      type: 'button',
      onclick: () => {
        // Bloqueo corto: al comprar, la siguiente mejora ocupa el mismo lugar y un
        // doble toque la compraría sin querer.
        const now = performance.now();
        if (!slot.id || now < upgradeLockUntil) return;
        upgradeLockUntil = now + UPGRADE_LOCK_MS;
        handlers.onUpgrade(slot.id);
      },
    });
    // li exterior: lleva la sombra (filter); el interior lleva la máscara perforada.
    slot.root = h('li', { class: 'up-slot' }, [h('div', { class: 'up-card' }, [art, name, effect, slot.buy])]);
    return slot;
  });
  const upgradesTitle = h('h2', { class: 'section-title', text: 'Mejoras' });
  upgradesTitle.id = 'upgrades-title';
  upgradesTitle.tabIndex = -1;
  const upgrades = h('section', { class: 'upgrades panel', hidden: true }, [
    upgradesTitle,
    h(
      'ul',
      { class: 'up-list' },
      slots.map((s) => s.root),
    ),
  ]);
  upgrades.setAttribute('aria-labelledby', 'upgrades-title');
  upgrades.id = 'upgrades';

  // Empleados: los 8 gerentes siempre, en cupones como las mejoras. render() pone el estado.
  let refocusAfterHire = false;
  const charSlots: CharSlot[] = BUSINESSES.map((def) => {
    const buy = h('button', { class: 'btn primary', type: 'button', onclick: () => handlers.onHire(def.id) });
    const state = h('p', { class: 'char-state', text: def.manager.genero === 'f' ? 'Contratada' : 'Contratado', hidden: true });
    const root = h('li', { class: 'up-slot' }, [
      h('div', { class: 'up-card char-card' }, [
        portrait(def.manager.id, 'icon char-portrait', true),
        h('h3', { class: 'up-name', text: def.manager.name }),
        h('p', { class: 'up-effect', text: def.name }),
        buy,
        state,
      ]),
    ]);
    return { def, root, buy, state };
  });
  const charList = h(
    'ul',
    { class: 'up-list' },
    charSlots.map((x) => x.root),
  );
  const charsTitle = h('h2', { class: 'section-title', text: 'Empleados' });
  charsTitle.id = 'personajes-title';
  charsTitle.tabIndex = -1;
  const chars = h('section', { class: 'personajes panel' }, [charsTitle, charList]);
  chars.setAttribute('aria-labelledby', 'personajes-title');
  chars.id = 'personajes';

  const prestigeBtn = h('button', { class: 'btn heir', type: 'button', onclick: confirmPrestige });
  const picado = papelPicado();
  picado.addEventListener('animationend', () => picado.classList.remove('shake'));

  // Orden: lateral (web), header, guía de Chelo, mejoras y personajes (en web, paneles
  // deslizantes), tarjetas, barra.
  root.replaceChildren(
    lateral,
    h('header', { class: 'top' }, [
      h('div', { class: 'title-row' }, [appTitle, h('div', {}, [musicBtn, sound, charsBtn, menu])]),
      money,
      h('div', { class: 'sub-row' }, [rate, recipes]),
      picado,
    ]),
    h('div', { class: 'layout' }, [
      guia,
      upgrades,
      chars,
      h('div', { class: 'col-main' }, [
        h(
          'ul',
          { class: 'list' },
          cards.map((c) => c.root),
        ),
      ]),
    ]),
    h('footer', { class: 'bottom' }, [
      h('div', { class: 'bottom-inner' }, [h('div', { class: 'bottom-row' }, [guiaBtn, segmented]), prestigeBtn]),
    ]),
    live,
    toast,
  );

  let last: State | null = null;

  // Paneles laterales (web): no modales, las tarjetas siguen vivas detrás; solo uno abierto a la
  // vez. En móvil las secciones están en línea u ocultas y .open no tiene reglas: solo tocan el estado.
  interface Panel {
    section: HTMLElement;
    toggle(): void;
    open(focus?: boolean): void;
    close(restore: boolean): void;
  }
  let activePanel: Panel | null = null;
  let switching = false; // open() cierra al activo: ese cierre no suena, solo la apertura
  /** Foco al botón del lateral; si está deshabilitado o en móvil, al título de la app. */
  function focusLateral(btn: HTMLButtonElement): void {
    (mq.matches && !btn.disabled ? btn : appTitle).focus({ preventScroll: true });
  }
  function sidePanel(section: HTMLElement, btn: HTMLButtonElement, title: HTMLElement): Panel {
    let focusFrame = 0;
    const panel: Panel = {
      section,
      toggle: () => (activePanel === panel ? panel.close(true) : panel.open()),
      open(focus = true) {
        if (section.hidden || activePanel === panel) return;
        switching = true;
        try {
          activePanel?.close(false); // el que cierra sale mientras este entra
        } finally {
          switching = false;
        }
        activePanel = panel;
        section.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
        handlers.onSlide(true);
        // Ya es visible (sin retardo al abrir); el frame deja que el navegador lo pinte antes de enfocar.
        // Una apertura automática (Chelo habla) no mueve el foco del jugador.
        if (focus) focusFrame = requestAnimationFrame(() => title.focus({ preventScroll: true }));
      },
      close(restore) {
        if (activePanel !== panel) return;
        activePanel = null;
        cancelAnimationFrame(focusFrame);
        section.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
        if (!switching) handlers.onSlide(false);
        // Si el foco seguía dentro del panel (teclado, o Safari que no enfoca al hacer clic), no se pierde.
        if (restore || section.contains(document.activeElement)) focusLateral(btn);
      },
    };
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', section.id);
    return panel;
  }
  const upPanel = sidePanel(upgrades, latUp.btn, upgradesTitle);
  const cheloPanel = sidePanel(guia, latChelo, guiaTitle);

  function openGuia(): void {
    if (guiaDialogTitle) return;
    guiaDialogTitle = openInDialog(CHELO.name, guiaBody, guiaTitle, () => {
      guiaDialogTitle = null;
    });
  }
  const charsPanel = sidePanel(chars, latChars.btn, charsTitle);

  // Personajes en móvil: la misma lista se mueve al diálogo y vuelve a su sección al cerrar.
  // Un solo DOM: render() sigue escribiendo en los mismos nodos mientras está abierto.
  let charsDialogTitle: HTMLElement | null = null;
  function openChars(): void {
    if (charsDialogTitle) return;
    charsDialogTitle = openInDialog('Empleados', charList, charsTitle, () => {
      charsDialogTitle = null;
    });
  }

  // Al cruzar los 900 px todo vuelve al estado en línea / cerrado: nada queda a medias.
  mq.addEventListener('change', () => {
    activePanel?.close(false);
    charsDialogTitle?.closest('dialog')?.close();
    guiaDialogTitle?.closest('dialog')?.close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !activePanel || document.querySelector('dialog[open]')) return;
    // Panel abierto solo (Chelo) con el foco fuera: Esc lo cierra sin mover el foco.
    activePanel.close(autoCloseAt === 0);
  });
  document.addEventListener('click', (e) => {
    if (!activePanel) return;
    const t = e.target;
    if (!(t instanceof Element) || activePanel.section.contains(t) || lateral.contains(t) || t.closest('dialog')) return;
    activePanel.close(false); // el clic sigue llegando a su destino
  });

  function confirmPrestige(): void {
    if (!last) return;
    const n = pendingRecipes(last);
    if (n === 0) return;
    const go = h('button', {
      class: 'btn heir',
      type: 'button',
      text: `Heredar (+${formatNumber(n)} recetas)`,
      onclick: () => {
        d.close();
        handlers.onPrestige();
      },
    });
    const d = dialog(
      'Herencia',
      [
        h('p', {
          text: `Le pasas el negocio a la familia: pierdes dinero, negocios, empleados y mejoras, pero ganas ${formatNumber(n)} recetas de la abuela.`,
        }),
        h('p', { text: 'Cada receta suma +2% a todas tus ventas, para siempre.' }),
      ],
      [go],
    );
  }

  function openMenu(): void {
    const code = h('textarea', { class: 'code' });
    code.readOnly = true;
    code.value = handlers.getExport();
    code.setAttribute('aria-label', 'Código de tu partida');
    const copy = h('button', {
      class: 'btn',
      type: 'button',
      text: 'Copiar',
      onclick: () => {
        code.select();
        navigator.clipboard?.writeText(code.value).then(
          () => setText(copy, '¡Copiado!'),
          () => setText(copy, 'Cópialo a mano'),
        );
      },
    });
    const input = h('textarea', { class: 'code' });
    input.setAttribute('aria-label', 'Pega aquí un código de partida');
    input.placeholder = 'Pega aquí un código de partida';
    const msg = h('p', { class: 'msg' });
    msg.setAttribute('role', 'status');
    const load = h('button', {
      class: 'btn primary',
      type: 'button',
      text: 'Cargar partida',
      onclick: () => {
        if (handlers.onImport(input.value)) d.close();
        else setText(msg, 'Ese código no es válido.');
      },
    });
    const d = dialog('Respaldo', [
      h('p', {
        text: 'Guarda este código en un lugar seguro. Si borras los datos del navegador, con él recuperas tu partida.',
      }),
      code,
      copy,
      h('h3', { text: 'Cargar una partida' }),
      h('p', { text: 'Reemplaza tu partida actual.' }),
      input,
      load,
      msg,
    ]);
  }

  function renderUpgrades(s: State): void {
    const next = nextUpgrades(s, UPGRADE_SLOTS);
    // Solo se muestran cuando ya hay algo ganado: al inicio no distraen del primer toque.
    const off = next.length === 0 || s.lifetimeEarned === 0;
    setHidden(upgrades, off);
    setDisabled(latUp.btn, off);
    if (off) upPanel.close(false);
    slots.forEach((slot, i) => {
      const u = next[i];
      setHidden(slot.root, !u);
      if (!u) {
        slot.id = null;
        return;
      }
      slot.id = u.id;
      const t = upgradeTarget(u.target);
      setIcon(slot.art, t.art);
      setText(slot.name, u.name);
      setText(slot.effect, `${t.label} ×${u.multiplier}`);
      setText(slot.buy, formatMoney(u.cost));
      slot.buy.setAttribute('aria-label', `Comprar ${u.name} por ${formatMoney(u.cost)}`);
      setDisabled(slot.buy, !canBuyUpgrade(s, u.id));
    });
  }

  function renderPersonajes(s: State): void {
    for (const slot of charSlots) {
      const b = s.businesses[slot.def.id];
      const owned = (b?.count ?? 0) > 0;
      const managed = b?.manager === true;
      const m = slot.def.manager;
      slot.root.classList.toggle('cerrado', !owned);
      setHidden(slot.buy, managed);
      setHidden(slot.state, !managed);
      if (managed) continue;
      if (owned) {
        setText(slot.buy, `Contratar · ${formatMoney(m.cost)}`);
        setAttr(slot.buy, 'aria-label', `Contratar a ${m.name} por ${formatMoney(m.cost)}`);
        setDisabled(slot.buy, !canHireManager(s, slot.def.id));
      } else {
        setText(slot.buy, 'Sin abrir');
        setAttr(slot.buy, 'aria-label', `Abre ${slot.def.name} para contratar a ${m.name}`);
        setDisabled(slot.buy, true);
      }
    }
    // Badge: cuántos se pueden contratar ahora; el conteo va al nombre accesible, no al badge.
    const n = hireableIds(s).length;
    const label = n > 0 ? `Empleados: ${n} por contratar` : 'Empleados';
    for (const [btn, badge] of [
      [latChars.btn, latCharsBadge],
      [charsBtn, charsBadge],
    ] as const) {
      setAttr(btn, 'aria-label', label);
      setHidden(badge, n === 0);
      setText(badge, String(n));
    }
    if (refocusAfterHire) {
      // El botón recién pulsado se ocultó: el foco va al título del diálogo (móvil) o del panel.
      refocusAfterHire = false;
      (charsDialogTitle ?? charsTitle).focus({ preventScroll: true });
    }
  }

  function renderChelo(s: State, now: number): void {
    const abierto = activePanel === cheloPanel || guiaDialogTitle !== null;
    if (abierto) unread = false;
    else {
      answer = null; // la respuesta elegida dura lo que el panel
      autoCloseAt = 0;
    }
    if (autoCloseAt && now >= autoCloseAt) {
      autoCloseAt = 0;
      cheloPanel.close(false);
    }
    const consejo = tipFor(s);
    const tip = consejo ?? CHELO.idle;
    // Punto solo con consejo nuevo de verdad: ni en el primer render, ni al volver de un evento,
    // ni al quedarse sin consejo (reposo).
    if (lastTip !== null && tip !== lastTip && !abierto && consejo !== null) unread = true;
    lastTip = tip;
    // Lección: la primera vez que alcanza para un empleado, Chelo explica para qué sirve (6 s) y
    // luego queda el consejo de dónde contratarlo. Se abre sola, también en móvil, pero nunca sobre
    // otro panel, diálogo o frase de evento en curso (espera a que terminen) y no se cierra sola.
    // Una vez por sesión. Va antes de calcular `text` para que el panel abra ya con la frase.
    if (!taught && firstHireReady(s) && !bubbleVisible(now, eventUntil)) {
      const modal = document.querySelector('dialog[open]') !== null;
      const libre = mq.matches ? activePanel === null && !modal : !modal;
      if (abierto || libre) {
        eventText = CHELO.says.empleado;
        eventUntil = now + BUBBLE_MS;
        answer = null;
        unread = false;
        autoCloseAt = 0; // si el panel estaba abierto por un evento, ya no se cierra solo
        live.textContent = `${CHELO.name}: ${eventText}`;
        if (!abierto) {
          if (mq.matches) cheloPanel.open(false);
          else openGuia();
        }
        taught = true;
      }
    }
    const text = bubbleVisible(now, eventUntil) ? eventText : (answer ?? tip);
    if (guiaTexto.textContent !== text) {
      guiaTexto.textContent = text;
      if (abierto) pop(guiaTexto);
    }
    const label = unread ? `${CHELO.name}: consejo nuevo` : CHELO.name;
    for (const [btn, dot] of [
      [latChelo, latCheloDot],
      [guiaBtn, guiaBtnDot],
    ] as const) {
      setHidden(dot, !unread);
      setAttr(btn, 'aria-label', label);
    }
    // Bienvenida: en partida nueva el primer consejo se muestra sin que haya que buscarlo.
    if (!welcomed) {
      welcomed = true;
      if (s.lifetimeEarned === 0 && s.recipes === 0) {
        if (mq.matches) cheloPanel.open(false);
        else if (!document.querySelector('dialog[open]')) openGuia(); // nunca dos modales
      }
    }
  }

  return {
    render(s, mode, audio) {
      last = s;
      setText(money, formatMoney(s.money));
      const ips = incomePerSecond(s);
      setText(rate, ips > 0 ? `${formatMoney(ips)}/s con empleados` : 'Sin empleados todavía');
      setHidden(recipes, s.recipes === 0);
      setText(recipesText, `${formatNumber(s.recipes)} recetas (+${formatNumber(s.recipes * 2)}%)`);

      for (const [btn, ic, canal, onName, offName] of audioBtns) {
        const on = audio[canal];
        setPressed(btn, on);
        setIcon(ic, on ? onName : offName);
      }

      for (const { m, b } of modeButtons) setPressed(b, m === mode);
      if (mode !== currentMode) {
        currentMode = mode;
        setIcon(latModo.ic, modeIcon(mode));
        setText(latModo.label, modeLabel(mode));
        latModo.btn.setAttribute('aria-label', `Cantidad a comprar: ${modeLabel(mode)}`);
        flip(latModo.disc);
      }
      const now = performance.now();
      renderChelo(s, now);

      renderUpgrades(s);
      if (refocusAfterUpgrade) {
        // El botón comprado ahora muestra otra mejora (o desapareció): el foco va a un
        // lugar estable en vez de perderse o caer sobre una compra que no se pidió.
        refocusAfterUpgrade = false;
        if (upgrades.hidden) focusLateral(latUp.btn);
        else upgradesTitle.focus({ preventScroll: true });
      }
      renderPersonajes(s);

      let lockedShown = false;
      for (const c of cards) {
        const b = s.businesses[c.def.id];
        if (!b) continue;
        // Muestra los negocios ya comprados y solo el siguiente bloqueado.
        const show = b.count > 0 || !lockedShown;
        if (b.count === 0) lockedShown = true;
        setHidden(c.root, !show);
        if (!show) continue;

        const owned = b.count > 0;
        c.root.classList.toggle('owned', owned);
        setText(c.count, owned ? ` · ${formatNumber(b.count)}` : '');
        setDisabled(c.sell, !owned || b.running || b.manager);

        const next = nextMilestone(b.count);
        const per = owned
          ? `${formatMoney(revenuePerCycle(s, c.def.id))} cada ${formatDuration(c.def.cycleMs)}`
          : 'Bloqueado';
        setText(c.info, next !== null && owned ? `${per} · ×2 a las ${next}` : per);

        const q = quantityFor(s, c.def.id, mode);
        const k = q > 0 ? q : mode === 'max' ? 1 : mode;
        setText(
          c.buy,
          `${owned ? 'Comprar' : 'Abrir'} ×${formatNumber(k)} · ${formatMoney(costOf(c.def, b.count, k))}`,
        );
        setDisabled(c.buy, q === 0);

        c.root.classList.toggle('managed', b.manager);

        setHidden(c.bubble, !bubbleVisible(now, c.bubbleUntil));
      }

      const n = pendingRecipes(s);
      const heirLabel = n > 0 ? `Heredar · +${formatNumber(n)} recetas` : 'Herencia: sigue vendiendo';
      for (const b of [prestigeBtn, latHeir.btn]) {
        setHidden(b, n === 0 && s.recipes === 0);
        setDisabled(b, n === 0);
      }
      setText(prestigeBtn, heirLabel);
      if (latHeir.btn.getAttribute('aria-label') !== heirLabel) latHeir.btn.setAttribute('aria-label', heirLabel);
      setHidden(latHeirBadge, n === 0);
      setText(latHeirBadge, `+${formatNumber(n)}`);
    },

    renderBars(s) {
      for (const c of cards) {
        const b = s.businesses[c.def.id];
        if (!b || c.root.hidden) continue;
        const p = b.count > 0 && (b.running || b.manager) ? Math.min(b.progressMs / c.def.cycleMs, 1) : 0;
        c.fill.style.transform = `scaleX(${p})`;
      }
    },

    announce(text) {
      live.textContent = text;
    },

    say(id, kind) {
      const c = cards.find((x) => x.def.id === id);
      if (!c) return;
      setText(c.bubble, c.def.manager.says[kind]);
      c.bubbleUntil = performance.now() + BUBBLE_MS;
      setHidden(c.bubble, false);
      pop(c.bubble);
    },

    cheloSays(kind) {
      eventText = CHELO.says[kind];
      eventUntil = performance.now() + BUBBLE_MS;
      answer = null;
      if (activePanel === cheloPanel || guiaDialogTitle !== null) return;
      // Web: se abre solo si no tapa otro panel y sin robar el foco; se cierra con la frase.
      // Móvil: el diálogo es modal, así que solo se avisa con el punto (announce lee la frase).
      if (mq.matches && activePanel === null && !document.querySelector('dialog[open]')) {
        // Un frame después: el evento llega dentro del clic que lo causó y el cierre por
        // "clic fuera" cerraría el panel en ese mismo instante.
        requestAnimationFrame(() => {
          if (activePanel !== null || document.querySelector('dialog[open]')) {
            unread = true;
            return;
          }
          cheloPanel.open(false);
          autoCloseAt = eventUntil;
        });
      } else unread = true;
    },

    sold(id, amount) {
      const c = cards.find((x) => x.def.id === id);
      if (c) coin(c.sell, `+${formatMoney(amount)}`);
    },

    confirm(kind, id) {
      if (kind === 'upgrade') {
        // Se anima lo que cambió de verdad: el ingreso de los negocios afectados.
        const { target } = getUpgrade(id);
        for (const c of cards) if (!c.root.hidden && (target === 'all' || c.def.id === target)) pulse(c.info);
        if (slots.some((x) => x.buy === document.activeElement)) refocusAfterUpgrade = true;
        return;
      }
      const c = cards.find((x) => x.def.id === id);
      if (!c) return;
      if (kind === 'buy') {
        pulse(c.buy);
        return;
      }
      // Contratado: el sello cae sobre la tarjeta (se ve desde el render que pone .managed) y el
      // cupón del gerente cambia a "Contratado"/"Contratada".
      stamp(c.mark);
      const slot = charSlots.find((x) => x.def.id === id);
      if (slot) {
        if (slot.buy === document.activeElement) refocusAfterHire = true;
        pop(slot.state);
      }
    },

    celebrate() {
      // La partida se reinicia: ningún bocadillo sobrevive a la herencia.
      for (const c of cards) c.bubbleUntil = 0;
      eventUntil = 0;
      answer = null;
      autoCloseAt = 0;
      // Con reduced-motion no hay animationend y la clase se quedaría puesta: se reinicia a mano.
      picado.classList.remove('shake');
      void picado.getBoundingClientRect();
      picado.classList.add('shake');
      confetti();
    },

    showOffline(earned, elapsedMs) {
      dialog('¡Bienvenido de vuelta!', [
        h('p', { text: `Mientras no estabas (${formatDuration(elapsedMs)}), tus negocios vendieron:` }),
        h('p', { class: 'big', text: formatMoney(earned) }),
      ]);
    },

    showProblem() {
      dialog('Algo pasó con tu partida', [
        h('p', {
          text: 'No pudimos leer tu partida guardada. Recuperamos la mejor copia disponible; si tienes un código de respaldo, cárgalo desde el Menú.',
        }),
      ]);
    },

    showNoSave() {
      dialog('No se puede guardar', [
        h('p', {
          text: 'Tu navegador no deja guardar la partida (modo privado o almacenamiento lleno). Puedes jugar, pero el progreso se perderá al cerrar. Usa el Menú para copiar un código de respaldo.',
        }),
      ]);
    },

    showUpdate(onReload) {
      toast.replaceChildren(
        h('span', { text: 'Nueva versión disponible' }),
        h('button', { class: 'btn primary', type: 'button', text: 'Recargar', onclick: onReload }),
      );
      setHidden(toast, false);
    },
  };
}
