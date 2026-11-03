# DESIGN.md — Imperio de Antojitos

Fuente única de estilo visual. Si algo aquí choca con el código, manda el código (`src/style.css`, `src/assets/icons.svg`) y se actualiza este archivo.

## Voz visual

Mercado mexicano en caricatura, pegatinas sobre cielo azul: alegre, legible. Papel picado colgando del header, tarjetas blancas con borde negro de 2 px y sombra dura de 3 px, banderín como motivo repetido (título de los diálogos). Ilustración **flat caricaturesca**: formas gordas y redondas, contorno negro grueso fijo (`#1B2A3A`, nunca `currentColor` en lo ilustrado), un brillo blanco por pieza, colores de comida saturados. Sin degradados, sin sombras dentro de los iconos, sin fotos, **cero emojis**. El dinero es el héroe del header; el título queda secundario.

## Paleta (tokens en `src/style.css`)

Contraste mínimo: texto ≥ 4.5:1, UI ≥ 3:1 (WCAG AA). Nunca usar hex sueltos en CSS de UI: usar `var(--token)`.

| Token              | Claro                | Oscuro    | Uso / contraste (claro)                                      |
| ------------------ | -------------------- | --------- | ------------------------------------------------------------ |
| `--bg`             | `#cfe6f7`            | `#15283d` | azul cielo claro / azul noche                                |
| `--card`           | `#ffffff`            | `#223b57` | tarjetas, barra inferior, diálogos                           |
| `--text`           | `#1b2a3a`            | `#eaf3fb` | texto, 11.9:1 sobre `--bg`                                   |
| `--muted`          | `#4a5d70`            | `#b7c7d6` | texto secundario, 5.3:1 sobre `--bg`, 6.8:1 sobre `--card`   |
| `--ink`            | `#1b2a3a`            | `#0b1620` | tinta: sombras duras y bordes sobre `--corn`                 |
| `--primary`        | `#c2006a`            | `#ff6fb5` | rosa mexicano, 6.0:1 con blanco, 4.7:1 sobre `--bg`          |
| `--on-primary`     | `#ffffff`            | `#1b2a3a` | texto sobre primary                                          |
| `--primary-bright` | `#e4007c`            | `#ff6fb5` | solo decorativo: banderines, confeti, banderín de diálogo    |
| `--corn`           | `#f5b92a`            | `#f5b92a` | amarillo elote: bocadillos, cupones, 9:1 con `--on-corn`     |
| `--on-corn`        | `#1b2a3a`            | `#1b2a3a` | texto sobre corn                                             |
| `--nopal`          | `#2a7239`            | `#7cc68a` | verde nopal, 5.9:1 con blanco, 4.8:1 sobre `--track`         |
| `--on-nopal`       | `#ffffff`            | `#15283d` | texto sobre nopal                                            |
| `--cielo`          | `#1f7fc2`            | `#6cc1f0` | solo decorativo: banderines                                  |
| `--border`         | `#1b2a3a`            | `#8fb3d1` | bordes de 2 px; negro en claro (pegatina), claro en oscuro   |
| `--track`          | `#dbe9f3`            | `#2f4b68` | fondo de barras y del chip de gerente                        |
| `--shadow`         | `0 3px 0 var(--ink)` | `none`    | sombra dura de pegatina; en oscuro el relieve lo da el borde |
| `--focus`          | `#c2006a`            | `#f5b92a` | anillo de foco, 4.7:1 sobre `--bg`                           |

`--primary-bright` y `--cielo` nunca llevan texto encima. Cualquier token nuevo necesita par claro/oscuro y ratio comprobado; `.fx-*` del confeti usan tokens, nunca hex sueltos. Script de comprobación: calcula el ratio WCAG de cada par (texto ≥ 4.5, UI ≥ 3) leyendo `:root` claro y oscuro de `style.css`; se corre antes de cerrar cualquier cambio de paleta.

## Tipografía

- Familia: `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif` (sin webfonts: rendimiento y offline).
- Dinero: `clamp(1.75rem, 8vw, 2.5rem)`, peso 900. Título de la app: `1rem`, peso 600, `--muted`. Cuerpo: `1rem`. Secundario: `0.85rem` a `0.95rem`. Cifras grandes: `2rem`. Títulos de sección: `0.9rem`, peso 700, sin mayúsculas forzadas.

