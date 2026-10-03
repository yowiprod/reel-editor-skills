#!/usr/bin/env node
// ============================================================================
// Fusiona TEXTO del cut entero + TIMING de la transcripción por sub-bloques.
// ============================================================================
// Por qué: transcribir el cut ENTERO da el mejor TEXTO (Whisper usa todo el
// contexto) pero onsets con error puntual de hasta ~1s. Transcribir en
// sub-bloques de ~8s da onsets precisos pero ensucia el TEXTO en los bordes
// (palabras duplicadas, "funnel"→"funely", "a la IA"→"a la guía").
// Este script alinea ambas listas por LCS y se queda con lo mejor de cada una.
//
// Uso: node merge-text-timing.mjs <workDir>
//   lee  <workDir>/transcripts-whole/<id>.json   (texto bueno)
//   lee  <workDir>/transcripts-cut/<id>.json     (timing bueno, por bloques)
//   escribe <workDir>/transcripts-cut/<id>.json  (texto bueno + timing bueno)
//   backup en <workDir>/transcripts-blocks/<id>.json
// ============================================================================
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";

const workDir = process.argv[2];
if (!workDir) { console.error("uso: node merge-text-timing.mjs <workDir>"); process.exit(1); }

const norm = (s) => s.toLowerCase().replace(/[.,¿?¡!…"':;]/g, "").trim();

// LCS clásico sobre palabras normalizadas → pares (i en A, j en B)
function lcsPairs(A, B) {
  const n = A.length, m = B.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = norm(A[i].text) === norm(B[j].text)
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const pairs = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (norm(A[i].text) === norm(B[j].text)) { pairs.push([i, j]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return pairs;
}

mkdirSync(join(workDir, "transcripts-timing-backup"), { recursive: true });
const ids = readdirSync(join(workDir, "transcripts-whole")).filter((f) => f.endsWith(".json"));

for (const file of ids) {
  const A = JSON.parse(readFileSync(join(workDir, "transcripts-whole", file), "utf8")); // texto
  const B = JSON.parse(readFileSync(join(workDir, "transcripts-cut", file), "utf8"));   // timing
  copyFileSync(join(workDir, "transcripts-cut", file), join(workDir, "transcripts-timing-backup", file));

  const pairs = lcsPairs(A, B);
  const timing = new Map(pairs.map(([i, j]) => [i, B[j]]));
  const out = A.map((w, i) => ({ ...w }));

  // palabras matcheadas: timing exacto del bloque
  for (const [i, b] of timing) { out[i].start = b.start; out[i].end = b.end; }

  // palabras sin match: interpolar dentro del hueco entre los matches vecinos,
  // proporcional al largo de cada palabra (mismo criterio que splitTiming)
  const anchors = pairs.map(([i]) => i);
  for (let k = 0; k <= anchors.length; k++) {
    const prev = k === 0 ? -1 : anchors[k - 1];
    const next = k === anchors.length ? A.length : anchors[k];
    if (next - prev <= 1) continue;
    const gapStart = prev >= 0 ? out[prev].end : (out[next] ? Math.min(A[0].start, out[next].start) : A[0].start);
    const gapEnd = next < A.length ? out[next].start : A[A.length - 1].end;
    const idx = [];
    for (let i = prev + 1; i < next; i++) idx.push(i);
    const span = Math.max(gapEnd - gapStart, 0.001);
    const total = idx.reduce((a, i) => a + Math.max(A[i].text.length, 1), 0);
    let cur = gapStart;
    for (const i of idx) {
      const dur = span * (Math.max(A[i].text.length, 1) / total);
      out[i].start = +cur.toFixed(3);
      out[i].end = +(cur + dur).toFixed(3);
      cur += dur;
    }
  }

  const unmatched = A.length - pairs.length;
  writeFileSync(join(workDir, "transcripts-cut", file), JSON.stringify(out, null, 1));
  console.log(`${file.replace(".json", "")}: ${A.length} palabras, ${pairs.length} con timing exacto, ${unmatched} interpoladas`);
}
console.log("\nOK — texto del cut entero + timing de sub-bloques");
