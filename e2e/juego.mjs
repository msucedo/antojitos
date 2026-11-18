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

/**
 * /api/ranking de mentira (la función real corre en Vercel y se prueba con vitest): guarda apodo y
 * dinero por id y ordena. `envios` cuenta los POST que llegaron, para comprobar que algo NO se envió.
 */
const ranking = new Map();
const envios = [];
function apiRanking(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const responder = (status, body) => {
    res.statusCode = status;
    res.end(JSON.stringify(body));
  };
  const top = () =>
    [...ranking.entries()]
      .sort((a, b) => b[1].money - a[1].money)
      .map(([id, j], i) => ({ id, pos: i + 1, apodo: j.apodo, money: j.money }));
  if (req.method === 'GET') {
    return responder(200, { top: top().map(({ pos, apodo, money }) => ({ pos, apodo, money })), total: ranking.size });
  }
  if (req.method !== 'POST') return responder(405, { error: 'metodo' });
  let cuerpo = '';
  req.on('data', (c) => (cuerpo += c));
  req.on('end', () => {
    envios.push(cuerpo);
    try {
      const state = JSON.parse(JSON.parse(cuerpo).save);
      const { id, apodo } = state.ranking;
      if (typeof apodo !== 'string' || apodo.trim().length < 3) return responder(400, { error: 'apodo' });
      ranking.set(id, { apodo: apodo.trim(), money: state.money });
      responder(200, { pos: top().find((f) => f.id === id).pos, total: ranking.size });
    } catch {
      responder(400, { error: 'save' });
    }
  });
}

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
  if (ruta.startsWith('/api/ranking')) return apiRanking(req, res);
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