## Ilustración e iconos (`src/assets/icons.svg`)

- Sprite con `<symbol id="...">`, se usa con `<use href>`. Un `id` nuevo exige añadirlo a `ICON_NAMES` en `src/icons.ts` (lo comprueba `src/icons.test.ts`).
- `viewBox="0 0 48 48"`, dibujado para verse bien a 24 px.
- **Contorno:** tinta fija `stroke="#1B2A3A"`, `stroke-width="3"`, `stroke-linejoin="round"` (y `stroke-linecap="round"` en trazos abiertos). Mismo contorno en claro y oscuro: sobre azul noche los rellenos saturados lo separan del fondo. Solo los iconos de interfaz (sonido, música, menú, candado, check) usan `currentColor`.
- **Detalles internos:** trazos finos de 1.5–2 en un tono más oscuro del relleno (p. ej. granos del elote `#C99700`).
- **Rellenos:** hex fijo de comida. Paleta de ilustración actual:
  - Masa / pan: `#F6E3C3` `#F2D18B` `#E8C99A` `#D9A15B` `#F7D9C4`
  - Carne / tostado: `#B07850` `#A0522D` `#B5562B` `#C96A3A`
  - Elote: `#F4C430` (detalle `#C99700`)
  - Verdes: `#3A7D44` `#5FA35F`
  - Rojos / rosa: `#E5484D` `#E4007C` `#F25C8F`
  - Agua / cristal: `#9ED8F0`; metal: `#C8C8C8` `#DADADA`
  - Azul (gorra, cielo): `#1F7FC2`
  - Pieles: `#8C5A3C` `#B07850` `#D9A15B` `#E8B48A`; pelo: `#2B1B17` `#6B4A3A`, canas `#DADADA`
  - Puntos oscuros: `#2B1B17`; brillos: `#FFF6E5`
- Reutilizar estos hex antes de añadir nuevos. Formas simples, máximo 10–12 elementos por icono.
- **Estampa:** los iconos ilustrados grandes llevan la clase `.sticker` (`src/style.css`): cuatro `drop-shadow` blancos de 1.5 px en cruz forman el halo troquelado y un quinto `drop-shadow(2px 2.5px 0 var(--ink))` pone la sombra dura. Es CSS puro (vale con la CSP) y no toca el sprite. Se aplica al icono del plato (52 px en plato de 76), al de mejoras (48 px), a Doña Chelo (52 px) y al avatar del chip de gerente (40 px). No se aplica a iconos de 30 px o menos (avatar del botón de contratar, iconos de interfaz): a ese tamaño el halo ensucia.
- **Marcos de estampa** (`.estampa`): el símbolo `sello` detrás del avatar, papel liso de `--bg` por `radial-gradient` y color del ondulado en `--aro`. Doña Chelo: caja de 64 px, avatar 46, aro `--primary-bright`. Chip de gerente: caja 48, avatar 34, aro `--primary`. Plato: aro `--primary` si responde, `--muted` sin abrir, `--border` con gerente.
- **Cupones** (`.up-slot` > `.up-card`): estampilla vertical de 156 px (icono 56 arriba, nombre, efecto, botón). El `li` exterior pone la sombra con `::before` enmascarado, que sigue el perforado; el interior lleva la máscara: rectángulo interior y una fila de medios círculos de 12 px centrada en cada lado. Borde `--corn`. Botón de precio como matasellos: pastilla con borde `--ink` y sombra de 2 px. En web, cuadrícula 2×2 (4 cupones).
- **Avatares** (busto en el cuadro de 48): cabeza circular centrada en ~(24,20), hombros que tocan el borde inferior, dos ojos de punto, boca de trazo y un objeto o prenda que identifique al personaje. Se usan a 28 px (botón de contratar) y 40 px (chip de gerente, con estampa).
- **Sello** (`sello`): círculo de borde ondulado generado por fórmula (radio 21.6 ± 1.9, 14 ondas, 140 puntos), un solo `<path fill="currentColor">`. Marco del plato; si se reutiliza para otro marco, mantener el mismo número de ondas.
- **Banderín** (`banderin`, viewBox `0 0 24 28`): un solo `<path fill="currentColor" fill-rule="evenodd">` con borde inferior festoneado y calados. El color lo pone CSS (`.picado .f1…f4`).
- **CSP:** prohibido `style`, `<style>`, `<script>`, handlers `on*` y recursos externos dentro del SVG.

