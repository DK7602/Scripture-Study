#!/usr/bin/env python3
"""Adds the narrated audio Bible recorded on Kaggle to the built site, just before it is deployed.

The recordings are too large for the git repository (about 1-1.6 GB per voice), so they stay in the Kaggle
kernels that rendered them (scripts/kaggle_narrate.py). For every source in scripts/narration_sources.json this
downloads the kernel's archive (cached in .narration-cache between deploys), unpacks it into dist/audio/, and
adds the voice to dist/audio/index.json so the app offers it.

Credentials: KAGGLE_API_TOKEN (a token from kaggle.com/settings/api), or KAGGLE_USERNAME + KAGGLE_KEY.
Without them, or if anything fails, the site deploys without the recordings (the device voice still reads).
"""
import base64
import json
import os
import sys
import tarfile
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCES = os.path.join(ROOT, "scripts", "narration_sources.json")
CACHE = os.path.join(ROOT, ".narration-cache")
DIST = os.path.join(ROOT, "dist", "audio")
API = "https://api.kaggle.com/v1"


def auth_header():
    tok = os.environ.get("KAGGLE_API_TOKEN", "").strip()
    if tok:
        return {"Authorization": f"Bearer {tok}"}
    user, key = os.environ.get("KAGGLE_USERNAME", ""), os.environ.get("KAGGLE_KEY", "")
    if user and key:
        return {"Authorization": "Basic " + base64.b64encode(f"{user}:{key}".encode()).decode()}
    return None


def outputs(kernel: str, headers: dict) -> list[dict]:
    owner, slug = kernel.split("/")
    files, token = [], None
    for _ in range(50):
        q = {"userName": owner, "kernelSlug": slug, "pageSize": 500}
        if token:
            q["pageToken"] = token
        req = urllib.request.Request(f"{API}/kernels/output?{urllib.parse.urlencode(q)}", headers=headers)
        with urllib.request.urlopen(req, timeout=120) as r:
            d = json.load(r)
        files += d.get("files") or []
        token = d.get("nextPageToken")
        if not token:
            break
    return files


def download(url: str, dest: str):
    tmp = dest + ".part"
    with urllib.request.urlopen(url, timeout=600) as r, open(tmp, "wb") as f:
        while True:
            chunk = r.read(1 << 22)
            if not chunk:
                break
            f.write(chunk)
    os.replace(tmp, dest)


def main():
    if not os.path.exists(SOURCES):
        return
    sources = json.load(open(SOURCES)).get("sources", [])
    if not sources:
        print("narration: no sources listed")
        return
    headers = auth_header()
    if not headers:
        print("narration: no Kaggle credentials (KAGGLE_API_TOKEN secret) - deploying without recordings")
        return
    if not os.path.isdir(DIST):
        sys.exit("run the build first (dist/audio is missing)")
    os.makedirs(CACHE, exist_ok=True)
    index_path = os.path.join(DIST, "index.json")
    index = json.load(open(index_path)) if os.path.exists(index_path) else {"voices": []}
    for s in sources:
        try:
            dest = os.path.join(CACHE, s["archive"])
            if not os.path.exists(dest):
                files = outputs(s["kernel"], headers)
                match = [f for f in files if os.path.basename(f.get("fileName", "")) == s["archive"]]
                if not match:
                    print(f"narration: {s['archive']} not found in {s['kernel']} output - skipped")
                    continue
                print(f"narration: downloading {s['archive']} from {s['kernel']}")
                download(match[0]["url"], dest)
            with tarfile.open(dest) as t:
                t.extractall(DIST, filter="data")
            voice = dict(s["voice"])
            old = next((v for v in index["voices"] if v["id"] == voice["id"]), None)
            if old:  # one narrator, several translations: merge
                old.update({k: v for k, v in voice.items() if k != "versions"})
                old["versions"] = {**old.get("versions", {}), **voice.get("versions", {})}
            else:
                index["voices"].append(voice)
            print(f"narration: added {voice['id']} ({os.path.getsize(dest) // 2**20} MB)")
        except Exception as e:  # never block a deploy over the recordings
            print(f"narration: {s.get('archive')} failed: {e}")
    # recorded voices first, the samples after
    full = [v for v in index["voices"] if any(x == "all" or any(c == "all" for c in x.values()) for x in v["versions"].values() if isinstance(x, (dict, str)))]
    rest = [v for v in index["voices"] if v not in full]
    index["voices"] = full + rest
    json.dump(index, open(index_path, "w"), indent=1)


if __name__ == "__main__":
    main()
