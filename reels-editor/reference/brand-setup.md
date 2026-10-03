# Configuración de marca — la entrevista

Se hace **una sola vez por proyecto**, antes del primer reel. Después queda escrita en
`brand.json` y ningún reel vuelve a preguntar nada de esto.

La regla es simple: **preguntá poco, proponé defaults y seguí**. La única respuesta sin
default es el color de marca (sin eso el editor no arranca); en todas las demás, si el
usuario no sabe qué contestar se toma el default y se sigue. Siempre se puede cambiar
después editando `brand.json` y volviendo a correr el script con `--force`.

---

## Las 5 preguntas

### 1. Nombre de la marca (y handle, si querés)

Para nombrar los archivos y para que el copy del hook suene a la marca y no a un genérico.

> «¿Cómo se llama la marca o el proyecto? (y tu @ de Instagram si querés que lo tenga en
> cuenta para el copy)»

### 2. Color de acento

Es **el color de la marca**: pinta el chip del punch del hook y las palabras de énfasis
de los captions. Uno solo, en hex.

> «¿Cuál es el color principal de tu marca? Pasame el hex (ej: #FF3B30). Si no lo tenés a
> mano, decime el color y lo elegimos.»

Cosas a mirar (el script las chequea y avisa; **los avisos se le cuentan al usuario**):

- Si el color es muy oscuro, **no se va a leer** como palabra de énfasis sobre video
  oscuro. Ahí el énfasis va en blanco (`--emphasis white`) y el acento queda solo para el
  chip del hook, que tiene fondo propio.
- El color del texto adentro del chip (negro o blanco) **no se pregunta**: lo calcula el
  script por contraste.

### 3. Base oscura

El fondo del primer chip del hook. Default `#0D0D0D` (negro suave, no negro puro: sobre
video el negro puro "abre un pozo" en la imagen).

> «¿Usás algún negro/gris de marca para los fondos? Si no, dejamos #0D0D0D.»

### 4. Tipografía

La misma para captions y hook. **Tiene que ser una display pesada**: las tipografías de
texto en peso regular desaparecen sobre video.

> «¿Tenés una tipografía de marca? Si me pasás el archivo (.otf o .ttf) la uso. Si no,
> elegí una de estas:»

| Tipografía | Cómo se ve |
|---|---|
| **Anton** (default) | Condensada muy pesada. Lee perfecto chiquita, entra mucho texto. |
| Archivo Black | Ancha y sólida, editorial/deportiva. |
| Bebas Neue | Muy condensada, todo mayúsculas. Elegante y agresiva. |
| Oswald | Condensada clásica, más neutra que Anton. |
| Montserrat 800 | Geométrica amable. Marcas cálidas / lifestyle. |
| Poppins 800 | Geométrica redonda. Tech amigable. |
| Inter 900 | Neutra de interfaz. Marcas sobrias / SaaS. |
| Space Grotesk 700 | Grotesca con personalidad. Tech / diseño. |
| Figtree 900 | Humanista moderna. Coaching / consultoría. |
| Rubik 900 | Esquinas redondeadas. Marcas jóvenes. |

Todas son gratis y se cargan solas desde Google Fonts. El catálogo completo con las notas:
`node scripts/setup-brand.mjs --print-fonts`.

Si el usuario pasa su propia tipografía, se copia al proyecto:
`--font-file /ruta/a/Fuente-Black.otf --font "Nombre Visible"`.

### 5. Idioma y forma de hablar

Define en qué idioma transcribe Whisper y cómo se escriben los captions.

> «¿En qué idioma hablás en los reels? ¿Y tratás de vos, de tú o neutro?»

- `language`: código del idioma (`es`, `en`, `pt`, `it`...). Va directo al
  `--language` de `hyperframes transcribe`. **Nunca usar los modelos `.en` si el audio no
  está en inglés**: traducen.
- `dialect`: `rioplatense` (voseo), `neutro` (tuteo), `peninsular`, `mexicano`, o lo que
  corresponda. Whisper tiende a normalizar todo a peninsular/neutro, así que esto es lo
  que le dice al editor **qué convertir en el mapa de `fix` de los captions**
  (ej. en rioplatense: `puedes→podés`, `tienes→tenés`, `queréis→querés`).

---

## Opcionales (preguntar solo si el usuario los menciona)

- **Léxico de marca**: nombres propios, productos o términos que Whisper escribe mal
  siempre. Van a `brand.json → lexicon.always` y de ahí al `fix` de cada reel.
  Ej: `{"clot code": ["Claude", "Code"], "vibe coding": ["vibecoding"]}`.
- **Palabras prohibidas**: términos que la marca no usa nunca (por compliance o por estilo).
  Van a `lexicon.never`; el editor las evita en el copy del hook.
- **CTA fijo**: si todos los reels cierran con la misma keyword o llamada a la acción.

---

## El comando

Con las respuestas juntadas:

```bash
node ~/.claude/skills/reels-editor/scripts/setup-brand.mjs \
  --proj ~/reels/hyper-edits \
  --name "Mi Marca" \
  --handle "@mimarca" \
  --accent "#FF3B30" \
  --dark "#0D0D0D" \
  --font "Anton" \
  --language es \
  --dialect neutro
```

Salidas: `brand.json` (config) y `brand.css` (variables que consume la composición).
Si el acento tiene poco contraste, el script lo avisa: **contarle el aviso al usuario y
decidir con él**, no resolverlo por cuenta propia.

## Cambiar la marca después

Editar `brand.json` a mano y regenerar el CSS:

```bash
node ~/.claude/skills/reels-editor/scripts/setup-brand.mjs --proj ~/reels/hyper-edits \
  --from ~/reels/hyper-edits/brand.json --force
```

O correr el script de nuevo con los flags cambiados y `--force`. Los reels ya renderizados
no cambian (el estilo queda horneado en el MP4): el cambio aplica del próximo render en
adelante.
