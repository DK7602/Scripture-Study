#!/usr/bin/env python3
"""Narrated audio Bible: renders chapters to MP3 with per-verse timings for the app's player.

  Kokoro (Apache-2.0 neural text-to-speech, via kokoro-onnx) reads every verse; the verses are joined with
  natural pauses and the start of each verse is recorded. Optionally the narration is then turned into one of
  the VoxaVersa singer voices (RVC, through VoxaVersa's tools/training/try_voice.py) so the Bible is read in
  that voice.

Output, per chapter (the layout the app reads from /audio/<voice>/):
  <out>/<voice>/<VERSION>/<BOOK>/<chapter>.mp3
  <out>/<voice>/<VERSION>/<BOOK>/<chapter>.json   {"d": seconds, "v": [[verse, start, end], ...]}

Examples
  python3 scripts/narrate.py --version KJV --book JHN --chapters 15 --kokoro-voice bm_george --voice-id george
  python3 scripts/narrate.py --version KJV --book JHN --chapters 15 --kokoro-voice am_michael --voice-id male8 \\
      --rvc-model male8/vocalset_male8_e40.onnx --rvc-encoder contentvec-768.onnx --voxaversa ../VoxaVersa

Needs: pip install kokoro-onnx onnxruntime soundfile scipy; ffmpeg; the Kokoro model files
(kokoro-v1.0.int8.onnx, voices-v1.0.bin from github.com/thewh1teagle/kokoro-onnx releases).
Only public-domain texts (KJV, WEB, ASV, BSB) may be rendered: the licensed translations do not allow it.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile

import numpy as np
import soundfile as sf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "public", "data")
PUBLIC_DOMAIN = {"KJV", "WEB", "ASV", "BSB"}

ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()


def number_words(n: int) -> str:
    if n < 20:
        return ONES[n]
    if n < 100:
        return TENS[n // 10] + ("" if n % 10 == 0 else "-" + ONES[n % 10])
    return ONES[n // 100] + " hundred" + ("" if n % 100 == 0 else " and " + number_words(n % 100))


def speakable(markup: str) -> str:
    """The verse as plain text a voice can read: no Strong's tags or markup, LORD/GOD in ordinary case."""
    t = re.sub(r"\{([^|}]*)\|[^}]*\}", r"\1", markup)
    t = re.sub(r"[\[\]«»¶]", "", t)
    t = re.sub(r"\b([A-Z])([A-Z]+)\b", lambda m: m.group(1) + m.group(2).lower() if len(m.group(0)) > 1 and m.group(0) not in {"II", "III"} else m.group(0), t)
    return re.sub(r"\s+", " ", t).strip()


def heading(book: dict, ch: int) -> str:
    if book["id"] == "PSA":
        return f"Psalm {number_words(ch)}."
    one = len(book.get("v", [0, 0])) == 1
    return f"{book['name']}." if one else f"{book['name']}, chapter {number_words(ch)}."


def encode(src: str, mp3: str, bitrate: str):
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", src, "-ac", "1", "-ar", "24000",
                    "-af", "highpass=f=60,loudnorm=I=-18:TP=-1.5:LRA=11", "-b:a", bitrate, mp3], check=True)


