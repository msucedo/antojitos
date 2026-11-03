# DESIGN.md — Imperio de Antojitos

Fuente única de estilo visual. Si algo aquí choca con el código, manda el código (`src/style.css`, `src/assets/icons.svg`) y se actualiza este archivo.

## Voz visual

Álbum de timbres y boletos de mercado mexicano, en caricatura: alegre, legible. Cada negocio es una estampilla de papel plano de color (crema, rosa, mostaza o verde) con 3 o 4 tintas, borde perforado, línea fina interior y puntos en las esquinas, sobre un fondo de papel crema con grano de imprenta (azul noche en oscuro, donde las estampas conservan su papel). Papel picado colgando del header, sombra dura de 3 px, botones como matasellos, rotulación Rye en el título y el dinero, banderín como motivo repetido (título de los diálogos). Referencias en `docs/refs/`. Ilustración **flat caricaturesca**: formas gordas y redondas, contorno negro grueso fijo (`#1B2A3A`, nunca `currentColor` en lo ilustrado), un brillo blanco por pieza, colores de comida saturados. Sin degradados, sin sombras dentro de los iconos, sin fotos, **cero emojis**. El dinero es el héroe del header; el título queda secundario.

## Paleta (tokens en `src/style.css`)

Contraste mínimo: texto ≥ 4.5:1, UI ≥ 3:1 (WCAG AA). Nunca usar hex sueltos en CSS de UI: usar `var(--token)`. `src/paleta.test.ts` lee los dos `:root` y comprueba cada par de la tabla; cualquier cambio de paleta pasa por ahí.

### Tokens de tema

| Token              | Claro                | Oscuro                   | Uso / contraste (claro)                                                |
| ------------------ | -------------------- | ------------------------ | ---------------------------------------------------------------------- |
| `--bg`             | `#f1e6d0`            | `#15283d`                | crema de fondo / azul noche                                            |
| `--card`           | `#fff6e5`            | `#223b57`                | barra inferior, diálogos (papel crema en claro)                        |
| `--text`           | `#1b2a3a`            | `#eaf3fb`                | texto, 11.8:1 sobre `--bg`                                             |
| `--muted`          | `#4a5d70`            | `#b7c7d6`                | texto secundario, 5.5:1 sobre `--bg`                                   |
| `--ink`            | `#1b2a3a`            | `#0b1620`                | tinta: sombras duras y bordes sobre `--corn`                           |
| `--primary`        | `#c2006a`            | `#ff6fb5`                | rosa mexicano, 6.0:1 con blanco, 4.85:1 sobre `--bg`                   |
| `--on-primary`     | `#ffffff`            | `#1b2a3a`                | texto sobre primary                                                    |
| `--primary-bright` | `#e4007c`            | `#ff6fb5`                | solo decorativo: banderines, confeti, banderín de diálogo              |
| `--corn`           | `#f5b92a`            | `#f5b92a`                | amarillo elote: bocadillos, borde de cupones, 9:1 con tinta            |
| `--on-corn`        | `#1b2a3a`            | `#1b2a3a`                | texto sobre corn                                                       |
| `--nopal`          | `#2a7239`            | `#7cc68a`                | verde nopal, 5.9:1 con blanco                                          |
| `--on-nopal`       | `#ffffff`            | `#15283d`                | texto sobre nopal                                                      |
| `--cielo`          | `#1f7fc2`            | `#6cc1f0`                | solo decorativo: banderines                                            |
| `--border`         | `#1b2a3a`            | `#8fb3d1`                | bordes de 2 px fuera de las estampillas                                |
| `--track`          | `#e6d9c0`            | `#2f4b68`                | hovers del chrome                                                      |
| `--shadow`         | `0 3px 0 var(--ink)` | `none`                   | sombra dura de estampa; en oscuro el relieve lo da el borde            |
| `--sombra-btn`     | `0 2px 0 var(--ink)` | `none`                   | matasellos: botones y pastillas                                        |
| `--halo`           | `#ffffff`            | `#ffffff`                | halo troquelado de `.sticker`; dentro de una estampilla es el papel    |
| `--focus`          | `#c2006a`            | `#f5b92a`                | anillo de foco, 4.85:1 sobre `--bg`                                    |
| `--marco`          | `var(--marco-tinta)` | `rgb(234 243 251 / .35)` | línea interior del diálogo; dentro de la isla vuelve a `--marco-tinta` |
| `--grano`          | `url(grano.svg)`     | `none`                   | grano de imprenta; sobre azul noche no se ve y no vale el repintado    |

