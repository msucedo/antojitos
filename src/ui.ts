import type { Sound } from './audio';
import { plato, type PlatoId } from './platos';
import {
  ANTIGUEDAD_MS,
  BUSINESSES,
  CHELO,
  ESTRELLA_BONO,
  PROPINA_ESPERA_MS,
  PROPINA_MS,
  PROPINA_MULT,
  RACHA_SEMANA,
  type BusinessDef,
  fraseDe,
  type CheloEvent,
  type ManagerEvent,
} from './data';
import {
  canBuyUpgrade,
  canHireManager,
  cicloMs,
  costOf,
  estrellas,
  getDef,
  getUpgrade,
  firstHireReady,
  heredadas,
  hireableIds,
  incomePerSecond,
  MODES,
  nextMilestone,
  nextMode,
  nextUpgrades,
  pendingRecipes,
  propinaActiva,
  propinaCosto,
  propinaLista,
  puedeDarPropina,
  quantityFor,
  revenuePerCycle,
  ventasConPropina,
  type BizState,
  type BuyMode,
  type State,
} from './game';
import { formatDuration, formatMoney, formatNumber, formatReloj, recetas } from './format';
import { icon, setIcon, tabla, use, type IconName } from './icons';
import { portrait } from './characters';
import { LOGROS, type LogroDef, type LogroIcono } from './logros';
import { diaDeSemana, estadoRacha, type Regalo } from './racha';
import { aparecer, coin, completar, confetti, deslizar, flip, pop, pulse, stamp, tilt } from './fx';

