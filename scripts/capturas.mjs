// Capturas de verificación visual (ver DESIGN.md, "Verificación visual").
//
//   node scripts/capturas.mjs [--sprite | --album | --ajustes | --herencia] [--semilla ruta.json] [--nombre prefijo]
//
// Arranca Vite en localhost:5174, abre el Chrome del sistema en headless,
// siembra la partida (si hay semilla) y deja los PNG en capturas/.
// Sin --sprite: juego en móvil 390×844 y web 1280×800, tema claro y oscuro.
// Con --sprite: docs/sprite.html a 1280 de ancho, página completa, claro y oscuro.
// Con --album: abre el Álbum y guarda album-* y libreta-*. Con --ajustes: abre el diálogo de Ajustes (ajustes-*).
// Con --herencia: abre Herencia (recetario + Heredar): panel del lateral en web, diálogo desde la barra en móvil.
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
  web: { width: 1280, height: 800 },
  webcorta: { width: 1366, height: 620 }, // ventana baja de PLAN.md: lateral compacto
};
const TEMAS = { claro: 'light', oscuro: 'dark' };

const { values: flags } = parseArgs({
  options: {
    sprite: { type: 'boolean', default: false },
    album: { type: 'boolean', default: false }, // abre el Álbum y captura sus dos pestañas
    ajustes: { type: 'boolean', default: false }, // abre el diálogo de Ajustes
    herencia: { type: 'boolean', default: false }, // abre Herencia (hace falta una semilla con recetas)
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
  });
  try {
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

/** Cierra lo que abra solo (bienvenida de Chelo) y abre el Álbum: lateral en web, barra inferior en móvil. */
const esperarAlbum = (vista) => async (page) => {
  await esperarJuego(page);
  await page.waitForTimeout(ASIENTO_MS);
  await page.keyboard.press('Escape');
  if (vista === 'movil') await page.locator('.album-btn').click();
  else await page.locator('.lateral button[aria-label^="Álbum"]').click();
  await page.waitForTimeout(400);
};

/** Como esperarAlbum, pero abre el diálogo de Ajustes: icono del header en móvil, disco del lateral en web. */
const esperarAjustes = (vista) => async (page) => {
  await esperarJuego(page);
  await page.waitForTimeout(ASIENTO_MS);
  await page.keyboard.press('Escape');
  if (vista === 'movil') await page.locator('.title-row button[aria-label="Ajustes"]').click();
  else await page.locator('.lateral button', { hasText: 'Ajustes' }).click();
  await page.waitForTimeout(400);
};

/** Como esperarAlbum, pero abre Herencia: botón Heredar de la barra en móvil, disco del lateral en web. */
const esperarHerencia = (vista) => async (page) => {
  await esperarJuego(page);
  await page.waitForTimeout(ASIENTO_MS);
  await page.keyboard.press('Escape');
  if (vista === 'movil') await page.locator('.bottom .btn.heir').click();
  else await page.locator('.lateral button[aria-label^="Herencia"]').click();
  await page.waitForTimeout(400);
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
    for (const tema of Object.keys(TEMAS)) {
      lista.push(
        flags.album
          ? {
              viewport,
              tema,
              url: `${ORIGEN}/`,
              archivo: `album-${vista}-${tema}.png`,
              fullPage: false,
              semilla,
              esperar: esperarAlbum(vista),
              despues: capturarLibreta(vista, tema),
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
