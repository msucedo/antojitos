# Prompts de retratos (estilo estampilla ilustrada)

Cómo usarlos: pegar el bloque base más el párrafo del personaje en el modelo de imagen (el de Chelo salió con este texto). Si el modelo admite imágenes de referencia, adjuntar `docs/refs/caracter1.png`, `caracter2.png` y `caracter3.png` y dejar la primera línea; si no, borrarla. Pedir 1:1, 1024 px o más, PNG. Guardar la elegida como `docs/refs/<id>-v1.png` y correr `python3 scripts/retrato.py <id>`; luego añadir `<id>` a `PORTRAITS` en `src/characters.ts`.

Si sale con escena de fondo o marco, no hace falta regenerar: `python3 scripts/retrato.py <id> --sujeto` recorta la figura con Vision y `--abajo N` corta rótulos del pie. Si sale con marco o perforado, añadir al final "The image is the artwork only, with no border". Si sale fotorrealista o con degradados, cambiar el arranque por "A flat vector illustration, cel-shaded, in the style of…". Pedir 4 variantes y elegir.

## Bloque base

```
Reference images 1–3 show the target style: vintage illustrated postage stamps with fine ink linework, flat color blocks, expressive faces and a graphic background disc.

[PÁRRAFO DEL PERSONAJE]

Behind the figure, a large flat [COLOR DEL DISCO] circle fills most of the frame like a sun or a seal, with a thin darker ring inside it. The outer background is plain cream (#FFF6E5).

Style: clean fine ink outlines in dark navy (#1B2A3A), about one pixel wide, flat cel-shaded colors with one darker tone per color for simple block shadows, no gradients, no texture. Limited palette taken from the character description plus navy ink. Mid-century poster feel, like a 1960s illustrated stamp.

Square 1:1 composition, the figure occupies the center two thirds, the shoulders are cut off cleanly by the bottom edge. No text, no stamp perforations, no frame, no watermark.
```

## Personajes

Disco de cada uno (todos de la paleta del juego): Chelo mostaza `#F4C430`, Beto verde `#5FA35F`, Lupita azul claro `#9ED8F0`, Güero rojo `#E5484D`, Tere arena `#F2D18B`, Chuy beige `#E8C99A`, Rosita rosa `#F25C8F`, Pérez gris `#C8C8C8`, Jefa azul `#1F7FC2`.

### chelo (hecho: `docs/refs/chelo-v1.jpeg`)

```
A vector-style illustrated portrait of Doña Chelo, a warm Mexican grandmother around 70, in the style of a retro illustrated postage stamp. Bust framing from the chest up, centered, facing the viewer with a kind, knowing smile and one eyebrow slightly raised. She has brown skin, a neat gray bun with a loose curl, round wire glasses with light-blue lenses catching a small white highlight, rosy cheeks, small gold earrings, and a magenta rebozo shawl (#E4007C) with yellow fringe (#F4C430) draped over her shoulders.
```

