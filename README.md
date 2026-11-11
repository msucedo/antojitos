# Imperio de Antojitos

Juego idle de antojitos mexicanos: empiezas con un carrito de elotes y terminas con una cadena de restaurantes. Se instala como PWA y funciona sin red. Opcionalmente compites en un ranking mundial por quién tiene más efectivo.

Juego propio: nombre, arte, textos y números. Sin anuncios, sin cuentas, sin rastreo.

## Cómo se juega

- Toca el plato para vender a mano; compra más unidades para ganar más por vuelta.
- Contrata al gerente de cada negocio para que venda solo. Dale propina para que venda ×1.5 un rato.
- Los hitos de unidades (25, 50, 100, 200, 300, 400, 500) aceleran o doblan las ventas.
- Las mejoras multiplican negocios. Los logros dan +2 % cada uno y se quedan para siempre.
- Al heredar reinicias la partida y cobras recetas, que dan +2 % cada una o se cocinan en el recetario de la abuela (arranque con elotes y dinero, ausencia más larga, propinas más largas, estrellas iniciales, ventas ×2 y ×4).
- Vuelve cada día: la racha regala minutos de ventas y, el día 7, una receta.
- Ranking mundial: elige un apodo desde el trofeo del header y tu efectivo actual compite con el de todos. Baja cuando compras o heredas, a propósito.

## Stack

- Vite + TypeScript estricto, DOM y CSS a mano, sin framework.
- `vite-plugin-pwa` para el service worker y el manifest.
- Vitest para pruebas unitarias; `node:test` + `playwright-core` (Chrome del sistema) para las de punta a punta.
- Vercel para servir el juego y `api/ranking.ts` (Vercel Function) con Upstash Redis para el ranking. El juego no depende del servidor: sin red todo sigue funcionando salvo el ranking.
- Node 22 (`.nvmrc`).
                                                                                                                                            
## Estructura

```
api/ranking.ts          Función de Vercel: adapta Request/Response y Upstash a src/servidor
src/game.ts             Reglas y estado puro del juego (dinero, negocios, hitos, herencia, recetario)
src/data.ts             Catálogo: negocios, gerentes y sus frases, mejoras, recetario, constantes
src/save.ts             Guardado en localStorage: validación, migraciones, respaldo, exportar e importar
src/ranking.ts          Lado cliente del ranking sin red (identidad, cuerpo del envío, parseo defensivo)
src/servidor/ranking.ts Lógica del ranking (validación, plausibilidad, límites); se prueba con un Redis en memoria
src/apodo.ts            Reglas del apodo, compartidas por cliente y servidor
src/ui.ts               Toda la interfaz, construida con createElement y textContent
src/main.ts             Arranque, bucle de juego, autosave, service worker, envíos al ranking
src/style.css           Estilos con tokens de tema (claro y oscuro)
src/assets/             Sprite de iconos, retratos y platos raster, fondo, cursores
e2e/juego.mjs           Pruebas de punta a punta sobre dist/
scripts/capturas.mjs    Capturas de verificación visual
public/                 Manifest, iconos, fuente Rye (OFL), robots.txt
```

## Documentación

- `PLAN.md`: objetivo, decisiones, mecánicas y balance, seguridad, y el estado de cada etapa (MVP1 a MVP5). Es la fuente de verdad.
- `DESIGN.md`: identidad visual, tokens, tipografía, iconos, componentes y el proceso de verificación visual. Leerlo antes de tocar la interfaz.
- `CLAUDE.md`: reglas para trabajar en el repo con Claude Code.

## Guardado y compatibilidad

La partida vive en `localStorage` (`antojitos.save` con respaldo en `antojitos.bak`) y se puede exportar como código desde Ajustes. El guardado es entrada no confiable: se valida y se migra en cadena (hoy versión 7). Regla de deploy: nunca publicar un build con una versión de guardado menor que la ya publicada; un cliente viejo con un guardado más nuevo juega en solo lectura hasta recargar. El código de respaldo incluye la identidad del ranking: no se comparte.


## Licencia

Código y arte: todos los derechos reservados por ahora. La fuente Rye es de Google Fonts bajo la SIL Open Font License (`public/fonts/OFL-rye.txt`).