`--primary-bright` y `--cielo` nunca llevan texto encima. Todo token de tema nuevo necesita par claro/oscuro y ratio comprobado en `paleta.test.ts`; `.fx-*` del confeti usan tokens, nunca hex sueltos.

### Papeles y tintas de estampilla (fijos en ambos temas)

Decisión del 2026-11-03: una estampa conserva su papel sobre azul noche, como los timbres sobre marino de `docs/refs/estampas2.png`. Por eso estos tokens no tienen par oscuro.

| Token             | Valor                 | Uso / contraste sobre los cuatro papeles                   |
| ----------------- | --------------------- | ---------------------------------------------------------- |
| `--papel-crema`   | `#fff6e5`             | cupones, estampa de Chelo, negocios sin papel asignado     |
| `--papel-rosa`    | `#f6c7cf`             | papel de negocio                                           |
| `--papel-mostaza` | `#f5c462`             | papel de negocio                                           |
| `--papel-verde`   | `#c5dcc6`             | papel de negocio                                           |
| `--tinta`         | `#1b2a3a`             | texto, bordes y sombra: 9.0 (mostaza) a 13.6 (crema)       |
| `--tinta-suave`   | `#3d4f61`             | secundario: 5.2 (mostaza) a 7.9 (crema)                    |
| `--tinta-rosa`    | `#c2006a`             | primario, aro del plato, foco: ≥ 3.7 (UI)                  |
| `--tinta-nopal`   | `#2a7239`             | barra de progreso, heredar: ≥ 3.6 (UI)                     |
| `--marco-tinta`   | `rgb(27 42 58 / .4)`  | línea interior y puntos de esquina sobre papel, decorativo |
| `--on-tinta`      | `#ffffff`             | texto sobre `--tinta-rosa` (6.0) y `--tinta-nopal` (5.9)   |
| `--velo-tinta`    | `rgb(27 42 58 / .08)` | pista de la barra y chip de gerente, decorativo            |

**Isla de papel.** `.paper` y `.up-card` re-declaran los tokens semánticos (`--text`, `--muted`, `--ink`, `--border`, `--card`, `--track`, `--primary`, `--on-primary`, `--nopal`, `--on-nopal`, `--focus`, `--halo`, `--sombra-btn`) con la tinta y el papel de la estampa (`--papel`). Las reglas hijas (`.sell`, `.estampa`, `.manager`, `.bar`, `.btn`) siguen leyendo `var(--token)`: dentro resuelven al papel, fuera al tema. `.tip` solo fija `--papel` y `--halo` en crema para la estampa de Chelo. El plato (`.sell`) y la estampa de personaje (`.estampa`) pintan `--papel`, nunca `--bg`; el radio del papel de la estampa es `--papel-r`.

## Tipografía

- Una sola webfont: **Rye** (OFL, solo peso 400), subconjunto latino de Google Fonts sin modificar (la OFL reserva el nombre), en `public/fonts/rye-v17-latin.woff2` con su `OFL-rye.txt`. Origen: `https://fonts.gstatic.com/s/rye/v17/r05XGLJT86YzEZ7tfumh4g.woff2`, SHA-256 `213b4683d65efe68c64d461fb8874d349c725282d840503b14f93642d826ef92`, 22.9 KB. `src/fuente.test.ts` comprueba archivo, licencia, preload, `@font-face` y glob del SW.
- Rótulo (`--fuente-rotulo`) solo en cuatro sitios: título de la app, `.money`, `h2` de diálogo y `.section-title`. `font-weight: 400`, `font-synthesis: none` (Rye no tiene negrita), `line-height: 1.15` fijo y `font-display: swap`: el intercambio no mueve nada. Preload en `index.html` con `crossorigin` (sin él se pide dos veces).
- Todo lo demás: `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`.
- Dinero: `clamp(1.6rem, 7.5vw, 2.25rem)`, `--primary`, `letter-spacing: 0.01em`. Título de la app: `1.15rem`, `--text`, una línea con elipsis. Cuerpo: `1rem`. Secundario: `0.85rem` a `0.95rem`. Cifras grandes: `2rem`. Títulos de sección: `0.95rem`, `--muted`, sin mayúsculas forzadas.

## Ilustración e iconos (`src/assets/icons.svg`)

