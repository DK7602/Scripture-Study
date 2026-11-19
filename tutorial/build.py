#!/usr/bin/env python3
"""Step 3 of the tutorial videos: puts picture and narration together.

For every chapter recorded by record.cjs: the screen frames (each shown for as long as it was on screen) become an
H.264 video, the narration of each scene (tts.py) starts when that scene started, and in "Listening" Michael's own
recording of the chapter plays where the app played it. Writes, for the app (served through the Worker, which
answers Range requests as iPhones need):
  public/audio/tutorial/<chapter>.mp4, .vtt (captions), .jpg (poster) and index.json,
and tutorial/.build/scripture-study-tutorial.mp4, all chapters in one file.
"""
import hashlib
import json
import os
import re
import shutil
import subprocess
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HERE = os.path.join(ROOT, "tutorial")
BUILD = os.path.join(HERE, ".build")
OUT = os.path.join(ROOT, "public", "audio", "tutorial")
SITE = "https://scripture-study.dking7602.workers.dev/"
LEAD = 0.35  # seconds of picture before the first words


def ff(*args):
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)


def duration(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], capture_output=True, text=True, check=True)
    return float(r.stdout.strip())


def vtt_time(t):
    h, rem = divmod(max(t, 0), 3600)
    m, s = divmod(rem, 60)
    return f"{int(h):02d}:{int(m):02d}:{s:06.3f}"


def fetch(url, dest=None):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (scripture-study tutorial build)"})
    with urllib.request.urlopen(req, timeout=120) as r:
        data = r.read()
    if dest:
        open(dest, "wb").write(data)
    return data


def michael_clip(m, dest):
    """Michael's recording of the chapter from its start to the end of verse toVerse; returns (file, verse-1 start, end)."""
    base = f"{SITE}audio/michael/{m['version']}/{m['book']}"
    mp3 = os.path.join(BUILD, "michael", f"{m['version']}-{m['book']}-{m['chapter']}.mp3")
    os.makedirs(os.path.dirname(mp3), exist_ok=True)
    if not os.path.exists(mp3):
        fetch(f"{base}/{m['chapter']}.mp3", mp3)
    timings = json.loads(fetch(f"{base}.json"))[str(m["chapter"])]
    verses = {v[0]: (v[1], v[2]) for v in timings["v"]}
    return mp3, verses[1][0], verses[m["toVerse"]][1] + 0.5


