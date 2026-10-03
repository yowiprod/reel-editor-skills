# Pipeline detallado — edición de reels (HyperFrames)

Referencia técnica completa, comando por comando. El flujo resumido y los criterios
están en `SKILL.md`; acá está el "cómo exacto" con todas las trampas resueltas.
Probado de punta a punta en reels publicados (9 clips de iPhone → 111s finales, sincro
verificada frame a frame; y un reel largo de 167s con auditoría de sincro por energía).

Todo lo que es marca (tipografía, colores, idioma) sale de `brand.json` del proyecto:
si no existe, arrancá por el **Paso 0**.

Convenciones de este doc:
- `$SRC`  = carpeta con los clips crudos (ej: `~/reels/clips-reel-lunes`)
- `$PROJ` = proyecto HyperFrames (ej: `~/reels/hyper-edits`)
- `$REEL` = carpeta del reel dentro del proyecto (`$PROJ/reel-<slug>`)
- `$WORK` = `$REEL/_work` (intermedios: cuts, transcripts, frames, configs)

---

## Paso 0 — Marca (solo la primera vez del proyecto)

```bash
[ -f "$PROJ/brand.json" ] && cat "$PROJ/brand.json" || echo "SIN MARCA CONFIGURADA"
```

- **Si existe**: leerlo y usar esos valores (idioma de transcripción, dialecto para los
  fixes, colores y tipografía ya están en `brand.css`). No preguntar nada de marca.
- **Si no existe**: hacer la entrevista de `brand-setup.md` (5 preguntas; solo el color
  es obligatorio) y correr:

```bash
node ~/.claude/skills/reels-editor/scripts/setup-brand.mjs \
  --proj "$PROJ" --name "Mi Marca" --accent "#FF3B30" --dark "#0D0D0D" \
  --font "Anton" --language es --dialect neutro
```

Genera `$PROJ/brand.json` y `$PROJ/brand.css`. Si imprime avisos de contraste,
**contárselos al usuario** antes de seguir (puede que convenga otro acento, o énfasis en
blanco con `--emphasis white`).

De acá en adelante, en este doc:
- `$LANG` = `brand.json → language` (ej. `es`)
- `$DIALECT` = `brand.json → dialect` (ej. `rioplatense`)

---

## Paso A — Inventario y análisis de fuentes

### A.1 Specs de cada clip

```bash
cd "$SRC" && for f in *.MOV; do echo "=== $f ==="; ffprobe -v error -select_streams v:0 \
  -show_entries stream=width,height,r_frame_rate,duration -show_entries format=duration \
  -of default=noprint_wrappers=1 "$f" 2>&1 | head -6; done
```

**Trampa iPhone:** clips que reportan `1920x1080` casi seguro son verticales con
rotación en metadata. Verificar:

```bash
ffprobe -v error -select_streams v:0 -show_entries stream_side_data=rotation \
  -of default=noprint_wrappers=1 "$f"
```

`rotation=-90` → es vertical real (1080×1920 efectivo). ffmpeg auto-rota al decodificar:
NO hay que hacer nada, pero hay que saberlo para no "corregir" de más.

**SIN rotation + 1920×1080 → es horizontal REAL (apaisado).** REGLA PERMANENTE: el video
**queda horizontal** en el reel — letterbox centrado en el lienzo 1080×1920 con franjas
negras arriba y abajo. **PROHIBIDO cropear a 9:16** (ni franja central ni nada) y prohibido
estirar: el recorte central descuadra la cabeza y arruina cualquier demo de pantalla. En
`clips.json` va `"fit": "letterbox"` en cada clip horizontal; los captions quedan en su
posición estándar (caen en la franja negra inferior, que es donde van) y en la composición
se **borra el `<div id="scrim">`** (captions sobre negro puro).

### A.2 Color / HDR

```bash
ffprobe -v error -select_streams v:0 -show_entries \
  stream=codec_name,pix_fmt,color_space,color_transfer,color_primaries,bit_rate \
  -of default=noprint_wrappers=1 "$f"
```

- `color_transfer=bt709` → SDR, seguir normal (el caso típico: celular grabando HD sin HDR).
- `arib-std-b67` (HLG) o `smpte2084` (PQ) → **HDR: FRENAR y avisar.** El pipeline
  x264 8-bit sin tonemap lava los colores. Solución si pasa: tonemap con
  `zscale=t=linear:npl=100,tonemap=hable,zscale=p=bt709:t=bt709:m=bt709` antes
  del scale en los cuts, y verificar contra frames.