- Sprite con `<symbol id="...">`, se usa con `<use href>`. Un `id` nuevo exige añadirlo a `ICON_NAMES` en `src/icons.ts` (lo comprueba `src/icons.test.ts`).
- `viewBox="0 0 48 48"`, dibujado para verse bien a 24 px.
- **Contorno:** tinta fija `stroke="#1B2A3A"`, `stroke-width="3"`, `stroke-linejoin="round"` (y `stroke-linecap="round"` en trazos abiertos). Mismo contorno en claro y oscuro: sobre azul noche los rellenos saturados lo separan del fondo. Los iconos de **acción** son ilustrados (los del plato, los cupones y los del menú lateral: `upgrade`, `recipe`, `moneda`, `monedas`, `costal`, `caja`, `bocina`, `guitarra`); solo los de **ajuste compacto** del header móvil y los de estado (`sound-*`, `music-*`, `menu`, `lock`, `check`) usan `currentColor`.
- **Detalles internos:** trazos finos de 1.5–2 en un tono más oscuro del relleno (p. ej. granos del elote `#C99700`). Excepción: en los iconos del menú lateral (30 px) los "$", cuerdas, manijas y ondas suben a 2.5–3 para leerse en el disco.
- **Rellenos:** hex fijo de comida. Paleta de ilustración actual:
  - Masa / pan: `#F6E3C3` `#F2D18B` `#E8C99A` `#D9A15B` `#F7D9C4`
  - Carne / tostado: `#B07850` `#A0522D` `#B5562B` `#C96A3A`
  - Elote: `#F4C430` (detalle `#C99700`)
  - Verdes: `#3A7D44` `#5FA35F`
  - Rojos / rosa: `#E5484D` `#E4007C` `#F25C8F`
  - Agua / cristal: `#9ED8F0`; metal: `#C8C8C8` `#DADADA`
  - Azul (gorra, cielo): `#1F7FC2`
  - Pieles: `#8C5A3C` `#B07850` `#D9A15B` `#E8B48A`; pelo: `#2B1B17` `#6B4A3A`, canas `#DADADA`
  - Puntos oscuros: `#2B1B17`; brillos: `#FFF6E5` (sobre rellenos claros) o `#FFFFFF` (sobre rellenos saturados)
- Reutilizar estos hex antes de añadir nuevos. Formas simples, máximo 10–12 elementos por icono.
- **Iconos del menú lateral** (dibujados para 30 px en disco de 48; se dan por buenos cuando se distinguen por silueta a 20 px). Las variantes `-off` repiten el dibujo y añaden la barra diagonal `M6 6l36 36` en tinta 3.5, sin bajar la opacidad. El "$" se dibuja como trazo, nunca `<text>`. Sin hex nuevos:

  | id         | Uso      | Composición y paleta                                                                                                                                |
  | ---------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `moneda`   | ×1       | Disco r 16 `#F4C430`, aro interior `#C99700` 2, "$" en trazo `#C99700` 2.5, brillo. 4 elementos.                                                    |
  | `monedas`  | ×10      | Tres cantos `rect` 32×8 apilados y cara `ellipse` 16×6, todo `#F4C430`; "$" pequeño `#C99700` 2; brillo. 6 elementos.                               |
  | `costal`   | Máx      | Bolsa `#E8C99A`, cuerda `#B5562B` 3, dos pliegues `#B07850` 2, "$" grande `#B5562B` 3, brillo. 5 elementos.                                         |
  | `caja`     | Respaldo | Cuerpo `#C8C8C8`, puerta `#DADADA`, dial `#1B2A3A` con marca `#F4C430`, manija `#F4C430` 3, patas, brillo. 7 elementos.                             |
  | `bocina`   | Sonido   | Base `#C99700`, cono `#F4C430` con aro `#C99700` 2, dos ondas en tinta 3 (un solo `path`), brillo. 5 elementos. `bocina-off`: sin ondas.            |
  | `guitarra` | Música   | Mástil `#B07850` 4 sobre tinta 9, clavijero `#2B1B17`, cuerpo `#D9A15B` de dos lóbulos, boca, puente, brillo. 7 elementos. Sin cuerdas: no se leen. |

