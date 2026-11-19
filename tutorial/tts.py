#!/usr/bin/env python3
"""Step 1 of the tutorial videos: Michael reads every scene of tutorial/narration.json.

Kokoro (Apache-2.0) through kokoro-onnx, on the processor. Writes tutorial/.build/audio/<chapter>/<scene>.wav and
tutorial/.build/durations.json (seconds per scene), which the recording (record.cjs) waits for.

Needs: pip install kokoro-onnx soundfile. The Kokoro model (310 MB) and voices-v1.0.bin are downloaded once into
.voice-model-cache (or pass --model / --voices).
"""
import argparse
import json
import os
import urllib.request

import soundfile as sf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HERE = os.path.join(ROOT, "tutorial")
BUILD = os.path.join(HERE, ".build")
MODEL_URL = "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/onnx/model.onnx"
VOICES_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default=os.path.join(ROOT, ".voice-model-cache", "hf", "onnx", "model.onnx"))
    ap.add_argument("--voices", default=os.path.join(ROOT, ".voice-model-cache", "voices-v1.0.bin"))
    ap.add_argument("--speed", type=float, default=1.0)
    a = ap.parse_args()
    if not os.path.exists(a.model):
        os.makedirs(os.path.dirname(a.model), exist_ok=True)
        print("downloading", MODEL_URL)
        urllib.request.urlretrieve(MODEL_URL, a.model)
    if not os.path.exists(a.voices):
        os.makedirs(os.path.dirname(a.voices), exist_ok=True)
        print("downloading", VOICES_URL)
        urllib.request.urlretrieve(VOICES_URL, a.voices)
    from kokoro_onnx import Kokoro

    tts = Kokoro(a.model, a.voices)
    script = json.load(open(os.path.join(HERE, "narration.json")))
    durations = {}
    for ch in script["chapters"]:
        os.makedirs(os.path.join(BUILD, "audio", ch["id"]), exist_ok=True)
        for sc in ch["scenes"]:
            audio, sr = tts.create(sc["say"], voice=script.get("voice", "am_michael"), speed=a.speed, lang="en-us")
            path = os.path.join(BUILD, "audio", ch["id"], sc["id"] + ".wav")
            sf.write(path, audio, sr)
            durations[f"{ch['id']}/{sc['id']}"] = round(len(audio) / sr, 3)
            print(f"{ch['id']}/{sc['id']}: {durations[ch['id'] + '/' + sc['id']]:.1f} s")
    json.dump(durations, open(os.path.join(BUILD, "durations.json"), "w"), indent=1)
    print(f"total {sum(durations.values()) / 60:.1f} min of narration")


if __name__ == "__main__":
    main()
