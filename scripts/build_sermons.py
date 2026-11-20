#!/usr/bin/env python3
"""Spurgeon's sermons by text: the New Park Street and Metropolitan Tabernacle Pulpit (63 volumes, 1855-1917),
public domain, from the Christian Classics Ethereal Library (ccel.org/ccel/spurgeon/sermons01 ... sermons63).

Downloads the volumes once into .cache/ccel/ and writes public/data/sermons/:
  books/<BOOK>.json   {chapter: [[first verse, last verse, sermon no., title, date], ...]}  the sermons on texts there
  text/<k>.json       {no.: {t: title, d: when and where, r: [texts], v: volume, h: html}}  sermons k*10 ... k*10+9
                      (a sermon no. is a string: a few numbers were printed twice, as 1451A and 1451B)
  index.json          {count, volumes, source}

Each sermon's text is the CCEL markup's <scripCom type="Sermon" osisRef=...>; its body becomes the same small HTML
subset as the commentaries (scripture references become data-r links).
Run:  python3 scripts/build_sermons.py
"""
import html
import json
import os
import re
import shutil
import sys
import time
import urllib.request
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_data import CODES, OUT, ROOT, load_books, log, markup_to_html, osis_attr_to_compact, write_json  # noqa: E402

CACHE = os.path.join(ROOT, ".cache", "ccel")
VOLUMES = 63
BUNDLE = 10  # sermons per text file: few files for the host, small downloads for a phone

MONTHS = "January February March April May June July August September October November December".split()
DATE = re.compile(r"(" + "|".join(MONTHS) + r")\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(1[89]\d\d)", re.I)
HEADER = re.compile(
    r"^(a sermon|\(?no\.\s*[\d,]+\)?|delivered|preached|intended for reading|published|by\b|by the rev|rev\.|"
    r"c\.\s*h\.\s*spurgeon|at\s+(the\s+)?(metropolitan|new park|exeter|surrey|music hall|agricultural|crystal|"
    r"tabernacle|mentone|westwood|stambourne|.{0,40}\b(chapel|hall|church|newington|southwark|london)\b)|"
    r"held (at|in)\b|this sermon was|being the day|"
    r"on (lord|sunday|monday|tuesday|wednesday|thursday|friday|saturday|sabbath|christmas|good friday))", re.I)


def get(v: int) -> str:
    path = os.path.join(CACHE, f"sermons{v:02d}.xml")
    if not os.path.exists(path) or os.path.getsize(path) < 1000:
        os.makedirs(CACHE, exist_ok=True)
        url = f"https://ccel.org/ccel/spurgeon/sermons{v:02d}.xml"
        log("  downloading", url)
        req = urllib.request.Request(url, headers={"User-Agent": "scripture-study-build"})
        with urllib.request.urlopen(req, timeout=300) as r, open(path + ".part", "wb") as f:
            shutil.copyfileobj(r, f)
        os.replace(path + ".part", path)
        time.sleep(1)
    return open(path, encoding="utf-8").read()


