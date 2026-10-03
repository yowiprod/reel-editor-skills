#!/usr/bin/env node
// ============================================================================
// Re-transcribe cada cut EN SUB-BLOQUES para matar el drift de Whisper.
// ============================================================================
// Whisper acumula error de onset dentro de una misma toma: en tomas de 20-35s
// el final puede quedar 0.3-1s corrido. Transcribir el cut en bloques de ~6-8s
// (cortando SIEMPRE en el medio de un silencio, para no partir palabras) y
// ensamblar con offsets conocidos mantiene el error acotado por bloque.
//
// Uso: node retranscribe-blocks.mjs <workDir>
// Requiere: <workDir>/segments.json y <workDir>/cuts/<id>_cut.mp4
// Escribe:  <workDir>/transcripts-cut/<id>.json  (mismo formato que whisper)
// ============================================================================
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const workDir = process.argv[2];
if (!workDir) { console.error("uso: node retranscribe-blocks.mjs <workDir> [outSubdir] [phase]"); process.exit(1); }
// outSubdir: dónde escribir (default transcripts-cut). phase: corrimiento del primer
// corte, para una 2ª pasada con los bordes en otro lado (consenso anti-ruido).
const OUT_DIR = process.argv[3] || "transcripts-cut";
const PHASE = parseFloat(process.argv[4] || "0");

const MAX_BLOCK = 8.0;   // largo objetivo de bloque
const MIN_BLOCK = 4.5;   // no cerrar un bloque antes de esto
const NOISE = "-35dB";   // umbral para encontrar puntos de corte dentro del cut
const SILDUR = 0.15;

const segments = JSON.parse(readFileSync(join(workDir, "segments.json"), "utf8"));
mkdirSync(join(workDir, OUT_DIR), { recursive: true });
mkdirSync(join(workDir, "blocks"), { recursive: true });

function silences(file) {
  // silencedetect escribe en STDERR: spawnSync para capturarlo (execFileSync devuelve stdout)
  const out = spawnSync("ffmpeg", [
    "-v", "info", "-i", file, "-af", `silencedetect=noise=${NOISE}:d=${SILDUR}`, "-f", "null", "-",
  ], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).stderr || "";
  const res = [];
  let cur = null;
  for (const line of out.split("\n")) {
    const s = line.match(/silence_start: ([\d.]+)/);
    const e = line.match(/silence_end: ([\d.]+)/);
    if (s) cur = parseFloat(s[1]);
    if (e && cur !== null) { res.push([cur, parseFloat(e[1])]); cur = null; }
  }
  return res;
}

// puntos de corte = centro de cada silencio, respetando MIN/MAX de bloque
function blocksFor(dur, sils) {
  if (dur <= MAX_BLOCK - PHASE) return [[0, dur]];
  const cuts = [];
  let start = -PHASE; // phase>0 adelanta el primer corte: bordes en otro lado que la pasada A
  for (const [a, b] of sils) {
    const mid = (a + b) / 2;
    if (mid - start >= MIN_BLOCK && mid < dur - 1.0) {
      // cortar acá si ya pasamos el objetivo, o si el próximo silencio nos pasaría de largo
      cuts.push(mid);
      start = mid;
    }
  }
  // quedarse solo con los cortes necesarios para que ningún bloque supere MAX_BLOCK
  const keep = [];
  let last = 0;
  for (let i = 0; i < cuts.length; i++) {
    const next = cuts[i + 1] ?? dur;
    if (next - last > MAX_BLOCK) { keep.push(cuts[i]); last = cuts[i]; }
  }
  const bounds = [0, ...keep, dur];
  const out = [];
  for (let i = 0; i < bounds.length - 1; i++) out.push([bounds[i], bounds[i + 1]]);
  return out;
}

for (const seg of segments) {
  const cut = join(workDir, "cuts", `${seg.id}_cut.mp4`);
  const dur = +execFileSync("ffprobe", [
    "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=duration", "-of", "csv=p=0", cut,
  ]).toString().trim();
  const blocks = blocksFor(dur, silences(cut));
  const words = [];
  blocks.forEach(([a, b], i) => {
    const bf = join(workDir, "blocks", `${seg.id}_b${i}.m4a`);
    execFileSync("ffmpeg", [
      "-y", "-v", "error", "-i", cut,
      "-af", `atrim=${a.toFixed(3)}:${b.toFixed(3)},asetpts=PTS-STARTPTS`,
      "-vn", "-c:a", "aac", "-b:a", "192k", bf,
    ]);
    execFileSync("npx", ["--yes", "hyperframes@0.6.63", "transcribe", bf,
      "--model", "medium", "--language", "es", "--dir", workDir], { stdio: "ignore" });
    const w = JSON.parse(readFileSync(join(workDir, "transcript.json"), "utf8"));
    const span = b - a;
    for (const x of w) {
      if (x.start >= span + 0.05) continue;          // cola alucinada fuera del bloque
      words.push({
        text: x.text,
        start: +(x.start + a).toFixed(3),
        end: +(Math.min(x.end, span) + a).toFixed(3),
      });
    }
  });
  words.sort((p, q) => p.start - q.start);
  writeFileSync(join(workDir, OUT_DIR, `${seg.id}.json`), JSON.stringify(words, null, 1));
  console.log(`${seg.id}: ${blocks.length} bloque/s, ${words.length} palabras (dur ${dur.toFixed(2)}s)`);
}
console.log("\nOK — transcripts-cut regenerados por sub-bloques");