/** Los 26 logros, en el orden del catálogo (src/logros.ts). */
const LOGRO_IDS = [
  'venta',
  'clics-100',
  'clics-1000',
  'negocios-8',
  'unidades-25',
  'unidades-200',
  'todos-100',
  'empleado',
  'empleados-8',
  'estrella',
  'estrellas-3',
  'todos-estrella',
  'propina',
  'propinas-10',
  'mejoras-todas',
  'herencia',
  'herencias-5',
  'recetas-10',
  'recetas-50',
  'ganado-1e6',
  'ganado-1e12',
  'ganado-1e15',
  'jugado-1h',
  'jugado-10h',
  'racha-7',
  'imperio',
];

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
async function abrir({ semilla, crudo, movil = false, sw = false, quieto = false } = {}) {
  const context = await browser.newContext({
    viewport: movil ? { width: 390, height: 844 } : { width: 1280, height: 800 },
    hasTouch: movil,
    isMobile: movil,
    serviceWorkers: sw ? 'allow' : 'block',
    reducedMotion: quieto ? 'reduce' : 'no-preference',
  });
  if (semilla || crudo !== undefined) {
    await context.addInitScript(
      ([clave, valor, texto]) => {
        if (sessionStorage.getItem('sembrado')) return; // solo la primera carga: las recargas leen lo guardado
        sessionStorage.setItem('sembrado', '1');
        // "AYER" en racha.ultimoDia se resuelve aquí, en la zona local del navegador.
        if (valor?.racha?.ultimoDia === 'AYER') {
          const d = new Date();
          d.setDate(d.getDate() - 1);
          const dos = (n) => String(n).padStart(2, '0');
          valor.racha.ultimoDia = `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
        }
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
  const antes = await page.locator('.rate [aria-hidden]').textContent();
  await propina.click();
  await page.waitForFunction(() => document.querySelector('.card.propina') !== null);
  const despues = await page.locator('.rate [aria-hidden]').textContent();
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
  await page.locator('.bottom button[aria-label^="Empleados"]').tap();
  const dlg = page.locator('dialog[open]');
  await dlg.waitFor();
  assert.equal(await dlg.locator('.char-card').count(), 8);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  assert.equal(await page.locator('#personajes .char-card').count(), 8);
  assert.deepEqual(errores, []);
  await context.close();
});

test('historial (web): el disco abre el panel y al contratar aparece la entrada con su hora', async () => {
  const semilla = partida(
    { money: 10_000, lifetimeEarned: 10_000, runEarned: 10_000 },
    { elotes: { count: 10 }, aguas: { count: 1 } },
  );
  const { context, page, errores } = await abrir({ semilla });
  await sinPaneles(page);
  await page.locator('nav.lateral button', { hasText: 'Empleados' }).click();
  await page.locator('#personajes button[aria-label^="Contratar a Don Beto"]').click();
  await page.locator('nav.lateral button', { hasText: 'Historial' }).click();
  await page.waitForSelector('#historial.open');
  assert.equal(
    await page.locator('nav.lateral button[aria-controls="historial"]').getAttribute('aria-expanded'),
    'true',
  );
  // Más reciente primero: el logro "Primer empleado" se anuncia después de contratar.
  const textos = await page.locator('#historial .hist-texto').allTextContents();
  assert.match(textos[0], /^Logro: Primer empleado\./);
  assert.match(textos[1], /^Contrataste a Don Beto\./);
  assert.match(await page.locator('#historial .hist-hora').first().textContent(), /^\d\d:\d\d$/);
  assert.equal(await page.locator('#historial .hist-vacio').isHidden(), true);
  assert.deepEqual(errores, []);
  await context.close();
});

test('móvil: Historial abre en diálogo desde la barra y el cuerpo vuelve al cerrarlo', async () => {
  const semilla = partida({ money: 100, lifetimeEarned: 100, runEarned: 100 }, { elotes: { count: 1 } });
  const { context, page, errores } = await abrir({ semilla, movil: true });
  await sinPaneles(page);
  await page.locator('.bottom button[aria-label="Historial"]').tap();
  const dlg = page.locator('dialog[open]');
  await dlg.waitFor();
  assert.equal(await dlg.locator('h2').textContent(), 'Historial');
  assert.equal(await dlg.locator('.hist-vacio').textContent(), 'Aún no pasa nada.');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  assert.equal(await page.locator('#historial .hist-body').count(), 1);
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

test('logro: la primera venta a mano lo desbloquea y el badge del Álbum se apaga al abrirlo (web)', async () => {
  const { context, page, errores } = await abrir();
  await sinPaneles(page);
  await page.locator('.sell[aria-label="Vender: Carrito de elotes"]').click();
  const albumBtn = page.locator('.lateral button[aria-label^="Álbum"]');
  await page.waitForFunction(
    () => document.querySelector('.lateral button[aria-label="Álbum: 1 logro nuevo"]') !== null,
    null,
    { timeout: 3000 },
  );
  assert.match(await page.locator('p[aria-live]').textContent(), /^Logro: Primer elote\. \+2 % de ventas\./);
  assert.equal(await albumBtn.locator('.lat-badge').textContent(), '1');
  await albumBtn.click();
  await page.locator('#album .estampilla.nueva').waitFor(); // el marcado va en un rAF tras abrir
  assert.equal(await page.locator('#album .estampilla:not(.bloqueada)').count(), 1);
  assert.equal(await page.locator('#album .estampilla').count(), 26);
  assert.equal(await albumBtn.getAttribute('aria-label'), 'Álbum');
  // Abre en Logros con el recién desbloqueado marcado como nuevo; la Libreta se escribe aunque esté oculta.
  assert.equal(await page.locator('#album [role="tab"][aria-selected="true"]').textContent(), 'Logros');
  assert.equal(await page.locator('#album .estampilla.nueva').count(), 1);
  assert.match(await page.locator('#album .estampilla.nueva .up-name').textContent(), /Primer elote/);
  assert.match(await page.locator('#album .libreta').textContent(), /Logros1 de 26/);
  // Teclado: → activa Libreta, ← vuelve.
  await page.locator('#album [role="tab"][aria-selected="true"]').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#album [role="tab"][aria-selected="true"]').textContent(), 'Libreta');
  assert.equal(await page.locator('#album .estampillas').isHidden(), true);
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.locator('#album [role="tab"][aria-selected="true"]').textContent(), 'Logros');
  // Cerrar y reabrir: ya nada es nuevo.
  await albumBtn.click();
  await page.waitForTimeout(200);
  await albumBtn.click();
  await page.waitForTimeout(400);
  assert.equal(await page.locator('#album .estampilla.nueva').count(), 0);
  assert.deepEqual(errores, []);
  await context.close();
});

test('logro por tiempo con el Álbum abierto: se sella a la vista y el badge no se enciende', async () => {
  // Un clic fuera del panel lo cierra, así que con el Álbum abierto solo caen logros por tiempo: "Una hora".
  const semilla = partida({ version: 4, stats: { jugadoMs: 3_600_000 - 400 } }, { elotes: { count: 1 } });
  const { context, page, errores } = await abrir({ semilla });
  await sinPaneles(page);
  const albumBtn = page.locator('.lateral button[aria-label^="Álbum"]');
  await albumBtn.click();
  await page.waitForFunction(() => document.querySelectorAll('#album .estampilla:not(.bloqueada)').length === 1, null, {
    timeout: 4000,
  });
  await page.waitForTimeout(200);
  assert.match(await page.locator('#album .estampilla:not(.bloqueada) .up-name').textContent(), /Una hora/);
  assert.equal(await page.locator('#album .estampilla.nueva').count(), 1); // cayó a la vista: marcado
  assert.equal(await albumBtn.getAttribute('aria-label'), 'Álbum');
  assert.equal(await albumBtn.locator('.lat-badge').isHidden(), true);
  assert.deepEqual(errores, []);
  await context.close();
});

test('móvil: el Álbum abre en diálogo desde la barra inferior y el cuerpo vuelve al cerrarlo', async () => {
  const { context, page, errores } = await abrir({ movil: true });
  await sinPaneles(page);
  await page.locator('.album-btn').tap();
  const dlg = page.locator('dialog[open]');
  await dlg.waitFor();
  assert.equal(await dlg.locator('.estampilla').count(), 26);
  assert.equal(await dlg.locator('.libreta dt').count(), 17);
  assert.equal(await dlg.locator('.libreta').isHidden(), true); // abre en Logros
  await dlg.getByRole('tab', { name: 'Libreta' }).tap();
  assert.equal(await dlg.locator('.estampillas').isHidden(), true);
  assert.equal(await dlg.locator('.libreta').isVisible(), true);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  assert.equal(await page.locator('#album .estampilla').count(), 26);
  assert.deepEqual(errores, []);
  await context.close();
});

test('carga v3 avanzada: migra a la versión actual y apunta los logros de golpe con un solo anuncio, sin sonido ni Chelo', async () => {
  const negocios = Object.fromEntries(
    ['elotes', 'aguas', 'tacos', 'tortas', 'fonda', 'panaderia', 'franquicia', 'cadena'].map((id) => [
      id,
      { count: 100, manager: true },
    ]),
  );
  const semilla = partida({ money: 5, lifetimeEarned: 2e12, runEarned: 2e12, recipes: 1 }, negocios);
  const { context, page, errores } = await abrir({ semilla });
  await page.waitForFunction(() => /^Logros: /.test(document.querySelector('p[aria-live]')?.textContent ?? ''), null, {
    timeout: 3000,
  });
  const anuncio = await page.locator('p[aria-live]').textContent();
  // negocios-8, unidades-25, todos-100, empleado, empleados-8, herencia, 1e6, 1e12: ocho de golpe, +16 %.
  assert.match(anuncio, /\+16 % de ventas\.$/);
  assert.equal(await page.locator('.lateral button[aria-label="Álbum: 8 logros nuevos"]').count(), 1);
  assert.equal(await page.locator('dialog[open]').count(), 0);
  assert.doesNotMatch((await page.locator('.guia-texto').textContent()) ?? '', /logro/i);
  // El autoguardado corre cada 5 s: se espera a que escriba la versión migrada.
  await page.waitForFunction((k) => JSON.parse(localStorage.getItem(k) ?? '{}').version >= 4, SAVE_KEY, {
    timeout: 8000,
  });
  const guardado = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}'), SAVE_KEY);
  assert.equal(guardado.logros.length, 8);
  assert.deepEqual(errores, []);
  await context.close();
});

test('racha: partida nueva no regala el primer día (ningún diálogo tras la bienvenida de Chelo)', async () => {
  const { context, page, errores } = await abrir();
  await sinPaneles(page);
  await page.waitForTimeout(400);
  assert.equal(await page.locator('dialog[open]').count(), 0);
  assert.equal(await page.locator('#chelo .guia-faq li[hidden]').count(), 1); // sin regalo pendiente
  assert.deepEqual(errores, []);
  await context.close();
});

test('racha: al volver al día siguiente sale "Día 1", Recibir suma $120 y persiste al instante', async () => {
  const semilla = partida({ racha: { dias: 0, ultimoDia: 'AYER' } }, { elotes: { count: 1 } });
  const { context, page, errores } = await abrir({ semilla });
  // La bienvenida de Chelo (web) es un panel, no un modal: la racha abre encima sin esperar.
  const dlg = page.locator('dialog[open]');
  await dlg.waitFor();
  assert.match(await dlg.locator('h2').textContent(), /Día 1 de racha/);
  assert.match(await dlg.locator('.big').textContent(), /^\$120/);
  assert.equal(await dlg.locator('.racha-dia.hoy').count(), 1);
  await dlg.getByRole('button', { name: 'Recibir' }).click();
  await page.waitForFunction(() => document.querySelector('.money')?.textContent === '$120', null, { timeout: 2000 });
  assert.equal(await page.locator('dialog[open]').count(), 0);
  const guardado = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}'), SAVE_KEY);
  assert.equal(guardado.racha.dias, 1);
  await page.reload();
  await page.waitForSelector('#app .card');
  await page.waitForTimeout(600);
  assert.equal(await page.locator('dialog[open]').count(), 0); // ya cobrado hoy
  assert.deepEqual(errores, []);
  await context.close();
});

test('racha: el día 7 regala una receta sin heredar y no gasta las pendientes', async () => {
  const semilla = partida(
    { money: 10, lifetimeEarned: 10, runEarned: 10, racha: { dias: 6, ultimoDia: 'AYER' } },
    { elotes: { count: 1 } },
  );
  const { context, page, errores } = await abrir({ semilla });
  const dlg = page.locator('dialog[open]');
  await dlg.waitFor();
  assert.match(await dlg.locator('h2').textContent(), /Día 7 de racha/);
  assert.match(await dlg.locator('.big').textContent(), /\+1 receta/);
  await dlg.getByRole('button', { name: 'Recibir' }).click();
  await page.waitForTimeout(300);
  assert.match(await page.locator('.recipes').textContent(), /1 receta/);
  const guardado = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}'), SAVE_KEY);
  assert.equal(guardado.recipes, 1);
  assert.equal(guardado.recetasRegalo, 1);
  assert.equal(guardado.racha.dias, 7);
  // Sin pendientes no se hereda, pero la receta regalada ya se puede cocinar: Herencia abre el panel.
  const herencia = page.locator('.lateral button[aria-label^="Here"]');
  assert.equal(await herencia.count(), 1);
  assert.equal(await herencia.isDisabled(), false);
  assert.equal(await herencia.getAttribute('aria-label'), 'Herencia');
  await herencia.click();
  await page.waitForTimeout(400);
  assert.equal(await page.locator('#herencia.open .receta-card').count(), 6);
  assert.equal(await page.locator('#herencia button[aria-label^="Cocinar Canasta"]').isDisabled(), false);
  assert.equal(await page.locator('#heredar').isDisabled(), true);
  await sinPaneles(page);
  await page.waitForFunction(
    () => /Siete seguidos/.test(document.querySelector('p[aria-live]')?.textContent ?? ''),
    null,
    {
      timeout: 2000,
    },
  );
  assert.deepEqual(errores, []);
  await context.close();
});

test('racha: tras una ausencia primero "Bienvenido de vuelta" y luego el regalo', async () => {
  const semilla = partida(
    {
      money: 0,
      lifetimeEarned: 1,
      runEarned: 1,
      lastSeen: Date.now() - 3_600_000,
      racha: { dias: 2, ultimoDia: 'AYER' },
    },
    { elotes: { count: 5, manager: true } },
  );
  const { context, page, errores } = await abrir({ semilla });
  const dlg = page.locator('dialog[open]');
  await dlg.waitFor();
  assert.match(await dlg.locator('h2').textContent(), /Bienvenido de vuelta/);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  assert.match(await page.locator('dialog[open] h2').textContent(), /Día 3 de racha/);
  assert.deepEqual(errores, []);
  await context.close();
});

test('racha: cerrar sin recibir deja el botón y el tip en Chelo; al recargar vuelve a salir', async () => {
  const semilla = partida(
    { money: 10, lifetimeEarned: 10, runEarned: 10, racha: { dias: 0, ultimoDia: 'AYER' } },
    { elotes: { count: 1 } },
  );
  const { context, page, errores } = await abrir({ semilla });
  const dlg = page.locator('dialog[open]');
  await dlg.waitFor();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.locator('.lateral button[aria-label^="Doña Chelo"]').click();
  await page.waitForTimeout(400);
  assert.match(await page.locator('#chelo .guia-texto').textContent(), /regalo del día/);
  const btn = page.locator('#chelo .guia-faq button', { hasText: 'Recibir regalo del día' });
  assert.equal(await btn.isVisible(), true);
  // pagehide persiste al recargar; la racha sigue sin cobrar.
  await page.reload();
  await page.waitForSelector('#app .card');
  await page.locator('dialog[open]').waitFor();
  assert.match(await page.locator('dialog[open] h2').textContent(), /Día 1 de racha/);
  await page.locator('dialog[open]').getByRole('button', { name: 'Recibir' }).click();
  await page.waitForTimeout(300);
  assert.equal(await btn.isHidden(), true);
  assert.deepEqual(errores, []);
  await context.close();
});

test('guardado de una versión más nueva: aviso, se juega sin guardar y el guardado queda intacto', async () => {
  const crudo = JSON.stringify({ ...partida({ money: 999 }), version: 99 });
  const { context, page, errores } = await abrir({ crudo });
  const dlg = page.locator('dialog[open]');
  await dlg.waitFor();
  assert.match(await dlg.locator('h2').textContent(), /versión más nueva/);
  await page.keyboard.press('Escape');
  // persist() directo (pagehide) y un intento de importar: nada escribe en solo lectura.
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  assert.equal(await page.evaluate((k) => localStorage.getItem(k), SAVE_KEY), crudo);
  assert.deepEqual(errores, []);
  await context.close();
});

test('ajustes: Sonido conmuta y un código exportado se carga desde el diálogo', async () => {
  const codigo = Buffer.from(JSON.stringify({ ...partida({ money: 2000 }), lastSeen: Date.now() })).toString('base64');
  const { context, page, errores } = await abrir();
  await sinPaneles(page);
  await page.locator('nav.lateral button', { hasText: 'Ajustes' }).click();
  // aria-pressed cambia en el siguiente tramo de render (10 Hz), no en el clic.
  await page.locator('dialog[open] button', { hasText: 'Sonido' }).click();
  await page.waitForFunction(() =>
    [...document.querySelectorAll('dialog[open] button[aria-pressed="true"]')].some((b) => b.textContent === 'Sonido'),
  );
  await page.locator('dialog[open] textarea[aria-label="Pega aquí un código de partida"]').fill(codigo);
  await page.locator('dialog[open] button', { hasText: 'Cargar partida' }).click();
  await page.waitForFunction(() => document.querySelector('.money')?.textContent === '$2,000');
  assert.deepEqual(errores, []);
  await context.close();
});

test('herencia (web): cocinar una receta gasta su +2 %, se guarda, y Heredar pide confirmación y arranca con la canasta', async () => {
  // 3 recetas de por vida, 2 pendientes (lifetime 1e12 ⇒ 5 ganadas en total).
  const semilla = partida(
    { version: 6, money: 10, lifetimeEarned: 1e12, runEarned: 1e12, recipes: 3 },
    { elotes: { count: 1 } },
  );
  const { context, page, errores } = await abrir({ semilla });
  await sinPaneles(page);
  assert.match(await page.locator('.recipes').textContent(), /3 recetas \(\+6%\)/);
  const herencia = page.locator('.lateral button[aria-label^="Herencia"]');
  assert.equal(await herencia.getAttribute('aria-label'), 'Herencia · +2 recetas');
  await herencia.click();
  await page.waitForTimeout(400);
  assert.match(await page.locator('.herencia-resumen').textContent(), /3 recetas para cocinar.*ganas 2 recetas/);
  await page.locator('#herencia button[aria-label^="Cocinar Canasta"]').click();
  await page.waitForTimeout(300);
  assert.match(await page.locator('.recipes').textContent(), /2 recetas \(\+4%\)/);
  assert.match(await page.locator('#app .card').first().locator('.count').textContent(), /25/); // la canasta se nota ya
  const guardado = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}'), SAVE_KEY);
  assert.equal(guardado.recetario.canasta, 1);
  assert.equal(guardado.recipes, 3);
  // Heredar: confirmación aparte (destructivo) y la línea de Chelo porque 2 pendientes no llegan a 5.
  await page.locator('#heredar').click();
  const dlg = page.locator('dialog[open]');
  await dlg.waitFor();
  assert.match(await dlg.locator('h2').textContent(), /Herencia/);
  assert.match(await dlg.textContent(), /recomienda esperar a 5 recetas/);
  await dlg.getByRole('button', { name: 'Heredar (+2 recetas)' }).click();
  await page.waitForTimeout(400);
  assert.equal(await page.locator('dialog[open]').count(), 0);
  assert.equal(await page.locator('#herencia.open').count(), 0);
  assert.match(await page.locator('.recipes').textContent(), /4 recetas \(\+8%\)/); // 5 de por vida − 1 cocinada
  assert.match(await page.locator('#app .card').first().locator('.count').textContent(), /25/);
  assert.deepEqual(errores, []);
  await context.close();
});

test('móvil: Herencia abre en diálogo desde la barra inferior y el cuerpo vuelve al cerrarlo', async () => {
  const semilla = partida(
    { version: 6, money: 10, lifetimeEarned: 10, runEarned: 10, recipes: 1 },
    { elotes: { count: 1 } },
  );
  const { context, page, errores } = await abrir({ semilla, movil: true });
  await sinPaneles(page);
  const heir = page.locator('.bottom .btn.heir');
  assert.equal(await heir.textContent(), 'Herencia');
  await heir.click();
  const dlg = page.locator('dialog[open]');
  await dlg.waitFor();
  assert.match(await dlg.locator('h2').textContent(), /Herencia/);
  assert.equal(await dlg.locator('.receta-card').count(), 6);
  assert.equal(await dlg.locator('#heredar').isDisabled(), true);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  assert.equal(await page.locator('dialog[open]').count(), 0);
  assert.equal(await page.locator('#herencia .receta-card').count(), 6);
  assert.deepEqual(errores, []);
  await context.close();
});

test('álbum completo: con todos los logros sale el letrero', async () => {
  const { context, page } = await abrir({
    semilla: partida({ version: 6, lifetimeEarned: 1 }, { elotes: { count: 1 } }),
  });
  await sinPaneles(page);
  const ids = await page.evaluate(() => [...document.querySelectorAll('.estampilla .up-name')].length);
  assert.equal(ids, 26);
  await context.close();
  // Segunda carga con los 26 ids: el letrero se ve al abrir el Álbum.
  const todos = partida(
    { version: 6, lifetimeEarned: 1, logros: LOGRO_IDS, logrosVistos: 26 },
    { elotes: { count: 1 } },
  );
  const otra = await abrir({ semilla: todos });
  await sinPaneles(otra.page);
  assert.equal(await otra.page.locator('.album-completo').isVisible(), false);
  await otra.page.locator('.lateral button[aria-label^="Álbum"]').click();
  await otra.page.waitForTimeout(400);
  assert.equal(await otra.page.locator('#album.open .album-completo').isVisible(), true);
  assert.match(await otra.page.locator('.album-completo').textContent(), /Álbum completo.*quedó completo/);
  assert.deepEqual(otra.errores, []);
  await otra.context.close();
});

/** Partida con tres logros: un plato (venta), un símbolo del sprite (clics-100) y un retrato (empleado). */
const conLogros = () =>
  partida(
    { version: 6, lifetimeEarned: 1, logros: ['venta', 'clics-100', 'empleado'], logrosVistos: 3 },
    { elotes: { count: 1 } },
  );

test('vitrina 3D (web): plato, sprite y retrato giran en WebGL; Esc cierra y el foco vuelve a la estampilla', async () => {
  const { context, page, errores } = await abrir({ semilla: conLogros() });
  await sinPaneles(page);
  await page.locator('.lateral button[aria-label^="Álbum"]').click();
  await page.waitForTimeout(400);
  // Las bloqueadas no tienen botón a la vista.
  assert.equal(await page.locator('#album .estampilla-ver:not([hidden])').count(), 3);
  for (const nombre of ['Primer elote', 'Mano caliente', 'Primer empleado']) {
    const ver = page.getByRole('button', { name: `Ver ${nombre}` });
    await ver.click();
    const dlg = page.locator('dialog[open]');
    assert.equal(await dlg.locator('h2').textContent(), nombre);
    await dlg.locator('.vitrina[data-modo="3d"]').waitFor({ timeout: 5000 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    assert.equal(await page.locator('dialog[open]').count(), 0);
    assert.equal(await ver.evaluate((b) => b === document.activeElement), true);
    // El panel del Álbum sigue abierto (Esc cerró solo la vitrina).
    assert.equal(await page.locator('#album.open').count(), 1);
  }
  assert.deepEqual(errores, []);
  await context.close();
});

test('vitrina 3D: abrir y cerrar 20 veces seguidas, también antes de que cargue, sin errores', async () => {
  const { context, page, errores } = await abrir({ semilla: conLogros() });
  // Cada contexto webgl2 que se crea, para comprobar al final que todos se soltaron.
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    window.__contextos = [];
    HTMLCanvasElement.prototype.getContext = function (tipo, ...resto) {
      const ctx = original.call(this, tipo, ...resto);
      if (tipo === 'webgl2' && ctx) window.__contextos.push(ctx);
      return ctx;
    };
  });
  await sinPaneles(page);
  await page.locator('.lateral button[aria-label^="Álbum"]').click();
  await page.waitForTimeout(400);
  const ver = page.getByRole('button', { name: 'Ver Mano caliente' });
  for (let i = 0; i < 20; i++) {
    await ver.click();
    // La mitad se cierra en el acto (chunk o textura a medio cargar); la otra, ya girando.
    if (i % 2) await page.locator('.vitrina[data-modo="3d"]').waitFor({ timeout: 5000 });
    await page.keyboard.press('Escape');
    await page.locator('dialog[open]').waitFor({ state: 'detached' });
  }
  await page.waitForTimeout(500); // que terminen las cargas pendientes de los cierres rápidos
  assert.equal(await page.locator('dialog, .vitrina').count(), 0);
  // Ninguno queda vivo, tampoco los de cierres antes de montar (Chrome tope 16: se notaría al desalojar).
  const vivos = await page.evaluate(() => window.__contextos.filter((c) => !c.isContextLost()).length);
  assert.equal(await page.evaluate(() => window.__contextos.length), 20);
  assert.equal(vivos, 0);
  assert.deepEqual(errores, []);
  await context.close();
});

test('vitrina sin el chunk de three: se queda el arte 2D, sin errores', async () => {
  const { context, page, errores } = await abrir({ semilla: conLogros() });
  await page.route(/\/assets\/vitrina-[\w-]+\.js$/, (r) => r.abort());
  await sinPaneles(page);
  await page.locator('.lateral button[aria-label^="Álbum"]').click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Ver Primer elote' }).click();
  const vitrina = page.locator('dialog[open] .vitrina[data-modo="2d"]');
  await vitrina.waitFor({ timeout: 5000 });
  assert.equal(await vitrina.locator('.vitrina-2d').isVisible(), true);
  // El aborto del chunk sale como error de red en la consola: es lo que se prueba, no un fallo del juego.
  assert.deepEqual(
    errores.filter((e) => !/ERR_FAILED|Failed to fetch dynamically imported module/.test(e)),
    [],
  );
  await context.close();
});

test('móvil: la vitrina se apila sobre el diálogo del Álbum y al cerrarla el Álbum sigue abierto', async () => {
  const { context, page, errores } = await abrir({ semilla: conLogros(), movil: true });
  await sinPaneles(page);
  await page.locator('.album-btn').tap();
  await page.locator('dialog[open]').waitFor();
  await page.getByRole('button', { name: 'Ver Primer elote' }).tap();
  await page.locator('.vitrina[data-modo="3d"]').waitFor({ timeout: 5000 });
  assert.equal(await page.locator('dialog[open]').count(), 2);
  await page
    .locator('dialog[open]', { has: page.locator('.vitrina') })
    .getByRole('button', { name: 'Cerrar' })
    .tap();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('dialog[open]').count(), 1);
  assert.equal(await page.locator('dialog[open] .estampilla').count(), 26);
  // Cruzar a web cierra todo, la vitrina incluida.
  await page.getByRole('button', { name: 'Ver Primer elote' }).tap();
  await page.locator('.vitrina').waitFor();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(400);
  assert.equal(await page.locator('dialog[open]').count(), 0);
  assert.deepEqual(errores, []);
  await context.close();
});

const conMejoras = () =>
  partida(
    { version: 6, money: 50_000, lifetimeEarned: 60_000, runEarned: 60_000 },
    { elotes: { count: 30 }, aguas: { count: 12 } },
  );

test('móvil: Mejoras en diálogo desde la barra (badge, compra) y Cantidad cicla con un botón', async () => {
  const { context, page, errores } = await abrir({ semilla: conMejoras(), movil: true });
  await sinPaneles(page);
  // Sin franja: las mejoras ya no están a la vista sobre las tarjetas.
  assert.equal(await page.locator('#upgrades').isVisible(), false);
  const mejoras = page.locator('.bottom .up-btn');
  assert.equal(await mejoras.getAttribute('aria-label'), 'Mejoras: 1 por comprar');
  assert.equal(await mejoras.locator('.lat-badge').textContent(), '1');
  await mejoras.tap();
  const dlg = page.locator('dialog[open]');
  assert.equal(await dlg.locator('h2').textContent(), 'Mejoras');
  await dlg
    .getByRole('button', { name: /^Comprar / })
    .first()
    .tap();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.bottom .up-btn .lat-badge').isVisible(), false);
  await dlg.getByRole('button', { name: 'Cerrar' }).tap();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('dialog[open]').count(), 0);
  // Cantidad: un solo botón que cicla ×1 → ×10 → Máx → ×1 y lo dice en su nombre.
  const modo = page.locator('.bottom .modo-btn');
  for (const m of ['×10', 'Máx', '×1']) {
    await modo.tap();
    await page.waitForFunction(
      (m) => document.querySelector('.bottom .modo-btn')?.getAttribute('aria-label') === `Cantidad a comprar: ${m}`,
      m,
      { timeout: 2000 },
    );
  }
  assert.deepEqual(errores, []);
  await context.close();
});

test('móvil: sin mejoras que ofrecer, el botón de Mejoras está deshabilitado', async () => {
  const { context, page, errores } = await abrir({ movil: true });
  await sinPaneles(page);
  assert.equal(await page.locator('.bottom .up-btn').isDisabled(), true);
  assert.deepEqual(errores, []);
  await context.close();
});

test('móvil: Cerrar arriba a la derecha y a la vista aunque el diálogo haga scroll', async () => {
  const { context, page, errores } = await abrir({ movil: true });
  await sinPaneles(page);
  await page.setViewportSize({ width: 390, height: 500 }); // ventana baja: el cuerpo de Ajustes no cabe
  await page.locator('.title-row button[aria-label="Ajustes"]').tap();
  const dlg = page.locator('dialog[open]');
  const cuerpo = dlg.locator('.modal-body');
  // Ajustes abre con el foco en Sonido, como antes de mover Cerrar.
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Sonido');
  assert.ok(await cuerpo.evaluate((c) => ((c.scrollTop = c.scrollHeight), c.scrollTop > 0))); // sí hizo scroll
  const cerrar = dlg.getByRole('button', { name: 'Cerrar' });
  const caja = await cerrar.boundingBox();
  const titulo = await dlg.locator('h2').boundingBox();
  assert.ok(caja && titulo && caja.y < titulo.y + titulo.height && caja.x > titulo.x); // en la fila del título, a la derecha
  assert.ok(caja.y >= 0 && caja.y + caja.height <= 500);
  await cerrar.tap();
  assert.equal(await page.locator('dialog[open]').count(), 0);
  assert.deepEqual(errores, []);
  await context.close();
});

test('móvil: atrás del navegador cierra el diálogo abierto y el juego sigue', async () => {
  const { context, page, errores } = await abrir({ semilla: conLogros(), movil: true });
  await sinPaneles(page);
  const url = page.url();
  await page.locator('.album-btn').tap();
  await page.locator('dialog[open]').waitFor();
  await page.getByRole('button', { name: 'Ver Primer elote' }).tap();
  assert.equal(await page.locator('dialog[open]').count(), 2);
  await page.evaluate(() => history.back());
  await page.waitForTimeout(300);
  assert.equal(await page.locator('dialog[open]').count(), 1); // la vitrina; el Álbum sigue
  // Adelante no cierra nada: el historial vuelve solo a la entrada del Álbum.
  await page.evaluate(() => history.forward());
  await page.waitForTimeout(300);
  assert.equal(await page.locator('dialog[open]').count(), 1);
  assert.deepEqual(await page.evaluate(() => history.state), { antojitosDialogo: 1 });
  await page.evaluate(() => history.back());
  await page.waitForTimeout(300);
  assert.equal(await page.locator('dialog[open]').count(), 0);
  assert.equal(await page.evaluate(() => history.state), null);
  assert.equal(page.url(), url);
  // Cerrar con el botón consume su entrada: atrás no queda "atorado" en entradas viejas.
  await page.locator('.album-btn').tap();
  await page.locator('dialog[open]').getByRole('button', { name: 'Cerrar' }).tap();
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => history.state), null);
  assert.equal(page.url(), url);
  assert.deepEqual(errores, []);
  await context.close();
});

test('móvil: el Álbum mide lo mismo en Logros y en Libreta y las pestañas siguen a la vista al bajar', async () => {
  const { context, page, errores } = await abrir({ semilla: conLogros(), movil: true });
  await sinPaneles(page);
  await page.locator('.album-btn').tap();
  const papel = page.locator('dialog[open] .modal-paper');
  const enLogros = await papel.boundingBox();
  await page.locator('#album-panel-logros').evaluate((p) => (p.scrollTop = p.scrollHeight));
  const tab = await page.getByRole('tab', { name: 'Libreta' }).boundingBox();
  assert.ok(tab && tab.y > enLogros.y && tab.y < enLogros.y + 140); // arriba, no se fue con el scroll
  await page.getByRole('tab', { name: 'Libreta' }).tap();
  await page.waitForTimeout(400);
  const enLibreta = await papel.boundingBox();
  assert.deepEqual(enLibreta, enLogros);
  assert.deepEqual(errores, []);
  await context.close();
});

test('móvil: barra de seis discos en el orden del escritorio; arriba solo Ranking y Ajustes', async () => {
  // $1,000 con un elote: alcanza para contratar a su empleado ($500) → badge de Empleados.
  const semilla = partida({ money: 1000, lifetimeEarned: 1000, runEarned: 1000 }, { elotes: { count: 1 } });
  const { context, page, errores } = await abrir({ semilla, movil: true });
  await sinPaneles(page);
  const arriba = await page
    .locator('.title-row button')
    .evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label')));
  assert.deepEqual(arriba, ['Ranking mundial', 'Ajustes']);
  const fila = page.locator('.bottom-row > button');
  const nombres = await fila.evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label') ?? ''));
  const orden = ['Historial', 'Doña Chelo', 'Mejoras', 'Empleados', 'Álbum', 'Cantidad a comprar'];
  assert.equal(nombres.length, orden.length);
  orden.forEach((o, i) => assert.ok(nombres[i]?.startsWith(o), `${nombres[i]} en el lugar de ${o}`));
  const empleados = page.locator('.bottom button[aria-label^="Empleados"]');
  await page.waitForFunction(
    () =>
      document.querySelector('.bottom button[aria-label^="Empleados"]')?.getAttribute('aria-label') ===
      'Empleados: 1 por contratar',
    null,
    { timeout: 2000 },
  );
  assert.equal(await empleados.locator('.lat-badge').textContent(), '1');
  // Los discos también se hunden al presionarlos.
  const hist = page.locator('.bottom button[aria-label="Historial"]');
  const c = await hist.boundingBox();
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
  await page.mouse.down();
  assert.equal(await hist.evaluate((b) => getComputedStyle(b).translate), '0px 2px');
  await page.mouse.up();
  await page.keyboard.press('Escape'); // el clic abrió el Historial
  await page.waitForTimeout(200);
  // Cabe a 390, 360 y 320: el último disco dentro del margen de 16 px y al menos 4 px entre discos.
  for (const ancho of [390, 360, 320]) {
    await page.setViewportSize({ width: ancho, height: 700 });
    const cajas = await fila.evaluateAll((bs) => bs.map((b) => b.getBoundingClientRect().toJSON()));
    assert.ok(cajas.at(-1).right <= ancho - 16, `a ${ancho} px el último disco se sale`);
    for (let i = 1; i < cajas.length; i++)
      assert.ok(cajas[i].left - cajas[i - 1].right >= 4, `a ${ancho} px los discos ${i - 1} y ${i} se pegan`);
  }
  assert.deepEqual(errores, []);
  await context.close();
});

test('móvil: con una ventana abierta solo hace scroll la ventana, no la página de abajo', async () => {
  const { context, page, errores } = await abrir({ semilla: conMejoras(), movil: true });
  await sinPaneles(page);
  await page.setViewportSize({ width: 390, height: 500 });
  await page.evaluate(() => window.scrollTo(0, 200));
  const y0 = await page.evaluate(() => window.scrollY);
  assert.ok(y0 > 0); // la página sí tiene scroll: la prueba no es en vacío
  await page.locator('.title-row button[aria-label="Ajustes"]').tap();
  const dlg = page.locator('dialog[open]');
  await dlg.waitFor();
  const rueda = async (x, y) => {
    await page.mouse.move(x, y);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(150);
  };
  await rueda(3, 250); // fondo oscuro, fuera del papel
  assert.equal(await page.evaluate(() => window.scrollY), y0);
  const titulo = await dlg.locator('h2').boundingBox();
  await rueda(titulo.x + 10, titulo.y + titulo.height / 2); // cabecera
  assert.equal(await page.evaluate(() => window.scrollY), y0);
  const cuerpo = await dlg.locator('.modal-body').boundingBox();
  await rueda(cuerpo.x + cuerpo.width / 2, cuerpo.y + 15); // la ventana sí se desplaza (arriba: no en el textarea, que tiene su scroll)
  assert.ok((await dlg.locator('.modal-body').evaluate((c) => c.scrollTop)) > 0);
  assert.equal(await page.evaluate(() => window.scrollY), y0);
  await dlg.getByRole('button', { name: 'Cerrar' }).tap();
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => window.scrollY), y0); // la página quedó donde estaba
  await rueda(195, 300);
  assert.notEqual(await page.evaluate(() => window.scrollY), y0); // y vuelve a desplazarse
  assert.deepEqual(errores, []);
  await context.close();
});

test('móvil: el bloqueo sigue con ventanas apiladas y se suelta al cerrar la última', async () => {
  const { context, page, errores } = await abrir({ semilla: conLogros(), movil: true });
  await sinPaneles(page);
  const bloqueado = () => page.evaluate(() => document.documentElement.classList.contains('con-modal'));
  assert.equal(await bloqueado(), false);
  await page.locator('.album-btn').tap();
  await page.getByRole('button', { name: 'Ver Primer elote' }).tap();
  assert.equal(await page.locator('dialog[open]').count(), 2);
  assert.equal(await bloqueado(), true);
  await page.keyboard.press('Escape'); // cierra la vitrina; el Álbum sigue
  await page.waitForTimeout(200);
  assert.equal(await bloqueado(), true);
  await page.evaluate(() => history.back()); // cierra el Álbum
  await page.waitForTimeout(300);
  assert.equal(await page.locator('dialog[open]').count(), 0);
  assert.equal(await bloqueado(), false);
  // Cruzar a web cierra el diálogo del Álbum y suelta el bloqueo.
  await page.locator('.album-btn').tap();
  assert.equal(await bloqueado(), true);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(300);
  assert.equal(await bloqueado(), false);
  assert.deepEqual(errores, []);
  await context.close();
});

test('hundido al tocar y sin recarga al jalar', async () => {
  // $100: alcanza un elote ($31) y no un agua ($322): un Comprar habilitado y otro deshabilitado.
  const semilla = partida(
    { version: 6, money: 100, lifetimeEarned: 100, runEarned: 100 },
    { elotes: { count: 30 }, aguas: { count: 12 } },
  );
  const { context, page, errores } = await abrir({ semilla });
  await sinPaneles(page);
  const raiz = await page.evaluate(() => getComputedStyle(document.documentElement).overscrollBehaviorY);
  assert.equal(raiz, 'none');
  const estilo = (loc) =>
    loc.evaluate((b) => ({ translate: getComputedStyle(b).translate, sombra: getComputedStyle(b).boxShadow }));
  const comprar = page.locator('.card:not([hidden]) .btn.primary:not(:disabled)').first();
  const caja = await comprar.boundingBox();
  const suelto = await estilo(comprar);
  await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
  await page.mouse.down();
  assert.deepEqual(await estilo(comprar), { translate: '0px 2px', sombra: 'none' });
  await page.mouse.up();
  assert.deepEqual(await estilo(comprar), suelto);
  // Deshabilitado no se hunde.
  const cerrado = page.locator('.card:not([hidden]) .btn.primary:disabled').first();
  const cajaCerrado = await cerrado.boundingBox();
  const antes = await estilo(cerrado);
  await page.mouse.move(cajaCerrado.x + cajaCerrado.width / 2, cajaCerrado.y + cajaCerrado.height / 2);
  await page.mouse.down();
  assert.deepEqual(await estilo(cerrado), antes);
  await page.mouse.up();
  assert.deepEqual(errores, []);
  await context.close();
});

test('móvil: el título que recibe el foco al abrir una ventana no muestra el anillo; los botones sí', async () => {
  const { context, page, errores } = await abrir({ movil: true });
  await sinPaneles(page);
  // Abrir con teclado: así Chromium sí considera :focus-visible el foco por código (la prueba no es en vacío).
  const hist = page.locator('.bottom button[aria-label="Historial"]');
  await hist.focus();
  await page.keyboard.press('Enter');
  const dlg = page.locator('dialog[open]');
  await dlg.waitFor();
  const titulo = await page.evaluate(() => {
    const a = document.activeElement;
    return {
      tag: a?.tagName,
      focusVisible: a?.matches(':focus-visible'),
      outline: a ? getComputedStyle(a).outlineStyle : '',
    };
  });
  assert.deepEqual(titulo, { tag: 'H2', focusVisible: true, outline: 'none' });
  await page.keyboard.press('Tab'); // al botón Cerrar: ese sí lleva anillo
  const boton = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  assert.equal(boton, 'solid');
  assert.deepEqual(errores, []);
  await context.close();
});

/** Animaciones del icono de cada estampilla: { lograda, n, estados } en el orden del catálogo. */
const giros = (page, raiz) =>
  page.evaluate(
    (sel) =>
      [...document.querySelectorAll(`${sel} .estampilla`)].map((li) => {
        const anims = li.querySelector('.up-icon').getAnimations();
        return {
          lograda: !li.classList.contains('bloqueada'),
          n: anims.length,
          estados: anims.map((a) => a.playState),
        };
      }),
    raiz,
  );

test('giro de papel (web): giran solo las logradas, con el Álbum en Logros; en pausa bajo la vitrina', async () => {
  // A 1.5 s de "Una hora": cae con el Álbum ya abierto y debe empezar a girar.
  const semilla = conLogros();
  semilla.stats = { jugadoMs: 3_600_000 - 1500 };
  const { context, page, errores } = await abrir({ semilla });
  await sinPaneles(page);
  const cerrado = await giros(page, '#album');
  assert.equal(cerrado.length, 26);
  assert.ok(cerrado.every((g) => g.n === 0)); // panel cerrado: nada anima
  // "Una hora" aún no cae: así se prueba que un logro que cae con el Álbum abierto empieza a girar.
  assert.equal(cerrado.filter((g) => g.lograda).length, 3);
  await page.locator('.lateral button[aria-label^="Álbum"]').click();
  await page.waitForFunction(() => document.querySelectorAll('#album .estampilla:not(.bloqueada)').length === 4, null, {
    timeout: 4000,
  });
  const abiertos = await giros(page, '#album');
  assert.equal(abiertos.filter((g) => g.lograda).length, 4);
  for (const g of abiertos) assert.equal(g.n, g.lograda ? 2 : 0); // giro + brinco; el logro nuevo incluido
  // Bajo la vitrina, en pausa; al cerrarla vuelven a correr.
  await page.getByRole('button', { name: 'Ver Primer elote' }).click();
  await page.locator('dialog[open] .vitrina').waitFor();
  assert.ok(
    (await giros(page, '#album')).filter((g) => g.lograda).every((g) => g.estados.every((e) => e === 'paused')),
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  assert.ok(
    (await giros(page, '#album')).filter((g) => g.lograda).every((g) => g.estados.every((e) => e === 'running')),
  );
  // Libreta: el tabpanel de Logros queda display: none y nada anima.
  await page.getByRole('tab', { name: 'Libreta' }).click();
  assert.ok((await giros(page, '#album')).every((g) => g.n === 0));
  await page.getByRole('tab', { name: 'Logros' }).click();
  assert.equal((await giros(page, '#album')).filter((g) => g.n === 2).length, 4);
  // Cerrar el Álbum: se detiene.
  await page.locator('.lateral button[aria-label^="Álbum"]').click();
  await page.waitForTimeout(300);
  assert.ok((await giros(page, '#album')).every((g) => g.n === 0));
  assert.deepEqual(errores, []);
  await context.close();
});

test('giro de papel (móvil): gira en el diálogo del Álbum y se detiene al cerrarlo', async () => {
  const { context, page, errores } = await abrir({ semilla: conLogros(), movil: true });
  await sinPaneles(page);
  await page.locator('.album-btn').tap();
  await page.locator('dialog[open]').waitFor();
  const enDialogo = await giros(page, 'dialog[open]');
  assert.equal(enDialogo.length, 26);
  assert.equal(enDialogo.filter((g) => g.lograda).length, 3);
  for (const g of enDialogo) assert.equal(g.n, g.lograda ? 2 : 0);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  assert.ok((await giros(page, '#album')).every((g) => g.n === 0));
  assert.deepEqual(errores, []);
  await context.close();
});

test('giro de papel con reduced motion: nada gira', async () => {
  const { context, page, errores } = await abrir({ semilla: conLogros(), quieto: true });
  await sinPaneles(page);
  await page.locator('.lateral button[aria-label^="Álbum"]').click();
  await page.locator('#album.open').waitFor();
  const quietos = await giros(page, '#album');
  assert.equal(quietos.filter((g) => g.lograda).length, 3);
  assert.ok(quietos.every((g) => g.n === 0));
  assert.deepEqual(errores, []);
  await context.close();
});

const fondoEstado = (page) =>
  page.evaluate(() => ({
    fondo: document.documentElement.dataset.fondo ?? null,
    lienzos: document.querySelectorAll('canvas.fondo-pagina, canvas.fondo-header').length,
    banderines: getComputedStyle(document.querySelector('.picado use')).visibility,
  }));

test('fondo animado (web): se monta, se pausa con un diálogo y Ajustes lo apaga y lo recuerda', async () => {
  const { context, page, errores } = await abrir();
  await sinPaneles(page);
  await page.waitForFunction(() => document.documentElement.dataset.fondo === 'activo');
  assert.deepEqual(await fondoEstado(page), { fondo: 'activo', lienzos: 2, banderines: 'hidden' });
  // El canvas de la página cubre el viewport y el del header su ancho (más la cola de la sacudida).
  const tam = await page.evaluate(() => {
    const p = document.querySelector('canvas.fondo-pagina').getBoundingClientRect();
    const h = document.querySelector('canvas.fondo-header').getBoundingClientRect();
    const top = document.querySelector('.top').getBoundingClientRect();
    return { pw: p.width, ph: p.height, hw: h.width, hh: h.height, tw: top.width, th: top.height };
  });
  assert.equal(tam.pw, 1280);
  assert.ok(tam.ph >= 800);
  assert.equal(tam.hw, tam.tw);
  assert.ok(Math.abs(tam.hh - (tam.th + 8)) < 0.5);

  await page.locator('nav.lateral button', { hasText: 'Ajustes' }).click();
  await page.waitForFunction(() => document.documentElement.dataset.fondo === 'pausa');
  const boton = page.locator('dialog[open] button[aria-label="Fondo animado"]');
  assert.equal(await boton.getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#fondo-nota').isVisible(), false);
  assert.equal(await boton.getAttribute('aria-describedby'), null); // la nota oculta no se lee
  await boton.click();
  assert.equal(await boton.getAttribute('aria-pressed'), 'false');
  assert.deepEqual(await fondoEstado(page), { fondo: null, lienzos: 0, banderines: 'visible' });
  await page.keyboard.press('Escape');
  await sinPaneles(page); // cerrar el diálogo hace history.back() (atras.ts): que termine antes de recargar

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#app .card');
  await page.waitForTimeout(1500); // después del montaje en reposo: sigue apagado
  assert.deepEqual(await fondoEstado(page), { fondo: null, lienzos: 0, banderines: 'visible' });
  await sinPaneles(page);
  await page.locator('nav.lateral button', { hasText: 'Ajustes' }).click();
  await page.locator('dialog[open] button[aria-label="Fondo animado"]').click();
  await page.waitForFunction(() => document.documentElement.dataset.fondo === 'pausa'); // montado en pausa
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.documentElement.dataset.fondo === 'activo');
  assert.deepEqual(errores, []);
  await context.close();
});

test('fondo animado con reduced motion: no se monta y Ajustes lo explica', async () => {
  const { context, page, errores } = await abrir({ movil: true, quieto: true });
  await sinPaneles(page);
  await page.waitForTimeout(1500);
  assert.deepEqual(await fondoEstado(page), { fondo: null, lienzos: 0, banderines: 'visible' });
  await page.locator('header .icon-btn[aria-label="Ajustes"]').click();
  assert.equal(await page.locator('#fondo-nota').isVisible(), true);
  assert.equal(
    await page.locator('dialog[open] button[aria-label="Fondo animado"]').getAttribute('aria-describedby'),
    'fondo-nota',
  );
  assert.deepEqual(errores, []);
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

test('ranking (web): unirse con apodo, fila propia y badge; al recargar sigue participando', async () => {
  ranking.clear();
  const semilla = partida({ money: 5_000, lifetimeEarned: 5_000, runEarned: 5_000 }, { elotes: { count: 1 } });
  const { context, page, errores } = await abrir({ semilla });
  await sinPaneles(page);
  const trofeo = page.locator('button.ranking-btn');
  assert.equal(await trofeo.getAttribute('aria-label'), 'Ranking mundial');
  await trofeo.click();
  const dlg = page.locator('dialog[open]');
  await dlg.waitFor();
  assert.equal(await dlg.locator('h2').textContent(), 'Ranking');
  await dlg.locator('.ranking-pie').waitFor();
  assert.match(await dlg.locator('.ranking-pie').textContent(), /Nadie participa/);
  await dlg.locator('input.apodo').fill('  Doña  Prueba ');
  await dlg.locator('button', { hasText: 'Participar' }).click();
  await dlg.locator('.ranking-lista li.yo').waitFor();
  assert.match(await dlg.locator('li.yo').textContent(), /Doña Prueba.*\$5,000/);
  assert.match(await dlg.locator('.ranking-tu').textContent(), /puesto 1 de 1/);
  await page.waitForFunction(() => document.querySelector('.ranking-btn .lat-badge')?.textContent === '#1');
  assert.equal(await trofeo.getAttribute('aria-label'), 'Ranking mundial: puesto 1');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  // La identidad viaja en el guardado: tras recargar, el diálogo dispara el envío y vuelve el puesto.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#app .card');
  await sinPaneles(page);
  await page.locator('button.ranking-btn').click();
  await page.locator('dialog[open] .ranking-lista li.yo').waitFor();
  assert.match(await page.locator('dialog[open] .ranking-tu').textContent(), /Doña Prueba: puesto 1 de 1/);
  assert.equal(ranking.size, 1);
  assert.deepEqual(errores, []);
  await context.close();
});

test('ranking: un apodo inválido no sale a la red', async () => {
  ranking.clear();
  envios.length = 0;
  const { context, page, errores } = await abrir();
  await sinPaneles(page);
  await page.locator('button.ranking-btn').click();
  const dlg = page.locator('dialog[open]');
  await dlg.locator('.ranking-pie').waitFor();
  await dlg.locator('input.apodo').fill('x');
  await dlg.locator('button', { hasText: 'Participar' }).click();
  assert.match(await dlg.locator('.ranking-aviso').textContent(), /De 3 a 16 letras/);
  await dlg.locator('input.apodo').fill('Pinche Tramposo');
  await dlg.locator('button', { hasText: 'Participar' }).click();
  assert.match(await dlg.locator('.ranking-aviso').textContent(), /sin groserías/);
  assert.equal(envios.length, 0);
  assert.equal(await dlg.locator('.ranking-lista li').count(), 0);
  assert.deepEqual(errores, []);
  await context.close();
});

test('ranking (móvil): sin red el diálogo avisa y el juego sigue', async () => {
  const { context, page, errores } = await abrir({ movil: true });
  await page.route('**/api/ranking*', (ruta) => ruta.abort());
  await sinPaneles(page);
  await page.locator('button.ranking-btn:visible').tap();
  const dlg = page.locator('dialog[open]');
  await dlg.waitFor();
  await page.waitForFunction(
    () => document.querySelector('dialog[open] .ranking-estado')?.textContent === 'Sin conexión. Intenta más tarde.',
  );
  assert.equal(await dlg.locator('input.apodo').count(), 1); // aun sin red se puede elegir apodo (queda guardado)
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  assert.equal(await dinero(page), '$0');
  // El fetch abortado lo anota Chrome ("Failed to load resource"), no el juego; nada más debe aparecer.
  assert.deepEqual(
    errores.filter((e) => !e.includes('net::ERR_FAILED')),
    [],
  );
  await context.close();
});