def even_frames(tl):
    """Every frame the same size (a frame of another shape would break the video on phones)."""
    from collections import Counter

    from PIL import Image

    paths = [os.path.join(tl["frames"], f["file"]) for f in tl["frameList"]]
    sizes = {p: Image.open(p).size for p in paths}
    size = Counter(sizes.values()).most_common(1)[0][0]
    odd = [p for p, s in sizes.items() if s != size]
    for p in odd:
        im = Image.open(p).convert("RGB")
        im.thumbnail(size)
        canvas = Image.new("RGB", size, (24, 30, 26))
        canvas.paste(im, ((size[0] - im.width) // 2, (size[1] - im.height) // 2))
        canvas.save(p, quality=90)
    if odd:
        print(f"  {len(odd)} frames of another size were fitted to {size[0]}x{size[1]}")


def build_chapter(ch, tl, durations):
    cid = ch["id"]
    even_frames(tl)
    frames = tl["frameList"]
    scenes = tl["scenes"]
    t_start = scenes[0]["start"] - LEAD
    t_end = tl["end"]
    # the frames, each for as long as it stayed on screen
    first = max([i for i, f in enumerate(frames) if f["t"] <= t_start] or [0])
    lines = []
    shown = [f for f in frames[first:] if f["t"] < t_end]
    for i, f in enumerate(shown):
        a = max(f["t"], t_start)
        b = shown[i + 1]["t"] if i + 1 < len(shown) else t_end
        if b - a <= 0:
            continue
        lines.append(f"file '{os.path.join(tl['frames'], f['file'])}'\nduration {b - a:.4f}")
    lines.append(f"file '{os.path.join(tl['frames'], shown[-1]['file'])}'")
    listing = os.path.join(BUILD, f"{cid}-frames.txt")
    open(listing, "w").write("\n".join(lines) + "\n")

    # the narration (and Michael), each where it belongs
    inputs, filters, labels = [], [], []
    for sc in scenes:
        wav = os.path.join(BUILD, "audio", cid, sc["id"] + ".wav")
        delay = int(round((sc["start"] - t_start) * 1000))
        k = len(inputs) // 2
        inputs += ["-i", wav]
        filters.append(f"[{k + 1}:a]aresample=48000,adelay={delay}|{delay}[a{k}]")
        labels.append(f"[a{k}]")
    for ex in tl.get("extra", []):
        if ex.get("kind") != "michael":
            continue
        mp3, v1, to = michael_clip(ex, None)
        zero = ex["playAt"] - t_start  # where the recording's second 0 (the chapter heading) falls in the video
        skip = max(0.0, -zero)
        delay = int(round(max(zero, 0) * 1000))
        k = len(inputs) // 2
        inputs += ["-i", mp3]
        filters.append(
            f"[{k + 1}:a]atrim={skip:.3f}:{to:.3f},asetpts=PTS-STARTPTS,afade=t=out:st={max(to - skip - 0.6, 0):.3f}:d=0.6,"
            f"volume=0.9,aresample=48000,adelay={delay}|{delay}[a{k}]"
        )
        labels.append(f"[a{k}]")
    mix = "".join(labels) + f"amix=inputs={len(labels)}:normalize=0:dropout_transition=0,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[aout]"
    mp4 = os.path.join(OUT, f"{cid}.mp4")
    ff(
        "-f", "concat", "-safe", "0", "-i", listing, *inputs,
        "-filter_complex", ";".join(filters + [mix, "[0:v]fps=30,scale=720:-2:flags=lanczos,format=yuv420p[vout]"]),
        "-map", "[vout]", "-map", "[aout]",
        "-c:v", "libx264", "-preset", "slow", "-crf", "27", "-tune", "stillimage", "-profile:v", "high", "-level", "4.1",
        "-c:a", "aac", "-b:a", "112k", "-ac", "2", "-movflags", "+faststart", "-shortest", mp4,
    )
    ff("-ss", "2.5", "-i", mp4, "-frames:v", "1", "-vf", "scale=360:-2", "-q:v", "4", os.path.join(OUT, f"{cid}.jpg"))

    # captions: each scene's words, sentence by sentence
    cues = []
    for sc in scenes:
        say = next(s["say"] for s in ch["scenes"] if s["id"] == sc["id"])
        start = sc["start"] - t_start
        total = durations[f"{cid}/{sc['id']}"]
        parts = [p for p in re.split(r"(?<=[.!?])\s+", say) if p]
        weight = sum(len(p) for p in parts)
        t = start
        for p in parts:
            d = total * len(p) / weight
            cues.append((t, t + d, p))
            t += d
    vtt = "WEBVTT\n\n" + "\n\n".join(f"{vtt_time(a)} --> {vtt_time(b)}\n{text}" for a, b, text in cues) + "\n"
    open(os.path.join(OUT, f"{cid}.vtt"), "w").write(vtt)
    return mp4


def main():
    os.makedirs(OUT, exist_ok=True)
    script = json.load(open(os.path.join(HERE, "narration.json")))
    timeline = json.load(open(os.path.join(BUILD, "timeline.json")))
    durations = json.load(open(os.path.join(BUILD, "durations.json")))
    index, parts = [], []
    for ch in script["chapters"]:
        if ch["id"] not in timeline:
            print("not recorded yet:", ch["id"])
            continue
        mp4 = build_chapter(ch, timeline[ch["id"]], durations)
        secs = duration(mp4)
        parts.append(mp4)
        # ?v= changes whenever a file is remade, so phones fetch the new one instead of a cached copy
        v = lambda ext: f"{ch['id']}.{ext}?v={hashlib.md5(open(os.path.join(OUT, ch['id'] + '.' + ext), 'rb').read()).hexdigest()[:8]}"
        index.append({"id": ch["id"], "title": ch["title"], "seconds": round(secs), "video": v("mp4"), "poster": v("jpg"), "captions": v("vtt")})
        print(f"{ch['id']}: {secs:.0f} s, {os.path.getsize(mp4) / 2**20:.1f} MB")
    json.dump({"chapters": index}, open(os.path.join(OUT, "index.json"), "w"), indent=1)
    if len(parts) == len(script["chapters"]):
        listing = os.path.join(BUILD, "all.txt")
        open(listing, "w").write("".join(f"file '{p}'\n" for p in parts))
        full = os.path.join(BUILD, "scripture-study-tutorial.mp4")
        ff("-f", "concat", "-safe", "0", "-i", listing, "-c", "copy", "-movflags", "+faststart", full)
        print(f"all chapters: {duration(full) / 60:.1f} min, {os.path.getsize(full) / 2**20:.1f} MB -> {full}")
    shutil.rmtree(os.path.join(BUILD, "michael"), ignore_errors=True)


if __name__ == "__main__":
    main()