Disco: mustard-yellow (#F4C430).

### beto (hecho: `docs/refs/beto-v1.jpeg`, sin disco)

```
A vector-style illustrated portrait of Don Beto, a calm Mexican street vendor around 70, in the style of a retro illustrated postage stamp. Bust framing from the chest up, centered, a gentle half-smile under a thick white mustache, eyes narrowed kindly. Brown skin with deep laugh lines, a woven palm straw hat (#F2D18B) with a brown band, and a red-and-cream checkered shirt (#E5484D, #FFF6E5) with the top button open.
```

Disco: green (#5FA35F).

### lupita (hecho: `docs/refs/lupita-v1.jpeg`, con escena; `--sujeto --abajo 985`)

```
A vector-style illustrated portrait of Lupita, a cheerful young Mexican woman who sells aguas frescas, in the style of a retro illustrated postage stamp. Bust framing, centered, a big open smile and bright eyes, head tilted slightly. Light-brown skin, a long dark braid over one shoulder tied with a pink ribbon (#F25C8F), small flower earrings, and a cream apron (#FFF6E5) printed with small red and yellow flowers over a green blouse (#5FA35F).
```

Disco: light blue (#9ED8F0).

### guero (hecho: `docs/refs/guero-v2.jpeg`, fondo blanco; `--version 2`)

```
A vector-style illustrated portrait of El Güero, a joking Mexican taquero in his 30s, in the style of a retro illustrated postage stamp. Bust framing, centered, a wide mischievous grin with one eyebrow up. Light skin with a hint of stubble, a blue baseball cap (#1F7FC2) worn backwards, a plain cream t-shirt (#FFF6E5), and a wooden-handled ladle resting on his shoulder.
```

Disco: red (#E5484D).

### tere (hecho: `docs/refs/tere-v1.jpeg`, tres variantes en una imagen; `--recorte 20,140,420,640`, la de la izquierda)

```
A vector-style illustrated portrait of Doña Tere, a strict, elegant Mexican woman around 60 who runs a torta shop, in the style of a retro illustrated postage stamp. Bust framing, centered, lips pressed in a serious but not unkind expression, chin slightly raised. Brown skin, dark hair in a tight bun with gray streaks, half-moon reading glasses low on her nose, large round gold earrings (#F4C430), and a dark green blouse (#2E7D32) with a white collar.
```

Disco: sand (#F2D18B).

### chuy (hecho: `docs/refs/chuy-v1.jpeg`, estampilla con texto; `--sujeto --recorte 500,130,900,600`)

```
A vector-style illustrated portrait of Chuy, a warm, round-faced Mexican cook around 50, in the style of a retro illustrated postage stamp. Bust framing, centered, a broad happy smile with red cheeks, eyes almost closed from smiling. Brown skin, a thick dark mustache, a tall white chef's hat (#FFFFFF) and a white double-breasted chef's jacket (#FFF6E5) with dark buttons.
```

Disco: beige (#E8C99A).

### rosita (hecho: `docs/refs/rosita-v1.jpeg`, estampilla con texto; `--sujeto --recorte 480,130,930,712`)

```
A vector-style illustrated portrait of Rosita, a dreamy young Mexican baker in her 20s, in the style of a retro illustrated postage stamp. Bust framing, centered, a soft sweet smile and eyes looking slightly upward as if daydreaming. Light-brown skin, dark hair tied under a red bandana (#E5484D) with white dots, a smudge of flour on one cheek, a pink blouse (#F25C8F) and a white apron (#FFF6E5), holding the edge of a tray of conchas at the bottom of the frame.
```

Disco: pink (#F25C8F).

### perez (hecho: `docs/refs/perez-v1.jpeg`, tres variantes, la del centro; `--sujeto --recorte 505,75,895,638`)

```
A vector-style illustrated portrait of Licenciado Pérez, a stiff corporate Mexican man in his 40s, in the style of a retro illustrated postage stamp. Bust framing, centered, a thin polite smile, eyebrows level, eyes attentive behind rectangular glasses. Light-brown skin, neatly combed dark hair with gray at the temples, a gray suit (#8C8C8C) over a white shirt, a pink tie (#E4007C) and a small badge on the lapel.
```

Disco: gray (#C8C8C8).

### jefa (hecho: `docs/refs/jefa-v1.jpeg`, estampilla con banda de texto; `--sujeto --recorte 530,120,880,515`)

```
A vector-style illustrated portrait of La Jefa, a powerful, composed Mexican businesswoman in her 50s, in the style of a retro illustrated postage stamp. Bust framing, centered, an unreadable confident expression, chin up, no smile. Brown skin, sleek dark hair pulled back, large dark sunglasses (#1B2A3A lenses with a small white highlight), big gold hoop earrings (#F4C430), and a sharp red blazer (#E5484D) over a black top.
```

Disco: blue (#1F7FC2).
