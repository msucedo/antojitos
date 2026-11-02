# Imperio de Antojitos — juego idle web

## Objetivo
Juego idle de antojitos mexicanos, jugable con una mano en el móvil, instalable como PWA, que funciona sin red y sin servidor. Juego propio: nombre, arte, textos y números nuevos, sin copiar layout ni personajes (inspiración: idle tycoon, `~/Documents/ideas/28-octubre/`).

**Listo cuando:**
- Ciclo completo jugable: comprar → gerente → los 8 negocios → prestigio.
- Ritmo: primer gerente en ~2 min y primer prestigio en 1–2 h (`balance.test.ts`).
- Lighthouse móvil: Accesibilidad ≥ 90, Performance ≥ 90. DevTools → Application → Manifest sin errores de instalabilidad.
- Abre offline y no pierde progreso al recargar, al actualizar, con un guardado corrupto ni con dos pestañas abiertas.

**Fuera del alcance:** cuentas, servidor, ranking, push, analytics, anuncios, pagos. Se reevalúan tras jugar el MVP.

## Ubicación y reglas
`~/Documents/code/antojitos/`. Sin git init ni commit (regla del user). Riesgo aceptado: no hay rollback.

## Stack
- Vite + TypeScript (`strict`, `noUncheckedIndexedAccess`), DOM + CSS sin framework.
- Vitest, ESLint + Prettier.
- `vite-plugin-pwa`: genera el SW con la lista de archivos con hash.
- Versiones exactas + lockfile, `.nvmrc` + `engines`.
- Scripts: `check` = `tsc --noEmit && eslint . && vitest run`; `audit` aparte, porque necesita red.

## Mecánicas y balance
Fórmulas estándar del género (Kongregate, "The Math of Idle Games"); constantes propias.
- Costo de la unidad n: `baseCost·r^n`, con `r` entre 1.07 y 1.15.
- Compra de k unidades: `baseCost·r^n·(r^k−1)/(r−1)`.
- Máximo comprable: `floor(log_r(dinero·(r−1)/(baseCost·r^n) + 1))`, corregido ±1 comprobando el costo real.
- Ingreso por ciclo: `baseRevenue·n·2^hitos·(1 + 0.02·recetas)`.
- Hitos a las 25/50/100/200 unidades: ingreso ×2 cada uno. El ciclo queda fijo para que nunca dure menos que un frame.
- Gerente: corre los ciclos solo.
- Ganancias offline: ciclos continuos solo con gerente; un ciclo manual ya iniciado termina (una vuelta). Tope de 8 h, diferencia negativa → 0.
- Prestigio "Herencia": `recetas = floor(sqrt(totalGanado/3e10))` (divisor ajustado por la simulación: herencia a ~93 min); reinicia todo salvo las recetas.
- Escalera: cada negocio cuesta ~×12 el anterior y su ciclo dura ~×2–3. Se ajusta hasta que la simulación cumpla el ritmo del objetivo.
- Tiempo: todo avance (frame, pausa del hilo, pestaña oculta, app cerrada) pasa por `applyOffline(state, Date.now())` contra `lastSeen`, con el mismo tope. Se guarda el `lastSeen` en memoria, nunca `Date.now()`. Ciclos en fórmula cerrada, nunca un bucle por ciclo.
- Todo valor de dinero se topa en `Number.MAX_VALUE` (Infinity no sobrevive a JSON).

## PWA
- Manifest: `name`, `short_name`, `display: standalone`, `theme_color`, iconos 192/512 + maskable, `apple-touch-icon`.
- SW: precachea todo el build. `registerType: 'prompt'` + `registerSW` desde `virtual:pwa-register` (sin script inline). Aviso "Nueva versión, recarga" → `save()` y luego `updateSW(true)`.
- Sin código en segundo plano: el offline se calcula al abrir y en `visibilitychange`.

## Guardado (`src/save.ts`)
- localStorage `antojitos.save` + respaldo `antojitos.bak`, autosave cada 5 s y en `visibilitychange`/`pagehide`.
- Es entrada no confiable: `validate` (tipos, finitos ≥ 0, ids conocidos) y `migrate(version)` en cadena. Si falla → respaldo; si el respaldo también falla → estado nuevo + aviso. Nunca crash.
- Exportar/importar (base64, tope 10 KB, misma validación).
- `navigator.storage.persist()`: Safari borra los datos tras 7 días sin uso si no está instalada.
- Una sola pestaña: `navigator.locks.request('antojitos', { ifAvailable: true })`. Sin candado → pantalla "Ya está abierto en otra pestaña", sin guardar.

