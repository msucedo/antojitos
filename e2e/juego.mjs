// Pruebas de punta a punta sobre el build de producción (dist/) servido con los headers de
// vercel.json (CSP incluida), en el Chrome del sistema en headless.
//   npm run e2e        (construye y corre)
// Cada prueba abre un contexto nuevo: localStorage vacío o sembrado con addInitScript.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright-core';

const RAIZ = path.resolve(import.meta.dirname, '..');
const DIST = path.join(RAIZ, 'dist');
const PUERTO = 4179;
const ORIGEN = `http://127.0.0.1:${PUERTO}`;
const SAVE_KEY = 'antojitos.save';
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};

const vercel = JSON.parse(fs.readFileSync(path.join(RAIZ, 'vercel.json'), 'utf8'));
let server;
let browser;

/** Servidor estático mínimo: headers de vercel.json por ruta y fallback a index.html. */
function servir(req, res) {
  let ruta;
  try {
    ruta = decodeURIComponent(new URL(req.url, ORIGEN).pathname);
  } catch {
    res.statusCode = 400;
    return res.end();
  }
  for (const regla of vercel.headers) {
    if (new RegExp(`^${regla.source}$`).test(ruta)) for (const h of regla.headers) res.setHeader(h.key, h.value);
  }
  let archivo = path.resolve(DIST, `.${ruta === '/' ? '/index.html' : ruta}`);
  // Nada fuera de dist/ (../), y lo desconocido cae al index como en Vercel.
  if (!archivo.startsWith(DIST + path.sep) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) {
    archivo = path.join(DIST, 'index.html');
  }
  res.setHeader('Content-Type', TIPOS[path.extname(archivo)] ?? 'application/octet-stream');
  res.end(fs.readFileSync(archivo));
}

before(async () => {
  assert.ok(fs.existsSync(path.join(DIST, 'index.html')), 'falta dist/: corre `npm run e2e` (construye antes)');
  server = http.createServer(servir);
  await new Promise((r) => server.listen(PUERTO, '127.0.0.1', r)); // solo local, nunca la LAN
  browser = await chromium.launch({ channel: 'chrome', headless: true });
});

after(async () => {
  await browser?.close();
  await new Promise((r) => server?.close(r));
});

/** Partida v3 con lo mínimo; `negocios` sobrescribe por id. */
function partida(extra = {}, negocios = {}) {
  const vacio = { count: 0, progressMs: 0, running: false, manager: false, propinaMs: 0, trabajadoMs: 0 };
  const ids = ['elotes', 'aguas', 'tacos', 'tortas', 'fonda', 'panaderia', 'franquicia', 'cadena'];
  const businesses = Object.fromEntries(ids.map((id) => [id, { ...vacio, ...negocios[id] }]));
  return { version: 3, money: 0, runEarned: 0, lifetimeEarned: 0, recipes: 0, upgrades: [], businesses, ...extra };
}

/**
 * Página nueva con errores de consola y violaciones de CSP recogidos. `semilla` se escribe en
 * localStorage antes de que corra el juego (con lastSeen actual si no trae uno).
 */
