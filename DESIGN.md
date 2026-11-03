# DESIGN.md — Imperio de Antojitos

Fuente única de estilo visual. Si algo aquí choca con el código, manda el código (`src/style.css`, `src/assets/icons.svg`) y se actualiza este archivo.

## Voz visual

Mercado mexicano / papel recortado: cálido, alegre, legible. Una sola apuesta: todo es papel sobre papel. Papel picado colgando del header, tarjetas con borde de 2 px y sombra dura de 3 px sin desenfoque, banderín como motivo repetido (título de los diálogos). Ilustración **flat** con contorno grueso redondeado, colores de comida saturados sobre fondo papel crema. Sin degradados, sin sombras dentro de los iconos, sin fotos, **cero emojis**. El dinero es el héroe del header; el título queda secundario.

## Paleta (tokens en `src/style.css`)

Contraste mínimo: texto ≥ 4.5:1, UI ≥ 3:1 (WCAG AA). Nunca usar hex sueltos en CSS de UI: usar `var(--token)`.

| Token              | Claro                   | Oscuro    | Uso / contraste (claro)                                    |
| ------------------ | ----------------------- | --------- | ---------------------------------------------------------- |
| `--bg`             | `#fbf0e4`               | `#1c1210` | fondo papel                                                |
| `--card`           | `#fffaf3`               | `#2b1d19` | tarjetas, barra inferior, diálogos                         |
| `--text`           | `#2a1612`               | `#f6ece0` | texto, 15.3:1 sobre `--bg`                                 |
| `--muted`          | `#6e574c`               | `#cdb9a7` | texto secundario, 6.0:1 sobre `--bg`, 6.5:1 sobre `--card` |
| `--primary`        | `#c2006a`               | `#ff6fb5` | rosa mexicano oscuro, 6.0:1 con blanco; aro del plato      |
| `--on-primary`     | `#ffffff`               | `#2b1d19` | texto sobre primary                                        |
| `--primary-bright` | `#e4007c`               | `#ff6fb5` | solo decorativo: banderines, confeti, banderín de diálogo  |
| `--corn`           | `#f5b92a`               | `#f5b92a` | amarillo elote: bocadillos, cupones, 9.7:1 con `--on-corn` |
| `--on-corn`        | `#2a1612`               | `#1c1210` | texto sobre corn                                           |
| `--nopal`          | `#2a7239`               | `#7cc68a` | verde nopal, 5.9:1 con blanco, 4.7:1 sobre `--track`       |
| `--on-nopal`       | `#ffffff`               | `#1c1210` | texto sobre nopal                                          |
| `--cielo`          | `#1f7fc2`               | `#6cc1f0` | solo decorativo: banderines                                |
| `--border`         | `#ecd9c0`               | `#4a3832` | bordes de 2 px; en oscuro da el relieve                    |
| `--track`          | `#f3e3cb`               | `#3d2e29` | fondo de barras y del chip de gerente                      |
| `--shadow`         | `0 3px 0 var(--border)` | `none`    | sombra dura (papel sobre papel); en oscuro no hay          |
| `--focus`          | `#c2006a`               | `#f5b92a` | anillo de foco, 5.3:1 sobre `--bg`                         |

`--primary-bright` y `--cielo` nunca llevan texto encima. Cualquier token nuevo necesita par claro/oscuro y ratio comprobado; `.fx-*` del confeti usan tokens, nunca hex sueltos. Script de comprobación: calcula el ratio WCAG de cada par (texto ≥ 4.5, UI ≥ 3) leyendo `:root` claro y oscuro de `style.css`; se corre antes de cerrar cualquier cambio de paleta.

## Tipografía

- Familia: `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif` (sin webfonts: rendimiento y offline).
- Dinero: `clamp(1.75rem, 8vw, 2.5rem)`, peso 900. Título de la app: `1rem`, peso 600, `--muted`. Cuerpo: `1rem`. Secundario: `0.85rem` a `0.95rem`. Cifras grandes: `2rem`. Títulos de sección: `0.9rem`, peso 700, sin mayúsculas forzadas.

## Ilustración e iconos (`src/assets/icons.svg`)

- Sprite con `<symbol id="...">`, se usa con `<use href>`. Un `id` nuevo exige añadirlo a `ICON_NAMES` en `src/icons.ts` (lo comprueba `src/icons.test.ts`).
- `viewBox="0 0 48 48"`, dibujado para verse bien a 24 px.
- **Contorno:** `stroke="currentColor"`, `stroke-width="2.5"`, `stroke-linejoin="round"` (y `stroke-linecap="round"` en trazos abiertos). Así sigue el tema claro/oscuro.
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
- **Avatares** (busto en el cuadro de 48): cabeza circular centrada en ~(24,20), hombros que tocan el borde inferior, dos ojos de punto, boca de trazo y un objeto o prenda que identifique al personaje. Se usan a 24 px (botón de contratar), 26 px (esquina del plato) y 36 px (chip de gerente).
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
- **Plato** (`.sell`): aro de 4 px. Interactivo: `--primary` con anillo interior `--corn`; bloqueado o con gerente: `--border`. Con gerente, el avatar asoma en la esquina (`.badge`).
- **Chip de gerente** (`.manager`): sustituye al botón de contratar, misma altura mínima (44 px) para que la fila no cambie.
- **Bocadillos** (`.bubble`): overlay absoluto sobre título y barra de la tarjeta, `pointer-events: none`, `aria-hidden`; nunca desplazan botones. Duran 6 s por marca de tiempo en `render`, sin temporizadores. El tip de Doña Chelo (`.tip`) comparte el estilo pero sigue siendo un `<aside>` legible.
- **Cupón** (`.up-card`): borde `--corn`, muescas laterales con `mask-image` (CSS puro), sin sombra.
- Objetivos táctiles ≥ 44 px.
- Estado deshabilitado: borde punteado además del color (nunca solo color).
- Foco visible con `--focus`.
- Animaciones cortas de feedback; todo se desactiva con `prefers-reduced-motion: reduce`.

## Verificación visual (obligatoria para cambios de UI)

Con el MCP `playwright` (`.mcp.json`):

1. `npm run dev` (Vite, `http://localhost:5173`).
2. `browser_navigate` a la URL.
3. `browser_resize` 390×844 (móvil) → `browser_take_screenshot`.
4. `browser_resize` 1280×800 (web) → `browser_take_screenshot`.
5. Si el cambio toca color, revisar también el tema oscuro: comprobar que solo usa tokens con par oscuro y, si hace falta captura, emular `prefers-color-scheme: dark` en el navegador.
6. Criticar (jerarquía, contraste, alineación, consistencia con este archivo), corregir, repetir capturas.

## Referencias

Imágenes de inspiración en `docs/refs/` (opcional). Mirarlas antes de ilustrar algo nuevo.