- **Estampa:** los iconos ilustrados grandes llevan la clase `.sticker` (`src/style.css`): cuatro `drop-shadow` de 1.5 px en cruz en `--halo` (el papel dentro de una estampilla, blanco fuera) forman el halo troquelado y un quinto `drop-shadow(2px 2.5px 0 var(--ink))` pone la sombra dura. Es CSS puro (vale con la CSP) y no toca el sprite. Se aplica al icono del plato (52 px en plato de 76), al de mejoras (48 px), a Doña Chelo (52 px) y al avatar del chip de gerente (34 px). No se aplica a iconos de 30 px o menos (avatar del botón de contratar, iconos de interfaz): a ese tamaño el halo ensucia.
- **Marcos de estampa** (`.estampa`): el símbolo `sello` detrás del avatar, papel liso de `--papel` por `radial-gradient` y color del ondulado en `--aro`. Doña Chelo: caja de 64 px, avatar 46, aro `--primary-bright`. Chip de gerente: caja 48, avatar 34, aro `--primary`. Plato: aro `--primary` si responde, `--muted` sin abrir, `--border` con gerente.
- **Cupones** (`.up-slot` > `.up-card`): estampilla vertical de 156 px (icono 56 arriba, nombre, efecto, botón). El `li` exterior pone la sombra con `::before` enmascarado, que sigue el perforado; el interior lleva la máscara: rectángulo interior y una fila de medios círculos de 12 px centrada en cada lado. Borde `--corn`. Botón de precio como matasellos: pastilla con borde `--ink` y sombra de 2 px. En web, cuadrícula 2×2 (4 cupones).
- **Avatares** (busto en el cuadro de 48): cabeza circular centrada en ~(24,20), hombros que tocan el borde inferior, dos ojos de punto, boca de trazo y un objeto o prenda que identifique al personaje. Se usan a 28 px (botón de contratar), 34 px (chip de gerente, con estampa) y 24 px (chip compacto en web, estampa de 32; el filtro `.sticker` va en el chip entero, no en el avatar).
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
- Se aplica en `body` como `var(--grano), var(--bg) url('./assets/fondo.svg') 0 0 / 192px 192px repeat`; Vite lo sirve con hash y el SW lo precachea. `html` conserva `--bg` liso para el overscroll. Mismas reglas CSP que el sprite (`icons.test.ts`).
- **Grano de imprenta** (`src/assets/grano.svg`, token `--grano`): azulejo de 160 px con `feTurbulence` a tinta `#1B2A3A`, alfa `0.35·ruido − 0.1` (mota máxima 0.25). Va como primera capa de `background-image` en `body`, `.top`, `.bottom`, `.paper`, `.up-card` y `.modal-paper`; nunca como `filter` CSS (se rasteriza una vez y se repite, las barras no lo repintan). En oscuro `--grano` es `none`: tinta sobre azul noche no se ve y la referencia `estampas2.png` no tiene grano. `icons.test.ts` le aplica las reglas CSP del sprite; solo admite `url(#id)` interno.
- Sobre el patrón solo caen títulos de sección y la pantalla de bloqueo; con alpha 0.09 y el grano, `--muted` sigue ≥ 5:1 en ambos temas (`paleta.test.ts` mide sobre `--bg` liso: 5.5 claro). Todo lo demás va sobre `--card`, header o barra, que son sólidos.
- Las tarjetas nunca llevan `opacity`: el patrón se transparentaría. Un negocio sin abrir se atenúa con borde punteado y título en `--muted`.

## Componentes y UX

