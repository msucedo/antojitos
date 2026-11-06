# Prompts de los platos (iconos raster de las tarjetas)

Cómo usarlos: pegar el bloque base más el párrafo del plato en el modelo de imagen. Si admite imágenes de referencia, adjuntar `docs/refs/iconos-tarjetas1.png` y `iconos-tarjetas2.png` y dejar la primera línea; si no, borrarla. Pedir 1:1, 1024 px o más, PNG, 4 variantes. Guardar la elegida como `docs/refs/plato-<id>-v1.png` y correr `python3 scripts/retrato.py <id> --plato`; luego añadir `<id>` a `PLATOS` en `src/platos.ts`. Otra versión: `-v2` y `--version 2`.

Fondo: gris claro plano `#E6E6E6`, no blanco. El script quita el fondo por inundación desde los bordes; con fondo blanco, un brillo blanco que toque un hueco del contorno se volvería transparente.

Si sale con marco, sombra en el suelo o varias variantes en una imagen, no hace falta regenerar: `--recorte L,T,R,B` se queda con una caja y `--sujeto` recorta la figura con Vision. Si sale con degradados o textura, cambiar el arranque por "A flat vector game icon, cel-shaded, …".

Hecho (2026-11-04): el user generó los 8 en una sola lámina, `docs/refs/platos-todos.jpeg` (1292×832, cada icono sobre una loseta del color de su papel). Se extrajeron con `--fuente` y `--recorte` por loseta, más `--motas` para tirar el confeti y las motas del papel que el relleno dejaba como islas (Vision no sirvió aquí: se comía el limón del elote):

```
python3 scripts/retrato.py elote  --plato --fuente docs/refs/platos-todos.jpeg --recorte 45,95,318,368 --motas
python3 scripts/retrato.py agua   --plato --fuente docs/refs/platos-todos.jpeg --recorte 365,95,635,368 --motas
python3 scripts/retrato.py tienda --plato --fuente docs/refs/platos-todos.jpeg --recorte 688,95,955,368 --motas
python3 scripts/retrato.py taco   --plato --fuente docs/refs/platos-todos.jpeg --recorte 1005,95,1275,368 --motas
python3 scripts/retrato.py concha --plato --fuente docs/refs/platos-todos.jpeg --recorte 45,460,318,730 --motas
python3 scripts/retrato.py camion --plato --fuente docs/refs/platos-todos.jpeg --recorte 365,460,635,730 --motas
python3 scripts/retrato.py olla   --plato --fuente docs/refs/platos-todos.jpeg --recorte 688,460,955,730 --motas
python3 scripts/retrato.py torta  --plato --fuente docs/refs/platos-todos.jpeg --recorte 1005,460,1275,730 --motas
```

Los iconos de la lámina miden ~240 px; a 256 van ligeramente reescalados. Si se quiere más nitidez en la hoja de contacto a 160, pedir la lámina a 2048 px de ancho y repetir con las cajas ×1.6.

Color a evitar como dominante: cada plato va sobre el papel de su tarjeta y no debe fundirse con él (regla "el icono nunca sobre su propio matiz", `src/papel.test.ts`; para el raster se revisa a ojo en `docs/sprite.html` y se ajusta la tabla `PROHIBIDOS`).

## Bloque base

```
Reference images 1–2 show the target style: chunky casual-game item icons with a thick black closed outline all around, a hard dark offset shadow inside the outline on the lower right, flat colors with exactly one darker tone per color for simple block shading, and one big glossy white highlight per piece.

[PÁRRAFO DEL PLATO]

Style: flat vector game icon, cel-shaded, bold and rounded shapes, no gradients, no texture, no outline gaps. Limited palette taken from the item description plus black outline (#1B2A3A).

Square 1:1 composition, the item centered and filling about 80% of the canvas, slight three-quarter view from above. Plain flat light gray background (#E6E6E6), no ground shadow, no text, no frame, no watermark, a single item.
```

## Platos

También `puestos` (cupón de mejora global, no es negocio): va en `RASTER`, no en `PLATOS`; mismo pipeline, `--plato`.

Papel de cada tarjeta (color a evitar como dominante): elote rosa, agua crema, taco verde, torta rosa, olla crema, concha mostaza, tienda verde, camión mostaza.

### elote (Carrito de elotes · papel rosa)

```
A Mexican street corn (elote): a plump yellow corn cob (#F4C430, kernels outlined in #C99700) on a wooden stick, slathered with white mayo and crumbled cheese, a dusting of red chili powder (#E5484D) and a lime wedge (#5FA35F) tucked at the side. Avoid pink as the dominant color.
```

### agua (Aguas frescas · papel crema)

```
A Mexican vitrolero: a big round glass barrel jar (#9ED8F0 glass with a white highlight) full of deep red hibiscus water (#C2185B), ice cubes floating, a metal ladle (#C8C8C8) hooked on the rim, a slice of lime on top. Avoid cream or beige as the dominant color.
```

### taco (Taquería · papel verde)

```
A Mexican street taco on a corn tortilla (#F2D18B, slightly darker #D9A15B underneath), filled with chopped meat (#B5562B), a little chopped onion (#FFF6E5) and cilantro, with a lime wedge. Keep the green small: only the cilantro and the lime. Avoid green as the dominant color.
```

### torta (Tortería · papel rosa)

```
A Mexican torta: a crusty oval telera bread roll (#E8C99A crust, #F6E3C3 crumb) cut open and stacked with ham (#F25C8F), melted cheese, avocado (#5FA35F), tomato and a slice of jalapeño, sesame seeds on top. Avoid pink as the dominant color.
```

### olla (Fonda · papel crema)

```
A Mexican clay cooking pot (olla de barro, #B5562B with a darker #A0522D band) with a wooden spoon resting in it, steam curling up, red stew visible at the rim. Avoid cream or beige as the dominant color.
```

### concha (Panadería · papel mostaza)

```
A Mexican concha sweet bread: a round golden bun (#E8C99A) topped with a pink sugar shell (#F25C8F) scored in the classic seashell pattern, a few sugar crumbs around. Avoid mustard yellow as the dominant color.
```

### tienda (Franquicia · papel verde)

```
A small Mexican storefront: a cream facade (#FFF6E5) with a striped awning in magenta and white (#E4007C), a dark wooden door (#6B4A3A), a window, and a little sign without any text. Avoid green as the dominant color.
```

### puestos (Cupón "Todos los negocios" · papel crema del cupón)

```
A row of three small Mexican tianguis market stalls side by side, seen from the front three-quarter view: each stall is a simple wooden counter (#E8C99A, darker #D9A15B underneath) with a scalloped fabric awning on top, one awning magenta (#E4007C), one green (#3A7D44), one mustard yellow (#F4C430), each awning with a darker tone on its underside. The three stalls touch each other and read as one single compact object. No people, no goods on the counters, no poles sticking out, no signs or lettering. Avoid cream or beige as the dominant color: the awnings should carry the color.
```

Hecho (2026-11-06): `docs/refs/plato-puestos-v2.jpeg` (la v1 salió con contorno fino), `python3 scripts/retrato.py puestos --plato --version 2`.

### camion (Cadena nacional · papel mostaza)

```
A chunky delivery truck seen from the front three-quarter view: magenta cab (#E4007C) with a cream cargo box (#FFF6E5), big black tires with silver hubs (#C8C8C8), blue windows (#9ED8F0), no text on the box. Avoid mustard yellow as the dominant color.
```