## Personajes

Cada negocio tiene un gerente con nombre, avatar y tres frases (`manager.says` en `src/data.ts`: `hire`, `milestone`, `upgrade`). Doña Chelo (`CHELO`) es la guía: da tips al inicio y habla cuando no hay gerente (`milestone`, `upgrade` global, `upgradeOne` de un negocio sin gerente, `prestige`).

| Personaje        | Negocio    | Look                                                        | Voz                        |
| ---------------- | ---------- | ----------------------------------------------------------- | -------------------------- |
| Doña Chelo       | guía       | abuela, chongo con canas, lentes redondos, rebozo rosa      | cariñosa, manda con "mijo" |
| Don Beto         | elotes     | 70 años, sombrero de palma, bigote blanco, camisa a cuadros | calmado, de refranes       |
| Lupita           | aguas      | trenza con listón rosa, delantal de flores, sonrisa grande  | pregonera, entusiasta      |
| El Güero         | tacos      | cachucha al revés, playera, cucharón al hombro              | bromista                   |
| Doña Tere        | tortas     | lentes de media luna, chongo, aretes                        | seria, exigente            |
| Chuy             | fonda      | gorro de cocinero, bigote, cachetes rojos                   | cálido, consentidor        |
| Rosita           | panadería  | pañoleta, harina en la mejilla, charola                     | soñadora, dulce            |
| Licenciado Pérez | franquicia | traje gris, corbata rosa, lentes, gafete                    | corporativo, con cifras    |
| La Jefa          | cadena     | lentes oscuros, aretes grandes, saco rojo                   | pocas palabras, manda      |

Reglas de voz:

- Español de México, frases de una línea (≤ 70 caracteres), sin emojis ni pictogramas.
- Los gerentes tratan al jugador de "usted" y nunca usan sustantivos de género ni de rol ("patrón", "jefe", "mija"); lo comprueba `src/characters.test.ts`. Excepción asumida: el "mijo" de Doña Chelo es marca del personaje.
- Las frases son sabor, no información: lo que importa (dinero, hitos, recetas) siempre va también en números y en `aria-live`.

## Fondo (`src/assets/fondo.svg`)

- Azulejo de 192×192 con siluetas planas de antojitos (elote, chile, concha, taco, limón, flor y banderín) sin contorno, colores de la paleta de ilustración a `fill-opacity` 0.09 (máximo 0.1). Un solo archivo para claro y oscuro.
- Se aplica en `body` con `background: var(--bg) url('./assets/fondo.svg') 0 0 / 192px 192px repeat`; Vite lo sirve con hash y el SW lo precachea. `html` conserva `--bg` liso para el overscroll. Mismas reglas CSP que el sprite (`icons.test.ts`).
- Sobre el patrón solo caen títulos de sección y la pantalla de bloqueo; con alpha 0.09 `--muted` sigue ≥ 5.1:1 en ambos temas (5.14 claro, 8.16 oscuro). Todo lo demás va sobre `--card`, header o barra, que son sólidos.
- Las tarjetas nunca llevan `opacity`: el patrón se transparentaría. Un negocio sin abrir se atenúa con borde punteado y título en `--muted`.

## Componentes y UX

