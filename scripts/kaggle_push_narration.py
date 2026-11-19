#!/usr/bin/env python3
"""Pushes scripts/kaggle_narrate.py to Kaggle as a private GPU kernel (needs the kaggle CLI and credentials).

  python3 scripts/kaggle_push_narration.py --voice-id male8 --kokoro-voice am_michael --rvc --version KJV
  python3 scripts/kaggle_push_narration.py --voice-id male8 --kokoro-voice am_michael --rvc --book JHN --chapters 15 --test

--resume attaches the kernel's own previous output so the next run continues where the last one stopped.
"""
import argparse
import json
import os
import subprocess
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OWNER = "davekingiii"
VOXAVERSA_VOICE = "davekingiii/voxaversa-train-vocalset-male-8"  # the trained voice and its content encoder


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice-id", required=True)
    ap.add_argument("--kokoro-voice", default="am_michael")
    ap.add_argument("--rvc", action="store_true")
    ap.add_argument("--version", default="KJV")
    ap.add_argument("--book", default="ALL")
    ap.add_argument("--chapters", default="all")
    ap.add_argument("--hours", type=float, default=11)
    ap.add_argument("--branch", default="claude/affectionate-pasteur-c22ifu")
    ap.add_argument("--resume", action="store_true")
    ap.add_argument("--bitrate", default="32k")
    ap.add_argument("--test", action="store_true", help="a separate kernel for trial runs")
    a = ap.parse_args()

    title = f"Scripture Study narration {a.voice_id} {a.version}" + (" test" if a.test else "")
    slug = title.lower().replace(" ", "-")
    cfg = {"branch": a.branch, "version": a.version, "voice_id": a.voice_id, "kokoro_voice": a.kokoro_voice, "rvc": a.rvc,
           "book": a.book, "chapters": a.chapters, "hours": a.hours, "resume": a.resume, "bitrate": a.bitrate}
    src = open(os.path.join(ROOT, "scripts", "kaggle_narrate.py")).read()
    sources = [VOXAVERSA_VOICE] if a.rvc else []
    if a.resume:
        sources.append(f"{OWNER}/{slug}")
    meta = {"id": f"{OWNER}/{slug}", "title": title, "code_file": "kernel.py", "language": "python", "kernel_type": "script",
            "is_private": True, "enable_gpu": True, "enable_internet": True, "dataset_sources": [], "kernel_sources": sources,
            "competition_sources": [], "model_sources": []}
    with tempfile.TemporaryDirectory() as d:
        open(os.path.join(d, "kernel.py"), "w").write(f"SCRIPTURE_NARRATION = {cfg!r}\n\n{src}")
        json.dump(meta, open(os.path.join(d, "kernel-metadata.json"), "w"), indent=1)
        r = subprocess.run(["kaggle", "kernels", "push", "-p", d], capture_output=True, text=True)
        print((r.stdout + r.stderr).strip())
        if r.returncode or "error" in (r.stdout + r.stderr).lower():
            raise SystemExit(f"not started: {OWNER}/{slug} (Kaggle runs at most two GPU jobs at once)")
    print(f"pushed {OWNER}/{slug}: https://www.kaggle.com/code/{OWNER}/{slug}")


if __name__ == "__main__":
    main()
