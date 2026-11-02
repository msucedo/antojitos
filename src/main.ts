import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { applyOffline, buy, getDef, hireManager, prestige, startCycle, type BuyMode, type State } from './game';
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
    onBuy: (id) => set(buy(state, id, mode)),
    onHire: (id) => {
      const next = hireManager(state, id);
      if (next !== state) ui.announce(`Contrataste a ${getDef(id).managerName}.`);
      set(next);
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
      ui.announce(`Heredaste. Ahora tienes ${next.recipes} recetas.`);
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
    getExport: () => exportSave(state),
  });

  if (loaded.problem) ui.showProblem();

  // Todo avance de tiempo usa el reloj de pared contra lastSeen: un frame, una pausa
  // del hilo o horas fuera pasan por el mismo camino (tope 8 h, reloj atrasado → 0).
  const catchUp = (notify: boolean) => {
    const r = applyOffline(state, Date.now());
    state = r.state;
    dirty ||= r.earned > 0;
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
      ui.render(state, mode);
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
    } else {
      catchUp(true);
    }
  });
  window.addEventListener('pagehide', persist);

  void navigator.storage?.persist?.().catch(() => undefined);

  const updateSW = registerSW({
    onNeedRefresh() {
      ui.showUpdate(() => {
        persist();
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