export interface Handlers {
  onStart(id: string): void;
  onBuy(id: string): void;
  onHire(id: string): void;
  onPropina(id: string): void;
  onUpgrade(id: string): void;
  onMode(mode: BuyMode): void;
  onPrestige(): void;
  onToggleSound(): void;
  onToggleMusic(): void;
  /** Sonidos que nacen en la UI (paneles, diálogos, preguntas, punto de Chelo); main.ts los toca. */
  onSound(kind: Sound): void;
  /** Se abrió el Álbum: todo lo desbloqueado queda visto (badge a cero). */
  onAlbumVisto(): void;
  /** Cobrar el regalo del día (botón del diálogo de racha o del panel de Chelo). */
  /** `mostradoEn`: hora con que el diálogo calculó el día (el botón de Chelo no la tiene). */
  onRacha(mostradoEn?: number): void;
  /** false: código inválido; 'bloqueado': solo lectura (guardado de una versión más nueva). */
  onImport(text: string): boolean | 'bloqueado';
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

const ORDINALES = ['primero', 'segundo', 'tercero', 'cuarto', 'quinto', 'sexto', 'séptimo'] as const;

/** Arte de una estampilla del Álbum: plato, retrato o símbolo del sprite, al tamaño del cupón. */
function logroArte(icono: LogroIcono): Element {
  if ('plato' in icono) return plato(icono.plato, 'icon up-icon');
  if ('retrato' in icono) return portrait(icono.retrato, 'icon up-icon', true, '44px');
  return icon(icono.sprite, 'icon up-icon sticker');
}

/** Filas de la Libreta (Álbum): etiqueta y valor desde el estado. Solo lectura. */
const LIBRETA: readonly { label: string; valor: (s: State) => string }[] = [
  { label: 'Ganado en total', valor: (s) => formatMoney(s.lifetimeEarned) },
  { label: 'Ganado esta partida', valor: (s) => formatMoney(s.runEarned) },
  { label: 'Mejor ingreso por segundo', valor: (s) => formatMoney(s.stats.maxPorSegundo) },
  { label: 'Ingreso por segundo ahora', valor: (s) => formatMoney(incomePerSecond(s)) },
  { label: 'Toques al plato', valor: (s) => formatNumber(s.stats.clics) },
  { label: 'Tiempo jugado', valor: (s) => formatDuration(s.stats.jugadoMs) },
  { label: 'Herencias', valor: (s) => formatNumber(s.stats.herencias) },
  { label: 'Recetas', valor: (s) => formatNumber(s.recipes) },
  { label: 'Empleados contratados', valor: (s) => formatNumber(s.stats.contratados) },
  {
    label: 'Estrellas ahora',
    valor: (s) =>
      formatNumber(
        BUSINESSES.reduce((n, d) => n + (s.businesses[d.id]?.manager ? estrellas(s.businesses[d.id]!) : 0), 0),
      ),
  },
  { label: 'Propinas dadas', valor: (s) => formatNumber(s.stats.propinas) },
  { label: 'Mejoras compradas', valor: (s) => formatNumber(s.stats.mejoras) },
  { label: 'Logros', valor: (s) => `${s.logros.length} de ${LOGROS.length}` },
  { label: 'Racha actual', valor: (s) => `${formatNumber(s.racha.dias)} ${s.racha.dias === 1 ? 'día' : 'días'}` },
  { label: 'Regalos recibidos', valor: (s) => formatNumber(s.stats.regalos) },
  { label: 'Recetas de regalo', valor: (s) => formatNumber(s.recetasRegalo) },
];

interface Card {
  def: BusinessDef;
  root: HTMLElement;
  sell: HTMLButtonElement;
  /** Imagen del plato: se tilda al vender (clic, ciclo manual o vuelta del empleado). */
  art: Element;
  count: HTMLElement;
  bar: HTMLElement;
  fill: HTMLElement;
  /** Hasta cuándo (performance.now) la barra se sostiene llena tras completar una vuelta. */
  llenoHasta: number;
  /** Vuelta de CICLO_RAPIDO_MS o menos (con los hitos): tilt suave. Lo pone renderBars. */
  rapido: boolean;
  /** Barra fija (`barraFija`): llena, rayas corriendo, "$X/s". Lo pone renderBars. */
  fija: boolean;
  /** Último tilt por vuelta de empleado: con barra fija se limita a uno por CICLO_RAPIDO_MS. */
  ultimoTilt: number;
  /** Línea bajo la barra: cuánto deja cada vuelta. */
  meta: HTMLElement;
  gana: HTMLElement;
  por: HTMLElement;
  buy: HTMLButtonElement;
  /** Sello del gerente a todo el alto de la tarjeta; solo se ve con .managed. */
  mark: Element;
  bubble: HTMLElement;
  /** performance.now() hasta el que se ve el bocadillo (0 = oculto). */
  bubbleUntil: number;
}

interface UpgradeSlot {
  root: HTMLElement;
  /** Plato raster del negocio (o el sprite `upgrade` para "todos"); se reemplaza al cambiar. */
  art: Element;
  artName: UpgradeArt;
  name: HTMLElement;
  effect: HTMLElement;
  buy: HTMLButtonElement;
  id: string | null;
}

/** Cupón de un gerente en el menú Empleados: ahí se contrata, no en la tarjeta. */
interface CharSlot {
  def: BusinessDef;
  root: HTMLElement;
  /** Precio del empleado, sobre el botón (el botón solo dice "Contratar"). */
  price: HTMLElement;
  /** Contratado: estrellas de antigüedad (role=img) en el lugar del precio. */
  estrellas: HTMLElement;
  stars: SVGSVGElement[];
  /** Barrita hacia la siguiente estrella (escala en X, como la .fill de las tarjetas). */
  antig: HTMLElement;
  /** Último transform escrito en `antig` (el navegador lo normaliza al leerlo: no se compara con style). */
  antigT: string;
  /** Contratar antes; Dar propina después (con aria-disabled en curso y en espera). */
  buy: HTMLButtonElement;
  state: HTMLElement;
  shownStars: number;
}

/** Tiempo que un bocadillo queda a la vista. Sin temporizadores: lo decide render(). */
export const BUBBLE_MS = 6_000;
/** Banderines del papel picado: 48 × 24 px cubren hasta 1152 px de ancho. */
const FLAGS = 48;
const FLAG_W = 24;
const FLAG_H = 28;
const FLAG_COLORS = 4;

/**
 * Vueltas efectivas (`cicloMs`: los hitos las parten) de hasta este largo dan una o más vueltas por
 * segundo: tildan suave y, con empleado, la barra se queda llena en vez de barrer (y sin cierre por
 * vuelta) y la tarjeta dice "$X/s".
 */
const CICLO_RAPIDO_MS = 1_000;

/**
 * Cierre de una vuelta: la barra se sostiene llena este tiempo mientras se desvanece
 * (`completar` en fx.ts); luego vuelve a su progreso real.
 */
const LLENO_MS = 300;

/**
 * Con barra fija, tilt por vuelta de empleado como mucho cada tanto. Algo menos que CICLO_RAPIDO_MS:
 * el elote (1 s exacto) llega cada 983–1017 ms según el frame y no debe perder tilts.
 */
const TILT_FIJA_MS = 900;

function cicloRapido(def: BusinessDef, count: number): boolean {
  return cicloMs(def, count) <= CICLO_RAPIDO_MS;
}

/** Con empleado y vuelta rápida: la barra queda llena con las rayas corriendo y se lee el /s. */
function barraFija(def: BusinessDef, b: BizState): boolean {
  return b.count > 0 && b.manager && cicloRapido(def, b.count);
}

function tiltCard(c: Card): void {
  tilt(c.art, c.rapido);
}

/** Vuelta completa: la barra se queda llena LLENO_MS y se desvanece. */
function llenar(c: Card): void {
  c.llenoHasta = performance.now() + LLENO_MS;
  completar(c.fill, LLENO_MS);
}

/** Termina o corta el cierre de vuelta: la barra vuelve a opacidad 1 en su progreso real. */
function soltar(c: Card): void {
  c.llenoHasta = 0;
  for (const a of c.fill.getAnimations()) if (a.id === 'completar') a.cancel();
}

export function bubbleVisible(now: number, until: number): boolean {
  return now < until;
}

const modeLabel = (m: BuyMode) => (m === 'max' ? 'Máx' : `×${m}`);
const modeIcon = (m: BuyMode): IconName => (m === 'max' ? 'costal' : m === 10 ? 'monedas' : 'moneda');
const UPGRADE_SLOTS = 4;
const UPGRADE_LOCK_MS = 500;
/** Chelo avisa del siguiente hito (vuelta ×2 más rápida) cuando faltan esto o menos unidades. */
const MILESTONE_TIP_FALTAN = 5;

function tipFor(s: State, regaloPendiente: boolean): string | null {
  if (regaloPendiente) return 'Tu regalo del día te espera: tócalo aquí abajo.';
  const elotes = s.businesses.elotes;
  const managers = BUSINESSES.filter((d) => s.businesses[d.id]?.manager).length;
  if (pendingRecipes(s) > 0 && heredadas(s) === 0)
    return 'Ya puedes heredar: vuelves a empezar, pero con recetas que suben todas tus ventas.';
  if (s.lifetimeEarned > 0 || s.recipes > 0) {
    if (managers === 0 && canHireManager(s, 'elotes'))
      return `En Empleados contrata a ${getDef('elotes').manager.name}; ya te alcanza.`;
    if (managers === 0 && (elotes?.count ?? 0) < 5) return 'Compra más carritos: cada uno vende más por vuelta.';
    if (managers === 1 && (s.businesses.aguas?.count ?? 0) === 0)
      return 'Junta para un puesto de aguas frescas; deja más por vuelta.';
    if (s.upgrades.length === 0 && nextUpgrades(s, 1).some((u) => canBuyUpgrade(s, u.id)))
      return 'Ya te alcanza para una mejora: multiplica lo que vende un negocio.';
    // Siguiente hito cercano: la tarjeta ya no lo escribe, lo cuenta Chelo.
    for (const d of BUSINESSES) {
      const count = s.businesses[d.id]?.count ?? 0;
      const m = count > 0 ? nextMilestone(d, count) : null;
      if (m !== null && m.count - count <= MILESTONE_TIP_FALTAN) {
        const efecto = m.efecto === 'velocidad' ? 'vende el doble de rápido' : 'vende el doble';
        return `Con ${m.count} de ${d.name} ${efecto}: te faltan ${m.count - count}.`;
      }
    }
    return null;
  }
  return '¡Ándale, mijo! Toca el elote para hacer tu primera venta.';
}

/** Arte de un cupón de mejora: el plato del negocio, o el sprite `upgrade` para "Todos los negocios". */
type UpgradeArt = PlatoId | 'upgrade';

function upgradeArt(art: UpgradeArt): Element {
  return art === 'upgrade' ? icon('upgrade', 'icon up-icon sticker') : plato(art, 'icon up-icon');
}

function upgradeTarget(target: string): { art: UpgradeArt; label: string } {
  if (target === 'all') return { art: 'upgrade', label: 'Todos los negocios' };
  const def = getDef(target);
  return { art: def.icon, label: def.name };
}

export interface UI {
  render(s: State, mode: BuyMode, audio: { sound: boolean; music: boolean }): void;
  renderBars(s: State): void;
  announce(text: string): void;
  /** El gerente del negocio dice su frase del evento (bocadillo, 6 s); en un hito, la del n-ésimo alcanzado. */
  say(id: string, kind: ManagerEvent, hito?: number): void;
  /** Doña Chelo reemplaza su tip por la frase del evento (6 s). */
  cheloSays(kind: CheloEvent): void;
  /** Efectos de confirmación (sin efecto con reduced-motion). */
  sold(id: string, amount: number): void;
  /** Un empleado completó una vuelta: el icono se tilda, sin moneda ni sonido. */
  turned(id: string): void;
  /** Se dio propina: el plato se tilda (el anuncio lo hace main.ts). */
  tipped(id: string): void;
  /** Hitos cruzados por tipo: "×2 rápido", "×2 ventas" o ambos (×4 con Máx que cruza dos…) suben desde el plato. */
  hito(id: string, velocidad: number, ventas: number): void;
  /** Logros recién desbloqueados: badge del Álbum y estampillas; `silencioso` al cargar (sin efectos). */
  logros(defs: readonly LogroDef[], silencioso: boolean): void;
  /**
   * Diálogo del regalo del día (`dia` de racha, lo que da hoy y mañana). Devuelve false sin abrir
   * si ya hay un modal: el llamador vuelve a intentar en el siguiente render.
   */
  showRacha(dia: number, hoy: Regalo, manana: Regalo, mostradoEn: number): boolean;
  /** Confeti y sacudida del papel picado, sin tocar bocadillos (celebrate() además reinicia). */
  fiesta(): void;
  /** La partida guardada es de una versión más nueva: se juega sin guardar hasta recargar. */
  showNewer(onReload: () => void): void;
  confirm(kind: 'buy' | 'hire' | 'upgrade', id: string): void;
  celebrate(): void;
  /** `estrellas`: nombres de los empleados que ganaron estrella mientras no estabas. */
  showOffline(earned: number, elapsedMs: number, estrellas: string[]): void;
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

export function createUI(root: HTMLElement, handlers: Handlers): UI {
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
    d.addEventListener('close', () => {
      d.remove();
      handlers.onSound('dialogClose');
    });
    document.body.append(d);
    // <dialog> nativo: atrapa el foco, inerte el fondo y cierra con Esc.
    d.showModal();
    handlers.onSound('dialogOpen');
    return d;
  }

