---
description: Editar un reel desde clips crudos (silencios + captions + hook) con el pipeline completo
argument-hint: [carpeta con los clips o instrucciones]
---

Invocá la skill `reels-editor` y ejecutá el pipeline completo de edición de reels
sobre: $ARGUMENTS

Reglas de arranque:
- Si no se indicó carpeta, preguntá cuál es la carpeta con los clips crudos.
- Leé PRIMERO `~/.claude/skills/reels-editor/reference/pipeline-detallado.md` entero.
- **Paso 0 — marca**: mirá si el proyecto HyperFrames tiene `brand.json`.
  - Si lo tiene, usá esos valores y no preguntes nada de marca.
  - Si no lo tiene, hacé la entrevista de `reference/brand-setup.md` (5 preguntas: nombre,
    color de acento, base oscura, tipografía e idioma/forma de hablar) y corré
    `scripts/setup-brand.mjs`. Contale al usuario los avisos de contraste si los hubiera.
- Aplicá TODOS los criterios cerrados de la skill sin re-litigarlos (corte de silencios,
  captions una-palabra-por-vez con la tipografía de la marca, hook con sombra blur,
  safe zones IG, export a fps de la fuente, mux del audio del master y verificación
  frame a frame obligatoria).
- Trabajá dentro del proyecto HyperFrames de esta máquina (por defecto `~/reels/hyper-edits/`,
  o el que indique el usuario) creando `reel-<slug>/` para este reel, y entregá el MP4
  verificado con SendUserFile.