### A.3 fps del pipeline

El fps de trabajo = fps de la fuente (60 en los iPhone modernos; un clip suelto a
59.94 se normaliza a 60 sin problema). **Nunca bajar 60→30**: se pierde fluidez en
manos y scrolls. Todo el pipeline (cuts, master, render) usa el MISMO fps.

### A.4 Frames de muestra (encuadre + clasificación selfie/b-roll)

```bash
mkdir -p "$WORK/frames" && cd "$SRC" && for f in IMG_XXXX IMG_YYYY; do
  ffmpeg -v error -ss 1.5 -i "$f.MOV" -frames:v 1 -vf "scale=270:480" -y "$WORK/frames/${f}_t1.5.jpg"
done
```

**Leer las imágenes** (tool Read) y anotar por clip:
1. `selfie` (habla a cámara) o `broll` (pantalla/producto/manos). Los b-roll con voz en
   off se tratan como voz igual: cambia solo la política de corte.
2. Dónde arranca la cabeza (para validar que el hook a `top:300px` no la tape).
   En un encuadre selfie típico la frente arranca en y≈560-680 de 1920: OK. Más arriba
   que eso → hook achicado y subido (ver SKILL.md §Hook).

### A.5 Niveles de audio (calibrar silencedetect)

```bash
ffmpeg -i "$f.MOV" -af volumedetect -f null - 2>&1 | grep -E "mean_volume|max_volume"
```

Interior con ruido urbano de fondo: mean ≈ -20dB, max ≈ -2dB → umbral de silencio
**-25dB**. Si `mean` da mucho más bajo (lugar silencioso), probar -30/-35dB.

---

## Paso B — Transcripción v1 (para ENTENDER el contenido)

```bash
cd "$PROJ" && mkdir -p "$WORK/transcripts"
for f in IMG_4230 IMG_4231 ...; do
  npx hyperframes transcribe "$SRC/$f.MOV" --model small --language $LANG --dir "$WORK"
  cp "$WORK/transcript.json" "$WORK/transcripts/$f.json"
done
```

- El CLI escribe SIEMPRE `transcript.json` en el `--dir`: copiarlo por clip antes del siguiente.
- **NUNCA modelos `.en`** si el audio no está en inglés (traducen). Siempre
  `--model small --language $LANG`, con el idioma de `brand.json`.
- El JSON es un array plano: `[{ "text": "palabra", "start": 1.23, "end": 1.55 }, ...]`.
- Con los textos completos: decidir **orden narrativo** (casi siempre el orden de
  numeración = orden de grabación), detectar retakes/clips descartables, y redactar
  el copy del hook en la voz de la marca (ver SKILL.md §Hook).

---

## Paso C — Detección de silencios

```bash
ffmpeg -i "$f.MOV" -af "silencedetect=noise=-25dB:d=0.3" -f null - 2>&1 \
  | grep -E "silence_(start|end)" | sed 's/.*\] //'
```

- `noise=-25dB:d=0.3` es el punto de partida calibrado para los departamentos con
  ruido de calle. **Si no reporta NADA en ningún clip, el umbral está muy bajo**
  (a -37dB no detecta nada con ruido urbano): subirlo de a 3dB.
- Validar contra la transcripción: los silencios de cabeza/cola tienen que ser
  coherentes con el start de la primera palabra y el end de la última.
- **NO usar los gaps entre palabras de Whisper para cortar**: Whisper estira las
  palabras por encima de las pausas (una palabra puede "durar" 1.3s tapando una
  pausa real). silencedetect es la fuente de verdad para cortes; Whisper para texto.

Anotar por clip los pares `[silence_start, silence_end]`, incluyendo `[0, X]` si
arranca en silencio y `[Y, dur]` si termina en silencio.

---

## Paso D — Cortes + master (script de la skill)

1. Armar `$WORK/clips.json` (formato documentado en el header de `cut-and-master.mjs`):
   orden del array = orden final del reel; `kind` selfie/broll; `silences` medidos;
   `"fit": "letterbox"` en cada clip cuya fuente sea horizontal real (ver Paso A.1).
2. Copiar los scripts de la skill al `$WORK` (quedan versionados junto al reel):

```bash
cp ~/.claude/skills/reels-editor/scripts/*.mjs "$WORK/"
node "$WORK/cut-and-master.mjs" "$WORK/clips.json"
```