def plain(h: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", h))).strip()


SMALL = {"on", "at", "the", "by", "of", "in", "and", "for", "a", "an", "to", "near"}


def nice_case(t: str) -> str:
    """'DELIVERED ON LORD'S-DAY MORNING, AT THE METROPOLITAN TABERNACLE' -> 'Delivered on Lord's-day Morning, at the
    Metropolitan Tabernacle' (lines printed in capitals)."""
    if not t or sum(c.isupper() for c in t) < 0.6 * sum(c.isalpha() for c in t):
        return t
    words = t.lower().split(" ")
    out = []
    for i, w in enumerate(words):
        core = w.strip(",.;:()")
        if i and core in SMALL:
            out.append(w)
        elif core.startswith("lord's") or core.startswith("lord’s"):
            out.append(w[0].upper() + w[1:])
        else:
            out.append(re.sub(r"[a-z]", lambda m: m.group(0).upper(), w, count=1))
    return " ".join(out).replace("C. h.", "C. H.")


def short_date(text: str) -> str:
    """'Jan 8, 1871': the day it was preached (after 'delivered' when a line also gives a reading date)."""
    at = re.search(r"deliver|preach", text, re.I)
    m = DATE.search(text, at.start() if at else 0) or DATE.search(text)
    if not m:
        y = re.search(r"\b(1[89]\d\d)\b", text)
        return y.group(1) if y else ""
    return f"{m.group(1)[:3].title()} {int(m.group(2))}, {m.group(3)}"


def refs_of(body: str) -> list:
    out = []
    for m in re.finditer(r'<scripCom[^>]*osisRef="([^"]*)"', body):
        for one in m.group(1).split():
            r = osis_attr_to_compact(one)
            if r and r not in out:
                out.append(r)
    return out


def num(no: str) -> int:
    return int(re.sub(r"\D", "", no))


def sermon(no: str, title: str, body: str):
    refs = refs_of(body)
    body = re.sub(r"<scripCom[^>]*/>", "", body)
    body = re.sub(r"<p[^>]*/>", "", body)  # empty paragraphs
    body = re.sub(r"<h1[^>]*>.*?</h1>", "", body, flags=re.S)
    body = re.sub(r"<h2[^>]*>(.*?)</h2>", r"<h4>\1</h4>", body, flags=re.S)
    body = re.sub(r"<h3[^>]*>(.*?)</h3>", r"<h4>\1</h4>", body, flags=re.S)
    body = re.sub(r"<a [^>]*>(.*?)</a>", r"\1", body, flags=re.S)  # links to other sites
    body = re.sub(r"<(l|verse)\b[^>]*>", "", body)
    body = re.sub(r"</l>", "<br>", body)
    body = re.sub(r"</verse>", "", body)
    body = re.sub(r"<blockquote[^>]*>(.*?)</blockquote>", r"<p><i>\1</i></p>", body, flags=re.S)
    # the heading lines ("A Sermon", "(No. 969)", "Delivered on ...", "At the Metropolitan Tabernacle"): kept as
    # the sermon's date and place, taken out of the text
    paras = re.findall(r"<p\b[^>]*>.*?</p>|<h4>.*?</h4>", body, flags=re.S)
    head, start = [], 0
    for i, p in enumerate(paras):
        t = plain(p)
        if not t:
            start = i + 1
            continue
        if p.startswith("<h4>") and len(t) < 200:  # the title, printed again
            start = i + 1
            continue
        if re.sub(r"\W", "", t).lower() == re.sub(r"\W", "", html.unescape(title)).lower():  # the title as a line
            start = i + 1
            continue
        if "osisRef" not in p and ((len(t) < 260 and HEADER.match(t)) or (len(t) < 70 and t.isupper()) or t.lower().startswith("together with")):
            head.append(t)
            start = i + 1
            continue
        break
    head_text = " ".join(head)
    m = re.search(r"\(?no\.\s*([\d,]+)\)?", head_text, re.I)
    if m and int(m.group(1).replace(",", "")) != num(no):
        log(f"    note: sermon {no} says No. {m.group(1)}")
    where = re.sub(r"\(?no\.\s*[\d,]+[AB]?\)?", "", head_text, flags=re.I).strip()
    where = re.sub(r"^a sermon\b\s*", "", where, flags=re.I)
    where = re.sub(r",?\s*\bby\b(\s+the)?(\s+rev\.?)?\s*c\.\s*h\.\s*spurgeon\s*,?", ", ", where, flags=re.I)
    where = re.sub(r"\s+,", ",", re.sub(r"(,\s*)+,", ",", where)).strip(" ,.")
    where = nice_case(where)
    where = re.sub(r"^(delivered|preached),\s*", r"\1 ", where, flags=re.I)
    where = re.sub(r"([.,]\s*(?:delivered|preached)),\s*", r"\1 ", where, flags=re.I)
    where = re.sub(r"\s+", " ", where)
    where = re.sub(r", At (the|New|Exeter|Surrey)\b", r", at \1", where)
    where = where[:1].upper() + where[1:]
    h = markup_to_html("".join(paras[start:]))
    if not refs:  # a sermon on no single text: its first reference
        f = re.search(r'data-r="([^"]+)"', h)
        refs = [f.group(1)] if f else []
    return {"t": html.unescape(title).strip(), "d": where, "y": short_date(head_text), "r": refs, "h": h}


def chapters_of(ref: str, vcount: dict):
    """'MAT.11.28-30' -> [(MAT, 11, 28, 30)]; 'PSA.23' -> whole chapter; ranges across chapters split by chapter."""
    a, _, b = ref.partition("-")
    pa = a.split(".")
    code = pa[0]
    if code not in vcount or len(pa) < 2:
        return []
    c1 = int(pa[1])
    if c1 < 1 or c1 > len(vcount[code]):
        return []
    v1 = int(pa[2]) if len(pa) > 2 else 1
    if not b:
        return [(code, c1, v1, v1 if len(pa) > 2 else vcount[code][c1 - 1])]
    pb = b.split(".")
    if len(pb) == 3:  # MAT.5.1-MAT.7.29
        c2, v2 = int(pb[1]), int(pb[2])
    elif len(pb) == 2 and not pb[0].isdigit():  # PSA.1-PSA.2
        c2, v2 = int(pb[1]), vcount[code][min(int(pb[1]), len(vcount[code])) - 1]
    else:
        c2, v2 = c1, int(pb[-1])
    out = []
    for c in range(c1, min(c2, len(vcount[code])) + 1):
        last = vcount[code][c - 1]
        out.append((code, c, v1 if c == c1 else 1, min(v2, last) if c == c2 else last))
    return out


def main():
    log("== Spurgeon's sermons")
    vcount = {b["id"]: b["v"] for b in load_books()}
    sermons = {}
    for v in range(1, VOLUMES + 1):
        x = get(v)
        n0 = len(sermons)
        for m in re.finditer(r'<div1\b[^>]*?\btitle="Sermon\s+([\d,]+[AB]?)\.?\s*([^"]*)"[^>]*>(.*?)</div1>', x, flags=re.S):
            no = m.group(1).replace(",", "")  # "1451A", "1451B": two sermons printed under one number
            if no in sermons:
                log(f"    note: sermon {no} appears twice (volume {v}); the first is kept")
                continue
            sermons[no] = sermon(no, m.group(2), m.group(3))
            sermons[no]["v"] = v
        log(f"  volume {v}: {len(sermons) - n0} sermons")
    out_dir = os.path.join(OUT, "sermons")
    shutil.rmtree(out_dir, ignore_errors=True)
    by_book = defaultdict(lambda: defaultdict(list))
    bundles = defaultdict(dict)
    total = 0
    for no in sorted(sermons, key=lambda n: (num(n), n)):
        s = sermons[no]
        for r in s["r"]:
            for code, c, a, z in chapters_of(r, vcount):
                by_book[code][str(c)].append([a, z, no, s["t"], s["y"]])
        bundles[num(no) // BUNDLE][no] = {"t": s["t"], "d": s["d"], "r": s["r"], "v": s["v"], "h": s["h"]}
    for code in CODES:
        if code in by_book:
            chs = {c: sorted(lst, key=lambda e: (e[0], e[1], e[2])) for c, lst in sorted(by_book[code].items(), key=lambda kv: int(kv[0]))}
            total += write_json(f"sermons/books/{code}.json", chs)
    for k, b in bundles.items():
        total += write_json(f"sermons/text/{k}.json", b)
    no_text = [no for no, s in sermons.items() if not s["r"]]
    write_json("sermons/index.json", {"count": len(sermons), "bundle": BUNDLE, "volumes": VOLUMES, "books": sorted(by_book, key=CODES.index),
                                      "source": "The New Park Street and Metropolitan Tabernacle Pulpit, from the Christian Classics Ethereal Library (ccel.org)"})
    log(f"  {len(sermons)} sermons ({len(no_text)} without a text), {len(by_book)} books, {len(bundles)} files, {total / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