- Móvil primero (contenedor máx. 560 px); layout web a partir del breakpoint de 900 px en `style.css`.
- **Layout web** (≥ 900 px): menú lateral fijo de 72 px a la izquierda (`body { padding-left }`), `#app` de 1040 px centrado en el resto (no es grid: un hijo `sticky` de un grid queda atrapado en su celda y el header dejaría de pegarse); el tip de Doña Chelo (hijo directo de `#app`) va `fixed` en la esquina derecha del header, de 340 px, con el borde derecho alineado al de `#app`; los diálogos se desplazan `--lateral-w / 2` para centrarse en el área de contenido; debajo, las tarjetas en dos columnas de 4 con 6 px de gap (las 8 caben en 1280×800 sin scroll mientras Contratar quepa en su fila; con precios muy largos baja de línea y aparece un scroll corto); el header deja 356 px a la derecha para el tip; sin barra inferior (`.bottom { display: none }`, `--bar-h: 0`): el multiplicador, los iconos del header y el botón de heredar viven en el menú lateral.
- **Menú lateral** (`nav.lateral`, primero en el DOM): seis matasellos verticales de 48 px (`.lat-disc`: pastilla, borde `--border`, `--sombra-btn`, icono ilustrado de 30 px) con etiqueta de 0.75 rem debajo, centrados verticalmente en la ventana (`justify-content: center`): Mejoras (`aria-expanded`, abre el panel; deshabilitado si no hay mejoras), Cantidad (un solo botón que cicla ×1 → ×10 → Máx con `nextMode`; icono `moneda`/`monedas`/`costal`, etiqueta y `aria-label` "Cantidad a comprar: ×10" cambian en `render()` y el disco entra con `flip`; es la misma `mode` que el segmentado móvil), Herencia (badge `+N` en `--corn`, mismo `aria-label` que el botón de la barra), Respaldo (`caja`), Sonido (`bocina`/`bocina-off`) y Música (`guitarra`/`guitarra-off`) con `aria-pressed` y disco en `--primary` al estar activos. Copias de los controles originales; `render()` sincroniza ambos. Mismo papel que la barra: `--card` con grano y borde de 2 px.
- **Panel de mejoras** (`section.upgrades`, `.open`): en web es un panel de 360 px anclado al lateral entre el header y el borde inferior, que desliza desde la izquierda (`transform` 250 ms y `visibility` con retardo; instantáneo con reduced motion) sobre las tarjetas, que siguen vivas y visibles. No es modal (nada de `<dialog>`): cierra con Esc (si no hay diálogo abierto), clic fuera o clic en Mejoras; foco al título "Mejoras" al abrir y de vuelta al botón al cerrar (si está deshabilitado o en móvil, al `h1`); al cruzar los 900 px se cierra. El botón del header que abre Respaldo también se llama "Respaldo". Cerrado queda `visibility: hidden`: sin foco ni lectura. En móvil sigue en línea y `.open` no tiene reglas.
- **Tarjeta compacta** (web): ~130 px de alto. El papel es un grid de dos columnas (`--plato` y `minmax(0, 1fr)`; `.body` se disuelve con `display: contents`): plato 60 (`--plato` y `--plato-r` 20 viven en `.paper`; icono 42) a la izquierda con título, barra de 12 e info al lado, y la fila de botones debajo a todo el ancho. Padding 11, línea interior a 8 (`--marco-inset`), puntos de esquina a 11 (`--esq`). Comprar en una línea; contratar como "Nombre · precio" (el prefijo "Contratar a" se oculta, el nombre accesible completo va en `aria-label`, avatar 24): se queda en la fila si le quedan 200 px (recorta el nombre, nunca el precio) y si no baja de línea y la tarjeta crece: nunca se recorta contenido. Chip de gerente con estampa 32, avatar 24 y nombre con elipsis. Bocadillo a 78 px (`--bubble-x`). Columnas `minmax(0, 1fr)` iguales y `align-items: start` en la lista para que la sombra `::before` del `li` mida lo que el papel.
- **Papel picado** (`.picado`): un solo `<svg>` con 48 `<use>` del `banderin`, `preserveAspectRatio="xMinYMin slice"`: se recorta a lo ancho sin deformar. 22 px en móvil, 28 px en web. Estático; solo se sacude (`.shake`, un nodo, `transform`) al heredar.
- **Plato** (`.sell`): sello postal de 76 px. El símbolo `sello` del sprite (círculo de radio ondulado, 14 ondas, `currentColor`) va detrás del icono y hace de aro: `--primary` cuando responde, `--border` cuando no. El sello lleva también `.sticker` (halo del color del papel y sombra dura). El papel es un círculo de `--papel` pintado con `radial-gradient`, con una línea fina interior en el color del aro (`--aro`), como el marco de una estampilla. Icono de 52 px en estampa encima. Interactivo: `--primary` con anillo interior `--corn`; bloqueado o con gerente: `--border`.
- **Chip de gerente** (`.manager`): sustituye al botón de contratar, misma altura mínima (44 px) para que la fila no cambie. Boleto pequeño: borde `--border` y fondo `--track` (tinta translúcida sobre el papel).
- **Botones matasellos** (`.btn`, `.segmented`): pastilla (`border-radius: 999px`), borde de 2 px en `--border` y sombra dura `--sombra-btn` (2 px; `none` en oscuro fuera de una estampilla, siempre presente dentro). Deshabilitado: borde punteado y sin sombra. `.primary` y `.heir` conservan su relleno.
- **Barra de progreso** (`.bar`): 14 px con borde de 2 px en `--border` y pista `--card` (el papel); el relleno `--nopal` va sobre el papel (≥ 3.6:1 en los cuatro).
- **Diálogo** (`dialog.modal` > `.modal-paper`): estampilla del tema, no de la isla (fondo `--card` con grano, texto `--text`, borde `--border`, línea interior `--marco` en `::after`, máscara perforada en `.modal-paper`, sombra en `.modal::before` solo en claro, metida en 3 px de padding inferior porque el `dialog` tiene `overflow: auto`). Sin `position: relative` en el `dialog`: pisaría el `fixed` del top layer y el diálogo se centraría en el documento, no en la pantalla. `h2` en Rye con el banderín.
- **Bocadillos** (`.bubble`): overlay absoluto sobre título y barra de la tarjeta, `pointer-events: none`, `aria-hidden`; nunca desplazan botones. Duran 6 s por marca de tiempo en `render`, sin temporizadores. El tip de Doña Chelo (`.tip`) comparte el estilo pero sigue siendo un `<aside>` legible.
- **Tarjetas de negocio** (`li.card` > `.paper`): misma estampilla que los cupones. El `li` lleva la sombra en `::before` (pseudo-elemento de tinta con la misma máscara, desplazado 3 px; `--sombra-estampa` lo apaga en oscuro) y ancla el bocadillo; `.paper` lleva la máscara `--mascara-estampa` (variable compartida en `:root`), fondo `--papel` con grano, borde `--tinta` (`--tinta-suave` sin abrir), padding de 16 px, línea fina interior (`::after` absoluto con borde de 1.5 px en `--marco` a `--marco-inset`, 10 px; `z-index: -1` porque la máscara crea el contexto de apilamiento) y cuatro puntos de esquina en `--marco` a 15 px como capas del propio `background` (sin pseudo-elemento ni `filter`). El bocadillo queda fuera de la máscara para no recortarse.
- **Papel por negocio**: campo `papel` en `BusinessDef` (`src/data.ts`), `data-papel` en el `li.card`, regla `.card[data-papel] .paper { --papel }`. Cada papel dos veces, nunca dos vecinas iguales y el icono nunca sobre su propio matiz (`src/papel.test.ts`). La hoja `docs/sprite.html` pinta negocio y gerente sobre ese mismo papel.

  | Negocio | Papel | Negocio    | Papel   |
  | ------- | ----- | ---------- | ------- |
  | elotes  | rosa  | fonda      | crema   |
  | aguas   | crema | panadería  | mostaza |
  | tacos   | verde | franquicia | verde   |
  | tortas  | rosa  | cadena     | mostaza |