## Seguridad
- DOM: solo `textContent`/`createElement`; nada de `innerHTML` con datos, `eval` ni scripts inline. Las barras usan `el.style.transform`.
- `vercel.json`:
  - `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: no-referrer`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - `Cache-Control`: `no-cache` para `sw.js` e `index.html`; immutable para `assets/*`.
- Sin terceros (CDN, fuentes, analytics); cero PII.

## UI y accesibilidad
- Mobile-first, una columna, `lang="es-MX"`.
- Paleta papel picado (rosa mexicano, amarillo maíz, verde nopal) con contraste AA verificado. Iconos emoji; sin assets externos.
- Dinero: dígitos completos por debajo de 1e6; después escala larga española con singular/plural (millón, mil millones, billón = 1e12…).
- Toggle de compra x1/x10/Max; modal "Mientras no estabas ganaste…"; Doña Chelo con tips en los primeros pasos.
- `<button>` reales, áreas táctiles ≥ 44 px, `prefers-reduced-motion`, modal con foco atrapado + `Esc`, `aria-live="polite"` solo para eventos.
- Render: el DOM se crea una vez; el texto se actualiza a ~10 Hz y las barras en cada rAF.

## Archivos
`index.html`, `src/style.css`, `src/data.ts`, `src/game.ts`, `src/format.ts`, `src/save.ts`, `src/ui.ts`, `src/main.ts`, tests (`game`, `format`, `save`, `balance`), `vite.config.ts`, `vercel.json`, `eslint.config.js`, `.nvmrc`, `public/icons/*`.

## División del trabajo
1. En secuencia: scaffold → `data`/`game`/`format` + tests (fija el contrato `State`).
2. En paralelo: `save`/`ui`/`style`/`main` ∥ 1 agente con PWA, `vercel.json`, lint, `.nvmrc`.
3. Al final: 1 agente revisor independiente que lee los archivos (sin git, no hay diff).

## Verificación
1. `npm run check` en verde.
2. `npm run dev` en vista móvil:
   - comprar, gerente, hito, prestigio;
   - recargar → progreso intacto;
   - JSON basura en localStorage → abre y avisa;
   - segunda pestaña → aviso de bloqueo.
3. `npm run build && npm run preview`: manifest sin errores, SW activo; Offline + recargar → abre; Lighthouse ≥ 90 en a11y y perf.
4. Rebuild con preview abierto → aviso de nueva versión, recarga y no se pierde progreso.
5. Tras el deploy (lo decide el user): `curl -I` para los headers; iPhone instalado → pantalla completa y ganancias offline.

## Estado MVP1 (2026-11-01)
- [x] `npm run check`: 48 tests, tsc y eslint en verde.
- [x] Chrome headless con los headers de `vercel.json`: render, venta, compra, gerente, import, recarga con progreso intacto, guardado corrupto → aviso + copia, segunda pestaña bloqueada, SW activo, sin violaciones de CSP.
- [x] Aviso de nueva versión, en primera visita y en visitas posteriores: aparece, recarga, conserva el progreso y no muestra un bloqueo falso. Hizo falta `clientsClaim` + `controllerchange` propio, porque workbox-window no recarga en la primera visita.
- [x] Lighthouse 12.8.2 móvil: Performance 100, Accesibilidad 100 (FCP 1.0 s, LCP 1.4 s, TBT 10 ms, CLS 0).
- [x] Firefox y Safari: candado, guardado, offline (probado por el user).
- [ ] Deploy a Vercel + `curl -I` de headers + Manifest sin errores.
- [ ] iPhone instalado: pantalla completa, sin red, ganancias offline.

## MVP2 — Mejoras, sonido, animaciones e iconos propios (2026-11-01)
**Alcance:** mejoras de compra única, sonido opcional, animaciones de feedback, iconos SVG propios (cero emojis), UX móvil primero con layout web. Logros, estadísticas y eventos temporales quedan como posible MVP3.

