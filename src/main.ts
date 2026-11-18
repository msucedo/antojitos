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
  prestige,
  buyRecetario,
  getRecetario,
  heredarVale,
  propinaDuracionMs,
  recetasActivas,
  revenuePerCycle,
  startCycle,
  type BuyMode,
  type State,
  darPropina,
  estrellas,
  ingresoVuelta,
  propinaCosto,
  ventasConPropina,
} from './game';
import {
  AUSENCIA_MS,
  BUSINESSES,
  CHELO,
  ESTRELLA_BONO,
  fraseDe,
  LOGRO_BONO,
  PROPINA_MULT,
  type BusinessDef,
} from './data';
import { createAudio, loadPrefs, savePrefs, type Sound } from './audio';
import { albumCompleto, desbloquear, nuevos, verLogros } from './logros';
import { cobrar, diaSiguiente, estadoRacha, regalo } from './racha';
import { claveDia } from './fecha';
import { backup, exportCrudo, exportSave, importSave, load, save, type KV } from './save';
import { createUI, showLocked, textoNivel, type UI } from './ui';
import { formatDuration, formatMoney, recetas } from './format';
import {
  cambioDesde,
  crearIdentidad,
  cuerpoEnvio,
  CLAVE_PUESTO,
  debeEnviar,
  leerPuestoGuardado,
  puestoDesdeTop,
  serializarPuesto,
  enVuelo,
  parsearEnvio,
  parsearTop,
  RUTA_RANKING,
  type ErrorEnvio,
  type Puesto,
  type UltimoEnvio,
  marcaEnvio,
} from './ranking';