- **Cupón** (`.up-slot`): estampilla vertical con borde perforado y sombra (ver Ilustración e iconos). Papel crema con grano y borde `--corn`, sin línea interior: es un boleto, no un timbre. La sección `.upgrades` lleva `min-width: 0`: con cupones de ancho fijo, si no, ensancha la página.
- Objetivos táctiles ≥ 44 px. Excepción: en web con puntero fino (`(min-width: 900px) and (pointer: fine)`) botones y chip bajan a 40 px; con puntero grueso siguen a 44 y la cuadrícula puede hacer un scroll corto.
- Estado deshabilitado: borde punteado además del color (nunca solo color).
- Foco visible con `--focus`.
- Animaciones cortas de feedback en `src/fx.ts` (`pop`, `pulse`, `coin`, `confetti`, `flip`: 220 ms, solo `transform`); todo se desactiva con `prefers-reduced-motion: reduce`.
- **Rendimiento:** nunca `filter` en un ancestro de contenido que anima por frame (las barras de progreso). Nunca `outline` con `outline-offset` negativo sobre un elemento enmascarado (`.paper`, `.modal-paper`): obliga a repintar toda la estampilla en cada frame de las barras; medido en Chromium headless con la misma partida, el proceso GPU pasó de 10 % (antes del rediseño) a 26 % y volvió a 10 % con la línea en `::after`. Medir con `top` sobre los procesos de Chromium headless (`--type=gpu-process` y `renderer`) comparando contra `git worktree` del commit anterior. Las sombras de estampilla van en un pseudo-elemento enmascarado, no en `drop-shadow`; `.sticker` solo en iconos estáticos. `.fill` lleva `will-change: transform` para animar en su propia capa. Con filtros en `.card` el frame subía a 32 ms (31 fps) y la GPU al 99 %.

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
- `letra.png`: cartel de mercado con papel picado, rotulación gruesa y condensada con contorno, cielo plano y camioneta de línea. Modelo del papel picado y de la rotulación Rye del título y el dinero.
- Las referencias casi no usan contorno negro; nosotros sí (3 px). Se mantiene: en móvil a 52 px el contorno es lo que separa el icono del fondo.
