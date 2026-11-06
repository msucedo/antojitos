import './style.css';
import { registerSW } from 'virtual:pwa-register';
import {
  applyOffline,
  buy,
  buySound,
  buyUpgrade,
  cicloMs,
  getDef,
  getUpgrade,
  hireManager,
  hitosCruzados,
  milestonesReached,
  pendingRecipes,
  prestige,
  revenuePerCycle,
  startCycle,
  type BuyMode,
  type State,
  darPropina,
  estrellas,
  propinaCosto,
} from './game';
import { AUSENCIA_MS, BUSINESSES, CHELO, ESTRELLA_BONO, fraseDe, LOGRO_BONO, PROPINA_MS, PROPINA_MULT } from './data';
import { createAudio, loadPrefs, savePrefs, type Sound } from './audio';
import { desbloquear, nuevos, verLogros } from './logros';
import { cobrar, diaSiguiente, estadoRacha, regalo } from './racha';
import { claveDia } from './fecha';
import { backup, exportCrudo, exportSave, importSave, load, save, type KV } from './save';
import { createUI, showLocked, type UI } from './ui';
import { formatMoney, recetas } from './format';

const AUTOSAVE_MS = 5_000;
const BACKUP_MS = 60_000;
const TEXT_MS = 100;
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
  // Tras cargar o importar, lo que ya se cumplía se apunta sin fiesta (una partida vieja trae varios).
  let logrosSilencio = true;
  // Último día (local) en que se mostró el diálogo de la racha: sale una vez por día, no por sesión.
  let diaVisto = '';
  // Guardado de una versión más nueva (build viejo en caché): se juega, pero no se escribe nada.
  const soloLectura = loaded.source === 'newer';
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
  const respaldar = () => {
    if (!soloLectura) backup(kv, state);
  };
  const persist = () => {
    if (soloLectura) return;
    if (!save(kv, state) && !warnedNoSave) {
      warnedNoSave = true;
      ui.showNoSave();
    }
  };

  const ui: UI = createUI(root, {
    onStart: (id) => set(startCycle(state, id)),
    onBuy: (id) => {
      const before = state;
      const next = buy(state, id, mode);
      if (!act(next, 'buy', id, buySound(before, next, id))) return;
      // Al cruzar un hito habla el gerente; si aún no hay, Doña Chelo.
      const hitos = hitosCruzados(before, state, id);
      if (hitos.velocidad + hitos.ventas === 0) return;
      ui.hito(id, hitos.velocidad, hitos.ventas);
      const def = getDef(id);
      const b = state.businesses[id];
      if (b?.manager) {
        const alcanzados = milestonesReached(b.count);
        ui.say(id, 'milestone', alcanzados);
        ui.announce(`${def.manager.name}: ${fraseDe(def.manager, 'milestone', alcanzados)}`);
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
    onPropina: (id) => {
      const costo = propinaCosto(state, id);
      const next = darPropina(state, id);
      if (next === state) return;
      set(next);
      audio.play('upgrade');
      ui.tipped(id);
      ui.announce(
        `Propina de ${formatMoney(costo)} a ${getDef(id).manager.name}: vende ×${PROPINA_MULT} durante ${PROPINA_MS / 1000} s.`,
      );
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
      if (m === mode) return; // el segmentado móvil repite el toque sobre el modo actual
      mode = m;
      dirty = true;
      audio.play(m === 1 ? 'modeX1' : m === 10 ? 'modeX10' : 'modeMax');
    },
    onPrestige: () => {
      const next = prestige(state, Date.now());
      if (next === state) return;
      set(next);
      persist();
      respaldar();
      audio.play('prestige');
      ui.celebrate();
      ui.cheloSays('prestige');
      ui.announce(`Heredaste. Ahora tienes ${recetas(next.recipes)}. ${CHELO.says.prestige}`);
    },
    onImport: (text) => {
      if (soloLectura) return 'bloqueado'; // no se guardaría: al recargar volvería la partida más nueva
      const next = importSave(text, Date.now());
      if (!next) return false;
      respaldar();
      set({ ...next, lastSeen: Date.now() });
      logrosSilencio = true;
      diaVisto = ''; // la partida importada puede tener otro día de racha
      persist();
      ui.announce('Partida cargada.');
      return true;
    },
    onSound: (kind) => audio.play(kind),
    onAlbumVisto: () => set(verLogros(state)),
    onRacha: (mostradoEn) => {
      // Lo cobrado se calcula aquí (estado del clic); null si hoy ya se cobró (doble clic, dos botones).
      const r = cobrar(state, Date.now(), mostradoEn);
      if (!r) return;
      const habiaPendientes = pendingRecipes(state) > 0;
      set(r.state);
      persist(); // cerrar antes del autosave no debe perder el regalo
      // El dinero del regalo puede cruzar el umbral de receta: mismo ta-dá que en catchUp.
      if (!habiaPendientes && pendingRecipes(state) > 0) audio.play('heir');
      if (r.regalo.tipo === 'receta') {
        audio.play('heir');
        ui.fiesta();
        ui.announce(`Día ${r.dia} de racha: receta de la abuela de regalo. Ahora tienes ${recetas(r.state.recipes)}.`);
      } else {
        audio.play('welcome');
        ui.announce(`Día ${r.dia} de racha: recibiste ${formatMoney(r.regalo.monto)}.`);
      }
    },
    // Solo lectura: se exporta el guardado más nuevo tal cual (sin validar), no la partida vacía en memoria.
    getExport: () => (loaded.crudo !== null ? exportCrudo(loaded.crudo) : exportSave(state)),
  });

  /** Aplica una acción; si cambió el estado, da feedback visual y sonoro (`sound` si difiere del tipo). */
  function act(
    next: State,
    kind: Extract<Sound, 'buy' | 'hire' | 'upgrade'>,
    id: string,
    sound: Sound = kind,
  ): boolean {
    if (next === state) return false;
    set(next);
    audio.play(sound);
    ui.confirm(kind, id);
    return true;
  }

  if (soloLectura) ui.showNewer(actualizar);
  else if (loaded.problem) ui.showProblem(); // nunca dos modales apilados

  // Todo avance de tiempo usa el reloj de pared contra lastSeen: un frame, una pausa
  // del hilo o horas fuera pasan por el mismo camino (tope 8 h, reloj atrasado → 0).
  const catchUp = (notify: boolean) => {
    const before = state;
    // Un frame o la pestaña que se oculta cuentan como tiempo jugado; cargar o volver, no.
    const r = applyOffline(state, Date.now(), !notify);
    state = r.state;
    dirty ||= r.earned > 0;
    // Ciclos manuales que terminaron (en un frame o al volver a la pestaña):
    // moneda + sonido. Los gerentes no suenan; solo tildan el icono.
    for (const def of BUSINESSES) {
      const b0 = before.businesses[def.id];
      const b1 = state.businesses[def.id];
      if (b0?.running && b1 && !b1.running && !b1.manager) {
        ui.sold(def.id, revenuePerCycle(before, def.id));
        audio.play('sell');
      } else if (
        b0?.manager &&
        b1?.manager &&
        (b1.progressMs < b0.progressMs || r.elapsedMs >= cicloMs(def, b1.count))
      ) {
        // Vuelta de empleado: la barra volvió a empezar (o pasó un ciclo entero entre frames).
        // Tras una ausencia larga, un solo tilt.
        ui.turned(def.id);
      }
    }
    // Estrellas de antigüedad ganadas en este tramo.
    const ganadas = BUSINESSES.filter((def) => {
      const b0 = before.businesses[def.id];
      const b1 = state.businesses[def.id];
      return b0?.manager && b1?.manager && estrellas(b1) > estrellas(b0);
    });
    const aviso = r.earned > 0 && r.elapsedMs >= AUSENCIA_MS;
    if (aviso) {
      if (notify) {
        // Al volver: una línea en el aviso, sin avalancha de bocadillos ni sonidos.
        ui.showOffline(
          r.earned,
          r.elapsedMs,
          ganadas.map((d) => d.manager.name),
        );
        audio.play('welcome');
      } else if (ganadas.length === 0) ui.announce(`Ganaste ${formatMoney(r.earned)} mientras no estabas.`);
    }
    if (ganadas.length > 0 && !(aviso && notify)) {
      // Un solo anuncio y un solo sonido aunque ganen varios (el aria-live se pisaría).
      const textos = ganadas.map((def) => {
        const n = estrellas(state.businesses[def.id]!);
        ui.say(def.id, 'estrella');
        const pct = Math.round(n * ESTRELLA_BONO * 100);
        return `${def.manager.name}: ${n} ${n === 1 ? 'estrella' : 'estrellas'}, +${pct} % de ventas. ${def.manager.says.estrella}`;
      });
      if (aviso) textos.unshift(`Ganaste ${formatMoney(r.earned)} mientras no estabas.`);
      ui.announce(textos.join(' '));
      audio.play('milestone');
    }
    // Primera receta disponible en esta partida: un guardado que ya la traía no suena al cargar.
    if (pendingRecipes(before) === 0 && pendingRecipes(state) > 0) audio.play('heir');
  };
  catchUp(true);

  /**
   * Único sitio donde se desbloquean logros: cualquier cambio de estado (compra, contrato, tiempo,
   * herencia, importar) se ve aquí al frame siguiente. Un solo anuncio y un solo sonido aunque
   * caigan varios (el aria-live se pisaría); al cargar, ni sonido ni Chelo.
   */
  const revisarLogros = () => {
    const n = nuevos(state);
    if (n.length === 0) {
      logrosSilencio = false;
      return;
    }
    const primero = state.logros.length === 0;
    set(desbloquear(state, n));
    ui.logros(n, logrosSilencio);
    if (!logrosSilencio) {
      audio.play('logro');
      if (primero) ui.cheloSays('logro');
    }
    const pct = Math.round(n.length * LOGRO_BONO * 100);
    const nombres = n.map((l) => l.nombre);
    const lista = nombres.length === 1 ? nombres[0] : `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}`;
    ui.announce(`${n.length === 1 ? 'Logro' : 'Logros'}: ${lista}. +${pct} % de ventas.`);
    logrosSilencio = false;
  };

  /**
   * Regalo del día: una vez por día local, cuando no hay otro modal (espera a "Bienvenido de
   * vuelta", la lección o Empleados). Pestaña oculta a medianoche: rAF no corre; al volver,
   * catchUp(true) abre la bienvenida si toca y el siguiente render abre la racha.
   */
  const revisarRacha = () => {
    const now = Date.now();
    const hoy = claveDia(now);
    if (hoy === diaVisto || estadoRacha(state, now) === 'cobrado') return;
    const dia = diaSiguiente(state, now);
    if (ui.showRacha(dia, regalo(state, dia), regalo(state, dia + 1), now)) diaVisto = hoy;
  };

  let lastText = 0;
  const frame = (t: number) => {
    catchUp(false);
    if (dirty || t - lastText >= TEXT_MS) {
      // Antes de pintar: un logro por acción sale en el mismo frame (dirty ya es true); uno por tiempo, en ≤ 100 ms.
      revisarLogros();
      revisarRacha();
      ui.render(state, mode, audio.prefs());
      lastText = t;
      dirty = false;
    }
    ui.renderBars(state);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  setInterval(persist, AUTOSAVE_MS);
  setInterval(respaldar, BACKUP_MS);
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
      ui.showUpdate(actualizar);
    },
  });

  /**
   * Activa el SW en espera y recarga. workbox-window solo recarga si ya había SW controlando al
   * registrar; en la primera visita no lo hay, así que recargamos nosotros al cambiar de controlador.
   * Sin SW en espera (o sin SW), recarga de todos modos tras un momento.
   */
  function actualizar(): void {
    persist();
    let reloading = false;
    const reload = () => {
      if (reloading) return;
      reloading = true;
      location.reload();
    };
    if (!('serviceWorker' in navigator)) {
      reload();
      return;
    }
    navigator.serviceWorker.addEventListener('controllerchange', reload);
    void updateSW(true);
    // Sin SW en espera (p. ej. tras un rollback) el controlador no cambia: recargar igual; con uno en
    // espera, esperar al cambio (un dispositivo lento no debe recargar el build viejo).
    void navigator.serviceWorker.getRegistration().then((r) => {
      if (!r?.waiting) setTimeout(reload, 1500);
    });
  }
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
