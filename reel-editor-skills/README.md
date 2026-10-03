# tienda-dropshiping — BrilloVital UGC

Reel UGC para BrilloVital (`reel-ugc-mujer 2.mp4`, @vitalmaxstore en TikTok).  
Proyecto HyperFrames en `C:\Users\Jowy\reels\brillovital\`.

## Archivos en esta carpeta

| Archivo | Qué es |
|---|---|
| `index.html` | Composición HyperFrames final (v7). Carga `captions_v6.js` y el master de video. |
| `build_captions_ugc2.py` | Genera `captions_v6.js` mapeando el nuevo script sobre los timings del audio original por interpolación lineal. |

## Técnica: tapar subtítulos quemados de TikTok

El video fuente tiene subtítulos baked-in en los píxeles (no se pueden eliminar).  
Solución: banda sólida `background: #111` de ancho completo en el `.cw` (contenedor de cada caption).

```css
.cw {
  position: absolute;
  left: 0; right: 0; bottom: 0;
  height: 230px;
  background: #111;          /* CLAVE: opaco total, no rgba */
  display: flex;
  justify-content: center;
  align-items: center;
}
#caption-layer {
  bottom: 540px;             /* posición ajustada para cubrir la zona de subtítulos originales */
  height: 230px;
}
```

> **Por qué opaco y no rgba:** un fondo semi-transparente (incluso 0.95) deja pasar el blanco brillante del texto original. Solo `#111` sólido lo tapa por completo.

## Técnica: nuevo script sobre audio distinto

El audio dice un script diferente al que se quiere mostrar.  
Solución: usar los timings del audio como guía de ritmo y distribuir las palabras del nuevo script proporcionalmente (interpolación lineal) sobre el rango temporal `[t_start, t_end]` de Whisper.

```
N palabras nuevas  →  espaciadas uniformemente sobre [0.0s, 23.24s]
```

Ver `build_captions_ugc2.py`.

## Datos del reel

- **Fuente**: `reel-ugc-mujer 2.mp4` (576×1024, 30fps, 27.47s)
- **Master**: `reel-ugc-mujer/master_ugc2.mp4` (1080×1920, loudnorm −14 LUFS)
- **Captions**: 46 palabras nuevas, t=0.0–23.24s
- **Tipografía**: Good Love 900 (`fonts/Good Love.ttf`)
- **Acento BrilloVital**: `#108474` (teal)
- **AV lag verificado**: 0.0ms (correlación cruzada en 3 tramos)
- **Entregado**: `renders/BrilloVital_ugc-mujer_v7_final.mp4` (27 MB)