Qué hace y por qué (si hay que debuggear):
- **Por clip**: `trim/atrim` de cada rango de voz + concat filter → un solo re-encode
  `crf 15 medium`, `fps=<fps>`, `scale=1080:1920 lanczos`, `setsar=1`, `aac 192k 48kHz`.
  Cortar con filter_complex da precisión de frame (el `-ss` de input no).
- **Offsets**: la duración REAL (container) de cada cut, acumulada → `segments.json`.
  Esta es la clave de la sincro: los offsets salen de los archivos medidos, no de la teoría.
- **Master**: concat demuxer + `loudnorm=I=-14:TP=-1:LRA=11` (loudness social) +
  `crf 16 slow` + `-g <fps> -keyint_min <fps> -bf 0` → keyframe por segundo.
  Sin keyframes densos el renderer avisa "sparse keyframes" y el video congela.
- El script imprime la duración del master → es el `{{DURATION}}` de la composición.

Verificación del master:

```bash
ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate \
  -of default=noprint_wrappers=1 "$REEL/master.mp4"
ffmpeg -t 20 -i "$REEL/master.mp4" -af volumedetect -f null - 2>&1 | grep max_volume
# esperado: 1080x1920, fps correcto, max_volume ≈ -1 dB
```

---

## Paso E — Transcripción v2 (para el TIMING de captions)

```bash
mkdir -p "$WORK/transcripts-cut"
for f in IMG_4230 ...; do
  npx hyperframes transcribe "$WORK/cuts/${f}_cut.mp4" --model medium --language $LANG --dir "$WORK"
  cp "$WORK/transcript.json" "$WORK/transcripts-cut/$f.json"
done
```

**Modelo `medium` para el TIMING (no `small`) — regla verificada en un testimonio de 130s.**
El `small` alcanza para ENTENDER (Paso B) pero ubica mal los onsets y el error se ACUMULA:
en tomas de > ~1 min el drift medido llegó a **1.7s** → captions desincronizados "en algunas
partes". El `medium` da onsets bastante más precisos y transcribe mejor (acentos, números,
léxico). Verificar un onset dudoso contra el audio real: `ffmpeg -ss <t> -t 1.2 -i master.mp4
/tmp/x.mp4 -y && npx hyperframes transcribe /tmp/x.mp4 --model medium ...` — la palabra tiene
que sonar ahí. **Fix de un reel ya salido con captions que patinan:** re-transcribir SOLO el
cut con `medium`, reconstruir con `build-captions.mjs` (mismo config) y re-renderizar; el
`medium` puede cambiar 1-2 palabras (mejor escritas), re-mapear los `fix` si hace falta.

**Por qué dos transcripciones:** los timestamps de captions deben medirse sobre el
clip YA RECORTADO (misma línea de tiempo que el master, vía offset). Transcribir el
master entero desfasa (Whisper deriva con pausas); transcribir por cut mantiene el
error por debajo de un frame y NO se acumula entre tomas.

Control de calidad (comparar con los transcripts v1):
- Word counts ±1 son normales: Whisper re-tokeniza ("y quiero" → "Yquiero",
  "mac os" → "macOS"). Ver el diff de texto y anotar los fixes para el paso F.
- Si un cut perdió una FRASE entera → un rango de corte se comió voz: revisar
  silencios de ese clip (umbral) y re-correr D.

### E.2 — Sincro fina: TEXTO del entero + TIMING por sub-bloques (obligatorio en reels largos)

Regla medida en un reel de 167s ("no están sincronizadas al 100%").
El `medium` sobre el cut entero deja **errores puntuales de onset de hasta 1s** en palabras
sueltas (peor caso medido: −0.99s). Ojo: **el drift MEDIO da ~0** — no es deriva acumulada
sino palabras que entran antes o después de tiempo, casi siempre alrededor de pausas. Por eso
mirar solo "la última palabra del reel" NO detecta el problema: hay que comparar palabra a
palabra.

```bash
cp ~/.claude/skills/reels-editor/scripts/{retranscribe-blocks,merge-text-timing}.mjs "$WORK/"
# 1) timing preciso: cada cut en sub-bloques de ~8s cortados en el medio de un silencio
node "$WORK/retranscribe-blocks.mjs" "$WORK"
# 2) texto limpio: transcripción del cut ENTERO (el paso E de arriba) a transcripts-whole/
mkdir -p "$WORK/transcripts-whole"
for f in IMG_4230 ...; do
  npx hyperframes transcribe "$WORK/cuts/${f}_cut.mp4" --model medium --language $LANG --dir "$WORK"
  cp "$WORK/transcript.json" "$WORK/transcripts-whole/$f.json"
done
# 3) fusionar: texto del entero + timing del bloque (alineación LCS)
node "$WORK/merge-text-timing.mjs" "$WORK"
```

