# yowiprod · plantilla de reel de beatmaking (sin voz)

Para reels de sesión de FL Studio (beat + cámara en PiP), **sin narración**.
Distinto del pipeline `reels-editor` (ese es para reels hablados con captions).

## Qué hay acá

| Archivo | Qué es |
|---|---|
| `brand.json` | La marca: fuentes Chrome + colores (amarillo #FFD700 / blanco #FFFFFF). |
| `fonts/ChromeBlack-Normal.ttf` | Títulos (DÍA X DE 30). |
| `fonts/Chrome-Normal.ttf` | Datos (nombre del beat, key, BPM). |
| `template.html` | La composición HyperFrames con `{{PLACEHOLDERS}}`. |

## Flujo por reel

1. **Master**: recortar el tiempo muerto (cabeza/cola) del `.mov` y formatear
   vertical 1080×1920 @60fps con loudness social:
   ```bash
   ffmpeg -y -i "clip.mov" \
     -filter_complex "[0:v]trim=IN:OUT,setpts=PTS-STARTPTS,fps=60,setsar=1[v];[0:a]atrim=IN:OUT,asetpts=PTS-STARTPTS,loudnorm=I=-14:TP=-1:LRA=11[a]" \
     -map "[v]" -map "[a]" -c:v libx264 -crf 16 -preset slow -g 60 -keyint_min 60 -bf 0 \
     -pix_fmt yuv420p -c:a aac -b:a 192k -ar 48000 -movflags +faststart master.mp4
   ```
   (IN/OUT salen de `silencedetect`; ffmpeg oculta su salida bajo `-v error`.)

   > **Sincronía OBS:** estas grabaciones de OBS capturan la PANTALLA ~2.5–3s
   > ATRASADA respecto del audio (se escucha el beat antes de verlo; no es offset
   > de contenedor, es de la captura). Corregir **adelantando el video** vs el
   > audio: el in-point del trim de video = in-point del audio + Δ (el audio se
   > queda con el beat; el video se toma Δ más adelante). Día 1: Δ = 2.5s.
   > Δ varía por grabación → mandar un master sincronizado sin título y que el
   > usuario confirme/ajuste. El drop del audio no cambia (la ventana de audio no
   > se toca), así que el `{{DROP}}` del título queda igual.

2. **Drop**: encontrar en qué segundo rompe el beat (salto de energía de bajo):
   ```bash
   ffmpeg -v error -i master.mp4 -af "lowpass=f=150,asetnsamples=n=48000,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-" -f null -
   ```

3. **Datos** (preguntar siempre): nombre del beat, key, BPM y qué día es.

4. **Template**: copiar `template.html` a `index.html` del proyecto HyperFrames,
   reemplazar los `{{PLACEHOLDERS}}` (incluido `{{DROP}}`), `npm run check`.

5. **Render + mux** (el renderer atrasa el audio → muxear el del master):
   ```bash
   npx hyperframes render -f 60 -q high --crf 16 -o render.mp4 --quiet
   ffmpeg -y -i render.mp4 -i master.mp4 -map 0:v -map 1:a -c copy -shortest -movflags +faststart final.mp4
   ```

## Título (criterio)

- Centrado, **mayúsculas, sin fondo**, borde negro + sombra.
- `DÍA X DE 30` entra en el **drop** y queda sola ~10s.
- Después se suma `NOMBRE` (amarillo) + `KEY · BPM` (blanco) un **20% más abajo**.
- Sale todo unos segundos después.

> Las fuentes Chrome son de terceros; revisá su licencia antes de redistribuir.