**Mejoras**
- 20 en `UPGRADES` (`src/data.ts`): 2 por negocio (×3) + 4 globales (×2). Solo se ofrecen las de negocios abiertos y las globales; la franja muestra las 3 más baratas.
- Se reinician con la herencia. Guardado v2: `upgrades: string[]`, migración v1→v2 automática; ids desconocidos o duplicados invalidan el guardado.
- Balance re-ajustado con mejoras en la simulación: costos ×10 sobre el borrador y `RECIPE_DIVISOR = 1e12`. Primer gerente 1.4 min, cadena ~30 min, herencia ~83 min, 15/20 mejoras compradas antes de heredar.

**Sonido** (`src/audio.ts`)
- Web Audio API con síntesis (osciladores + envolvente): sin archivos, sin red, CSP sin cambios.
- Apagado por defecto. Preferencia por dispositivo en `antojitos.prefs` (no va en el guardado ni en el export).
- El `AudioContext` solo se crea dentro de un gesto del usuario (requisito de iOS y Chrome). Los ciclos de gerentes no suenan.

**Animaciones** (`src/fx.ts`)
- Web Animations API, solo `transform`/`opacity`: moneda "+$" al vender, pulse al comprar, confeti al heredar.
- Tope de 8 monedas simultáneas; los nodos se quitan al terminar. Con `prefers-reduced-motion` no se crea nada.

**Iconos** (`src/assets/icons.svg` + `src/icons.ts`)
- Sprite SVG propio con `<symbol>`, usado con `<use href>`. Vite lo emite como archivo con hash (nunca `data:`) y el SW lo precachea.
- Colores de comida en hex fijo y contornos con `currentColor` (siguen el tema). Sin `style`, scripts ni referencias externas: `icons.test.ts` lo comprueba.

**UX**
- Móvil: selector ×1/×10/Máx y Herencia en barra inferior fija (zona del pulgar); mejoras en franja horizontal con scroll-snap.
- Web (≥ 900 px): dos columnas, negocios a la izquierda y Doña Chelo + mejoras sticky a la derecha; hover solo con puntero fino.
- Botones ≥ 44 px; deshabilitado también con borde punteado (no solo color).

**Música de fondo** (`src/music.ts`)
- Composición original: 8 compases en 3/4 con aire de son (I–IV–V en Do, 100 bpm, loop de ~14 s). Bajo, rasgueo con cuerdas escalonadas y melodía con vibrato leve, todo sintetizado.
- Scheduler con lookahead (temporizador de 25 ms, notas agendadas 150 ms por delante con el reloj del audio), así no se corta aunque el hilo principal se trabe.
- Controles separados "Música" y "Efectos de sonido" (`antojitos.prefs = { sound, music }`), ambos apagados por defecto. La música va en su propio bus, más bajo que los efectos, con fade.
- Pestaña oculta → se suspende el `AudioContext` (sin sonido de fondo ni gasto de batería); al volver se reanuda.
- El contexto solo se crea con una activación de usuario vigente (`navigator.userActivation`); se escucha `pointerdown`, `click`, `keydown` y `touchend`, así arranca también con teclado y en iOS.

**Correcciones de la revisión independiente**
- La migración v1→v2 reescala `lifetimeEarned` por 1e12/3e10: las recetas pendientes y la distancia a la siguiente quedan igual que en v1.
- Bloqueo de 500 ms en las mejoras tras comprar: un doble toque compra una sola.
- Tras comprar una mejora, el foco va al título "Mejoras" (o al `h1`): no se pierde ni cae sobre otra compra.
- La detección de ventas manuales vive en `catchUp`, así hay moneda y sonido también al volver a la pestaña.
- El rebote de confirmación de una mejora se aplica al ingreso de los negocios afectados.
- En web, el panel lateral sticky tiene altura máxima con scroll propio: no lo tapan ni el header ni la barra inferior en pantallas bajas.

**Estado MVP2**
- [x] `npm run check`: 71 tests, tsc y eslint en verde.
- [x] e2e en Chrome con la CSP real: 50/50.
  - MVP1: 11/11.
  - Actualización del SW: 9/9.
  - MVP2: 15/15. Sprite, cero emojis, moneda, sonido, mejoras, reduced-motion, layout web y botones ≥ 44 px.
  - Correcciones y música: 15/15. La música arranca con un gesto real, agenda notas, se suspende con la pestaña oculta y su preferencia persiste. Teclado desbloquea el audio. Doble toque compra una sola mejora. Foco correcto tras comprar. Sidebar dentro del viewport a 1366×620.
- [ ] Lighthouse (lo corre el user).
- [ ] Escucha de la música (gusto: lo valida el user).
