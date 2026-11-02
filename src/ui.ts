import { BUSINESSES, type BusinessDef } from './data';
import {
  canHireManager,
  costOf,
  incomePerSecond,
  nextMilestone,
  pendingRecipes,
  quantityFor,
  revenuePerCycle,
  type BuyMode,
  type State,
} from './game';
import { formatDuration, formatMoney, formatNumber } from './format';

export interface Handlers {
  onStart(id: string): void;
  onBuy(id: string): void;
  onHire(id: string): void;
  onMode(mode: BuyMode): void;
  onPrestige(): void;
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
function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

function setDisabled(el: HTMLButtonElement, disabled: boolean): void {
  if (el.disabled !== disabled) el.disabled = disabled;
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
}

const MODES: readonly BuyMode[] = [1, 10, 'max'];
const modeLabel = (m: BuyMode) => (m === 'max' ? 'Máx' : `×${m}`);

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
    return null;
  }
  return '¡Ándale, mijo! Toca el elote 🌽 para hacer tu primera venta.';
}

export interface UI {
  render(s: State, mode: BuyMode): void;
  renderBars(s: State): void;
  announce(text: string): void;
  showOffline(earned: number, elapsedMs: number): void;
  showProblem(): void;
  showNoSave(): void;
  showUpdate(onReload: () => void): void;
}

export function showLocked(root: HTMLElement): void {
  root.replaceChildren(
    h('section', { class: 'locked' }, [
      h('p', { class: 'locked-icon', text: '🔒' }),
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
  const recipes = h('p', { class: 'recipes' });
  const modeButtons = MODES.map((m) => {
    const b = h('button', { class: 'seg', type: 'button', text: modeLabel(m), onclick: () => handlers.onMode(m) });
    return { m, b };
  });
  const menu = h('button', { class: 'icon-btn', type: 'button', text: '⋯', label: 'Menú', onclick: openMenu });
  const tip = h('p', { class: 'tip-text' });
  const tipBox = h('aside', { class: 'tip', hidden: true }, [h('span', { class: 'chelo', text: '👵🏽' }), tip]);
  const live = h('p', { class: 'sr-only' });
  live.setAttribute('aria-live', 'polite');
  const toast = h('div', { class: 'toast', hidden: true });
  toast.setAttribute('role', 'status');

  const cards: Card[] = BUSINESSES.map((def) => {
    const sell = h('button', {
      class: 'sell',
      type: 'button',
      text: def.icon,
      label: `Vender: ${def.name}`,
      onclick: () => handlers.onStart(def.id),
    });
    const count = h('span', { class: 'count' });
    const fill = h('div', { class: 'fill' });
    const bar = h('div', { class: 'bar' }, [fill]);
    bar.setAttribute('aria-hidden', 'true');
    const info = h('p', { class: 'info' });
    const buy = h('button', { class: 'btn primary', type: 'button', onclick: () => handlers.onBuy(def.id) });
    const hire = h('button', { class: 'btn', type: 'button', onclick: () => handlers.onHire(def.id) });
    const root = h('li', { class: 'card' }, [
      sell,
      h('div', { class: 'body' }, [
        h('h2', { text: def.name }, [count]),
        bar,
        info,
        h('div', { class: 'row' }, [buy, hire]),
      ]),
    ]);
    return { def, root, sell, count, fill, info, buy, hire };
  });

  const prestigeBtn = h('button', { class: 'btn heir', type: 'button', onclick: confirmPrestige });

  root.replaceChildren(
    h('header', { class: 'top' }, [
      h('div', { class: 'title-row' }, [h('h1', { text: 'Imperio de Antojitos' }), menu]),
      money,
      h('div', { class: 'sub-row' }, [rate, recipes]),
      h(
        'div',
        { class: 'segmented', label: 'Cantidad a comprar' },
        modeButtons.map((x) => x.b),
      ),
    ]),
    tipBox,
    h(
      'ul',
      { class: 'list' },
      cards.map((c) => c.root),
    ),
    h('footer', { class: 'bottom' }, [prestigeBtn]),
    live,
    toast,
  );
  root.querySelector('.segmented')?.setAttribute('role', 'group');

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
          text: `Le pasas el negocio a la familia: pierdes dinero, negocios y gerentes, pero ganas ${formatNumber(n)} recetas de la abuela.`,
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

  return {
    render(s, mode) {
      last = s;
      setText(money, formatMoney(s.money));
      const ips = incomePerSecond(s);
      setText(rate, ips > 0 ? `${formatMoney(ips)}/s con gerentes` : 'Sin gerentes todavía');
      setText(recipes, s.recipes > 0 ? `📜 ${formatNumber(s.recipes)} recetas (+${formatNumber(s.recipes * 2)}%)` : '');
      for (const { m, b } of modeButtons) {
        const on = String(m === mode);
        if (b.getAttribute('aria-pressed') !== on) b.setAttribute('aria-pressed', on);
      }
      const t = tipFor(s);
      tipBox.hidden = t === null;
      if (t !== null) setText(tip, t);

      let unlockedShown = false;
      for (const c of cards) {
        const b = s.businesses[c.def.id];
        if (!b) continue;
        // Muestra los negocios ya comprados y solo el siguiente bloqueado.
        const show = b.count > 0 || !unlockedShown;
        if (b.count === 0) unlockedShown = true;
        if (c.root.hidden === show) c.root.hidden = !show;
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

        c.hire.hidden = !owned;
        if (b.manager) {
          setText(c.hire, `${c.def.managerName} ✓`);
          setDisabled(c.hire, true);
        } else {
          setText(c.hire, `Contratar a ${c.def.managerName} · ${formatMoney(c.def.managerCost)}`);
          setDisabled(c.hire, !canHireManager(s, c.def.id));
        }
      }

      const n = pendingRecipes(s);
      prestigeBtn.hidden = n === 0 && s.recipes === 0;
      setText(
        prestigeBtn,
        n > 0 ? `Heredar · +${formatNumber(n)} recetas` : 'Herencia: sigue vendiendo para ganar recetas',
      );
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

    showOffline(earned, elapsedMs) {
      dialog('¡Bienvenido de vuelta!', [
        h('p', { text: `Mientras no estabas (${formatDuration(elapsedMs)}), tus negocios vendieron:` }),
        h('p', { class: 'big', text: formatMoney(earned) }),
      ]);
    },

    showNoSave() {
      dialog('No se puede guardar', [
        h('p', {
          text: 'Tu navegador no deja guardar la partida (modo privado o almacenamiento lleno). Puedes jugar, pero el progreso se perderá al cerrar. Usa el menú ⋯ para copiar un código de respaldo.',
        }),
      ]);
    },

    showProblem() {
      dialog('Algo pasó con tu partida', [
        h('p', {
          text: 'No pudimos leer tu partida guardada. Recuperamos la mejor copia disponible; si tienes un código de respaldo, cárgalo desde el menú ⋯.',
        }),
      ]);
    },

    showUpdate(onReload) {
      toast.replaceChildren(
        h('span', { text: 'Nueva versión disponible' }),
        h('button', { class: 'btn primary', type: 'button', text: 'Recargar', onclick: onReload }),
      );
      toast.hidden = false;
    },
  };
}
