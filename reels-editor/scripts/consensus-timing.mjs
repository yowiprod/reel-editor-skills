#!/usr/bin/env node
// ============================================================================
// Consenso de timing entre DOS pasadas de sub-bloques con bordes distintos.
// ============================================================================
// Whisper tiene un ruido de onset de ~±0.3s que NO se elimina transcribiendo
// otra vez igual (medido: la misma palabra dio 77.87 y 78.87 en dos ventanas).
// Dos pasadas con los bordes de bloque corridos (phase 0 y phase 3.5) tienen
// errores independientes: promediarlas cancela buena parte del ruido y elimina
// el sesgo de "palabra pegada al borde del bloque".
//
// Uso: node consensus-timing.mjs <workDir> <dirA> <dirB>
//   escribe <workDir>/transcripts-cut/<id>.json con el timing consensuado
//   (el TEXTO se arregla después con merge-text-timing.mjs)
// ============================================================================
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const [workDir, dirA = "transcripts-blocks", dirB = "transcripts-blocks-b"] = process.argv.slice(2);
if (!workDir) { console.error("uso: node consensus-timing.mjs <workDir> [dirA] [dirB]"); process.exit(1); }

const norm = (s) => s.toLowerCase().replace(/[.,¿?¡!…"':;]/g, "").trim();

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

mkdirSync(join(workDir, "transcripts-cut"), { recursive: true });
let totalPairs = 0, totalBig = 0, worst = { d: 0 };

for (const file of readdirSync(join(workDir, dirA)).filter((f) => f.endsWith(".json"))) {
  const A = JSON.parse(readFileSync(join(workDir, dirA, file), "utf8"));
  const B = JSON.parse(readFileSync(join(workDir, dirB, file), "utf8"));
  const pairs = lcsPairs(A, B);
  const out = A.map((w) => ({ ...w }));
  let big = 0;
  for (const [i, j] of pairs) {
    const d = Math.abs(A[i].start - B[j].start);
    if (d > 0.25) big++;
    if (d > worst.d) worst = { d, t: A[i].text, a: A[i].start, b: B[j].start, file };
    // promedio simple: los errores de las dos pasadas son independientes
    out[i].start = +((A[i].start + B[j].start) / 2).toFixed(3);
    out[i].end = +((A[i].end + B[j].end) / 2).toFixed(3);
  }
  // el promedio puede desordenar mínimamente: reordenar y evitar solapes negativos
  out.sort((p, q) => p.start - q.start);
  for (let k = 1; k < out.length; k++) if (out[k].start < out[k - 1].start) out[k].start = out[k - 1].start;
  writeFileSync(join(workDir, "transcripts-cut", file), JSON.stringify(out, null, 1));
  totalPairs += pairs.length; totalBig += big;
  console.log(`${file.replace(".json", "")}: ${A.length}/${B.length} palabras, ${pairs.length} consensuadas, ${big} con discrepancia >0.25s`);
}
console.log(`\nTOTAL: ${totalPairs} palabras consensuadas, ${totalBig} discrepancias >0.25s entre pasadas`);
if (worst.t) console.log(`peor discrepancia: "${worst.t}" ${worst.a}s vs ${worst.b}s (${worst.d.toFixed(2)}s) en ${worst.file}`);