async function abrir({ semilla, crudo, movil = false, sw = false } = {}) {
  const context = await browser.newContext({
    viewport: movil ? { width: 390, height: 844 } : { width: 1280, height: 800 },
    hasTouch: movil,
    isMobile: movil,
    serviceWorkers: sw ? 'allow' : 'block',
  });
  if (semilla || crudo !== undefined) {
    await context.addInitScript(
      ([clave, valor, texto]) => {
        if (sessionStorage.getItem('sembrado')) return; // solo la primera carga: las recargas leen lo guardado
        sessionStorage.setItem('sembrado', '1');
        localStorage.setItem(clave, texto ?? JSON.stringify({ lastSeen: Date.now(), ...valor }));
      },
      [SAVE_KEY, semilla ?? null, crudo ?? null],
    );
  }
  const page = await context.newPage();
  const errores = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errores.push(m.text());
  });
  page.on('pageerror', (e) => errores.push(String(e)));
  await page.goto(`${ORIGEN}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#app .card');
  return { context, page, errores };
}

/** Cierra el diálogo de bienvenida de Chelo (partida nueva) o cualquier panel abierto. */
async function sinPaneles(page) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

const dinero = (page) => page.locator('.money').textContent();

test('partida nueva: dos tarjetas, sin errores ni violaciones de CSP', async () => {
  const { context, page, errores } = await abrir();
  assert.equal(await page.locator('.card:not([hidden])').count(), 2);
  assert.equal(await dinero(page), '$0');
  assert.deepEqual(errores, []);
  await context.close();
});

test('vender un elote a mano: cobra al terminar la barra', async () => {
  const { context, page, errores } = await abrir();
  await sinPaneles(page);
  await page.locator('.sell[aria-label="Vender: Carrito de elotes"]').click();
  await page.waitForFunction(() => document.querySelector('.money')?.textContent === '$1', null, { timeout: 3000 });
  assert.deepEqual(errores, []);
  await context.close();
});

test('con empleado la tarjeta dice /s y la barra queda fija si la vuelta es rápida; a mano, por vuelta', async () => {
  // Aguas con 50 (dos hitos: 3 s → 750 ms) y empleado; tacos con 25 (6 s → 3 s) barre; elote a mano.
  const semilla = partida(
    { lifetimeEarned: 1e6, runEarned: 1e6 },
    { elotes: { count: 1 }, aguas: { count: 50, manager: true }, tacos: { count: 25, manager: true } },
  );
  const { context, page, errores } = await abrir({ semilla });
  await sinPaneles(page);
  const aguas = page.locator('.card').nth(1);
  const tacos = page.locator('.card').nth(2);
  await aguas.locator('.bar.fija').waitFor();
  assert.match(await aguas.locator('.gana').textContent(), /\/s$/);
  assert.equal(await tacos.locator('.bar.fija').count(), 0);
  assert.match(await tacos.locator('.gana').textContent(), /\/s$/);
  const elotes = page.locator('.card').nth(0); // sin empleado
  assert.match(await elotes.locator('.por').textContent(), /por vuelta/);
  assert.doesNotMatch(await elotes.locator('.gana').textContent(), /\/s$/);
  assert.deepEqual(errores, []);
  await context.close();
});

test('el progreso sobrevive a una recarga', async () => {
  const { context, page } = await abrir({ semilla: partida({ money: 100 }, { elotes: { count: 1 } }) });
  await sinPaneles(page);
  await page.locator('.card .btn.primary').first().click(); // Comprar ×1 elote
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#app .card');
  assert.match(await page.locator('.card .count').first().textContent(), /×2/);
  await context.close();
});

test('contratar, dar propina con precio y ver el /s subir (web)', async () => {
  const semilla = partida(
    { money: 10_000, lifetimeEarned: 10_000, runEarned: 10_000 },
    { elotes: { count: 10 }, aguas: { count: 1 } },
  );
  const { context, page, errores } = await abrir({ semilla });
  await sinPaneles(page);
  await page.locator('nav.lateral button', { hasText: 'Empleados' }).click();
  await page.locator('#personajes button[aria-label^="Contratar a Don Beto"]').click();
  const propina = page.locator('#personajes button[aria-label*="de propina a Don Beto"]');
  await propina.waitFor();
  assert.match(await propina.textContent(), /^Dar \$\d[\d,]* de propina$/);
  assert.equal(await page.locator('#personajes .sello-goma').first().textContent(), 'Contratado');
  // Doble toque sobre Contratar: el segundo cae en "Dar propina" y el bloqueo lo ignora.
  await propina.click();
  await page.waitForTimeout(150);
  assert.equal(await page.locator('.card.propina').count(), 0, 'el doble toque no debe pagar propina');
  assert.match(await propina.textContent(), /^Dar /);
  await page.waitForTimeout(600); // pasa el bloqueo (500 ms), como una persona
  const antes = await page.locator('.rate').textContent();
  await propina.click();
  await page.waitForFunction(() => document.querySelector('.card.propina') !== null);
  const despues = await page.locator('.rate').textContent();
  const num = (t) => Number(t.replace(/[^\d.]/g, ''));
  assert.ok(num(despues) > num(antes), `${antes} → ${despues}`);
  assert.match(await page.locator('#personajes .btn[aria-disabled="true"]').first().textContent(), /×1\.5 · 0:\d\d/);
  assert.deepEqual(errores, []);
  await context.close();
});

test('móvil: Empleados abre en diálogo y la lista vuelve al cerrarlo', async () => {
  const semilla = partida({ money: 100, lifetimeEarned: 100, runEarned: 100 }, { elotes: { count: 1 } });
  const { context, page, errores } = await abrir({ semilla, movil: true });
  await sinPaneles(page);
  await page.locator('button[aria-label^="Empleados"]:visible').first().tap();
  const dlg = page.locator('dialog[open]');
  await dlg.waitFor();
  assert.equal(await dlg.locator('.char-card').count(), 8);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  assert.equal(await page.locator('#personajes .char-card').count(), 8);
  assert.deepEqual(errores, []);
  await context.close();
});

test('vuelta tras ausencia: aviso con lo ganado', async () => {
  const semilla = partida(
    { money: 0, lifetimeEarned: 1, runEarned: 1, lastSeen: Date.now() - 3_600_000 },
    { elotes: { count: 5, manager: true } },
  );
  const { context, page } = await abrir({ semilla });
  const dlg = page.locator('dialog[open]');
  await dlg.waitFor();
  assert.match(await dlg.locator('h2').textContent(), /Bienvenido de vuelta/);
  assert.match(await dlg.locator('.big').textContent(), /^\$/);
  await context.close();
});

test('respaldo: un código exportado se carga desde el diálogo', async () => {
  const codigo = Buffer.from(JSON.stringify({ ...partida({ money: 2000 }), lastSeen: Date.now() })).toString('base64');
  const { context, page } = await abrir();
  await sinPaneles(page);
  await page.locator('nav.lateral button', { hasText: 'Respaldo' }).click();
  await page.locator('dialog[open] textarea[aria-label="Pega aquí un código de partida"]').fill(codigo);
  await page.locator('dialog[open] button', { hasText: 'Cargar partida' }).click();
  await page.waitForFunction(() => document.querySelector('.money')?.textContent === '$2,000');
  await context.close();
});

test('guardado corrupto: aviso y copia ilegible conservada', async () => {
  const { context, page } = await abrir({ crudo: '{basura' });
  const dlg = page.locator('dialog[open]');
  await dlg.waitFor();
  assert.equal(await dlg.locator('h2').textContent(), 'Algo pasó con tu partida');
  assert.equal(await page.evaluate(() => localStorage.getItem('antojitos.unreadable')), '{basura');
  await context.close();
});

test('segunda pestaña: queda bloqueada', async () => {
  const { context, page } = await abrir();
  const otra = await context.newPage();
  await otra.goto(`${ORIGEN}/`, { waitUntil: 'networkidle' });
  await otra.waitForFunction(() => document.body.textContent?.includes('otra pestaña'));
  await page.close();
  await context.close();
});

test('service worker: se registra y controla la página', async () => {
  const { context, page } = await abrir({ sw: true });
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, null, { timeout: 10_000 });
  await context.close();
});
