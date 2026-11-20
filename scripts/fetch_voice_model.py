#!/usr/bin/env python3
"""Hosts the voices made on the phone (Ryan, by Piper, and Supertonic's five men and five women) on the site
itself, so phones only ever talk to our own domain.

Run by the deploy after the build (scripts/cloudflare_setup.mjs). Downloads once (cached in .voice-model-cache) the
Piper voice en_US-ryan-medium (rhasspy/piper-voices on Hugging Face; Piper is MIT, the voice's training data,
RyanSpeech, is CC BY-NC-SA 4.0: fine for this free app, credited in the player; for unrestricted use pick
en_US-john-medium or en_US-norman-medium (public domain) or en_US-joe-medium (CC0) here, in piper.worker.ts and as
LOCAL_NAME in audio.ts) and writes dist/voice-model/piper/:
the model split into parts under the host's 25 MiB file limit, its configuration, and manifest.json, which the
app's worker (src/lib/piper.worker.ts) reads. ONNX Runtime and eSpeak come with the app's own build.

Supertonic 2 (Supertone/supertonic-2 on Hugging Face; the model is OpenRAIL-M, its LICENSE is copied alongside) goes
to dist/voice-model/supertonic/: its four models in parts, tts.json, unicode_indexer.json, the ten voice styles and
manifest.json, which src/lib/supertonic.worker.ts reads.
"""
import json
import os
import shutil
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, ".voice-model-cache", "piper")
OUT = os.path.join(ROOT, "dist", "voice-model", "piper")

VOICE = "en_US-ryan-medium"
HF = "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/medium/"
PART = 20 * 2**20

ST = "https://huggingface.co/Supertone/supertonic-2/resolve/main/"
ST_CACHE = os.path.join(ROOT, ".voice-model-cache", "supertonic-2")
ST_OUT = os.path.join(ROOT, "dist", "voice-model", "supertonic")
ST_MODELS = ["duration_predictor", "text_encoder", "vector_estimator", "vocoder"]
ST_VOICES = [f"{g}{n}" for g in "MF" for n in range(1, 6)]


def get(url: str, dest: str):
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    print("voice model: downloading", url)
    req = urllib.request.Request(url, headers={"User-Agent": "scripture-study-deploy"})
    with urllib.request.urlopen(req, timeout=600) as r, open(dest + ".part", "wb") as f:
        shutil.copyfileobj(r, f, 1 << 22)
    os.replace(dest + ".part", dest)


def split(src: str, out_dir: str, name: str) -> dict:
    """The file in parts under the host's file limit: name.000, name.001, ..."""
    size, parts = os.path.getsize(src), 0
    with open(src, "rb") as f:
        while chunk := f.read(PART):
            open(os.path.join(out_dir, f"{name}.{parts:03d}"), "wb").write(chunk)
            parts += 1
    return {"path": name, "size": size, "parts": parts}


def supertonic():
    files = [f"onnx/{m}.onnx" for m in ST_MODELS] + ["onnx/tts.json", "onnx/unicode_indexer.json", "LICENSE"]
    files += [f"voice_styles/{v}.json" for v in ST_VOICES]
    for f in files:
        get(ST + f, os.path.join(ST_CACHE, f))
    shutil.rmtree(ST_OUT, ignore_errors=True)
    os.makedirs(os.path.join(ST_OUT, "styles"))
    models = {m: split(os.path.join(ST_CACHE, "onnx", f"{m}.onnx"), ST_OUT, f"{m}.onnx") for m in ST_MODELS}
    for f in ["tts.json", "unicode_indexer.json"]:
        shutil.copy(os.path.join(ST_CACHE, "onnx", f), ST_OUT)
    shutil.copy(os.path.join(ST_CACHE, "LICENSE"), os.path.join(ST_OUT, "LICENSE.txt"))
    for v in ST_VOICES:
        shutil.copy(os.path.join(ST_CACHE, "voice_styles", f"{v}.json"), os.path.join(ST_OUT, "styles"))
    manifest = {"models": models, "config": "tts.json", "indexer": "unicode_indexer.json", "styles": {v: f"styles/{v}.json" for v in ST_VOICES}}
    json.dump(manifest, open(os.path.join(ST_OUT, "manifest.json"), "w"), indent=1)
    total = sum(m["size"] for m in models.values())
    print(f"voice model: Supertonic 2, {total // 2**20} MB in {sum(m['parts'] for m in models.values())} parts, {len(ST_VOICES)} voices")


def main():
    if not os.path.isdir(os.path.join(ROOT, "dist")):
        sys.exit("run the build first")
    model, config = f"{VOICE}.onnx", f"{VOICE}.onnx.json"
    get(HF + model, os.path.join(CACHE, model))
    get(HF + config, os.path.join(CACHE, config))

    shutil.rmtree(OUT, ignore_errors=True)
    os.makedirs(OUT)
    shutil.copy(os.path.join(CACHE, config), OUT)
    m = split(os.path.join(CACHE, model), OUT, model)
    json.dump({"voice": VOICE, "config": config, "model": m}, open(os.path.join(OUT, "manifest.json"), "w"), indent=1)
    print(f"voice model: {VOICE} {m['size'] // 2**20} MB in {m['parts']} parts")
    supertonic()


if __name__ == "__main__":
    main()