**Por qué las dos:** los sub-bloques dan onsets precisos pero **ensucian el texto en los
bordes** (duplican palabras — "en el estudio en el estudio" —, rompen términos: "funnel"→
"funely", "a la IA"→"a la guía"), porque Whisper pierde contexto al arrancar cada bloque.
El merge alinea ambas listas por LCS: cada palabra conserva la grafía del cut entero y toma
el onset del bloque; las pocas sin match (1-3 por toma) se interpolan proporcional al largo.
Salida esperada del merge: "N palabras, casi todas con timing exacto, 0-3 interpoladas".

**Los fixes posicionales se re-aplican DESPUÉS del merge** (el merge reescribe
`transcripts-cut/`): si habías capitalizado a mano el arranque de un cut, hacelo de nuevo.

Medir cuánto mejoró (contra el captions.json anterior, guardando copia antes):
comparar por palabra los `s` de ambas versiones dentro de las tomas cuyo `masterStart`
no cambió; reportar el peor delta por tramo de 20s.

---

## Paso F — Captions (script de la skill)

1. Armar `$WORK/captions-config.json` (formato en el header de `build-captions.mjs`):
   - `fix`: typos de Whisper detectados + **conversión al dialecto de la marca**
     (`$DIALECT`; si es rioplatense: `puedes→podés`, `queréis→querés`, `tienes→tenés`...)
     + léxico de marca (`brand.json → lexicon.always`, ej. `clot code→["Claude","Code"]`)
     + merges (`yquiero→["Y","quiero"]`).
   - `emph`: palabras que van en el color de acento. Criterio: números, nombres de
     producto/modelo, el verbo de impacto de cada frase, el CTA. Aproximadamente 1 de
     cada 8-12 palabras.
2. Correr y LEER la salida completa (el texto final impreso) buscando typos restantes:

```bash
node "$WORK/build-captions.mjs" "$WORK/captions-config.json"
```

Genera `$WORK/captions.json` y el `captions.js` que consume la composición.

---

## Paso G — Composición

```bash
# brand.css ya existe desde el Paso 0 (y fonts/ solo si la marca usa tipografía propia)
[ -f "$PROJ/brand.css" ] || echo "FALTA brand.css → volvé al Paso 0"
[ -f "$PROJ/index.html" ] && cp "$PROJ/index.html" "$WORK/index-backup-$(date +%Y%m%d).html"
cp ~/.claude/skills/reels-editor/reference/composition-template.html "$PROJ/index.html"
```

Reemplazar en `index.html` los placeholders `{{DURATION}}` (4 lugares: root, video,
audio y `const DUR`), `{{MASTER_SRC}}`, `{{CAPTIONS_SRC}}`, `{{HOOK_LINE1}}`,
`{{HOOK_LINE2}}`. **No tocar nada más del template**: los tamaños, posiciones, sombras y
timings son criterio cerrado (detalle en SKILL.md), y los colores y la tipografía entran
solos por `brand.css` (si hay que cambiarlos, se cambia `brand.json`, no el HTML).

```bash
cd "$PROJ" && npm run check
```

- Debe dar **0 errors**. La advertencia `AudioContext was not allowed to start`
  es ruido benigno de Chrome headless: ignorar.
- Los self-lint del template avisan por consola si dos palabras se pisan o si una
  queda visible tras su hide → si aparecen, el bug está en los datos de captions.
- El auto-fit avisa `[caption-fit]` si una palabra no entra ni en el tamaño mínimo con
  la tipografía elegida: ahí se baja `minSize` en `brand.json` o se cambia a una
  tipografía más condensada.

---

## Paso H — Validación barata ANTES del render completo

**Nunca renderizar los 100+ segundos para descubrir un error visual.** Dos técnicas:

### H.1 Draft corto del arranque (hook + primeras palabras)

```bash
cd "$PROJ" && sed 's/data-duration="<DUR>"/data-duration="4.5"/g' index.html > test-hook.html
npx hyperframes render -c test-hook.html -q draft -o renders/test-hook.mp4 --quiet
for t in 1.3 2.6 3.8; do ffmpeg -v error -ss $t -i renders/test-hook.mp4 -frames:v 1 \
  -vf scale=324:576 -y "$WORK/frames/test_t${t}.jpg"; done
```