const AUTOSAVE_MS = 5_000;
const BACKUP_MS = 60_000;
/** Cada cuánto se revisa si toca enviar al ranking (la regla de los 60 s está en `debeEnviar`). */
const RANKING_TICK_MS = 10_000;
const ERRORES_ENVIO: readonly ErrorEnvio[] = ['save', 'apodo', 'secreto', 'salto', 'limite', 'baneado', 'red'];
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

  // Ranking mundial: último puesto que devolvió el servidor y último envío (hora, ganado y recetas enviados).
  let puesto: Puesto | null = null;
  // Lo último que el servidor te aceptó (o la cifra de tu fila del Top): piso para reconocerte en el Top.
  let pisoGanado = 0;
  /** Puesto del caché local para la identidad actual (al arrancar o tras importar). */
  const cargarPuesto = () => {
    const g = state.ranking ? leerPuestoGuardado(kv.getItem(CLAVE_PUESTO), state.ranking.id) : null;
    puesto = g?.puesto ?? null;
    pisoGanado = g?.ganado ?? 0;
  };
  const guardarPuesto = (id: string) => {
    if (soloLectura || !puesto) return;
    try {
      kv.setItem(CLAVE_PUESTO, serializarPuesto(id, puesto, pisoGanado));
    } catch {
      // Caché del puesto: no es crítico.
    }
  };
  const olvidarPuesto = () => {
    puesto = null;
    pisoGanado = 0;
    if (soloLectura) return;
    try {
      kv.setItem(CLAVE_PUESTO, '');
    } catch {
      // Caché del puesto: no es crítico.
    }
  };
  cargarPuesto();
  let ultimoEnvio: UltimoEnvio | null = null;
  // Motivo del último fallo, para la ficha del diálogo; null tras un `ok`.
  let ultimoError: ErrorEnvio | null = null;
  /**
   * POST del guardado completo al servidor; con `keepalive` al ocultar la pestaña. Nunca lanza.
   * El resultado se anota en la marca de este envío (si sigue siendo la última): `debeEnviar` decide
   * con él cuándo reintentar.
   */
  const enviarRanking = async (keepalive = false): Promise<'ok' | ErrorEnvio> => {
    const body = state.ranking && !soloLectura ? cuerpoEnvio(state) : null;
    if (!state.ranking || !body) {
      ultimoError = 'save';
      dirty = true;
      return 'save';
    }
    const marca = marcaEnvio(state, Date.now());
    ultimoEnvio = marca;
    const r = await postRanking(state.ranking.id, marca.ganado, body, keepalive);
    // Una respuesta vieja no pisa a un envío más nuevo (tick, diálogo y pagehide pueden cruzarse).
    if (ultimoEnvio === marca) {
      marca.resultado = r;
      ultimoError = r === 'ok' ? null : r;
    }
    dirty = true; // la ficha del diálogo y el badge muestran el resultado
    return r;
  };
  const postRanking = async (
    id: string,
    ganado: number,
    body: string,
    keepalive: boolean,
  ): Promise<'ok' | ErrorEnvio> => {
    // Tras el await solo se toca la identidad si sigue siendo la misma (un import pudo cambiarla).
    const misma = () => !soloLectura && state.ranking?.id === id;
    try {
      const res = await fetch(RUTA_RANKING, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive,
      });
      const json: unknown = await res.json().catch(() => null);
      if (res.ok) {
        const p = parsearEnvio(json);
        if (!p) return 'red';
        if (!misma()) return 'ok'; // la identidad cambió durante el envío: este puesto no es del jugador actual
        puesto = { pos: p.pos, total: p.total, en: Date.now(), guardado: false };
        pisoGanado = ganado;
        guardarPuesto(id);
        // El apodo es fijo desde el alta: si el save trae otro (respaldo importado), manda el del servidor.
        if (p.apodo && misma() && state.ranking && p.apodo !== state.ranking.apodo) {
          set({ ...state, ranking: { ...state.ranking, apodo: p.apodo } });
          persist();
        }
        dirty = true;
        return 'ok';
      }
      const error =
        typeof json === 'object' && json !== null && 'error' in json && typeof json.error === 'string'
          ? json.error
          : '';
      const motivo = ERRORES_ENVIO.find((e) => e === error) ?? 'red';
      // Retirado o identidad que no coincide: el puesto guardado ya no vale y taparía el motivo.
      if ((motivo === 'baneado' || motivo === 'secreto') && misma()) {
        olvidarPuesto();
        dirty = true;
      }
      // Apodo rechazado: solo pasa en el alta (con registro el servidor no valida el apodo), así que
      // no hay nada que perder; se suelta la identidad para elegir otro.
      if (motivo === 'apodo' && misma()) {
        set({ ...state, ranking: null });
        persist();
        olvidarPuesto();
        ultimoEnvio = null;
        ultimoError = null;
        dirty = true;
      }
      return motivo;
    } catch {
      return 'red';
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
        `Propina de ${formatMoney(costo)} a ${getDef(id).manager.name}: vende ×${PROPINA_MULT} durante ${formatDuration(propinaDuracionMs(state))}.`,
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
    onRecetario: (id) => {
      const next = buyRecetario(state, id);
      if (next === state) return;
      set(next);
      persist();
      audio.play('upgrade');
      ui.confirm('recetario', id);
      ui.cheloSays('recetario');
      const def = getRecetario(id);
      ui.announce(
        `Cocinaste ${def.name}: ${textoNivel(def, next.recetario[id] ?? 1)}. Te quedan ${recetas(recetasActivas(next))} para cocinar.`,
      );
    },
    onToggleSound: () => {
      const on = !audio.prefs().sound;
      audio.setSound(on);
      savePrefs(audio.prefs());
      if (on) {
        audio.unlock();
        audio.play('buy');
      }
      ui.announce(on ? 'Efectos de sonido activados.' : 'Efectos de sonido desactivados.', false); // ajuste, no evento
      dirty = true;
    },
    onToggleMusic: () => {
      const on = !audio.prefs().music;
      audio.setMusic(on);
      savePrefs(audio.prefs());
      if (on) audio.unlock();
      ui.announce(on ? 'Música activada.' : 'Música desactivada.', false);
      dirty = true;
    },
    onMode: (m) => {
      if (m === mode) return; // el mismo modo no suena ni marca cambio
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
      ui.announce(`Heredaste. Tienes ${recetas(recetasActivas(next))} para cocinar. ${CHELO.says.prestige}`);
    },
    onImport: (text) => {
      if (soloLectura) return 'bloqueado'; // no se guardaría: al recargar volvería la partida más nueva
      const next = importSave(text, Date.now());
      if (!next) return false;
      respaldar();
      const idAntes = state.ranking?.id;
      set({ ...next, lastSeen: Date.now() });
      // Otra identidad: su puesto (del caché, si lo hay) y sus envíos empiezan de cero.
      if (state.ranking?.id !== idAntes) {
        cargarPuesto();
        ultimoEnvio = null;
        ultimoError = null;
      }
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
      const valia = heredarVale(state);
      set(r.state);
      persist(); // cerrar antes del autosave no debe perder el regalo
      // El dinero del regalo puede cruzar el umbral en que heredar vale la pena: mismo ta-dá que en catchUp.
      if (!valia && heredarVale(state)) audio.play('heir');
      if (r.regalo.tipo === 'receta') {
        audio.play('heir');
        ui.fiesta();
        ui.announce(
          `Día ${r.dia} de racha: receta de la abuela de regalo. Tienes ${recetas(recetasActivas(r.state))} para cocinar.`,
        );
      } else {
        audio.play('welcome');
        ui.announce(`Día ${r.dia} de racha: recibiste ${formatMoney(r.regalo.monto)}.`);
      }
    },
    // Solo lectura: se exporta el guardado más nuevo tal cual (sin validar), no la partida vacía en memoria.
    getExport: () => (loaded.crudo !== null ? exportCrudo(loaded.crudo) : exportSave(state)),
    onRankingVer: async (fresco) => {
      // Sin puesto se envía al abrir, salvo con uno en vuelo o tras un 429 reciente: chocaría otra vez.
      // Tras un fallo pasajero se respeta su espera (si no, el reenvío choca con el 429 y tapa el motivo real).
      const sinPuestoToca = (ahora: number) => {
        const r = ultimoEnvio?.resultado;
        return r === 'limite' || r === 'red' || r === 'salto'
          ? debeEnviar(ultimoEnvio, state, ahora)
          : !enVuelo(ultimoEnvio, ahora);
      };
      // Si participa y aún no hay puesto en esta sesión (o ya toca), primero el envío: así el Top trae tu cifra.
      // Si salió, el Top se pide fresco; lo acotan `debeEnviar` (60 s) y el límite del servidor (30 s).
      const enviado =
        state.ranking &&
        (puesto === null || puesto.guardado ? sinPuestoToca(Date.now()) : debeEnviar(ultimoEnvio, state, Date.now()))
          ? (await enviarRanking()) === 'ok'
          : false;
      try {
        // La URL con query es otra entrada de la CDN (10 s): salta la caché tras unirse o tras tu envío.
        const res = await fetch(fresco || enviado ? `${RUTA_RANKING}?t=${Date.now()}` : RUTA_RANKING);
        if (!res.ok) return 'error';
        const top = parsearTop(await res.json());
        if (!top) return 'error';
        // Tu fila del Top da el puesto exacto aunque tu envío haya chocado con el 429. Un Top cacheado
        // (10 s) no pisa a un puesto de esta sesión, que es igual o más nuevo.
        // Con secreto o baneo no: la fila sigue ahí (o era tuya) pero el motivo del rechazo manda.
        const rechazado = ultimoError === 'secreto' || ultimoError === 'baneado';
        if (state.ranking && !rechazado && (puesto === null || puesto.guardado)) {
          const desdeTop = puestoDesdeTop(top, state.ranking.apodo, pisoGanado, state.lifetimeEarned, Date.now());
          if (desdeTop) {
            puesto = desdeTop.puesto;
            pisoGanado = desdeTop.ganado;
            guardarPuesto(state.ranking.id);
            dirty = true;
          }
        }
        return top;
      } catch {
        return 'error';
      }
    },
    onRankingApodo: (apodo) => {
      if (soloLectura) return Promise.resolve('save');
      // El apodo no se cambia: con identidad solo se reenvía; sin ella se crea con este apodo.
      if (!state.ranking) {
        set({ ...state, ranking: crearIdentidad(apodo, crypto) });
        persist();
      }
      return enviarRanking();
    },
    getRankingPuesto: () => puesto,
    getRankingError: () => ultimoError,
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
  const textoEstrella = (def: BusinessDef): string => {
    const n = estrellas(state.businesses[def.id]!);
    const pct = Math.round(n * ESTRELLA_BONO * 100);
    return `${def.manager.name}: ${n} ${n === 1 ? 'estrella' : 'estrellas'}, +${pct} % de ventas. ${def.manager.says.estrella}`;
  };
  const catchUp = (notify: boolean) => {
    const before = state;
    // Un frame o la pestaña que se oculta cuentan como tiempo jugado; cargar o volver, no.
    const r = applyOffline(state, Date.now(), !notify);
    state = r.state;
    dirty ||= r.earned > 0;
    // Ciclos manuales que terminaron (en un frame o al volver a la pestaña): moneda + sonido.
    // Los gerentes no suenan: tildan el icono y suben su moneda, salvo al cargar o al volver de una
    // ausencia (la bienvenida ya dice el total; sin lluvia de monedas sobre el diálogo).
    const silencio = notify || r.elapsedMs >= AUSENCIA_MS;
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
        // Tras una ausencia larga, un solo tilt. `before` trae el conteo y la propina del momento de
        // la vuelta; el /s actual sirve para la ventana de la barra fija.
        ui.turned(def.id, silencio ? 0 : ingresoVuelta(before, def.id), silencio ? 0 : ventasConPropina(state, def.id));
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
        // El diálogo lo dice; al Historial va sin leerlo (la rama de abajo, hilo congelado > 60 s sin
        // visibilitychange, lo registra vía announce: ramas excluyentes, nunca dos entradas).
        ui.registrar(`Ganaste ${formatMoney(r.earned)} mientras no estabas.`);
        for (const def of ganadas) ui.registrar(textoEstrella(def)); // el diálogo ya nombra a quien ganó estrella
      } else if (ganadas.length === 0) ui.announce(`Ganaste ${formatMoney(r.earned)} mientras no estabas.`);
    }
    if (ganadas.length > 0 && !(aviso && notify)) {
      // Un solo anuncio y un solo sonido aunque ganen varios (el aria-live se pisaría).
      const textos = ganadas.map((def) => {
        ui.say(def.id, 'estrella');
        return textoEstrella(def);
      });
      if (aviso) textos.unshift(`Ganaste ${formatMoney(r.earned)} mientras no estabas.`);
      ui.announce(textos.join(' '));
      audio.play('milestone');
    }
    // Heredar empieza a valer la pena (HERENCIA_MIN pendientes): un guardado que ya lo traía no suena al cargar.
    if (!heredarVale(before) && heredarVale(state)) audio.play('heir');
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
      if (albumCompleto(state)) ui.cheloSays('album');
      else if (primero) ui.cheloSays('logro');
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
  // Ranking: cada minuto si cambió lo ganado o las recetas y la pestaña está visible; al ocultarse, un último envío.
  setInterval(() => {
    if (document.visibilityState === 'visible' && state.ranking && debeEnviar(ultimoEnvio, state, Date.now())) {
      void enviarRanking();
    }
  }, RANKING_TICK_MS);
  const enviarAlSalir = () => {
    const ahora = Date.now();
    if (state.ranking && ultimoEnvio !== null && !enVuelo(ultimoEnvio, ahora) && cambioDesde(ultimoEnvio, state)) {
      void enviarRanking(true);
    }
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      catchUp(false);
      persist();
      enviarAlSalir();
      audio.setVisible(false);
    } else {
      audio.setVisible(true);
      catchUp(true);
    }
  });
  window.addEventListener('pagehide', () => {
    persist();
    enviarAlSalir();
  });

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