def silence(sec: float, sr: int) -> np.ndarray:
    return np.zeros(int(sec * sr), np.float32)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--version", default="KJV")
    ap.add_argument("--book", required=True, help="book id, e.g. JHN, or ALL")
    ap.add_argument("--chapters", default="all", help="e.g. 15, 1-3, all")
    ap.add_argument("--kokoro-model", default="models/kokoro-v1.0.int8.onnx")
    ap.add_argument("--kokoro-voices", default="models/voices-v1.0.bin")
    ap.add_argument("--kokoro-voice", default="bm_george")
    ap.add_argument("--speed", type=float, default=0.92)
    ap.add_argument("--voice-id", required=True, help="folder name for this narrator, e.g. george or male8")
    ap.add_argument("--rvc-model", help="VoxaVersa voice generator (.onnx from the .vxpack)")
    ap.add_argument("--rvc-encoder", help="contentvec-768.onnx")
    ap.add_argument("--voxaversa", help="VoxaVersa checkout (for tools/training/try_voice.py)")
    ap.add_argument("--transpose", type=float, default=0.0)
    ap.add_argument("--also-plain", help="also save the narration before the voice conversion, under this voice id")
    ap.add_argument("--threads", type=int, default=4)
    ap.add_argument("--bitrate", default="48k")
    ap.add_argument("--out", default="audio-out")
    a = ap.parse_args()

    if a.version not in PUBLIC_DOMAIN:
        sys.exit(f"{a.version} is not public domain; only {sorted(PUBLIC_DOMAIN)} may be narrated")
    from kokoro_onnx import Kokoro

    tts = Kokoro(a.kokoro_model, a.kokoro_voices)
    books = json.load(open(os.path.join(DATA, "books.json")))
    books = books["books"] if isinstance(books, dict) else books
    todo = [b for b in books if a.book == "ALL" or b["id"] == a.book]
    for book in todo:
        text = json.load(open(os.path.join(DATA, "bibles", a.version, book["id"] + ".json")))["c"]
        if a.chapters == "all":
            chs = range(1, len(text) + 1)
        elif "-" in a.chapters:
            x, y = map(int, a.chapters.split("-"))
            chs = range(x, y + 1)
        else:
            chs = [int(a.chapters)]
        for ch in chs:
            render_chapter(a, tts, book, ch, text[ch - 1])


def render_chapter(a, tts, book: dict, ch: int, verses: list[str]):
    dest = os.path.join(a.out, a.voice_id, a.version, book["id"])
    os.makedirs(dest, exist_ok=True)
    mp3 = os.path.join(dest, f"{ch}.mp3")
    if os.path.exists(mp3) and os.path.exists(mp3[:-4] + ".json"):
        return
    sr = 24000
    parts, timings, t = [], [], 0.0
    audio, sr = tts.create(heading(book, ch), voice=a.kokoro_voice, speed=a.speed, lang="en-us")
    parts += [silence(0.25, sr), audio.astype(np.float32), silence(0.8, sr)]
    t = sum(len(p) for p in parts) / sr
    for i, v in enumerate(verses, 1):
        s = speakable(v)
        if not s:
            continue
        audio, sr = tts.create(s, voice=a.kokoro_voice, speed=a.speed, lang="en-us")
        audio = audio.astype(np.float32)
        # trim the model's own leading/trailing silence so the pauses are ours
        nz = np.flatnonzero(np.abs(audio) > 0.004)
        if len(nz):
            audio = audio[max(0, nz[0] - int(0.03 * sr)) : nz[-1] + int(0.06 * sr)]
        start = t
        parts.append(audio)
        t += len(audio) / sr
        timings.append([i, round(start, 2), round(t, 2)])
        gap = 0.55 if s.rstrip().endswith((".", "?", "!")) else 0.4
        parts.append(silence(gap, sr))
        t += gap
    parts.append(silence(0.6, sr))
    wav = np.concatenate(parts)
    peak = np.max(np.abs(wav)) or 1
    wav = wav / peak * 0.89

    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, "narration.wav")
        sf.write(src, wav, sr, subtype="PCM_16")
        if a.rvc_model and a.also_plain:
            plain = os.path.join(a.out, a.also_plain, a.version, book["id"])
            os.makedirs(plain, exist_ok=True)
            encode(src, os.path.join(plain, f"{ch}.mp3"), a.bitrate)
            json.dump({"d": round(len(wav) / sr, 2), "v": timings}, open(os.path.join(plain, f"{ch}.json"), "w"), separators=(",", ":"))
        if a.rvc_model:
            conv = os.path.join(tmp, "voice.wav")
            tool = os.path.join(a.voxaversa, "tools", "training", "try_voice.py")
            subprocess.run([sys.executable, tool, "--model", a.rvc_model, "--encoder", a.rvc_encoder, "--input", src, "--out", conv,
                            "--transpose", str(a.transpose), "--threads", str(a.threads)], check=True)
            src = conv
        encode(src, mp3, a.bitrate)
    json.dump({"d": round(len(wav) / sr, 2), "v": timings}, open(mp3[:-4] + ".json", "w"), separators=(",", ":"))
    print(f"{book['id']} {ch}: {len(wav) / sr:.0f} s, {len(timings)} verses -> {mp3}", flush=True)


if __name__ == "__main__":
    main()