Leer los frames y verificar: hook entero y legible, NO tapa la cabeza, chips con
sombra difusa, captions del tamaño correcto, el 0 del hook no se lee como O (pasa en
varias display pesadas), y a los 3.8s el hook ya no está.

### H.2 Draft completo (valida el fit de TODAS las palabras)

```bash
npx hyperframes render -q draft -o renders/draft-full.mp4 --quiet
```

Extraer frames en los timestamps de las palabras MÁS LARGAS del video (buscarlas en
captions.json: `masterStart` de su toma + `s` de la palabra) y en 2-3 palabras `emph`.
Verificar fit (no desborda los márgenes), color de acento correcto y sincro.

Este mismo mecanismo (sed a duration corta + render -c) sirve para **mostrarle al usuario
un cambio puntual** (ej: la sombra del hook) sin re-exportar todo.

Borrar los archivos de test (`test-hook.html`, renders de prueba) al terminar.

---

## Paso I — Render final + verificación obligatoria

```bash
cd "$PROJ" && npx hyperframes render -f 60 -q high --crf 16 \
  -o "renders/REEL_<slug>_vN.mp4" --quiet
```

- `-f 60` = fps del pipeline (el render a 60fps captura el doble de frames: ~4 min
  para 110s; correr con `run_in_background`).
- `-q high --crf 16` ≈ 17 Mbps sobre fuente de celular de 23 Mbps: prácticamente
  transparente. IG acepta archivos grandes (límite lejano, 4GB).

⚠️ **El MP4 del renderer NO es el archivo de entrega**: falta el mux del audio del master
(SKILL.md §PASO OBLIGATORIO). Hacer el mux ANTES de la verificación de frames y verificar
sobre el archivo muxeado.

**Verificación frame a frame (OBLIGATORIA, no se entrega sin esto):**

```bash
V=renders/REEL_<slug>_vN.mp4
ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate \
  -show_entries format=duration -of default=noprint_wrappers=1 "$V"   # fps y duración
ffmpeg -t 15 -i "$V" -af volumedetect -f null - 2>&1 | grep max_volume # audio presente
for t in 1.5 <medio1> <medio2> <fin>; do ffmpeg -v error -ss $t -i "$V" -frames:v 1 \
  -vf scale=324:576 -y "$WORK/frames/final_t${t}.jpg"; done
```

Elegir ≥4 timestamps repartidos (inicio / dos del medio / uno cerca del final) donde
sepas QUÉ palabra debería estar activa (de captions.json) y **leer los frames**:
1. La palabra visible es la esperada → sincro OK (el punto del final valida que no
   hay drift acumulado).
2. Hook: presente antes de 3s, ausente después de 3.5s.
3. Nada fuera de safe zones; captions legibles sobre los b-roll más claros.
4. Palabras `emph` en el color de acento de la marca.

Entrega: copiar el MP4 junto a los clips fuente + `SendUserFile`. **El ojo final es
humano**: el dueño de la marca mira el MP4 entero antes de publicar.

---

## Paso J — Cambios después del primer render (qué invalida qué)

| Cambio | Qué re-hacer |
|---|---|
| Copy/estilo del hook, tamaño de captions, cualquier CSS | Solo editar `index.html` → check → render. Mostrar preview corto (H.1) si es un detalle visual. |
| Palabras del caption (un fix de texto) | `captions-config.json` → build-captions → render. |
| Cortes de silencio (agregar/sacar una pausa) | `clips.json` → cut-and-master → **re-transcribir SOLO los cuts modificados** → build-captions → actualizar `{{DURATION}}` → check → render. |
| fps / calidad de encode | cut-and-master + build-captions (los offsets cambian ≤30ms, las transcripciones v2 SIGUEN válidas si los rangos no cambiaron: el audio de cada cut es idéntico) + `{{DURATION}}` + render. |

**Regla de oro:** los offsets viven en `segments.json` y las transcripciones v2 pertenecen
a los RANGOS de corte. Si los rangos no cambiaron, no se re-transcribe nunca.

---

## Trampas conocidas (todas ya pisadas una vez)

