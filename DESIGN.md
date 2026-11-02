# DESIGN.md — Imperio de Antojitos

Fuente única de estilo visual. Si algo aquí choca con el código, manda el código (`src/style.css`, `src/assets/icons.svg`) y se actualiza este archivo.

## Voz visual

Mercado mexicano / papel picado: cálido, alegre, legible. Ilustración **flat** con contorno grueso redondeado, colores de comida saturados sobre fondo papel crema. Sin degradados, sin sombras dentro de los iconos, sin fotos, **cero emojis**.

## Paleta (tokens en `src/style.css`)

Contraste mínimo: texto ≥ 4.5:1, UI ≥ 3:1 (WCAG AA). Nunca usar hex sueltos en CSS de UI: usar `var(--token)`.

| Token          | Claro     | Oscuro    | Uso / contraste (claro)              |
| -------------- | --------- | --------- | ------------------------------------ |
| `--bg`         | `#fff6e5` | `#1e1412` | fondo papel                          |
| `--card`       | `#ffffff` | `#2a1f1c` | tarjetas                             |
| `--text`       | `#2b1b17` | `#f3e9dd` | texto, 15.4:1 sobre `--bg`           |
| `--muted`      | `#6b5a52` | `#c9b8a8` | texto secundario, 6.1:1 sobre `--bg` |
| `--primary`    | `#c2006a` | `#ff6fb5` | rosa mexicano, 6.0:1 con blanco      |
| `--on-primary` | `#ffffff` | `#2a1f1c` | texto sobre primary                  |
| `--corn`       | `#f4c430` | `#f4c430` | amarillo elote (acento, mejoras)     |
| `--on-corn`    | `#2b1b17` | `#1e1412` | texto sobre corn                     |
| `--nopal`      | `#2f6b39` | `#7cc68a` | verde nopal, 6.4:1 con blanco        |
| `--on-nopal`   | `#ffffff` | `#1e1412` | texto sobre nopal                    |
| `--border`     | `#f0dcc0` | `#3d2e29` | bordes                               |
| `--track`      | `#f6e7cd` | `#3d2e29` | fondo de barras de progreso          |
| `--focus`      | `#c2006a` | `#f4c430` | anillo de foco, 5.6:1 sobre `--bg`   |

Cualquier token nuevo necesita par claro/oscuro y ratio comprobado.

## Tipografía

- Familia: `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif` (sin webfonts: rendimiento y offline).
- Título: `clamp(1.75rem, 8vw, 2.5rem)`. Cuerpo: `1rem`. Secundario: `0.85rem` a `0.95rem`. Cifras grandes: `2rem`.

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
  - Puntos oscuros: `#2B1B17`; brillos: `#FFF6E5`
- Reutilizar estos hex antes de añadir nuevos. Formas simples, máximo 6–8 elementos por icono.
- **CSP:** prohibido `style`, `<style>`, `<script>`, handlers `on*` y recursos externos dentro del SVG.

## Componentes y UX

- Móvil primero (contenedor máx. 560 px); layout web a partir del breakpoint en `style.css`.
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
