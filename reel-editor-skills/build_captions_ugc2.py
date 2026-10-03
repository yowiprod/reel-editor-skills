"""
Genera captions_v6.js para BrilloVital UGC v6/v7.
Mapea las palabras del nuevo script sobre los timings del audio original
usando interpolacion lineal (misma cadencia de voz, texto diferente).

Uso: ajusta NEW_SCRIPT, RAW_JSON, OUT y EMPH segun el proyecto.
"""
import json, re

# ── Nuevo script ──────────────────────────────────────────────────────
NEW_SCRIPT = (
    "Después del embarazo, mi piel no era la misma. "
    "Estrías, sequedad, textura irregular… no sabía por dónde empezar. "
    "Empecé a usar la crema CANDELA cada noche. "
    "En pocas semanas noté la diferencia. "
    "Si tú también quieres volver a sentirte cómoda en tu piel, pruébala. "
    "Envío gratis."
)

def tokenize(text):
    return [w for w in text.split() if w]

new_words = tokenize(NEW_SCRIPT)
print(f"Nuevo script: {len(new_words)} palabras")
print("  " + " ".join(new_words))

# ── Timings del audio original (Whisper medium) ────────────────────────
RAW_JSON = r"C:\Users\Jowy\reels\brillovital\reel-ugc-mujer\_work\transcript_ugc2_raw.json"
with open(RAW_JSON, encoding="utf-8") as f:
    old_words = json.load(f)

print(f"\nAudio original: {len(old_words)} palabras")

t_start = old_words[0]["start"]
t_end   = old_words[-1]["end"]
duration_audio = t_end - t_start

DURATION = 27.47  # duracion total del video

# ── Interpolacion lineal ───────────────────────────────────────────────
N = len(new_words)
avg_word_dur = duration_audio / len(old_words)

def map_time(i, N, t_start, t_end):
    frac = i / (N - 1) if N > 1 else 0.0
    return t_start + frac * (t_end - t_start)

# Palabras de enfasis para BrilloVital
EMPH = {
    "candela", "crema", "piel", "estrías", "diferencia",
    "gratis", "pruébala", "embarazo"
}

captions = []
for i, word in enumerate(new_words):
    s = map_time(i, N, t_start, t_end)
    if i + 1 < N:
        e = map_time(i + 1, N, t_start, t_end) - 0.02
    else:
        e = min(s + 0.55, DURATION)

    display = word.rstrip(".,;:…")
    clean = re.sub(r'[.,;:…]', '', word).lower()
    is_emph = clean in EMPH

    captions.append({
        "t": display,
        "s": round(s, 3),
        "e": round(e, 3),
        "emph": is_emph
    })

# ── Guardar captions.js ────────────────────────────────────────────────
payload = {"captions": captions, "boundaries": [], "duration": DURATION}
js = "window.__CAPTIONS = " + json.dumps(payload, ensure_ascii=False, indent=2) + ";\n"

OUT = r"C:\Users\Jowy\reels\brillovital\reel-ugc-mujer\_work\captions_v6.js"
with open(OUT, "w", encoding="utf-8") as f:
    f.write(js)

print(f"\nEscrito: {OUT}")
print(f"Palabras: {len(captions)}")
print("\nPrimeras 10:")
for c in captions[:10]:
    print(f"  {c['s']:.2f}-{c['e']:.2f}  {c['t']!r}{'  ★' if c['emph'] else ''}")
print("...")
print("Ultimas 5:")
for c in captions[-5:]:
    print(f"  {c['s']:.2f}-{c['e']:.2f}  {c['t']!r}{'  ★' if c['emph'] else ''}")