1. **`-37dB` no detecta silencios** con ruido de fondo urbano → calibrar con volumedetect (Paso A.5).
2. **Whisper estira palabras sobre las pausas** → jamás cortar por gaps de Whisper.
3. **Whisper mergea palabras** en los cuts ("Yquiero") → fix map con split y timing proporcional.
4. **Límite de toma en captions**: al agrupar (si algún formato futuro agrupa), el corte
   de toma se detecta como CRUCE (`boundary > prev.end && boundary <= word.start`), no
   por cercanía del inicio de palabra: la 1ª palabra de una toma arranca DESPUÉS del offset.
5. **Palabras de 1 letra del splitTiming** duran <0.08s: NO forzar duración mínima de
   caption (pisa la palabra siguiente); el template ya lo maneja.
6. **"Sparse keyframes" en el render** → el master SIEMPRE con `-g <fps> -keyint_min <fps> -bf 0`.
7. **Sombra dura en chips** (`0 6px 0`) parece un segundo recuadro → SIEMPRE blur (regla permanente).
8. **Si tu marca veta el blur en piezas impresas, en video igual va**: queda rasterizado
   en píxeles, no es un efecto vivo.
9. **`npm run dev` es un server long-running** → solo con `run_in_background: true`.
10. **Warning AudioContext** en check/validate/render → benigno, ignorar.
11. **`npx hyperframes transcribe` pisa `transcript.json`** en cada corrida → copiar por clip.
12. **Los cuts se transcriben, el master NO** (drift). Offsets = container durations medidas.
13. **iPhone rotation=-90**: portrait real aunque ffprobe diga 1920×1080.
14. **HDR (HLG/PQ)**: frenar y tonemapear; el pipeline asume bt709 SDR.
15. **Drift teórico del concat demuxer** (~8ms/junta): con offsets medidos queda bajo
    un frame en videos de ~2 min. Verificar SIEMPRE la sincro en un punto cercano al final.
16. **Fuente horizontal (sin rotation) NUNCA se cropea a 9:16.** El primer intento en un
    reel real recortó una franja central 608×1080 y quedó vetado: regla permanente =
    letterbox (`"fit": "letterbox"`, franjas negras arriba/abajo, captions en la franja
    inferior, sin scrim). Ver Paso A.1.
17. **Duración del master: usar la del stream de VIDEO, no la del container.** El audio
    AAC puede quedar ~40ms más largo (padding del encoder) y el container reporta esa
    duración: si `data-duration` usa el número del container, el render agrega frames
    finales en NEGRO (el video ya terminó). `ffprobe -select_streams v:0
    -show_entries stream=duration` es la fuente de verdad para `{{DURATION}}`.
18. **Whisper puede derramar timestamps más allá del final del cut** cuando la última
    frase termina justo al borde (reporta palabras terminando después de `cutDur`).
    Chequear que el `end` de la última palabra ≤ duración real del cut; si se pasa,
    corregir a mano los timestamps de las últimas palabras (comprimirlos dentro del
    rango real) antes de build-captions.
19. **Si la voz baja mucho en el CTA final**, silencedetect puede confundir esa
    cola hablada con silencio y cortarla. Antes de dar por bueno un corte de cola,
    verificar contra la transcripción v1 que no haya palabras dentro del rango
    "silencioso" (ej: "por DM" a -40dB mean). Si las hay, NO cortar esa cola.
20. **La ÚLTIMA palabra de cada rango de corte se verifica contra el audio, siempre**
    ("la palabra no se llega a escuchar, está cortada antes").
    silencedetect a -32dB puede declarar "silencio" un tramo donde todavía hay voz baja:
    en un reel real una palabra iba de 20.88 a 22.28 en la fuente y el corte cayó
    en 21.52 — la palabra se veía en el caption pero se oía por la mitad. **Chequeo
    obligatorio, automatizado: `scripts/check-cut-edges.mjs <workDir> <srcDir>`** después
    de cada `cut-and-master`. Mide con energía fina (-45dB) si el punto de corte cae dentro
    de un bloque de voz e imprime el margen de cada borde (sano: 0.09-0.30s).
    ⚠️ **NO usar Whisper como árbitro de los bordes**: estira el `end` de la última palabra
    de cada frase por encima de la pausa, y da falsos positivos en TODOS los cierres
    (medido en un reel real: 4 de 4 alertas de Whisper eran falsas, la energía mostró
    que las cuatro palabras entraban completas). Si un borde cae en medio de voz, buscar el
    silencio real más cercano con `silencedetect -45dB:d=0.05` y correr el rango hasta ahí.
