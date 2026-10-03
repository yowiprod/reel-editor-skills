#!/usr/bin/env node
// ============================================================================
// Verifica que NINGÚN borde de corte parta una palabra (regla permanente)
// ============================================================================
// silencedetect a -32dB puede declarar "silencio" un tramo donde todavía hay
// voz baja (caso real medido: el caption se veía pero la palabra se
// oía por la mitad). Este chequeo mide con ENERGÍA FINA (-45dB) si el punto de
// corte cae DENTRO de un bloque de voz.
//
// ⚠️ NO usar Whisper como árbitro acá: estira el `end` de la última palabra de
// cada frase por encima de la pausa y da falsos positivos en TODOS los cierres
// (medido: 4 de 4 alertas eran falsas en el reel follow-up).
//
// Uso: node check-cut-edges.mjs <workDir> <srcDir>
// ============================================================================
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const [workDir, srcDir] = process.argv.slice(2);
if (!workDir || !srcDir) { console.error("uso: node check-cut-edges.mjs <workDir> <srcDir>"); process.exit(1); }

const NOISE = "-45dB", MINSIL = 0.06, WIN = 2.0;

function silences(file, a, b) {
  const out = spawnSync("ffmpeg", ["-v", "info", "-i", file,
    "-af", `atrim=${a}:${b},silencedetect=noise=${NOISE}:d=${MINSIL}`, "-f", "null", "-"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).stderr || "";
  const res = []; let cur = null;
  for (const line of out.split("\n")) {
    const s = line.match(/silence_start: ([\d.]+)/), e = line.match(/silence_end: ([\d.]+)/);
    if (s) cur = parseFloat(s[1]);
    if (e && cur !== null) { res.push([cur, parseFloat(e[1])]); cur = null; }
  }
  return res;
}

const segments = JSON.parse(readFileSync(join(workDir, "segments.json"), "utf8"));
let problems = 0;

for (const seg of segments) {
  const src = join(srcDir, seg.id + ".MOV");
  for (const [rs, re] of seg.ranges) {
    const a = Math.max(0, re - WIN), b = re + 1.0;
    const sils = silences(src, a, b);
    // ¿el corte cae dentro de un silencio (o justo después de uno)? → limpio
    const inSilence = sils.some(([ss, se]) => re >= ss - 0.02 && re <= se + 0.02);
    const voiceEnd = sils.filter(([ss]) => ss <= re + 0.02).at(-1)?.[0];
    if (inSilence) {
      console.log(`ok  ${seg.id} corte en ${re.toFixed(2)}s — la voz terminó en ${voiceEnd?.toFixed(2)}s (margen ${(re - voiceEnd).toFixed(2)}s)`);
    } else {
      problems++;
      console.log(`⚠️  ${seg.id} corte en ${re.toFixed(2)}s cae en MEDIO DE VOZ — correr el borde hasta el próximo silencio`);
    }
  }
}
console.log(problems ? `\n${problems} borde/s a corregir` : "\nTodos los bordes limpios: ninguna palabra partida");
