#!/usr/bin/env python3
"""Hosts Ryan's on-device voice (Piper) on the site itself, so phones only ever talk to our own domain.

Run by the deploy after the build (scripts/cloudflare_setup.mjs). Downloads once (cached in .voice-model-cache) the
Piper voice en_US-ryan-medium (rhasspy/piper-voices on Hugging Face; Piper is MIT, the voice's training data,
RyanSpeech, is CC BY-NC-SA 4.0: fine for this free app, credited in the player; for unrestricted use pick
en_US-john-medium or en_US-norman-medium (public domain) or en_US-joe-medium (CC0) here, in piper.worker.ts and as
LOCAL_NAME in audio.ts) and writes dist/voice-model/piper/:
the model split into parts under the host's 25 MiB file limit, its configuration, and manifest.json, which the
app's worker (src/lib/piper.worker.ts) reads. ONNX Runtime and eSpeak come with the app's own build.
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


def get(url: str, dest: str):
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    print("voice model: downloading", url)
    req = urllib.request.Request(url, headers={"User-Agent": "scripture-study-deploy"})
    with urllib.request.urlopen(req, timeout=600) as r, open(dest + ".part", "wb") as f:
        shutil.copyfileobj(r, f, 1 << 22)
    os.replace(dest + ".part", dest)


def main():
    if not os.path.isdir(os.path.join(ROOT, "dist")):
        sys.exit("run the build first")
    model, config = f"{VOICE}.onnx", f"{VOICE}.onnx.json"
    get(HF + model, os.path.join(CACHE, model))
    get(HF + config, os.path.join(CACHE, config))

    shutil.rmtree(OUT, ignore_errors=True)
    os.makedirs(OUT)
    shutil.copy(os.path.join(CACHE, config), OUT)
    src = os.path.join(CACHE, model)
    size, parts = os.path.getsize(src), 0
    with open(src, "rb") as f:
        while chunk := f.read(PART):
            open(os.path.join(OUT, f"{model}.{parts:03d}"), "wb").write(chunk)
            parts += 1
    json.dump({"voice": VOICE, "config": config, "model": {"path": model, "size": size, "parts": parts}}, open(os.path.join(OUT, "manifest.json"), "w"), indent=1)
    print(f"voice model: {VOICE} {size // 2**20} MB in {parts} parts")


if __name__ == "__main__":
    main()
