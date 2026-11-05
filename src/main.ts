import './style.css';
import { registerSW } from 'virtual:pwa-register';
import {
  applyOffline,
  buy,
  buyUpgrade,
  getDef,
  getUpgrade,
  hireManager,
  milestonesCrossed,
  prestige,
  revenuePerCycle,
  startCycle,
  type BuyMode,
  type State,
} from './game';
import { BUSINESSES, CHELO } from './data';
import { createAudio, loadPrefs, savePrefs, type Sound } from './audio';
import { backup, exportSave, importSave, load, save, type KV } from './save';
import { createUI, showLocked, type UI } from './ui';
import { formatMoney } from './format';

const AUTOSAVE_MS = 5_000;
const BACKUP_MS = 60_000;
const TEXT_MS = 100;
const MIN_OFFLINE_NOTICE_MS = 60_000;
const LOCK_RETRIES = 10;
const LOCK_RETRY_MS = 200;

function storage(): KV {
  try {
    const ls = window.localStorage;
    ls.getItem('');
    return ls;
  } catch {
    // Almacenamiento bloqueado: se juega, pero save() devuelve false y se avisa.
    return {
      getItem: () => null,
      setItem: () => {
        throw new Error('Almacenamiento no disponible');
      },
    };
  }
}

function start(root: HTMLElement): void {
  const kv = storage();
  const loaded = load(kv, Date.now());
  let state: State = loaded.state;
  let mode: BuyMode = 1;
  let dirty = true;
  let warnedNoSave = false;
  const audio = createAudio(loadPrefs());
  // El audio solo arranca dentro de un gesto. Se escuchan varios porque cada navegador
  // cuenta como "activación" uno distinto (iOS: touchend/click; teclado: keydown).
  for (const type of ['pointerdown', 'click', 'keydown', 'touchend'] as const) {
    document.addEventListener(type, () => audio.unlock(), { passive: true, capture: true });
  }

  const set = (next: State) => {
    if (next !== state) {
      state = next;
      dirty = true;
    }
  };
  // Guarda el lastSeen en memoria: con la pestaña oculta el estado está congelado
  // en ese instante, así que el tiempo oculto se cobra como offline al volver.
  const persist = () => {
    if (!save(kv, state) && !warnedNoSave) {
      warnedNoSave = true;
      ui.showNoSave();
    }
  };

  const ui: UI = createUI(root, {
    onStart: (id) => set(startCycle(state, id)),
    onBuy: (id) => {
      const before = state;
      if (!act(buy(state, id, mode), 'buy', id)) return;
      // Al cruzar un hito habla el gerente; si aún no hay, Doña Chelo.
      if (milestonesCrossed(before, state, id) === 0) return;
      const { manager } = getDef(id);
      if (state.businesses[id]?.manager) {
        ui.say(id, 'milestone');
        ui.announce(`${manager.name}: ${manager.says.milestone}`);
      } else {
        ui.cheloSays('milestone');
        ui.announce(`${CHELO.name}: ${CHELO.says.milestone}`);
      }
    },
    onHire: (id) => {
      if (!act(hireManager(state, id), 'hire', id)) return;
      const { manager } = getDef(id);
      ui.say(id, 'hire');
      ui.announce(`Contrataste a ${manager.name}. ${manager.says.hire}`);
    },
    onUpgrade: (id) => {
      if (!act(buyUpgrade(state, id), 'upgrade', id)) return;
      const { name, target } = getUpgrade(id);
      if (target !== 'all' && state.businesses[target]?.manager) {
        const { manager } = getDef(target);
        ui.say(target, 'upgrade');
        ui.announce(`Compraste ${name}. ${manager.name}: ${manager.says.upgrade}`);
      } else {
        const kind = target === 'all' ? 'upgrade' : 'upgradeOne';
        ui.cheloSays(kind);
        ui.announce(`Compraste ${name}. ${CHELO.says[kind]}`);
      }
    },
    onToggleSound: () => {
      const on = !audio.prefs().sound;
      audio.setSound(on);
      savePrefs(audio.prefs());
      if (on) {
        audio.unlock();
        audio.play('buy');
      }
      ui.announce(on ? 'Efectos de sonido activados.' : 'Efectos de sonido desactivados.');
      dirty = true;
    },
    onToggleMusic: () => {
      const on = !audio.prefs().music;
      audio.setMusic(on);
      savePrefs(audio.prefs());
      if (on) audio.unlock();
      ui.announce(on ? 'Música activada.' : 'Música desactivada.');
      dirty = true;
    },
    onMode: (m) => {
      mode = m;
      dirty = true;
    },
    onPrestige: () => {
      const next = prestige(state, Date.now());
      if (next === state) return;
      set(next);
      persist();
      backup(kv, state);
      audio.play('prestige');
      ui.celebrate();
      ui.cheloSays('prestige');
      ui.announce(`Heredaste. Ahora tienes ${next.recipes} recetas. ${CHELO.says.prestige}`);
    },
    onImport: (text) => {
      const next = importSave(text);
      if (!next) return false;
      backup(kv, state);
      set({ ...next, lastSeen: Date.now() });
      persist();
      ui.announce('Partida cargada.');
      return true;
    },
    onSlide: (open) => audio.play(open ? 'slideOpen' : 'slideClose'),
    getExport: () => exportSave(state),
  });

  /** Aplica una acción; si cambió el estado, da feedback visual y sonoro. */
  function act(next: State, kind: Extract<Sound, 'buy' | 'hire' | 'upgrade'>, id: string): boolean {
    if (next === state) return false;
    set(next);
    audio.play(kind);
    ui.confirm(kind, id);
    return true;
  }

  if (loaded.problem) ui.showProblem();

  // Todo avance de tiempo usa el reloj de pared contra lastSeen: un frame, una pausa
  // del hilo o horas fuera pasan por el mismo camino (tope 8 h, reloj atrasado → 0).
  const catchUp = (notify: boolean) => {
    const before = state;
    const r = applyOffline(state, Date.now());
    state = r.state;
    dirty ||= r.earned > 0;
    // Ciclos manuales que terminaron (en un frame o al volver a la pestaña):
    // moneda + sonido. Los gerentes no suenan.
    for (const def of BUSINESSES) {
      const b0 = before.businesses[def.id];
      const b1 = state.businesses[def.id];
      if (b0?.running && b1 && !b1.running && !b1.manager) {
        ui.sold(def.id, revenuePerCycle(before, def.id));
        audio.play('sell');
      }
    }
    if (r.earned > 0 && r.elapsedMs >= MIN_OFFLINE_NOTICE_MS) {
      if (notify) ui.showOffline(r.earned, r.elapsedMs);
      else ui.announce(`Ganaste ${formatMoney(r.earned)} mientras no estabas.`);
    }
  };
  catchUp(true);

  let lastText = 0;
  const frame = (t: number) => {
    catchUp(false);
    if (dirty || t - lastText >= TEXT_MS) {
      ui.render(state, mode, audio.prefs());
      lastText = t;
      dirty = false;
    }
    ui.renderBars(state);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  setInterval(persist, AUTOSAVE_MS);
  setInterval(() => backup(kv, state), BACKUP_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      catchUp(false);
      persist();
      audio.setVisible(false);
    } else {
      audio.setVisible(true);
      catchUp(true);
    }
  });
  window.addEventListener('pagehide', persist);

  void navigator.storage?.persist?.().catch(() => undefined);

  const updateSW = registerSW({
    onNeedRefresh() {
      ui.showUpdate(() => {
        persist();
        // workbox-window solo recarga si ya había SW controlando al registrar; en la
        // primera visita no lo hay, así que recargamos nosotros al cambiar de controlador.
        let reloading = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (reloading) return;
          reloading = true;
          location.reload();
        });
        void updateSW(true);
      });
    },
  });
}

/** Una sola pestaña con el candado: evita pisar el guardado y cobrar el offline dos veces. */
function acquire(root: HTMLElement, attempt = 0): void {
  void navigator.locks.request('antojitos', { ifAvailable: true }, (lock) => {
    if (!lock) {
      // Al recargar, el documento anterior puede tardar en soltar el candado.
      if (attempt < LOCK_RETRIES) setTimeout(() => acquire(root, attempt + 1), LOCK_RETRY_MS);
      else showLocked(root);
      return;
    }
    start(root);
    return new Promise<never>(() => {}); // se libera al cerrar la pestaña
  });
}

function boot(): void {
  const root = document.getElementById('app');
  if (!root) return;
  if ('locks' in navigator) acquire(root);
  else start(root);
}

boot();
