// Capturas de verificación visual (ver DESIGN.md, "Verificación visual").
//
//   node scripts/capturas.mjs [--sprite] [--semilla ruta.json]
//
// Arranca Vite en localhost:5174, abre el Chrome del sistema en headless,
// siembra la partida (si hay semilla) y deja los PNG en capturas/.
// Sin --sprite: juego en móvil 390×844 y web 1280×800, tema claro y oscuro.
// Con --sprite: docs/sprite.html a 1280 de ancho, página completa, claro y oscuro.

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
    semilla: { type: 'string' },
  },
});

async function leerSemilla(ruta) {
  if (!ruta) return null;
  return JSON.parse(await readFile(path.resolve(ruta), 'utf8'));
}

async function capturar(browser, { viewport, tema, url, archivo, fullPage, semilla, esperar }) {
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
        ([clave, valor]) => localStorage.setItem(clave, JSON.stringify({ lastSeen: Date.now(), ...valor })),
        [SAVE_KEY, semilla],
      );
    }
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    await esperar(page);
    await page.waitForTimeout(ASIENTO_MS);
    const destino = path.join(SALIDA, archivo);
    await page.screenshot({ path: destino, fullPage });
    console.log(destino);
  } finally {
    await context.close();
  }
}

const esperarJuego = (page) => page.waitForSelector('#app > *', { state: 'attached' });
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
      lista.push({
        viewport,
        tema,
        url: `${ORIGEN}/`,
        archivo: `juego-${vista}-${tema}.png`,
        fullPage: false,
        semilla,
        esperar: esperarJuego,
      });
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
