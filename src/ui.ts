import { BUSINESSES, type BusinessDef } from './data';
import {
  canBuyUpgrade,
  canHireManager,
  costOf,
  getDef,
  getUpgrade,
  incomePerSecond,
  nextMilestone,
  nextUpgrades,
  pendingRecipes,
  quantityFor,
  revenuePerCycle,
  type BuyMode,
  type State,
} from './game';
import { formatDuration, formatMoney, formatNumber } from './format';
import { icon, setIcon, type IconName } from './icons';
import { coin, confetti, pulse } from './fx';

export interface Handlers {
  onStart(id: string): void;
  onBuy(id: string): void;
  onHire(id: string): void;
  onUpgrade(id: string): void;
  onMode(mode: BuyMode): void;
  onPrestige(): void;
  onToggleSound(): void;
  onToggleMusic(): void;
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

interface Card {
  def: BusinessDef;
  root: HTMLElement;
  sell: HTMLButtonElement;
  count: HTMLElement;
  fill: HTMLElement;
  info: HTMLElement;
  buy: HTMLButtonElement;
  hire: HTMLButtonElement;
  hireText: HTMLElement;
  hireCheck: SVGSVGElement;
}

interface UpgradeSlot {
  root: HTMLElement;
  art: SVGSVGElement;
  name: HTMLElement;
  effect: HTMLElement;
  buy: HTMLButtonElement;
  id: string | null;
}

const MODES: readonly BuyMode[] = [1, 10, 'max'];
const modeLabel = (m: BuyMode) => (m === 'max' ? 'Máx' : `×${m}`);
const UPGRADE_SLOTS = 3;
const UPGRADE_LOCK_MS = 500;

function tipFor(s: State): string | null {
  const elotes = s.businesses.elotes;
  const managers = BUSINESSES.filter((d) => s.businesses[d.id]?.manager).length;
  if (pendingRecipes(s) > 0 && s.recipes === 0)
    return 'Ya puedes heredar: vuelves a empezar, pero con recetas que suben todas tus ventas.';
  if (s.lifetimeEarned > 0 || s.recipes > 0) {
    if (managers === 0 && canHireManager(s, 'elotes'))
      return 'Contrata a Don Beto: vende solito, aunque cierres el juego.';
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

function dialog(title: string, body: Node[], actions: HTMLButtonElement[] = []): HTMLDialogElement {
  const d = h('dialog', { class: 'modal' });
  const close = h('button', { class: 'btn', type: 'button', text: 'Cerrar', onclick: () => d.close() });
  d.append(h('h2', { text: title }), ...body, h('div', { class: 'actions' }, [...actions, close]));
  d.setAttribute('aria-label', title);
  d.addEventListener('close', () => d.remove());
  document.body.append(d);
  // <dialog> nativo: atrapa el foco, inerte el fondo y cierra con Esc.
  d.showModal();
  return d;
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
  const menu = h('button', { class: 'icon-btn', type: 'button', label: 'Menú', onclick: openMenu }, [icon('menu')]);

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

  const tip = h('p', { class: 'tip-text' });
  const tipBox = h('aside', { class: 'tip', hidden: true }, [icon('chelo', 'icon chelo'), tip]);

  const live = h('p', { class: 'sr-only' });
  live.setAttribute('aria-live', 'polite');
  const toast = h('div', { class: 'toast', hidden: true });
  toast.setAttribute('role', 'status');

  const cards: Card[] = BUSINESSES.map((def) => {
    const sell = h(
      'button',
      { class: 'sell', type: 'button', label: `Vender: ${def.name}`, onclick: () => handlers.onStart(def.id) },
      [icon(def.icon, 'icon sell-icon')],
    );
    const count = h('span', { class: 'count' });
    const fill = h('div', { class: 'fill' });
    const bar = h('div', { class: 'bar' }, [fill]);
    bar.setAttribute('aria-hidden', 'true');
    const info = h('p', { class: 'info' });
    const buy = h('button', { class: 'btn primary', type: 'button', onclick: () => handlers.onBuy(def.id) });
    const hireText = h('span');
    const hireCheck = icon('check', 'icon icon-sm');
    const hire = h('button', { class: 'btn', type: 'button', onclick: () => handlers.onHire(def.id) }, [
      hireCheck,
      hireText,
    ]);
    const cardRoot = h('li', { class: 'card' }, [
      sell,
      h('div', { class: 'body' }, [
        h('h2', { text: def.name }, [count]),
        bar,
        info,
        h('div', { class: 'row' }, [buy, hire]),
      ]),
    ]);
    return { def, root: cardRoot, sell, count, fill, info, buy, hire, hireText, hireCheck };
  });

  const appTitle = h('h1', { text: 'Imperio de Antojitos' });
  appTitle.tabIndex = -1;
  let upgradeLockUntil = 0;
  let refocusAfterUpgrade = false;

  const slots: UpgradeSlot[] = Array.from({ length: UPGRADE_SLOTS }, () => {
    const art = icon('upgrade', 'icon up-icon');
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
    slot.root = h('li', { class: 'up-card' }, [art, h('div', { class: 'up-body' }, [name, effect]), slot.buy]);
    return slot;
  });
  const upgradesTitle = h('h2', { class: 'section-title', text: 'Mejoras' });
  upgradesTitle.id = 'upgrades-title';
  upgradesTitle.tabIndex = -1;
  const upgrades = h('section', { class: 'upgrades', hidden: true }, [
    upgradesTitle,
    h(
      'ul',
      { class: 'up-list' },
      slots.map((s) => s.root),
    ),
  ]);
  upgrades.setAttribute('aria-labelledby', 'upgrades-title');

  const prestigeBtn = h('button', { class: 'btn heir', type: 'button', onclick: confirmPrestige });

  root.replaceChildren(
    h('header', { class: 'top' }, [
      h('div', { class: 'title-row' }, [appTitle, h('div', {}, [musicBtn, sound, menu])]),
      money,
      h('div', { class: 'sub-row' }, [rate, recipes]),
    ]),
    h('div', { class: 'layout' }, [
      h('div', { class: 'col-side' }, [tipBox, upgrades]),
      h('div', { class: 'col-main' }, [
        h(
          'ul',
          { class: 'list' },
          cards.map((c) => c.root),
        ),
      ]),
    ]),
    h('footer', { class: 'bottom' }, [h('div', { class: 'bottom-inner' }, [segmented, prestigeBtn])]),
    live,
    toast,
  );

  let last: State | null = null;

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
          text: `Le pasas el negocio a la familia: pierdes dinero, negocios, gerentes y mejoras, pero ganas ${formatNumber(n)} recetas de la abuela.`,
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
    setHidden(upgrades, next.length === 0 || s.lifetimeEarned === 0);
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

  return {
    render(s, mode, audio) {
      last = s;
      setText(money, formatMoney(s.money));
      const ips = incomePerSecond(s);
      setText(rate, ips > 0 ? `${formatMoney(ips)}/s con gerentes` : 'Sin gerentes todavía');
      setHidden(recipes, s.recipes === 0);
      setText(recipesText, `${formatNumber(s.recipes)} recetas (+${formatNumber(s.recipes * 2)}%)`);

      for (const [btn, on] of [
        [sound, audio.sound],
        [musicBtn, audio.music],
      ] as const) {
        const pressed = String(on);
        if (btn.getAttribute('aria-pressed') !== pressed) btn.setAttribute('aria-pressed', pressed);
      }
      setIcon(soundIcon, audio.sound ? 'sound-on' : 'sound-off');
      setIcon(musicIcon, audio.music ? 'music-on' : 'music-off');

      for (const { m, b } of modeButtons) {
        const on = String(m === mode);
        if (b.getAttribute('aria-pressed') !== on) b.setAttribute('aria-pressed', on);
      }
      const t = tipFor(s);
      setHidden(tipBox, t === null);
      if (t !== null) setText(tip, t);

      renderUpgrades(s);
      if (refocusAfterUpgrade) {
        // El botón comprado ahora muestra otra mejora (o desapareció): el foco va a un
        // lugar estable en vez de perderse o caer sobre una compra que no se pidió.
        refocusAfterUpgrade = false;
        (upgrades.hidden ? appTitle : upgradesTitle).focus({ preventScroll: true });
      }

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

        setHidden(c.hire, !owned);
        c.hireCheck.style.display = b.manager ? '' : 'none';
        if (b.manager) {
          setText(c.hireText, c.def.managerName);
          setDisabled(c.hire, true);
        } else {
          setText(c.hireText, `Contratar a ${c.def.managerName} · ${formatMoney(c.def.managerCost)}`);
          setDisabled(c.hire, !canHireManager(s, c.def.id));
        }
      }

      const n = pendingRecipes(s);
      setHidden(prestigeBtn, n === 0 && s.recipes === 0);
      setText(prestigeBtn, n > 0 ? `Heredar · +${formatNumber(n)} recetas` : 'Herencia: sigue vendiendo');
      setDisabled(prestigeBtn, n === 0);
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
      if (c) pulse(kind === 'buy' ? c.buy : c.hire);
    },

    celebrate() {
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
