"""
Renders the narrated audio Bible on a free Kaggle GPU, headless (scripts/narrate.py does the work).

Pushed as a private Kaggle "script" kernel with GPU and internet on by scripts/kaggle_push_narration.py, which
writes the settings into SCRIPTURE_NARRATION at the top of the kernel source:

  {"branch": "claude/affectionate-pasteur-c22ifu",   Scripture-Study branch with the texts and narrate.py
   "version": "KJV",                                   public-domain translation to read
   "voice_id": "male8",                                folder / id of this narrator in the app
   "kokoro_voice": "am_michael",                       Kokoro voice that reads the text
   "rvc": true,                                        then turn it into the VoxaVersa voice (vocalset-male8)
   "book": "ALL", "chapters": "all",                   or e.g. "JHN" / "15" for a test
   "hours": 11,                                        stop cleanly before Kaggle's 12-hour limit
   "resume": true}                                     continue from the previous run's archive (attached input)

Output (/kaggle/working): narration-<voice>-<VERSION>.tar with <voice>/<VERSION>/<BOOK>/<ch>.mp3 + .json, and
progress.json (chapters done, chapters missing). The site's deploy downloads the archive (scripts/fetch_narration.py).
"""

import glob
import json
import os
import subprocess
import sys
import tarfile
import time
import zipfile

START = time.time()
CFG = json.loads(os.environ.get("SCRIPTURE_NARRATION") or json.dumps(globals().get("SCRIPTURE_NARRATION", {})))
TMP = "/kaggle/tmp"
WORK = "/kaggle/working"


def sh(cmd):
    print("+ " + cmd, flush=True)
    subprocess.run(cmd, shell=True, check=True)


def main():
    os.makedirs(TMP, exist_ok=True)
    voice, version = CFG["voice_id"], CFG.get("version", "KJV")
    archive = os.path.join(WORK, f"narration-{voice}-{version}.tar")
    out = os.path.join(TMP, "out")
    sh("nvidia-smi --query-gpu=name,memory.total --format=csv || true")

    # the official kokoro package on the GPU (PyTorch is preinstalled); espeak-ng reads words its dictionary lacks
    sh("apt-get -qq -y install espeak-ng > /dev/null 2>&1 || true")
    sh("pip install -q 'kokoro>=0.9.4' soundfile scipy")
    if CFG.get("rvc"):  # the VoxaVersa voice conversion runs on onnxruntime
        sh("pip install -q 'onnxruntime-gpu>=1.20'")

    repo = os.path.join(TMP, "ss")
    if not os.path.isdir(repo):
        sh(f"git clone -q --depth 1 --filter=blob:none --sparse -b {CFG.get('branch', 'main')} https://github.com/DK7602/Scripture-Study {repo}")
        sh(f"git -C {repo} sparse-checkout set scripts public/data/bibles/{version}")
    vv = os.path.join(TMP, "VoxaVersa")
    if CFG.get("rvc") and not os.path.isdir(vv):
        sh(f"git clone -q --depth 1 https://github.com/DK7602/VoxaVersa {vv}")

    models = os.path.join(TMP, "models")
    os.makedirs(models, exist_ok=True)
    rel = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0"
    for f in ("kokoro-v1.0.onnx", "voices-v1.0.bin"):
        if not os.path.exists(os.path.join(models, f)):
            sh(f"curl -sSL -o {models}/{f} {rel}/{f}")

    args = [sys.executable, os.path.join(repo, "scripts", "narrate.py"), "--version", version, "--book", CFG.get("book", "ALL"),
            "--chapters", str(CFG.get("chapters", "all")), "--kokoro-model", f"{models}/kokoro-v1.0.onnx",
            "--kokoro-voices", f"{models}/voices-v1.0.bin", "--kokoro-voice", CFG.get("kokoro_voice", "am_michael"),
            "--voice-id", voice, "--out", out, "--threads", "4", "--bitrate", CFG.get("bitrate", "32k"), "--engine", "torch"]
    if CFG.get("rvc"):
        packs = glob.glob("/kaggle/input/**/vocalset-male8.vxpack", recursive=True)
        encs = glob.glob("/kaggle/input/**/contentvec-768.onnx", recursive=True)
        if not packs or not encs:
            sys.exit("the VoxaVersa voice (vocalset-male8.vxpack) and contentvec-768.onnx must be attached as input")
        with zipfile.ZipFile(packs[0]) as z:
            z.extractall(os.path.join(TMP, "voice"))
        model = glob.glob(os.path.join(TMP, "voice", "*.onnx"))[0]
        args += ["--rvc-model", model, "--rvc-encoder", encs[0], "--voxaversa", vv]

    # carry on from an earlier run: its archive is attached as input
    if CFG.get("resume"):
        for prev in glob.glob(f"/kaggle/input/**/narration-{voice}-{version}.tar", recursive=True):
            print("resuming from", prev, flush=True)
            with tarfile.open(prev) as t:
                t.extractall(out, filter="data")
            # unpack the per-book timings back into per-chapter files so narrate.py skips finished chapters
            for bj in glob.glob(os.path.join(out, voice, version, "*.json")):
                for ch, tm in json.load(open(bj)).items():
                    json.dump(tm, open(os.path.join(bj[:-5], f"{ch}.json"), "w"), separators=(",", ":"))
                os.remove(bj)

    left = CFG.get("hours", 11) - (time.time() - START) / 3600 - 0.25
    args += ["--hours", f"{max(0.1, left):.2f}"]
    print("+ " + " ".join(args), flush=True)
    subprocess.run(args, check=True)

    # pack what is done (also after a time-limit stop) and report progress. Verse timings go in one file per
    # book (<BOOK>.json: {chapter: timings}) to keep the site under the host's file-count limit.
    root = os.path.join(out, voice, version)
    done = sorted(os.path.relpath(p, root)[:-4] for p in glob.glob(os.path.join(root, "*", "*.mp3")))
    with tarfile.open(archive, "w") as t:
        for bdir in sorted(glob.glob(os.path.join(root, "*"))):
            if not os.path.isdir(bdir):
                continue
            book = os.path.basename(bdir)
            timing = {}
            for mp3 in sorted(glob.glob(os.path.join(bdir, "*.mp3"))):
                ch = os.path.basename(mp3)[:-4]
                t.add(mp3, arcname=f"{voice}/{version}/{book}/{ch}.mp3")
                timing[ch] = json.load(open(mp3[:-4] + ".json"))
            bj = os.path.join(TMP, f"{book}.json")
            json.dump(timing, open(bj, "w"), separators=(",", ":"))
            t.add(bj, arcname=f"{voice}/{version}/{book}.json")
    books = json.load(open(os.path.join(repo, "public", "data", "books.json")))
    books = books["books"] if isinstance(books, dict) else books
    want = [f"{b['id']}/{c}" for b in books for c in range(1, len(b["v"]) + 1)]
    missing = [w for w in want if w not in set(done)]
    json.dump({"voice": voice, "version": version, "chapters_done": len(done), "chapters_total": len(want),
               "missing": missing[:50], "missing_count": len(missing), "hours": round((time.time() - START) / 3600, 2)},
              open(os.path.join(WORK, "progress.json"), "w"), indent=1)
    print(f"done: {len(done)} of {len(want)} chapters, archive {os.path.getsize(archive) // 2**20} MB", flush=True)


if __name__ == "__main__":
    main()
