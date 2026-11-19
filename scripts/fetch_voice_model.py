#!/usr/bin/env python3
"""Hosts Michael's on-device voice (Kokoro) on the site itself, so phones only ever talk to our own domain.

Run by the deploy after the build (scripts/cloudflare_setup.mjs). Downloads, once (cached in .voice-model-cache):
  - the kokoro-js browser build and the ONNX Runtime WebAssembly files it uses (jsDelivr),
  - the Kokoro model files and Michael's voice from Hugging Face,
and writes them to dist/voice-model/, with the 88 MB model split into parts under the host's 25 MiB file limit.
The app's worker (src/lib/kokoro.worker.ts) reads dist/voice-model/manifest.json, downloads the files from the site and
places them in the browser cache under their Hugging Face addresses, where kokoro-js looks for them first.
"""
import json
import os
import shutil
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, ".voice-model-cache")
OUT = os.path.join(ROOT, "dist", "voice-model")

KOKORO_JS = "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js"
ORT = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1/dist/"  # the version bundled in kokoro-js 1.2.1
HF = "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/"
SMALL = ["config.json", "tokenizer.json", "tokenizer_config.json", "voices/am_michael.bin"]
MODELS = {"q8": "onnx/model_quantized.onnx", "fp32": "onnx/model.onnx"}  # 88 MB for the processor, 310 MB for WebGPU
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
    get(KOKORO_JS, os.path.join(CACHE, "kokoro.web.js"))
    for f in ("ort-wasm-simd-threaded.jsep.mjs", "ort-wasm-simd-threaded.jsep.wasm"):
        get(ORT + f, os.path.join(CACHE, "ort", f))
    for f in SMALL + list(MODELS.values()):
        get(HF + f, os.path.join(CACHE, "hf", f))

    shutil.rmtree(OUT, ignore_errors=True)
    os.makedirs(OUT)
    shutil.copy(os.path.join(CACHE, "kokoro.web.js"), OUT)
    shutil.copytree(os.path.join(CACHE, "ort"), os.path.join(OUT, "ort"))
    files = {}
    for f in SMALL:
        dest = os.path.join(OUT, "hf", f)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        shutil.copy(os.path.join(CACHE, "hf", f), dest)
        files[f] = os.path.getsize(dest)
    models = {}
    for dtype, path in MODELS.items():
        src = os.path.join(CACHE, "hf", path)
        size = os.path.getsize(src)
        parts = 0
        os.makedirs(os.path.join(OUT, "hf", os.path.dirname(path)), exist_ok=True)
        with open(src, "rb") as f:
            while True:
                chunk = f.read(PART)
                if not chunk:
                    break
                open(os.path.join(OUT, "hf", f"{path}.{parts:03d}"), "wb").write(chunk)
                parts += 1
        models[dtype] = {"path": path, "size": size, "parts": parts}
        print(f"voice model: {dtype} {size // 2**20} MB in {parts} parts")
    manifest = {"hf": HF, "files": files, "models": models, "ort": "ort/", "lib": "kokoro.web.js"}
    json.dump(manifest, open(os.path.join(OUT, "manifest.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
