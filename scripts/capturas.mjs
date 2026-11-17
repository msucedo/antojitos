// Capturas de verificación visual (ver DESIGN.md, "Verificación visual").
//
//   node scripts/capturas.mjs [--sprite | --album | --vitrina | --ajustes | --herencia | --ranking | --mejoras] [--semilla ruta.json] [--nombre prefijo]
//
// Arranca Vite en localhost:5174, abre el Chrome del sistema en headless,
// siembra la partida (si hay semilla) y deja los PNG en capturas/.
// Sin --sprite: juego en móvil 390×844 y web 1280×800, tema claro y oscuro.
// Con --sprite: docs/sprite.html a 1280 de ancho, página completa, claro y oscuro.
// Con --album: abre el Álbum con el giro de papel congelado y guarda album-*, album-pico-* (brinco en lo alto) y libreta-*. Con --ajustes: abre el diálogo de Ajustes (ajustes-*).
// Con --vitrina (solo movil y web): abre la vitrina 3D de un plato, un símbolo y un retrato (vitrina-*), con
// reduced motion para un frame fijo; el plato además de canto tras arrastrar. Sin semilla usa una con tres logros.
// Con --herencia: abre Herencia (recetario + Heredar): panel del lateral en web, diálogo desde la barra en móvil.
// Con --ranking: abre el diálogo Ranking con /api/ranking simulado (ranking-*); con una semilla con `ranking`
// se ve la tarjeta propia, sin ella el formulario de apodo.
// Con --mejoras: abre Mejoras (diálogo desde la barra en móvil, panel del lateral en web) y guarda mejoras-*;
// después, sin el diálogo, la pantalla con la barra (barra-*). Sin semilla usa una con mejoras que alcanzan.
// --nombre cambia el prefijo "juego" de los PNG.

import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const PUERTO = 5174;
const ORIGEN = `http://localhost:${PUERTO}`;
const RAIZ = path.resolve(import.meta.dirname, '..');
const SALIDA = path.join(RAIZ, 'capturas');
const SAVE_KEY = 'antojitos.save';
const ASIENTO_MS = 300;

const VISTAS = {
  movil: { width: 390, height: 844 },
  movil360: { width: 360, height: 780 }, // Android estrecho: la barra de seis discos y el nombre en dos líneas
  web: { width: 1280, height: 800 },
  webcorta: { width: 1366, height: 620 }, // ventana baja de PLAN.md: lateral compacto
};
const TEMAS = { claro: 'light', oscuro: 'dark' };

const { values: flags } = parseArgs({
  options: {
    sprite: { type: 'boolean', default: false },
    album: { type: 'boolean', default: false }, // abre el Álbum y captura sus dos pestañas
    vitrina: { type: 'boolean', default: false }, // abre la vitrina 3D de un logro
    ajustes: { type: 'boolean', default: false }, // abre el diálogo de Ajustes
    herencia: { type: 'boolean', default: false }, // abre Herencia (hace falta una semilla con recetas)
    ranking: { type: 'boolean', default: false }, // abre el diálogo Ranking con la API simulada
    mejoras: { type: 'boolean', default: false }, // abre Mejoras y captura la barra
    semilla: { type: 'string' },
    nombre: { type: 'string' }, // prefijo de los PNG en vez de "juego" (p. ej. --nombre racha7)
  },
});

async function leerSemilla(ruta) {
  if (!ruta) return null;
  return JSON.parse(await readFile(path.resolve(ruta), 'utf8'));
}

