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