  /**
   * Mueve `body` a un diálogo modal y enfoca su h2: sin eso showModal enfoca "Cerrar" (o el primer
   * botón habilitado) y el diálogo abre desplazado al final. Al cerrar, `body` vuelve detrás de
   * `anchor` (su sitio en línea) y se avisa con `onClose`. Devuelve el h2, que el llamador guarda
   * como "diálogo abierto" y usa para el foco.
   */
  function openInDialog(
    title: string,
    body: HTMLElement,
    anchor: HTMLElement,
    onClose: () => void,
  ): HTMLElement | null {
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

  const money = h('p', { class: 'money' });
  // "$X/s" a la vista; el lector oye "$X por segundo" (el "/s" se leería "barra s").
  const rateVisible = h('span');
  rateVisible.setAttribute('aria-hidden', 'true');
  const rateSr = h('span', { class: 'sr-only' });
  const rate = h('p', { class: 'rate', hidden: true }, [rateVisible, rateSr]);
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
  const latAlbum = latBtn('Álbum', 'album', () => {
    const abre = activePanel !== albumPanel;
    if (abre) setTab('logros'); // antes de abrir: así no dispara el marcado dos veces
    albumPanel.toggle();
    if (abre) {
      // Los ids se toman ahora (onAlbumVisto los marca vistos y render() actualiza `last` antes del rAF);
      // el marcado va en un rAF porque el panel entra en transición, como el foco en sidePanel.open.
      const nuevos = sinVer();
      requestAnimationFrame(() => {
        colocarIndicador(true);
        marcarNuevas(nuevos);
      });
      handlers.onAlbumVisto();
    } else limpiarNuevas();
  });
  const latAlbumBadge = h('span', { class: 'lat-badge', hidden: true });
  latAlbumBadge.setAttribute('aria-hidden', 'true');
  latAlbum.disc.append(latAlbumBadge);
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
  const latChelo = h(
    'button',
    { class: 'lat-btn', type: 'button', label: CHELO.name, onclick: () => cheloPanel.toggle() },
    [
      h('span', { class: 'lat-disc' }, [portrait(CHELO.id, 'lat-retrato', false, '42px'), latCheloDot]),
      h('span', { class: 'lat-label', text: 'Chelo' }),
    ],
  );
  const lateral = h('nav', { class: 'lateral', label: 'Menú' }, [
    latChelo,
    latUp.btn,
    latChars.btn,
    latAlbum.btn,
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
  /** Enciende el punto de "consejo nuevo"; suena solo al encenderse. */
  const markUnread = () => {
    if (unread) return;
    unread = true;
    handlers.onSound('tip');
  };
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
            handlers.onSound('ask');
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
  // Regalo del día sin cobrar (cerró el diálogo sin Recibir): botón al frente de las preguntas.
  const regaloLi = h('li', { hidden: true }, [
    h('button', {
      class: 'btn primary',
      type: 'button',
      text: 'Recibir regalo del día',
      onclick: () => handlers.onRacha(),
    }),
  ]);
  guiaFaq.prepend(regaloLi);
  const guiaBody = h('div', { class: 'guia-body' }, [
    portrait(CHELO.id, 'guia-retrato', false, '25vh'),
    guiaTexto,
    guiaFaq,
  ]);
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
    portrait(CHELO.id, 'lat-retrato', false, '36px'),
    guiaBtnDot,
  ]);
  const toast = h('div', { class: 'toast', hidden: true });
  toast.setAttribute('role', 'status');

  const cards: Card[] = BUSINESSES.map((def) => {
    const art = plato(def.icon, 'icon sell-icon');
    const sell = h(
      'button',
      {
        class: 'sell',
        type: 'button',
        label: `Vender: ${def.name}`,
        onclick: () => {
          handlers.onStart(def.id);
          const c = cards.find((x) => x.def.id === def.id);
          if (c) tiltCard(c);
        },
      },
      [art],
    );
    const count = h('span', { class: 'count' });
    // Rayas en su propia capa: con barra fija corren en bucle (barbería) solo con transform.
    const fill = h('div', { class: 'fill' }, [h('span', { class: 'rayas' })]);
    const bar = h('div', { class: 'bar' }, [fill]);
    bar.setAttribute('aria-hidden', 'true');
    const gana = h('strong', { class: 'gana' });
    const por = h('span', { class: 'por' });
    const meta = h('p', { class: 'meta' }, [count, gana, por]);
    const buy = h('button', { class: 'btn primary', type: 'button', onclick: () => handlers.onBuy(def.id) });
    // Sello del gerente: va al final del papel para quedar bajo el contenido (z-index -1 en la máscara).
    const mark = portrait(def.manager.id, 'icon card-mark', true);
    // Overlay anclado al cuerpo: no entra en el flujo, así la tarjeta no crece ni se mueven los
    // botones, y se coloca solo sobre el título sea cual sea el ancho del icono.
    const bubble = h('div', { class: 'bubble', hidden: true });
    bubble.setAttribute('aria-hidden', 'true');
    // Letrero colgante con el nombre: fuera de .paper (la máscara recortaría la mitad que sobresale).
    const letrero = h('h2', { class: 'letrero' }, [
      tabla(),
      icon('clavo', 'clavo izq'),
      icon('clavo', 'clavo der'),
      h('span', { class: 'nombre', text: def.name }),
    ]);
    // li: letrero y sombra; .paper: la estampilla con la máscara perforada.
    const cardRoot = h('li', { class: 'card' }, [
      letrero,
      h('div', { class: 'paper' }, [
        sell,
        h('div', { class: 'body' }, [bar, meta, h('div', { class: 'row' }, [buy]), bubble]),
        mark,
      ]),
    ]);
    cardRoot.dataset.papel = def.papel;
    return {
      def,
      root: cardRoot,
      sell,
      art,
      count,
      bar,
      fill,
      llenoHasta: 0,
      rapido: false,
      fija: false,
      ultimoTilt: 0,
      meta,
      gana,
      por,
      buy,
      mark,
      bubble,
      bubbleUntil: 0,
    };
  });

  const appTitle = h('h1', { text: 'Imperio de Antojitos' });
  appTitle.tabIndex = -1;
  let upgradeLockUntil = 0;
  let refocusAfterUpgrade = false;

  const slots: UpgradeSlot[] = Array.from({ length: UPGRADE_SLOTS }, () => {
    const art = upgradeArt('upgrade');
    const name = h('h3', { class: 'up-name' });
    const effect = h('p', { class: 'up-effect' });
    const slot: UpgradeSlot = { root: h('li'), art, artName: 'upgrade', name, effect, buy: h('button'), id: null };
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
  const charSlots: CharSlot[] = BUSINESSES.map((def) => {
    const buy = h('button', { class: 'btn primary', type: 'button' });
    // Un solo botón: contrata y, ya contratado, da propina. En curso o en espera va con
    // aria-disabled (no disabled) para que el foco no caiga a body; el clic se ignora.
    // Tras contratar, el mismo botón pasa a "Dar propina" en el siguiente frame: un doble toque
    // pagaría una propina sin querer. Bloqueo corto, como en Mejoras.
    let bloqueoHasta = 0;
    buy.addEventListener('click', () => {
      if (buy.getAttribute('aria-disabled') === 'true') return;
      const now = performance.now();
      if (buy.dataset.accion === 'propina') {
        if (now >= bloqueoHasta) handlers.onPropina(def.id);
        return;
      }
      bloqueoHasta = now + UPGRADE_LOCK_MS;
      handlers.onHire(def.id);
    });
    const price = h('p', { class: 'char-price', text: formatMoney(def.manager.cost) });
    price.setAttribute('aria-hidden', 'true'); // el precio ya va en el aria-label del botón
    const stars = [0, 1, 2].map(() => icon('estrella-off', 'icon estrella'));
    const antigFill = h('span', { class: 'antig-fill' });
    const antig = h('span', { class: 'antig' }, [antigFill]);
    antig.setAttribute('aria-hidden', 'true');
    const estrellasEl = h('span', { class: 'estrellas', hidden: true }, [
      h('span', { class: 'estrellas-fila' }, stars),
      antig,
    ]);
    estrellasEl.setAttribute('role', 'img');
    const state = h('p', { class: 'char-state', hidden: true }, [
      h('span', { class: 'sello-goma', text: def.manager.genero === 'f' ? 'Contratada' : 'Contratado' }),
    ]);
    const root = h('li', { class: 'up-slot' }, [
      h('div', { class: 'up-card char-card' }, [
        // El sello de "Contratado" cae sobre el retrato.
        h('div', { class: 'char-foto' }, [portrait(def.manager.id, 'icon char-portrait', true), state]),
        h('h3', { class: 'up-name', text: def.manager.name }),
        h('p', { class: 'up-effect', text: def.name }),
        h('div', { class: 'char-linea' }, [price, estrellasEl]),
        buy,
      ]),
    ]);
    return {
      def,
      root,
      price,
      estrellas: estrellasEl,
      stars,
      antig: antigFill,
      antigT: '',
      buy,
      state,
      shownStars: -1,
    };
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

  // Álbum: dos pestañas. Logros: una estampilla por logro (siempre las 25, bloqueadas en gris con su
  // pista); Libreta: los contadores. Los logros sin ver desde la última visita se marcan "Nuevo".
  interface Estampilla {
    def: LogroDef;
    root: HTMLElement;
    card: HTMLElement;
    nombre: HTMLElement;
    estado: HTMLElement;
    /** Marcador "Nuevo": lo que se anima al caer un logro a la vista (la tarjeta enmascarada se vería borrosa con scale). */
    nuevo: HTMLElement;
    lograda: boolean;
  }
  const resaltadas = new Set<string>(); // ids marcados "Nuevo" (antes de las estampillas: setEstado ya los consulta)
  function setEstado(e: Estampilla, lograda: boolean): void {
    e.lograda = lograda;
    e.root.classList.toggle('bloqueada', !lograda);
    if (lograda)
      e.estado.replaceChildren(document.createTextNode(e.def.logrado)); // qué se logró, no el +2 % repetido
    else {
      e.estado.replaceChildren(
        h('span', { class: 'sr-only', text: 'Bloqueado. ' }),
        document.createTextNode(e.def.pista),
      );
      desmarcar(e); // una partida importada con menos logros: lo que ya no está, no es nuevo
    }
  }
  const estampillas: Estampilla[] = LOGROS.map((def) => {
    const estado = h('p', { class: 'up-effect' });
    const nombre = h('h3', { class: 'up-name', text: def.nombre });
    // Sello de goma "Bloqueado" en diagonal sobre la estampilla, como el de "Contratado" (solo con .bloqueada).
    const sello = h('span', { class: 'sello-bloqueado' }, [h('span', { class: 'sello-goma', text: 'Bloqueado' })]);
    sello.setAttribute('aria-hidden', 'true'); // el sr-only de la pista ya lo dice
    const card = h('div', { class: 'up-card estampilla-card' }, [logroArte(def.icono), nombre, estado, sello]);
    const nuevo = h('span', { class: 'nuevo', text: 'Nuevo' });
    nuevo.setAttribute('aria-hidden', 'true'); // el sr-only del nombre ya lo dice
    // El marcador va después de la tarjeta enmascarada: el orden del árbol lo pinta encima.
    const root = h('li', { class: 'up-slot estampilla' }, [card, nuevo]);
    const e: Estampilla = { def, root, card, nombre, estado, nuevo, lograda: true };
    setEstado(e, false);
    return e;
  });

  // Logros nuevos: se marcan al abrir el Álbum (desde logrosVistos) o al caer con la pestaña Logros
  // a la vista, y se limpian al cerrar. Clase y texto se ponen en el acto, no en render().
  function marcar(e: Estampilla): void {
    if (resaltadas.has(e.def.id) || !e.lograda) return;
    resaltadas.add(e.def.id);
    e.root.classList.add('nueva');
    e.nombre.prepend(h('span', { class: 'sr-only', text: 'Nuevo. ' }));
  }
  function desmarcar(e: Estampilla): void {
    if (!resaltadas.delete(e.def.id)) return;
    e.root.classList.remove('nueva');
    e.nombre.querySelector('.sr-only')?.remove();
  }
  function limpiarNuevas(): void {
    for (const e of estampillas) desmarcar(e);
  }
  /** Ids sin ver según el último estado pintado. Tomarlos ANTES de onAlbumVisto (que los marca vistos). */
  const sinVer = (): string[] => (last ? last.logros.slice(last.logrosVistos) : []);
  /** Marca esos logros como nuevos y trae el primero a la vista. */
  function marcarNuevas(nuevos: readonly string[]): void {
    const ids = new Set(nuevos);
    let primera: Estampilla | null = null;
    for (const e of estampillas) {
      if (!ids.has(e.def.id)) continue;
      marcar(e);
      primera ??= e;
    }
    primera?.root.scrollIntoView({ block: 'nearest' });
  }

  const libretaFilas = LIBRETA.map((fila) => ({ fila, dd: h('dd') }));
  // Cada fila en su div (dl > div > dt + dd es válido): así el hover toma etiqueta y valor juntos.
  const libreta = h(
    'dl',
    { class: 'libreta' },
    libretaFilas.map(({ fila, dd }) => h('div', { class: 'fila' }, [h('dt', { text: fila.label }), dd])),
  );
  // Pestañas (patrón tablist sobre el segmentado): viajan al diálogo móvil dentro de albumBody.
  type Tab = 'logros' | 'libreta';
  let tabActiva: Tab = 'logros';
  const tabEls = (
    [
      {
        id: 'logros',
        titulo: 'Logros',
        contenido: h(
          'ul',
          { class: 'estampillas' },
          estampillas.map((e) => e.root),
        ),
      },
      { id: 'libreta', titulo: 'Libreta', contenido: libreta },
    ] as const
  ).map(({ id, titulo, contenido }) => {
    const btn = h('button', { class: 'tab', type: 'button', text: titulo, onclick: () => setTab(id, true) });
    btn.id = `album-tab-${id}`;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-controls', `album-panel-${id}`);
    const panel = h('div', {}, [contenido]);
    panel.id = `album-panel-${id}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', btn.id);
    return { id, btn, panel };
  });
  // "Logros | Libreta" en Rye, con un divisor de tinta entre ambas: hace de título del panel.
  const divisor = h('span', { class: 'tab-sep' });
  divisor.setAttribute('aria-hidden', 'true');
  // Subrayado de la activa: un solo indicador que se desliza y estira (transform) hasta la pestaña.
  const indicador = h('span', { class: 'tab-ind' });
  indicador.setAttribute('aria-hidden', 'true');
  const tablist = h('div', { class: 'tabs', label: 'Secciones del Álbum' }, [
    tabEls[0]!.btn,
    divisor,
    tabEls[1]!.btn,
    indicador,
  ]);
  /**
   * Coloca el subrayado bajo la pestaña activa; medir exige el Álbum en el layout (tras abrir, en un
   * rAF). Al abrir va sin transición: si no, se estiraría desde 1 px en x = 0 mientras el panel entra.
   */
  function colocarIndicador(sinAnimar = false): void {
    const btn = tabEls.find((t) => t.id === tabActiva)?.btn;
    if (!btn || btn.offsetWidth === 0) return;
    if (sinAnimar) indicador.style.transition = 'none';
    indicador.style.transform = `translateX(${btn.offsetLeft}px) scaleX(${btn.offsetWidth})`;
    if (sinAnimar) {
      void indicador.offsetWidth; // aplica el salto antes de devolver la transición
      indicador.style.transition = '';
    }
  }
  tablist.setAttribute('role', 'tablist');
  tablist.addEventListener('keydown', (ev) => {
    const n = tabEls.length;
    const i = tabEls.findIndex((t) => t.id === tabActiva);
    const destino =
      ev.key === 'ArrowRight'
        ? (i + 1) % n
        : ev.key === 'ArrowLeft'
          ? (i + n - 1) % n
          : ev.key === 'Home'
            ? 0
            : ev.key === 'End'
              ? n - 1
              : -1;
    const t = tabEls[destino];
    if (!t) return;
    ev.preventDefault(); // si no, el panel o el diálogo hacen scroll
    setTab(t.id, true);
    t.btn.focus();
  });
  /** `gesto`: cambio pedido por el jugador (clic o flechas): suena y el contenido entra deslizando. */
  function setTab(cual: Tab, gesto = false): void {
    const desde = tabEls.findIndex((t) => t.id === tabActiva);
    for (const t of tabEls) {
      const activa = t.id === cual;
      setAttr(t.btn, 'aria-selected', String(activa));
      t.btn.tabIndex = activa ? 0 : -1;
      t.panel.tabIndex = activa ? 0 : -1;
      setHidden(t.panel, !activa);
    }
    const cambio = tabActiva !== cual;
    tabActiva = cual;
    colocarIndicador();
    if (cambio && gesto) {
      handlers.onSound('tab');
      const hacia = tabEls.findIndex((t) => t.id === cual);
      const panel = tabEls[hacia]?.panel;
      if (panel) deslizar(panel, hacia > desde ? 1 : -1);
    }
    // Volver a Logros con el Álbum abierto: lo que cayó mientras miraba la Libreta se marca y queda visto.
    if (cambio && cual === 'logros' && albumAbierto()) {
      marcarNuevas(sinVer());
      handlers.onAlbumVisto();
    }
  }
  setTab('logros');
  const albumBody = h('div', { class: 'album-body' }, [tablist, ...tabEls.map((t) => t.panel)]);
  const albumTitle = h('h2', { class: 'sr-only', text: 'Álbum' }); // nombre del panel para el lector; a la vista, las pestañas
  albumTitle.id = 'album-title';
  albumTitle.tabIndex = -1;
  const album = h('section', { class: 'album panel' }, [albumTitle, albumBody]);
  album.setAttribute('aria-labelledby', 'album-title');
  album.id = 'album';
  // Móvil: botón en la barra inferior, junto a Chelo, que abre el Álbum en un diálogo.
  const albumBadge = h('span', { class: 'lat-badge', hidden: true });
  albumBadge.setAttribute('aria-hidden', 'true');
  const albumBtn = h('button', { class: 'guia-btn album-btn', type: 'button', label: 'Álbum', onclick: openAlbum }, [
    icon('album'),
    albumBadge,
  ]);

  const prestigeBtn = h('button', { class: 'btn heir', type: 'button', onclick: confirmPrestige });
  const picado = papelPicado();
  picado.addEventListener('animationend', () => picado.classList.remove('shake'));

  // Orden: lateral (web), header, guía de Chelo, mejoras y personajes (en web, paneles
  // deslizantes), tarjetas, barra.
  root.replaceChildren(
    lateral,
    h('header', { class: 'top' }, [
      h('div', { class: 'title-row' }, [appTitle, h('div', {}, [musicBtn, sound, charsBtn, menu])]),
      h('div', { class: 'money-row' }, [money, rate, recipes]),
      picado,
    ]),
    h('div', { class: 'layout' }, [
      guia,
      upgrades,
      chars,
      album,
      h('div', { class: 'col-main' }, [
        h(
          'ul',
          { class: 'list' },
          cards.map((c) => c.root),
        ),
      ]),
    ]),
    h('footer', { class: 'bottom' }, [
      h('div', { class: 'bottom-inner' }, [
        h('div', { class: 'bottom-row' }, [guiaBtn, albumBtn, segmented]),
        prestigeBtn,
      ]),
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
        handlers.onSound('slideOpen');
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
        if (!switching) handlers.onSound('slideClose');
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

  // El foco al abrir va a la pestaña activa (el h2 es sr-only: su anillo no se vería); siempre es Logros al abrir.
  const albumPanel = sidePanel(album, latAlbum.btn, tabEls[0]!.btn);
  let albumDialogTitle: HTMLElement | null = null;
  function openAlbum(): void {
    if (albumDialogTitle) return;
    setTab('logros');
    albumDialogTitle = openInDialog('Álbum', albumBody, albumTitle, () => {
      albumDialogTitle = null;
      limpiarNuevas();
    });
    colocarIndicador(true); // ya en el diálogo: hay layout
    marcarNuevas(sinVer()); // tras asignar albumDialogTitle (lo consulta albumAbierto) y del scrollTop = 0 del diálogo
    handlers.onAlbumVisto();
  }
  const albumAbierto = () => activePanel === albumPanel || albumDialogTitle !== null;

  // Al cruzar los 900 px todo vuelve al estado en línea / cerrado: nada queda a medias.
  mq.addEventListener('change', () => {
    activePanel?.close(false);
    charsDialogTitle?.closest('dialog')?.close();
    guiaDialogTitle?.closest('dialog')?.close();
    albumDialogTitle?.closest('dialog')?.close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !activePanel || document.querySelector('dialog[open]')) return;
    // Panel abierto solo (Chelo) con el foco fuera: Esc lo cierra sin mover el foco.
    activePanel.close(autoCloseAt === 0);
  });
  document.addEventListener('click', (e) => {
    if (!activePanel) return;
    const t = e.target;
    if (!(t instanceof Element) || activePanel.section.contains(t) || lateral.contains(t) || t.closest('dialog'))
      return;
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
        h('p', {
          text: 'Cada receta suma +2 % a todas tus ventas, para siempre. Las recetas y los logros que ya tienes se quedan.',
        }),
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
        const r = handlers.onImport(input.value);
        if (r === true) {
          // Partida nueva: las estrellas que trae no son "recién ganadas" (sin pop).
          for (const slot of charSlots) slot.shownStars = -1;
          d.close();
        } else if (r === 'bloqueado')
          setText(
            msg,
            'Ahora no se puede cargar: tu partida guardada es de una versión más nueva. Recarga para actualizar.',
          );
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
      if (t.art !== slot.artName) {
        const next = upgradeArt(t.art);
        slot.art.replaceWith(next);
        slot.art = next;
        slot.artName = t.art;
      }
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
      // Contratado: el precio cede su línea a las estrellas y el botón pasa a dar propina.
      setHidden(slot.price, managed);
      setHidden(slot.estrellas, !managed);
      setHidden(slot.state, !managed);
      if (b && managed) {
        renderAntiguedad(slot, b.trabajadoMs, estrellas(b));
        renderPropina(slot, s, b);
        continue;
      }
      slot.buy.dataset.accion = 'contratar';
      slot.buy.removeAttribute('aria-disabled');
      slot.buy.classList.remove('cuenta'); // tras heredar con una propina en curso
      slot.shownStars = -1;
      if (owned) {
        setText(slot.buy, 'Contratar');
        setAttr(slot.buy, 'aria-label', `Contratar a ${m.name} por ${formatMoney(m.cost)}`);
        setDisabled(slot.buy, !canHireManager(s, slot.def.id));
      } else {
        setText(slot.buy, 'Sin abrir');
        setAttr(slot.buy, 'aria-label', `Abre ${slot.def.name} para contratar a ${m.name} por ${formatMoney(m.cost)}`);
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
  }

  function renderAntiguedad(slot: CharSlot, trabajadoMs: number, n: number): void {
    if (n !== slot.shownStars) {
      slot.stars.forEach((st, i) => setIcon(st, i < n ? 'estrella' : 'estrella-off'));
      const label =
        n === ANTIGUEDAD_MS.length
          ? `${n} de ${n} estrellas, antigüedad máxima`
          : `${n} de ${ANTIGUEDAD_MS.length} estrellas, +${Math.round(n * ESTRELLA_BONO * 100)} % de ventas`;
      setAttr(slot.estrellas, 'aria-label', label);
      if (slot.shownStars >= 0 && n > slot.shownStars) {
        const nueva = slot.stars[n - 1];
        if (nueva) pop(nueva);
      }
      slot.shownStars = n;
    }
    // Progreso hacia la siguiente estrella (lleno al tope).
    const desde = ANTIGUEDAD_MS[n - 1] ?? 0;
    const hasta = ANTIGUEDAD_MS[n];
    const p = hasta === undefined ? 1 : (trabajadoMs - desde) / (hasta - desde);
    const t = `scaleX(${Math.min(Math.max(p, 0), 1).toFixed(3)})`;
    if (slot.antigT !== t) {
      slot.antigT = t;
      slot.antig.style.transform = t;
    }
  }

  function renderPropina(slot: CharSlot, s: State, b: BizState): void {
    const name = slot.def.manager.name;
    const efecto = `vende ×${PROPINA_MULT} durante ${PROPINA_MS / 1000} s`;
    slot.buy.dataset.accion = 'propina';
    setDisabled(slot.buy, false);
    const lista = propinaLista(b);
    slot.buy.classList.toggle('cuenta', !lista); // la cuenta regresiva va en una línea
    if (lista) {
      const costo = formatMoney(propinaCosto(s, slot.def.id));
      setText(slot.buy, `Dar ${costo} de propina`);
      // Sin dinero suficiente: aria-disabled como el resto de la cuenta (el foco se queda) y el porqué en la etiqueta.
      const alcanza = puedeDarPropina(s, slot.def.id);
      setAttr(slot.buy, 'aria-label', `Dar ${costo} de propina a ${name}: ${efecto}${alcanza ? '' : '. No alcanza'}`);
      if (alcanza) slot.buy.removeAttribute('aria-disabled');
      else setAttr(slot.buy, 'aria-disabled', 'true');
      return;
    }
    // aria-label estable: el número que cambia cada segundo solo se ve, no se lee.
    setAttr(slot.buy, 'aria-disabled', 'true');
    if (propinaActiva(b)) {
      setText(slot.buy, `×${PROPINA_MULT} · ${formatReloj(b.propinaMs - PROPINA_ESPERA_MS)}`);
      setAttr(slot.buy, 'aria-label', `${name}: propina en curso, ${efecto}`);
    } else {
      setText(slot.buy, `Espera · ${formatReloj(b.propinaMs)}`);
      setAttr(slot.buy, 'aria-label', `${name}: propina disponible en unos minutos`);
    }
  }

  function renderAlbum(s: State): void {
    // Badge: logros sin ver; el conteo va al nombre accesible, no al badge.
    const n = s.logros.length - s.logrosVistos;
    const label = n > 0 ? `Álbum: ${n} ${n === 1 ? 'logro nuevo' : 'logros nuevos'}` : 'Álbum';
    for (const [btn, badge] of [
      [latAlbum.btn, latAlbumBadge],
      [albumBtn, albumBadge],
    ] as const) {
      setAttr(btn, 'aria-label', label);
      setHidden(badge, n === 0);
      setText(badge, String(n));
    }
    const tiene = new Set(s.logros);
    for (const e of estampillas) if (tiene.has(e.def.id) !== e.lograda) setEstado(e, tiene.has(e.def.id));
    if (!albumAbierto()) {
      if (resaltadas.size > 0) limpiarNuevas(); // cerrado con Esc o clic fuera (sin pasar por el botón)
      return;
    }
    // La Libreta se reescribe también con la pestaña Logros a la vista: sin valores rancios al cambiar.
    for (const { fila, dd } of libretaFilas) setText(dd, fila.valor(s));
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
    const regaloPendiente = estadoRacha(s, Date.now()) !== 'cobrado';
    setHidden(regaloLi, !regaloPendiente);
    const consejo = tipFor(s, regaloPendiente);
    const tip = consejo ?? CHELO.idle;
    // Punto solo con consejo nuevo de verdad: ni en el primer render, ni al volver de un evento,
    // ni al quedarse sin consejo (reposo).
    const consejoNuevo = lastTip !== null && tip !== lastTip && !abierto && consejo !== null;
    lastTip = tip;
    let leccionAbrio = false;
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
          leccionAbrio = true;
        }
        taught = true;
      }
    }
    // El consejo de contratar cambia en el mismo render que abre la lección: no suma el tin.
    if (consejoNuevo && !leccionAbrio) markUnread();
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
    // Bienvenida: si hay un modal (p. ej. el regalo del día en móvil), se reintenta en el siguiente render.
    if (!welcomed) {
      if (s.lifetimeEarned === 0 && s.recipes === 0) {
        if (mq.matches) cheloPanel.open(false);
        else if (document.querySelector('dialog[open]')) return;
        else openGuia(); // nunca dos modales
      }
      welcomed = true;
    }
  }

  return {
    render(s, mode, audio) {
      last = s;
      const moneyText = formatMoney(s.money);
      setText(money, moneyText);
      money.style.setProperty('--largo', String(moneyText.length)); // .money encoge si no cabe
      const ips = incomePerSecond(s);
      setHidden(rate, ips === 0);
      if (ips > 0) {
        const ipsText = formatMoney(ips);
        setText(rateVisible, `${ipsText}/s`);
        setText(rateSr, `${ipsText} por segundo`);
      }
      setHidden(recipes, s.recipes === 0);
      setText(recipesText, `${recetas(s.recipes)} (+${formatNumber(s.recipes * 2)}%)`);

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
      renderAlbum(s);
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
        setText(c.count, owned ? `×${formatNumber(b.count)}` : '');
        setDisabled(c.sell, !owned || b.running || b.manager);

        // El tiempo de la vuelta no se escribe (la barra enseña el ritmo); el siguiente hito lo cuenta Chelo.
        // Con empleado el negocio corre solo: "$X/s", lo que de verdad entra (con propina) y lo mismo
        // que suma el /s del header; un hito lo duplica a la vista. A mano, "$X por vuelta": lo que
        // deja cada toque.
        setText(
          c.gana,
          !owned
            ? ''
            : b.manager
              ? `${formatMoney(ventasConPropina(s, c.def.id))}/s`
              : formatMoney(revenuePerCycle(s, c.def.id)),
        );
        setText(c.por, !owned ? 'Sin abrir' : b.manager ? '' : ' por vuelta');

        const q = quantityFor(s, c.def.id, mode);
        const k = q > 0 ? q : mode === 'max' ? 1 : mode;
        setText(
          c.buy,
          `${owned ? 'Comprar' : 'Abrir'} ×${formatNumber(k)} · ${formatMoney(costOf(c.def, b.count, k))}`,
        );
        setDisabled(c.buy, q === 0);

        c.root.classList.toggle('managed', b.manager);
        c.root.classList.toggle('propina', b.manager && propinaActiva(b));

        setHidden(c.bubble, !bubbleVisible(now, c.bubbleUntil));
      }

      const n = pendingRecipes(s);
      const heirLabel = n > 0 ? `Heredar · +${formatNumber(n)} recetas` : 'Herencia: sigue vendiendo';
      for (const b of [prestigeBtn, latHeir.btn]) {
        setHidden(b, n === 0 && heredadas(s) === 0); // una receta de regalo no estrena el botón
        setDisabled(b, n === 0);
      }
      setText(prestigeBtn, heirLabel);
      if (latHeir.btn.getAttribute('aria-label') !== heirLabel) latHeir.btn.setAttribute('aria-label', heirLabel);
      setHidden(latHeirBadge, n === 0);
      // Con miles de recetas el badge taparía el disco: tope visual; el número completo va en el aria-label.
      setText(latHeirBadge, n > 999 ? '+999+' : `+${formatNumber(n)}`);
    },

    renderBars(s) {
      const now = performance.now();
      for (const c of cards) {
        const b = s.businesses[c.def.id];
        if (!b || c.root.hidden) continue;
        // Fin del cierre (o venta manual nueva que lo corta): se suelta en este mismo frame en que la
        // barra salta, así no asoma llena. Con empleado ya avanzó un poco: reaparece suave.
        if (c.llenoHasta > 0 && (now >= c.llenoHasta || (b.running && !b.manager))) {
          const terminado = now >= c.llenoHasta;
          soltar(c);
          if (terminado && b.manager) aparecer(c.fill);
        }
        // Fija con empleado en ciclo rápido: siempre llena y con las rayas corriendo.
        c.rapido = cicloRapido(c.def, b.count);
        const fija = barraFija(c.def, b);
        c.fija = fija;
        // Recién fija (comprar cruzó un hito) con un cierre en curso: la barra no se desvanece.
        if (fija && c.llenoHasta > 0) soltar(c);
        c.bar.classList.toggle('fija', fija);
        // Llena: recién completada (se sostiene LLENO_MS) o fija.
        const llena = fija || (b.count > 0 && now < c.llenoHasta);
        const p = llena
          ? 1
          : b.count > 0 && (b.running || b.manager)
            ? Math.min(b.progressMs / cicloMs(c.def, b.count), 1)
            : 0;
        // Relleno a todo el ancho que se desliza desde la izquierda: rayas y brillo no se estiran.
        c.fill.style.transform = `translateX(${(p - 1) * 100}%)`;
      }
    },

    announce(text) {
      live.textContent = text;
    },

    say(id, kind, hito) {
      const c = cards.find((x) => x.def.id === id);
      if (!c) return;
      setText(c.bubble, fraseDe(c.def.manager, kind, hito));
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
            markUnread();
            return;
          }
          cheloPanel.open(false);
          autoCloseAt = eventUntil;
        });
      } else markUnread();
    },

    sold(id, amount) {
      const c = cards.find((x) => x.def.id === id);
      if (!c) return;
      coin(c.sell, `+${formatMoney(amount)}`);
      tiltCard(c);
      llenar(c);
    },

    turned(id) {
      const c = cards.find((x) => x.def.id === id);
      if (!c) return;
      // Con barra fija las vueltas llegan casi cada frame (62.5 ms con 4 hitos): un tilt por segundo.
      const now = performance.now();
      if (c.fija && now - c.ultimoTilt < TILT_FIJA_MS) return;
      c.ultimoTilt = now;
      tiltCard(c);
      if (!c.fija) llenar(c);
    },

    tipped(id) {
      const c = cards.find((x) => x.def.id === id);
      if (c) tiltCard(c);
    },

    hito(id, velocidad, ventas) {
      const c = cards.find((x) => x.def.id === id);
      if (!c || c.root.hidden) return;
      const partes = [];
      if (velocidad > 0) partes.push(`×${2 ** velocidad} rápido`);
      if (ventas > 0) partes.push(`×${2 ** ventas} ventas`);
      coin(c.sell, partes.join(' '));
    },

    logros(defs, silencioso) {
      const aLaVista = albumAbierto() && tabActiva === 'logros';
      if (silencioso) {
        // Importar con el Álbum abierto (bajo el diálogo de Respaldo): sin fiesta, pero lo ve → visto.
        if (aLaVista) handlers.onAlbumVisto();
        return;
      }
      pop(latAlbumBadge);
      pop(albumBadge);
      // En la Libreta no lo ve: el badge se enciende como si estuviera cerrado y se marca al volver a Logros.
      if (!aLaVista) return;
      for (const def of defs) {
        const e = estampillas.find((x) => x.def.id === def.id);
        if (!e) continue;
        setEstado(e, true); // render() aún no corrió: la estampilla sigue bloqueada
        marcar(e);
        stamp(e.nuevo);
      }
      handlers.onAlbumVisto(); // lo está viendo: el badge no debe encenderse
    },

    confirm(kind, id) {
      if (kind === 'upgrade') {
        // Se anima lo que cambió de verdad: el ingreso de los negocios afectados.
        const { target } = getUpgrade(id);
        for (const c of cards) if (!c.root.hidden && (target === 'all' || c.def.id === target)) pulse(c.meta);
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
      // El botón sigue en su lugar (pasa a "Dar propina"), así que el foco se queda en él.
      if (slot?.state.firstElementChild) stamp(slot.state.firstElementChild);
    },

    celebrate() {
      // La partida se reinicia: ningún bocadillo sobrevive a la herencia.
      for (const c of cards) c.bubbleUntil = 0;
      eventUntil = 0;
      answer = null;
      autoCloseAt = 0;
      this.fiesta();
    },

    fiesta() {
      // Con reduced-motion no hay animationend y la clase se quedaría puesta: se reinicia a mano.
      picado.classList.remove('shake');
      void picado.getBoundingClientRect();
      picado.classList.add('shake');
      confetti();
    },

    showRacha(dia, hoy, manana, mostradoEn) {
      if (document.querySelector('dialog[open]')) return false;
      const semana = diaDeSemana(dia);
      const discos = Array.from({ length: RACHA_SEMANA }, (_, i) => {
        const k = i + 1;
        const clase = k < semana ? 'cobrado' : k === semana ? 'hoy' : 'falta';
        return h(
          'span',
          { class: `racha-dia ${clase}` },
          k === RACHA_SEMANA ? [icon('recipe', 'icon racha-receta')] : [],
        );
      });
      const fila = h('div', { class: 'racha-semana' }, discos);
      fila.setAttribute('role', 'img');
      fila.setAttribute(
        'aria-label',
        `Semana de racha: ${semana - 1} de ${RACHA_SEMANA} días cobrados, hoy el ${ORDINALES[semana - 1]}; el séptimo da una receta.`,
      );
      const texto = (r: Regalo) => (r.tipo === 'receta' ? 'una receta de la abuela' : `${formatMoney(r.monto)} aprox`);
      // Cierra antes de cobrar: así el sonido del regalo no se encima con el de cerrar.
      const recibir = h('button', {
        class: 'btn primary',
        type: 'button',
        text: 'Recibir',
        onclick: () => {
          d.close();
          handlers.onRacha(mostradoEn);
        },
      });
      const d = dialog(
        `Día ${dia} de racha`,
        [
          h('p', { text: `${CHELO.name}: ${hoy.tipo === 'receta' ? CHELO.says.rachaReceta : CHELO.says.racha}` }),
          fila,
          h('p', { class: 'big', text: hoy.tipo === 'receta' ? '+1 receta' : `${formatMoney(hoy.monto)} aprox.` }),
          h('p', { text: `Mañana: ${texto(manana)}.` }),
        ],
        [recibir],
      );
      // Abrió sin gesto: al cerrar, el foco iría a body. Va al disco de Chelo (web) o al título (móvil).
      d.addEventListener('close', () => focusLateral(latChelo));
      return true;
    },

    showNewer(onReload) {
      dialog(
        'Partida de una versión más nueva',
        [
          h('p', {
            text: 'Tu partida se guardó con una versión más nueva del juego. Recarga para actualizar; mientras tanto puedes jugar, pero no se guardará nada. En Respaldo puedes copiar tu partida tal cual por si acaso.',
          }),
        ],
        [h('button', { class: 'btn primary', type: 'button', text: 'Recargar', onclick: onReload })],
      );
    },

    showOffline(earned, elapsedMs, estrellasGanadas) {
      dialog('¡Bienvenido de vuelta!', [
        h('p', { text: `Mientras no estabas (${formatDuration(elapsedMs)}), tus negocios vendieron:` }),
        h('p', { class: 'big', text: formatMoney(earned) }),
        ...(estrellasGanadas.length > 0
          ? [h('p', { text: `Ganaron estrella de antigüedad: ${estrellasGanadas.join(', ')}.` })]
          : []),
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