async function capturar(browser, { viewport, tema, url, archivo, fullPage, semilla, esperar, despues }) {
  const context = await browser.newContext({
    viewport,
    colorScheme: TEMAS[tema],
    serviceWorkers: 'block',
    // La vitrina gira sin parar: con reduced motion queda de frente y cada captura sale igual.
    reducedMotion: flags.vitrina ? 'reduce' : 'no-preference',
  });
  try {
    if (flags.ranking) await simularRanking(context);
    if (semilla) {
      // lastSeen se fija en el navegador, al cargar cada captura: si se fijara una vez en Node,
      // las capturas en serie llegarían "tarde" y el catchUp cerraría las vueltas en curso
      // (y con más retraso saldría el aviso de ausencia).
      await context.addInitScript(
        ([clave, valor]) => {
          // "AYER" en racha.ultimoDia se resuelve aquí, en la zona local del navegador (como en e2e).
          if (valor?.racha?.ultimoDia === 'AYER') {
            const d = new Date();
            d.setDate(d.getDate() - 1);
            const dos = (n) => String(n).padStart(2, '0');
            valor.racha.ultimoDia = `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
          }
          localStorage.setItem(clave, JSON.stringify({ lastSeen: Date.now(), ...valor }));
        },
        [SAVE_KEY, semilla],
      );
    }
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    await esperar(page);
    await page.waitForTimeout(ASIENTO_MS);
    const guardar = async (nombre) => {
      const destino = path.join(SALIDA, nombre);
      await page.screenshot({ path: destino, fullPage });
      console.log(destino);
    };
    await guardar(archivo);
    if (despues) await despues(page, guardar);
  } finally {
    await context.close();
  }
}

const esperarJuego = (page) => page.waitForSelector('#app > *', { state: 'attached' });

/** /api/ranking de mentira: un Top fijo y, al enviar, puesto 3 de 12. Vite dev devolvería index.html. */
async function simularRanking(context) {
  const top = [
    ['Lupita Aguas', 8.2e9],
    ['Don Beto', 5.1e9],
    ['La Jefa', 2.3e9],
    ['El Güero 99', 9.9e8],
    ['Chuy de la Fonda', 4.5e8],
    ['Rosita', 1.2e8],
    ['Lic Pérez', 7.7e7],
    ['Doña Tere', 3.1e7],
    ['Taquero 4821', 1.5e6],
    ['Elotero Novato', 12_345],
  ].map(([apodo, money], i) => ({ pos: i + 1, apodo, money }));
  await context.route('**/api/ranking*', (route) => {
    const json = route.request().method() === 'GET' ? { top, total: 12 } : { pos: 3, total: 12 };
    return route.fulfill({ json });
  });
}

/** Como esperarAlbum, pero abre el diálogo Ranking desde el trofeo del header (móvil y web). */
const esperarRanking = async (page) => {
  await esperarJuego(page);
  await page.waitForTimeout(ASIENTO_MS);
  await page.keyboard.press('Escape');
  await page.locator('button.ranking-btn').click();
  await page.waitForSelector('.ranking-lista li');
  await page.waitForTimeout(400);
};

/** Cierra lo que abra solo (bienvenida de Chelo) y abre el Álbum: lateral en web, barra inferior en móvil. */
const esperarAlbum = (vista) => async (page) => {
  await esperarJuego(page);
  await page.waitForTimeout(ASIENTO_MS);
  await page.keyboard.press('Escape');
  if (vista.startsWith('movil')) await page.locator('.album-btn').click();
  else await page.locator('.lateral button[aria-label^="Álbum"]').click();
  await page.waitForTimeout(400);
};

/** Como esperarAlbum, pero abre el diálogo de Ajustes: icono del header en móvil, disco del lateral en web. */
const esperarAjustes = (vista) => async (page) => {
  await esperarJuego(page);
  await page.waitForTimeout(ASIENTO_MS);
  await page.keyboard.press('Escape');
  if (vista.startsWith('movil')) await page.locator('.title-row button[aria-label="Ajustes"]').click();
  else await page.locator('.lateral button', { hasText: 'Ajustes' }).click();
  await page.waitForTimeout(400);
};

/** Abre Mejoras: disco de la barra en móvil, del lateral en web. */
const esperarMejoras = (vista) => async (page) => {
  await esperarJuego(page);
  await page.waitForTimeout(ASIENTO_MS);
  await page.keyboard.press('Escape');
  if (vista.startsWith('movil')) await page.locator('.bottom .up-btn').click();
  else await page.locator('.lateral button', { hasText: 'Mejoras' }).click();
  await page.waitForTimeout(400);
};

/** Tras Mejoras: la pantalla sin el diálogo ni el panel, con la barra (badge y Cantidad). */
const capturarBarra = (vista, tema) => async (page, guardar) => {
  if (vista.startsWith('movil')) await page.keyboard.press('Escape');
  else await page.locator('.lateral button', { hasText: 'Mejoras' }).click();
  await page.waitForTimeout(400);
  await guardar(`barra-${vista}-${tema}.png`);
};

/** Como esperarAlbum, pero abre Herencia: botón Heredar de la barra en móvil, disco del lateral en web. */
const esperarHerencia = (vista) => async (page) => {
  await esperarJuego(page);
  await page.waitForTimeout(ASIENTO_MS);
  await page.keyboard.press('Escape');
  if (vista.startsWith('movil')) await page.locator('.bottom .btn.heir').click();
  else await page.locator('.lateral button[aria-label^="Herencia"]').click();
  await page.waitForTimeout(400);
};

/** Partida con tres negocios abiertos y dinero para algunas mejoras, para --mejoras sin --semilla. */
function semillaMejoras() {
  const base = semillaVitrina();
  const cuenta = { elotes: 30, aguas: 12, tacos: 5 };
  for (const [id, b] of Object.entries(base.businesses)) b.count = cuenta[id] ?? 0;
  return { ...base, money: 5000, lifetimeEarned: 20000, runEarned: 20000 };
}

/** Partida mínima con tres logros (plato, símbolo y retrato) para --vitrina sin --semilla. */
function semillaVitrina() {
  const vacio = { count: 0, progressMs: 0, running: false, manager: false, propinaMs: 0, trabajadoMs: 0 };
  const ids = ['elotes', 'aguas', 'tacos', 'tortas', 'fonda', 'panaderia', 'franquicia', 'cadena'];
  const businesses = Object.fromEntries(ids.map((id) => [id, { ...vacio, count: id === 'elotes' ? 1 : 0 }]));
  return {
    version: 6,
    money: 0,
    runEarned: 0,
    lifetimeEarned: 1,
    recipes: 0,
    upgrades: [],
    businesses,
    logros: ['venta', 'clics-100', 'empleado'],
    logrosVistos: 3,
  };
}

/** Abre la vitrina de `nombre` con el Álbum ya abierto y espera el primer frame 3D. */
async function abrirVitrina(page, nombre) {
  await page.getByRole('button', { name: `Ver ${nombre}` }).click();
  await page.locator('.vitrina[data-modo="3d"]').waitFor({ timeout: 5000 });
  await page.waitForTimeout(ASIENTO_MS);
}

const esperarVitrina = (vista) => async (page) => {
  await esperarAlbum(vista)(page);
  await abrirVitrina(page, 'Primer elote');
};

/** Tras la de frente: la misma ficha girada a mano (~40°, se ve el canto), un símbolo del sprite y un retrato. */
const capturarVitrina = (vista, tema) => async (page, guardar) => {
  const caja = await page.locator('.vitrina canvas').boundingBox();
  if (caja) {
    const y = caja.y + caja.height / 2;
    await page.mouse.move(caja.x + caja.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(caja.x + caja.width / 2 + 60, y, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(ASIENTO_MS);
  }
  await guardar(`vitrina-canto-${vista}-${tema}.png`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(ASIENTO_MS);
  await abrirVitrina(page, 'Mano caliente');
  await guardar(`vitrina-sprite-${vista}-${tema}.png`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(ASIENTO_MS);
  await abrirVitrina(page, 'Primer empleado');
  await guardar(`vitrina-retrato-${vista}-${tema}.png`);
};

/**
 * Congela el giro de papel del Álbum: con `pico`, cada icono a ~70° y en lo alto del brinco (peor caso
 * para el recorte con la máscara); si no, todos en el mismo instante T, que por los desfases negativos
 * deja a cada uno en su fase (variedad de ángulos y espejos, siempre igual). animations: 'disabled' de
 * Playwright no sirve: cancela las infinitas y quedan todos a 0°.
 */
const congelarGiro = (page, pico = false) =>
  page.evaluate((pico) => {
    for (const a of document.getAnimations()) {
      if (!(a instanceof CSSAnimation) || !a.animationName.startsWith('papel-')) continue;
      a.pause();
      if (!pico) {
        a.currentTime = 1700;
        continue;
      }
      const { delay, duration } = a.effect.getTiming();
      // Tiempo activo = currentTime − delay: se compensa el desfase (delay negativo), módulo una vuelta para
      // no caer en currentTime < 0, que es antes de empezar (sin estilo animado).
      const activo = a.animationName === 'papel-giro' ? (duration * 70) / 360 : duration / 2;
      a.currentTime = (((activo + delay) % duration) + duration) % duration;
    }
  }, pico);

const esperarAlbumQuieto = (vista) => async (page) => {
  await esperarAlbum(vista)(page);
  await congelarGiro(page);
};

/** Tras la captura normal: el peor caso del brinco (album-pico-*) y la Libreta. */
const capturarAlbum = (vista, tema) => async (page, guardar) => {
  await congelarGiro(page, true);
  await guardar(`album-pico-${vista}-${tema}.png`);
  await capturarLibreta(vista, tema)(page, guardar);
};

const capturarLibreta = (vista, tema) => async (page, guardar) => {
  await page.getByRole('tab', { name: 'Libreta' }).click();
  await page.waitForTimeout(ASIENTO_MS);
  await guardar(`libreta-${vista}-${tema}.png`);
};
const esperarSprite = (page) => page.waitForFunction(() => [...document.images].every((img) => img.complete));

function tareas(semilla) {
  const lista = [];
  if (flags.sprite) {
    for (const tema of Object.keys(TEMAS)) {
      lista.push({
        viewport: VISTAS.web,
        tema,
        url: `${ORIGEN}/docs/sprite.html`,
        archivo: `sprite-${tema}.png`,
        fullPage: true,
        semilla: null,
        esperar: esperarSprite,
      });
    }
    return lista;
  }
  for (const [vista, viewport] of Object.entries(VISTAS)) {
    // La vitrina se abre desde el Álbum, que solo sabe llegar desde la barra (movil) o el lateral (web).
    if (flags.vitrina && vista !== 'movil' && vista !== 'web') continue;
    for (const tema of Object.keys(TEMAS)) {
      lista.push(
        flags.vitrina
          ? {
              viewport,
              tema,
              url: `${ORIGEN}/`,
              archivo: `vitrina-${vista}-${tema}.png`,
              fullPage: false,
              semilla: semilla ?? semillaVitrina(),
              esperar: esperarVitrina(vista),
              despues: capturarVitrina(vista, tema),
            }
          : flags.album
            ? {
                viewport,
                tema,
                url: `${ORIGEN}/`,
                archivo: `album-${vista}-${tema}.png`,
                fullPage: false,
                semilla: semilla ?? semillaVitrina(), // sin semilla nada estaría lograda ni giraría
                esperar: esperarAlbumQuieto(vista),
                despues: capturarAlbum(vista, tema),
              }
            : flags.ajustes
              ? {
                  viewport,
                  tema,
                  url: `${ORIGEN}/`,
                  archivo: `ajustes-${vista}-${tema}.png`,
                  fullPage: false,
                  semilla,
                  esperar: esperarAjustes(vista),
                }
              : flags.herencia
                ? {
                    viewport,
                    tema,
                    url: `${ORIGEN}/`,
                    archivo: `herencia-${vista}-${tema}.png`,
                    fullPage: false,
                    semilla,
                    esperar: esperarHerencia(vista),
                  }
                : flags.mejoras
                  ? {
                      viewport,
                      tema,
                      url: `${ORIGEN}/`,
                      archivo: `mejoras-${vista}-${tema}.png`,
                      fullPage: false,
                      semilla: semilla ?? semillaMejoras(),
                      esperar: esperarMejoras(vista),
                      despues: capturarBarra(vista, tema),
                    }
                  : flags.ranking
                    ? {
                        viewport,
                        tema,
                        url: `${ORIGEN}/`,
                        archivo: `ranking-${vista}-${tema}.png`,
                        fullPage: false,
                        semilla,
                        esperar: esperarRanking,
                      }
                    : {
                        viewport,
                        tema,
                        url: `${ORIGEN}/`,
                        archivo: `${flags.nombre ?? 'juego'}-${vista}-${tema}.png`,
                        fullPage: false,
                        semilla,
                        esperar: esperarJuego,
                      },
      );
    }
  }
  return lista;
}

async function main() {
  const semilla = await leerSemilla(flags.semilla);
  await mkdir(SALIDA, { recursive: true });

  const server = await createServer({
    root: RAIZ,
    logLevel: 'silent',
    server: { port: PUERTO, strictPort: true },
  });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    for (const tarea of tareas(semilla)) await capturar(browser, tarea);
  } finally {
    await browser?.close();
    await server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