- Móvil primero (contenedor máx. 560 px); layout web a partir del breakpoint en `style.css`.
- **Papel picado** (`.picado`): un solo `<svg>` con 48 `<use>` del `banderin`, `preserveAspectRatio="xMinYMin slice"`: se recorta a lo ancho sin deformar. 22 px en móvil, 28 px en web. Estático; solo se sacude (`.shake`, un nodo, `transform`) al heredar.
- **Plato** (`.sell`): sello postal de 76 px. El símbolo `sello` del sprite (círculo de radio ondulado, 14 ondas, `currentColor`) va detrás del icono y hace de aro: `--primary` cuando responde, `--border` cuando no. El sello lleva también `.sticker` (halo blanco y sombra dura). El papel es un círculo de `--bg` pintado con `radial-gradient`, con una línea fina interior en el color del aro (`--aro`), como el marco de una estampilla. Icono de 52 px en estampa encima. Interactivo: `--primary` con anillo interior `--corn`; bloqueado o con gerente: `--border`.
- **Chip de gerente** (`.manager`): sustituye al botón de contratar, misma altura mínima (44 px) para que la fila no cambie.
- **Bocadillos** (`.bubble`): overlay absoluto sobre título y barra de la tarjeta, `pointer-events: none`, `aria-hidden`; nunca desplazan botones. Duran 6 s por marca de tiempo en `render`, sin temporizadores. El tip de Doña Chelo (`.tip`) comparte el estilo pero sigue siendo un `<aside>` legible.
- **Tarjetas de negocio** (`li.card` > `.paper`): misma estampilla que los cupones. El `li` lleva la sombra en `::before` (pseudo-elemento de tinta con la misma máscara, desplazado 3 px; `--sombra-estampa` lo apaga en oscuro) y ancla el bocadillo; `.paper` lleva la máscara `--mascara-estampa` (variable compartida en `:root`), fondo `--card`, borde `--border` (`--muted` sin abrir) y padding de 14 px. El bocadillo queda fuera de la máscara para no recortarse.
- **Cupón** (`.up-slot`): estampilla vertical con borde perforado y sombra (ver Ilustración e iconos). La sección `.upgrades` lleva `min-width: 0`: con cupones de ancho fijo, si no, ensancha la página.
- Objetivos táctiles ≥ 44 px.
- Estado deshabilitado: borde punteado además del color (nunca solo color).
- Foco visible con `--focus`.
- Animaciones cortas de feedback; todo se desactiva con `prefers-reduced-motion: reduce`.
- **Rendimiento:** nunca `filter` en un ancestro de contenido que anima por frame (las barras de progreso). Las sombras de estampilla van en un pseudo-elemento enmascarado, no en `drop-shadow`; `.sticker` solo en iconos estáticos. `.fill` lleva `will-change: transform` para animar en su propia capa. Con filtros en `.card` el frame subía a 32 ms (31 fps) y la GPU al 99 %.

## Verificación visual (obligatoria para cambios de UI)

Con el MCP `playwright` (`.mcp.json`):

1. `npm run dev` (Vite, `http://localhost:5173`).
2. `browser_navigate` a la URL.
3. `browser_resize` 390×844 (móvil) → `browser_take_screenshot`.
4. `browser_resize` 1280×800 (web) → `browser_take_screenshot`.
5. Si el cambio toca color, revisar también el tema oscuro: comprobar que solo usa tokens con par oscuro y, si hace falta captura, emular `prefers-color-scheme: dark` en el navegador.
6. Criticar (jerarquía, contraste, alineación, consistencia con este archivo), corregir, repetir capturas.
7. Al terminar, `browser_close`: el Chrome headless de Playwright no hace throttling y deja el juego corriendo a 60 fps con la GPU ocupada. Parar también el `vite` del dev server.

## Hoja de contacto del sprite (obligatoria al ilustrar)

`docs/sprite.html`, servida solo por `vite` en `http://localhost:5173/docs/sprite.html` (no entra en el build). Lee el sprite y pinta cada símbolo a 160 px, en el plato real (sello y estampa a 52 px), a 30 px y a 20 px, más las referencias de `docs/refs/` al pie. Al dibujar o retocar un icono: captura web 1280×800 con `fullPage`, otra emulando `prefers-color-scheme: dark`, criticar contra las referencias y contra las reglas de arriba, corregir, repetir. Un icono se da por bueno cuando se lee a 20 px y no se ensucia a 160 px.

## Referencias

Imágenes de inspiración en `docs/refs/`. Mirarlas antes de ilustrar algo nuevo. Lo que se toma de ellas (2026-11-03):

- `estampas3.png`, `estampas4.png`: estampillas con borde dentado o perforado, 3 o 4 tintas planas por estampa, un solo motivo centrado y grande, pequeños adornos (cruces, puntos, rayas) en las esquinas. Es el modelo del plato y de los cupones.
- `estampas1.png`, `estampas2.png`: boletos y timbres con numeración, marco interior fino y matasellos. Modelo del botón de precio como matasellos y de la línea fina del plato.
- `letra.png`: cartel de mercado con papel picado, rotulación gruesa y condensada con contorno, cielo plano y camioneta de línea. Modelo del papel picado y de la voz de los títulos; pendiente una tipografía de rótulo para el título (hoy `system-ui`).
- Las referencias casi no usan contorno negro; nosotros sí (3 px). Se mantiene: en móvil a 52 px el contorno es lo que separa el icono del fondo.
