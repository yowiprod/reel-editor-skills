#!/usr/bin/env node
// ============================================================================
// reels-editor · Paso D — Corta silencios por clip y arma el master del reel
// ============================================================================
// Uso:   node cut-and-master.mjs <clips.json>
//
// clips.json (lo genera el modelo tras medir silencios con silencedetect):
// {
//   "srcDir": "/ruta/absoluta/a/los/clips/crudos",
//   "workDir": "/ruta/absoluta/al/_work",        // acá salen cuts/, segments.json, concat.txt
//   "masterOut": "/ruta/absoluta/al/master.mp4", // master final (fuera de _work)
//   "fps": 60,                                    // = fps de la fuente (60 si es iPhone 60fps)
//   "clips": [
//     { "id": "IMG_4230", "ext": ".MOV", "dur": 3.6467, "kind": "selfie",
//       "silences": [[0, 0.7804], [3.1878, 3.6467]] },
//     ...
//   ]
// }
//
// - "silences": pares [inicio, fin] medidos con silencedetect (ver SKILL.md §C).
// - "kind": "selfie" (corte agresivo) | "broll" (conservador, no rompe demos).
// - "fit": "letterbox" (opcional) — fuente HORIZONTAL real (16:9 SIN rotation en
//   metadata): el video queda horizontal, centrado, con franjas negras arriba/abajo.
//   REGLA PERMANENTE: JAMÁS cropear una fuente horizontal a
//   9:16 ni estirarla. Sin este campo → fuente vertical, full-bleed (comportamiento
//   de siempre).
// - El orden del array "clips" ES el orden final del reel.
//
// Salidas:
// - <workDir>/cuts/<id>_cut.mp4       clips recortados, fps/res/audio unificados
// - <workDir>/segments.json           offsets EXACTOS de cada clip en el master
// - <masterOut>                       master concatenado + loudnorm + keyframes densos
// ============================================================================
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const cfgPath = process.argv[2];
if (!cfgPath) { console.error("uso: node cut-and-master.mjs <clips.json>"); process.exit(1); }
const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
const { srcDir, workDir, masterOut, fps = 60, clips } = cfg;
const CUTS = join(workDir, "cuts");
mkdirSync(CUTS, { recursive: true });

// Políticas de corte APROBADAS (no cambiar sin pedido explícito del usuario):
// - selfie: corta toda pausa >= 0.55s y la colapsa a ~0.30s (pad 0.12 antes / 0.18 después)
// - broll : corta solo pausas >= 0.90s (pad 0.12 / 0.30) — no rompe demos a mitad de acción
// - cabezas y colas de clip se recortan SIEMPRE (aunque la pausa sea corta)
const POLICIES = {
  selfie: { minCut: 0.55, padBefore: 0.12, padAfter: 0.18 },
  broll: { minCut: 0.9, padBefore: 0.12, padAfter: 0.3 },
};

function keepRanges(clip) {
  const { minCut, padBefore, padAfter } = POLICIES[clip.kind];
  // bloques de voz = complemento de los silencios dentro de [0, dur]
  let speech = [];
  let cursor = 0;
  for (const [s, e] of clip.silences) {
    if (s > cursor + 0.01) speech.push([cursor, s]);
    cursor = Math.max(cursor, e);
  }
  if (cursor < clip.dur - 0.01) speech.push([cursor, clip.dur]);
  if (!speech.length) throw new Error(clip.id + ": sin voz detectada — revisá los silencios");
  // fusionar bloques separados por pausas cortas (< minCut): esas pausas se conservan
  const merged = [];
  for (const block of speech) {
    const prev = merged[merged.length - 1];
    if (prev && block[0] - prev[1] < minCut) prev[1] = block[1];
    else merged.push([...block]);
  }
  // padding + clamp a los límites del clip
  return merged.map(([s, e]) => [
    Math.max(0, +(s - padBefore).toFixed(3)),
    Math.min(clip.dur, +(e + padAfter).toFixed(3)),
  ]);
}

const segments = [];
for (const clip of clips) {
  const ranges = keepRanges(clip);
  const parts = [];
  const maps = [];
  ranges.forEach(([s, e], i) => {
    parts.push(`[0:v]trim=start=${s}:end=${e},setpts=PTS-STARTPTS[v${i}]`);
    parts.push(`[0:a]atrim=start=${s}:end=${e},asetpts=PTS-STARTPTS[a${i}]`);
    maps.push(`[v${i}][a${i}]`);
  });
  // fps unificado + 1080x1920 + SAR 1 + audio 48kHz: todos los cuts quedan idénticos.
  // Geometría según orientación (regla permanente 11-jul-2026):
  // - default: fuente vertical (portrait tras el auto-rotate de ffmpeg) → full-bleed
  // - fit "letterbox": fuente horizontal real → queda horizontal, centrada, franjas
  //   negras arriba/abajo (el video ocupa y≈656–1264). NUNCA crop, NUNCA estirar.
  const geom =
    clip.fit === "letterbox"
      ? "scale=1080:-2:flags=lanczos,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black"
      : "scale=1080:1920:flags=lanczos";
  const fc =
    parts.join(";") +
    `;${maps.join("")}concat=n=${ranges.length}:v=1:a=1[vc][ac];` +
    `[vc]fps=${fps},${geom},setsar=1[v];[ac]aresample=48000[a]`;
  const out = join(CUTS, `${clip.id}_cut.mp4`);
  execFileSync("ffmpeg", [
    "-y", "-v", "error", "-i", join(srcDir, clip.id + (clip.ext || ".MOV")),
    "-filter_complex", fc, "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-crf", "15", "-preset", "medium", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", out,
  ]);
  // la duración REAL del archivo (container) es la fuente de verdad de los offsets
  const dur = +execFileSync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out,
  ]).toString().trim();
  segments.push({ id: clip.id, kind: clip.kind, ranges, cutDur: dur, srcDur: clip.dur });
  console.log(`${clip.id}: ${clip.dur.toFixed(2)}s -> ${dur.toFixed(2)}s  (${ranges.length} rango/s)`);
}

// offsets acumulados de cada clip dentro del master (para mapear captions)
let offset = 0;
for (const seg of segments) {
  seg.masterStart = +offset.toFixed(3);
  offset += seg.cutDur;
}
writeFileSync(join(workDir, "segments.json"), JSON.stringify(segments, null, 2));

// master: concat + loudnorm social + keyframes densos (1/s — evita el warning
// "sparse keyframes" del renderer de HyperFrames, que causa freezing)
const listFile = join(workDir, "concat.txt");
writeFileSync(listFile, segments.map((s) => `file '${join(CUTS, s.id + "_cut.mp4")}'`).join("\n") + "\n");
execFileSync("ffmpeg", [
  "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", listFile,
  "-af", "loudnorm=I=-14:TP=-1:LRA=11",
  "-c:v", "libx264", "-crf", "16", "-preset", "slow",
  "-g", String(fps), "-keyint_min", String(fps), "-bf", "0", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", masterOut,
]);
const masterDur = +execFileSync("ffprobe", [
  "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", masterOut,
]).toString().trim();
console.log(`\nMASTER: ${masterDur.toFixed(2)}s (bruto ${clips.reduce((a, c) => a + c.dur, 0).toFixed(2)}s)`);
console.log(`>>> data-duration de la composición: ${masterDur.toFixed(2)}`);
