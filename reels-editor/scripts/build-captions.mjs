#!/usr/bin/env node
// ============================================================================
// reels-editor · Paso F — Construye los captions del reel (palabras + offsets)
// ============================================================================
// Uso:   node build-captions.mjs <captions-config.json>
//
// captions-config.json (lo genera el modelo tras leer los transcripts de los cuts):
// {
//   "workDir": "/ruta/al/_work",            // debe contener segments.json y transcripts-cut/<id>.json
//   "captionsJsOut": "/ruta/al/captions.js",// lo consume la composición (window.__CAPTIONS)
//   "fix": {                                 // clave = palabra transcripta normalizada (minúsculas, sin puntuación)
//     "yquiero": ["Y", "quiero"],            // merges de whisper: separar
//     "fabrito": ["Fablito"],                // nombres/marca mal oídos
//     "puedes": ["podés"],                   // convertir al dialecto de la marca (brand.json → dialect)
//     "queréis": ["querés"],
//     "super": ["súper"]
//   },
//   "emph": ["prompt", "brutal", "guía"]     // palabras en el color de acento (normalizadas) — 1 de cada ~8-12, las de impacto
// }
//
// Prerrequisitos: transcripts-cut/<id>.json = whisper de CADA CLIP RECORTADO
// (nunca del master entero: whisper desfasa con pausas largas y el error se acumula).
//
// Salidas:
// - <workDir>/captions.json   { captions: [{t,s,e,emph}...], boundaries: [...], duration }
// - <captionsJsOut>           window.__CAPTIONS = {...}  (para <script src> en la composición)
// ============================================================================
import fs from "node:fs";
import { join } from "node:path";

const cfgPath = process.argv[2];
if (!cfgPath) { console.error("uso: node build-captions.mjs <captions-config.json>"); process.exit(1); }
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
const { workDir, captionsJsOut, fix = {}, emph = [] } = cfg;

const segments = JSON.parse(fs.readFileSync(join(workDir, "segments.json"), "utf8"));
const norm = (s) => s.toLowerCase().replace(/[¿?¡!.,…":;]/g, "").trim();
const FIX = Object.fromEntries(Object.entries(fix).map(([k, v]) => [norm(k), v]));
const EMPH = new Set(emph.map(norm));

// reparte el intervalo original entre n palabras de reemplazo, proporcional a su longitud
function splitTiming(words, s, e) {
  const span = e - s;
  const total = words.reduce((a, p) => a + p.length, 0);
  let cur = s;
  return words.map((p) => {
    const b = cur + span * (p.length / total);
    const seg = [cur, b];
    cur = b;
    return seg;
  });
}

const out = [];
for (const seg of segments) {
  const words = JSON.parse(
    fs.readFileSync(join(workDir, "transcripts-cut", seg.id + ".json"), "utf8"),
  );
  for (const w of words) {
    if (w.start >= seg.cutDur) continue; // whisper a veces alucina cola fuera del recorte
    const S = w.start + seg.masterStart;
    const E = Math.min(w.end, seg.cutDur) + seg.masterStart;
    const repl = FIX[norm(w.text)];
    if (repl) {
      const times = splitTiming(repl, S, E);
      repl.forEach((p, i) =>
        out.push({ t: p, s: +times[i][0].toFixed(2), e: +times[i][1].toFixed(2), emph: EMPH.has(norm(p)) }),
      );
    } else {
      // limpiar: nunca ¿ ni ¡ (regla de marca); se conservan ! y ? de cierre
      const t = w.text.replace(/[¿¡"]/g, "").replace(/[.,…:;]+$/, "").trim();
      if (t) out.push({ t, s: +S.toFixed(2), e: +E.toFixed(2), emph: EMPH.has(norm(t)) });
    }
  }
}

const boundaries = segments.slice(1).map((s) => +s.masterStart.toFixed(2));
const duration = +(segments.at(-1).masterStart + segments.at(-1).cutDur).toFixed(2);
const result = { captions: out, boundaries, duration };
fs.writeFileSync(join(workDir, "captions.json"), JSON.stringify(result));
fs.writeFileSync(captionsJsOut, "window.__CAPTIONS = " + JSON.stringify(result) + ";\n");
console.log("palabras:", out.length, "| tomas:", segments.length, "| dur captions:", duration);
console.log("--- texto final (MAYÚSCULAS = palabra de énfasis) ---");
console.log(out.map((w) => (w.emph ? w.t.toUpperCase() : w.t)).join(" "));
console.log("\n>>> Leé el texto de arriba COMPLETO buscando typos de Whisper que falte fixear.");
