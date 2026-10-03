# fonts/

Esta carpeta viene **vacía a propósito**: el pack no distribuye tipografías con licencia.

Tenés dos caminos, y los dos los resuelve `scripts/setup-brand.mjs`:

**1. Tipografía del catálogo (recomendado si no tenés una propia).**
Son gratis y se cargan solas desde Google Fonts: no hace falta ningún archivo acá.

```bash
node scripts/setup-brand.mjs --print-fonts     # ver el catálogo
```

**2. Tu propia tipografía.**
Pasale el archivo `.otf` o `.ttf` al setup y el script lo copia al proyecto:

```bash
node scripts/setup-brand.mjs --proj ~/reels/hyper-edits \
  --name "Mi Marca" --accent "#FF3B30" \
  --font-file ~/tipografias/MiFuente-Black.otf --font "Mi Fuente"
```

Elegí siempre el **peso más pesado** que tengas (Black / Heavy / ExtraBold): sobre video,
los pesos de texto desaparecen.

⚠️ Si la tipografía es comercial, revisá su licencia antes de compartir el proyecto con
otra persona: el archivo queda adentro de la carpeta del proyecto.
