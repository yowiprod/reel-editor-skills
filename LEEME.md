# Pack de edición de reels — instalación

Con esto tu Claude Code edita reels hablados a cámara de punta a punta: corta los
silencios, sincroniza los captions palabra por palabra, arma el hook de los primeros 3
segundos y verifica el resultado frame a frame antes de entregarte el MP4. Todo el
criterio de edición ya viene cerrado adentro de la skill: vos solo le pasás los clips.

**El estilo es TUYO.** La primera vez que lo corrés te hace 5 preguntas (nombre, color
de marca, base oscura, tipografía e idioma) y con eso deja configurado el proyecto: todos
tus reels salen consistentes entre sí y con tu identidad, no con la de otro.

## Qué trae este pack

| Carpeta / archivo | Qué es | A dónde va en tu compu |
|---|---|---|
| `reels-editor/` | La skill con el pipeline, los criterios y 8 scripts | `~/.claude/skills/reels-editor/` |
| `reel.md` | El comando `/reel` para invocarlo fácil | `~/.claude/commands/reel.md` |
| `hyper-edits-starter/` | El proyecto HyperFrames donde se edita (esqueleto listo) | Donde quieras, ej: `~/reels/hyper-edits/` |
| `LEEME.md` | Este archivo | — |

## Instalación (una sola vez, ~10 minutos)

**1. Requisitos de sistema** (pegá esto en la Terminal):

```bash
brew install ffmpeg node
```

(Si no tenés Homebrew: https://brew.sh)

**2. Instalá la skill y el comando:**

```bash
mkdir -p ~/.claude/skills ~/.claude/commands
cp -r reels-editor ~/.claude/skills/
cp reel.md ~/.claude/commands/
```

**3. Copiá el proyecto de edición a tu carpeta de trabajo:**

```bash
mkdir -p ~/reels
cp -r hyper-edits-starter ~/reels/hyper-edits
```

**4. Claude Code** instalado y logueado (con el modelo por defecto va perfecto).

## Cómo se usa

1. Poné los clips crudos del reel (los videos de tu celular) en una carpeta,
   ej: `~/reels/clips-reel-lunes/`.
2. Abrí Claude Code desde `~/reels/hyper-edits/` y escribí:

```
/reel ~/reels/clips-reel-lunes
```

3. **La primera vez** te va a hacer las 5 preguntas de marca y va a dejar armado el
   `brand.json` del proyecto. De ahí en adelante no vuelve a preguntar.
4. Claude Code hace todo solo: analiza los clips, transcribe, corta silencios, arma
   los captions, propone el hook (si no es obvio te muestra opciones), renderiza y
   te entrega el MP4 verificado en `renders/`.

**La primera corrida tarda unos minutos extra**: baja el modelo de Whisper (para
transcribir) y el Chrome del renderer. Es una sola vez.

## Las 5 preguntas de marca

| Pregunta | Para qué | Default |
|---|---|---|
| Nombre de la marca (y tu @) | Nombrar archivos y darle voz al copy del hook | — |
| **Color de acento (hex)** | El chip del punch del hook + las palabras destacadas | **obligatorio** |
| Base oscura | El fondo del primer chip del hook | `#0D0D0D` |
| Tipografía | Captions y hook. Elegís de 10 gratis o pasás la tuya (.otf/.ttf) | `Anton` |
| Idioma y forma de hablar | En qué idioma transcribe y cómo se escriben los captions (de vos / de tú / neutro) | español neutro |

Si el color que elegís no se va a leer sobre video oscuro, la skill te lo avisa y te
propone la alternativa (destacados en blanco, color solo en el chip del hook).

Para cambiar la marca después: editá `brand.json` en la carpeta del proyecto y corré de
nuevo el setup con `--force` (está explicado en `reference/brand-setup.md`).

## Tres cosas para saber

- **El criterio de edición viene cerrado de fábrica** (tamaños, posiciones, safe zones de
  Instagram, política de corte de silencios, verificación): son reglas probadas en reels
  publicados y Claude Code las aplica solo. Lo que cambia entre marcas es la capa de
  identidad, y esa vive en `brand.json`.
- Los videos salen **verticales 1080×1920 a los fps de la fuente** (60 en celulares
  modernos), listos para subir a Reels. Si un clip viene horizontal, la skill lo resuelve
  sola con letterbox (nunca lo recorta ni lo estira).
- **Mirá siempre el MP4 final entero antes de publicar**: la skill verifica sincro,
  encuadres y audio, pero el ojo final es tuyo.

Cualquier cosa que se rompa, decile a tu Claude Code que lea
`~/.claude/skills/reels-editor/reference/pipeline-detallado.md`: ahí están documentadas
las 20 trampas conocidas con su solución.

---

by JordiGPT · jordigpt.com
