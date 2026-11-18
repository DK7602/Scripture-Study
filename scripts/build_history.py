#!/usr/bin/env python3
"""Build Scripture Study's church-history reference data (creeds, councils, catechisms, fathers).

Downloads public-domain sources into .cache/history/ (git-ignored) and writes compact JSON into
public/data/history/.  Self-contained: Python 3.11+ standard library only (uses tomllib/sqlite3).

Run:  python3 scripts/build_history.py

Sources
  * Creeds, confessions, catechisms: github.com/NonlinearFruit/Creeds.json (raw files).  The repo is
    Unlicense except eight texts it lists as copyrighted; those are skipped (see COPYRIGHTED_CREEDS).
    Texts that Creeds.json has in a modern (copyrighted or unverifiable) English translation are replaced
    from Schaff, Creeds of Christendom (CCEL ThML, public domain): Heidelberg, Belgic and Second Helvetic
    (vol. 3), Apostles', Nicene, Chalcedonian and Ignatius (vol. 2); see SCHAFF_REPLACEMENTS.  Where no
    public-domain English exists the document is dropped (DROPPED_CREEDS), and the Canons of Dort keep
    only the articles (the Rejection of Errors is not in Schaff's English).  Every doc has a "source".
  * The Thirty-Nine Articles: Schaff, Creeds of Christendom vol. 3 (CCEL ThML, public domain).
  * Ecumenical councils: Percival (ed.), The Seven Ecumenical Councils, NPNF series 2 vol. 14 (1900),
    CCEL ThML (public domain).  Only the creeds/definitions/decrees and canons are kept; editors'
    notes, excursuses and the "Ancient Epitome" summaries are dropped.
  * Church fathers: github.com/HistoricalChristianFaith/Commentaries-Database (public-domain
    dedication for its public-domain excerpts; the rest are fair-use excerpts).  Downloaded as the repo
    archive (TOML) when GitHub allows it, otherwise as the project's compiled SQLite release.  Kept:
    comments that cite a public-domain online text (ANF/NPNF, CCEL, New Advent, Roger Pearse, the
    project's Writings-Database), minus works whose title page shows a modern copyrighted translation
    (COPYRIGHTED_WORKS, Aquinas outside the Catena Aurea), minus modern authors, and minus
    anthology-style (ALL-CAPS) citations whose wording is not found verbatim in the text they cite.
    Many Writings-Database texts are the project's own (partly machine-made) translations from Migne.
    If everything does not fit in TOTAL_BUDGET_MB, the longest comments are trimmed (at a sentence
    boundary, marked "[…]") to the largest common length that fits.

Output (public/data/history/)
  index.json                      {"docs": [...], "fathers": [...]}
  docs/<id>.json                  one creed / council / confession / catechism with its sections
  fathers/<BOOK>.json             {"15:4": [{"f", "t", "s", "v2"?, "c2"?}], ...}
  fathers/authors/<id>.json       ["JHN.15.4", "JHN.15.5-7", ...]
"""
import html
import json
import os
import re
import shutil
import sqlite3
import sys
import tomllib
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CACHE = os.path.join(ROOT, ".cache", "history")
OUT = os.path.join(ROOT, "public", "data", "history")
BOOKS_JSON = os.path.join(ROOT, "public", "data", "books.json")

TOTAL_BUDGET_MB = 59.0      # keep public/data/history under ~60 MB
INCLUDE_ERAS = ("patristic", "medieval", "reformation", "modern")   # drop eras here to give the rest more room
MAX_COMMENT_CHARS = 4000    # never keep more than this per comment
MIN_COMMENT_CHARS = 400     # never trim below this, even if the budget is exceeded

CREEDS_RAW = "https://raw.githubusercontent.com/NonlinearFruit/Creeds.json/master/"
NPNF214_URL = "https://www.ccel.org/ccel/schaff/npnf214.xml"
CREEDS3_URL = "https://www.ccel.org/ccel/schaff/creeds3.xml"
FATHERS_ZIP_URLS = [
    "https://codeload.github.com/HistoricalChristianFaith/Commentaries-Database/zip/refs/heads/master",
    "https://github.com/HistoricalChristianFaith/Commentaries-Database/archive/refs/heads/master.zip",
]
FATHERS_SQLITE_URLS = [
    # compiled release of the same repository (compile_data.py), and the project's own deployment of it
    "https://github.com/HistoricalChristianFaith/Commentaries-Database/releases/download/latest/commentaries.sqlite",
    "https://historicalchristian.faith/data.sqlite",
]


def log(*a):
    print(*a, flush=True)


# ---------------------------------------------------------------------------------------------
# Downloads
# ---------------------------------------------------------------------------------------------
def fetch(url, name, quiet_fail=False, verbose=True):
    """Download url into .cache/history/<name> once; return the path (None if quiet_fail and it fails)."""
    path = os.path.join(CACHE, name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if os.path.exists(path):
        return path
    if verbose:
        log("  downloading", url)
    req = urllib.request.Request(url, headers={"User-Agent": "ScriptureStudy-databuild/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=600) as r, open(path + ".part", "wb") as f:
            shutil.copyfileobj(r, f, 1 << 20)
    except (urllib.error.URLError, OSError) as e:
        if os.path.exists(path + ".part"):
            os.remove(path + ".part")
        if quiet_fail:
            if verbose:
                log("    failed:", e)
            return None
        raise
    os.replace(path + ".part", path)
    return path


def write_json(rel, obj):
    path = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    return os.path.getsize(path)


# ---------------------------------------------------------------------------------------------
# Bible books and references
# ---------------------------------------------------------------------------------------------
# (usfm, osis, full name, other spellings/abbreviations without any leading number)
BOOKS = [
    ("GEN", "Gen", "Genesis", ["ge", "gn", "gen"]),
    ("EXO", "Exod", "Exodus", ["ex", "exo", "exod"]),
    ("LEV", "Lev", "Leviticus", ["le", "lv", "lev"]),
    ("NUM", "Num", "Numbers", ["nu", "nm", "num", "numb"]),
    ("DEU", "Deut", "Deuteronomy", ["de", "dt", "deu", "deut", "dent"]),
    ("JOS", "Josh", "Joshua", ["jos", "josh"]),
    ("JDG", "Judg", "Judges", ["jdg", "judg", "jg"]),
    ("RUT", "Ruth", "Ruth", ["ru", "rth"]),
    ("1SA", "1Sam", "1 Samuel", ["sa", "sam", "sm", "kingdoms"]),
    ("2SA", "2Sam", "2 Samuel", ["sa", "sam", "sm"]),
    ("1KI", "1Kgs", "1 Kings", ["ki", "kgs", "kin", "kings"]),
    ("2KI", "2Kgs", "2 Kings", ["ki", "kgs", "kin", "kings"]),
    ("1CH", "1Chr", "1 Chronicles", ["ch", "chr", "chron", "chronicles"]),
    ("2CH", "2Chr", "2 Chronicles", ["ch", "chr", "chron", "chronicles"]),
    ("EZR", "Ezra", "Ezra", ["ezr"]),
    ("NEH", "Neh", "Nehemiah", ["ne", "neh"]),
    ("EST", "Esth", "Esther", ["es", "est", "esth"]),
    ("JOB", "Job", "Job", ["jb"]),
    ("PSA", "Ps", "Psalms", ["ps", "psa", "psalm", "pss"]),
    ("PRO", "Prov", "Proverbs", ["pr", "pro", "prov", "pv"]),
    ("ECC", "Eccl", "Ecclesiastes", ["ec", "ecc", "eccl", "eccles", "qoh"]),
    ("SNG", "Song", "Song of Solomon", ["song", "sos", "cant", "canticles", "song of songs"]),
    ("ISA", "Isa", "Isaiah", ["is", "isa", "isai"]),
    ("JER", "Jer", "Jeremiah", ["je", "jer", "jr", "jerem"]),
    ("LAM", "Lam", "Lamentations", ["la", "lam"]),
    ("EZK", "Ezek", "Ezekiel", ["eze", "ezek", "ezk"]),
    ("DAN", "Dan", "Daniel", ["da", "dan", "dn"]),
    ("HOS", "Hos", "Hosea", ["ho", "hos"]),
    ("JOL", "Joel", "Joel", ["jl", "joe"]),
    ("AMO", "Amos", "Amos", ["am", "amo"]),
    ("OBA", "Obad", "Obadiah", ["ob", "oba", "obad"]),
    ("JON", "Jonah", "Jonah", ["jon", "jnh"]),
    ("MIC", "Mic", "Micah", ["mi", "mic"]),
    ("NAM", "Nah", "Nahum", ["na", "nah"]),
    ("HAB", "Hab", "Habakkuk", ["hab"]),
    ("ZEP", "Zeph", "Zephaniah", ["zep", "zeph", "zph"]),
    ("HAG", "Hag", "Haggai", ["hag", "hg"]),
    ("ZEC", "Zech", "Zechariah", ["zec", "zech", "zch"]),
    ("MAL", "Mal", "Malachi", ["mal", "ml"]),
    ("MAT", "Matt", "Matthew", ["mt", "mat", "matt"]),
    ("MRK", "Mark", "Mark", ["mk", "mr", "mar", "mrk"]),
    ("LUK", "Luke", "Luke", ["lk", "lu", "luk"]),
    ("JHN", "John", "John", ["jn", "joh", "jhn"]),
    ("ACT", "Acts", "Acts", ["ac", "act"]),
    ("ROM", "Rom", "Romans", ["ro", "rm", "rom"]),
    ("1CO", "1Cor", "1 Corinthians", ["co", "cor"]),
    ("2CO", "2Cor", "2 Corinthians", ["co", "cor"]),
    ("GAL", "Gal", "Galatians", ["ga", "gal"]),
    ("EPH", "Eph", "Ephesians", ["ep", "eph"]),
    ("PHP", "Phil", "Philippians", ["php", "phil", "philip", "phi"]),
    ("COL", "Col", "Colossians", ["col"]),
    ("1TH", "1Thess", "1 Thessalonians", ["th", "thes", "thess"]),
    ("2TH", "2Thess", "2 Thessalonians", ["th", "thes", "thess"]),
    ("1TI", "1Tim", "1 Timothy", ["ti", "tim"]),
    ("2TI", "2Tim", "2 Timothy", ["ti", "tim"]),
    ("TIT", "Titus", "Titus", ["tit"]),
    ("PHM", "Phlm", "Philemon", ["phm", "phlm", "philem"]),
    ("HEB", "Heb", "Hebrews", ["heb"]),
    ("JAS", "Jas", "James", ["jas", "jam", "jm"]),
    ("1PE", "1Pet", "1 Peter", ["pe", "pet", "pt", "peter"]),
    ("2PE", "2Pet", "2 Peter", ["pe", "pet", "pt", "peter"]),
    ("1JN", "1John", "1 John", ["jn", "jo", "joh", "john"]),
    ("2JN", "2John", "2 John", ["jn", "jo", "joh", "john"]),
    ("3JN", "3John", "3 John", ["jn", "jo", "joh", "john"]),
    ("JUD", "Jude", "Jude", ["jud", "jude"]),
    ("REV", "Rev", "Revelation", ["re", "rev", "rv", "apoc", "apocalypse", "revelations"]),
]
CODES = [b[0] for b in BOOKS]
BOOK_INDEX = {c: i for i, c in enumerate(CODES)}
ROMAN_PREFIX = {"1": "i", "2": "ii", "3": "iii"}


def _norm_book(s):
    return re.sub(r"\s+", " ", s.replace(".", " ").strip().lower())


ALIASES = {}
for _code, _osis, _name, _abbrs in BOOKS:
    _m = re.match(r"([123]) (.*)", _name)
    if _m:
        _num, _base = _m.groups()
        for _b in [_base] + _abbrs:
            for _p in (_num, ROMAN_PREFIX[_num], {"1": "first", "2": "second", "3": "third"}[_num]):
                ALIASES[_norm_book(f"{_p} {_b}")] = _code
                ALIASES[_norm_book(f"{_p}{_b}")] = _code
    else:
        for _b in [_name] + _abbrs:
            ALIASES[_norm_book(_b)] = _code
    ALIASES[_norm_book(_osis)] = _code
    ALIASES[_code.lower()] = _code
# Commentaries-Database book folder names ("1corinthians", "songofsolomon", ...)
for _code, _osis, _name, _abbrs in BOOKS:
    ALIASES[_name.lower().replace(" ", "")] = _code


def book_code(name):
    return ALIASES.get(_norm_book(name)) if name else None


def load_verse_counts():
    with open(BOOKS_JSON, encoding="utf-8") as f:
        return {b["id"]: b["v"] for b in json.load(f)}


VERSES = load_verse_counts()


def make_ref(code, c1, v1=None, c2=None, v2=None):
    """Validated reference string (JHN.3.16 / ROM.8.28-30 / GEN.1.1-2.3) or None.

    v1=None means the whole chapter (or chapters through c2)."""
    vc = VERSES.get(code)
    if not vc or not c1 or c1 < 1 or c1 > len(vc):
        return None
    whole = v1 is None
    if whole:
        v1 = 1
    if v1 < 1 or v1 > vc[c1 - 1]:
        return None
    if c2 is None:
        c2 = c1
    c2 = max(c1, min(c2, len(vc)))
    if v2 is None:
        v2 = vc[c2 - 1] if whole else (v1 if c2 == c1 else 1)
    v2 = max(1, min(v2, vc[c2 - 1]))
    if (c2, v2) < (c1, v1):
        c2, v2 = c1, v1
    if c2 == c1:
        return f"{code}.{c1}.{v1}" if v2 == v1 else f"{code}.{c1}.{v1}-{v2}"
    return f"{code}.{c1}.{v1}-{c2}.{v2}"


def ref_sort_key(ref):
    m = re.match(r"([1-3A-Z]{3})\.(\d+)\.(\d+)", ref)
    return (BOOK_INDEX.get(m.group(1), 99), int(m.group(2)), int(m.group(3)), ref)


OSIS_RE = re.compile(
    r"^([1-3]?[A-Za-z]+)\.(\d+)(?:\.(\d+))?(?:-(?:([1-3]?[A-Za-z]+)\.)?(\d+)(?:\.(\d+))?)?$")


def osis_refs(s):
    """'Rom.8.28', 'Ps.19.1-Ps.19.3', 'Rom.5.12,Rom.5.18-Rom.5.19', 'Ps.110', 'Job.38-Job.39'."""
    out = []
    s = (s or "").strip()
    if ":" in s or re.search(r"[A-Za-z]\s+\d", s):
        return text_refs(s)                 # free text such as "Rom. 5:12, 15 ff."
    for part in re.split(r"[,;]\s*", s):
        part = part.strip()
        if not part:
            continue
        m = OSIS_RE.match(part)
        if not m:
            out += text_refs(part)
            continue
        b1, c1, v1, b2, x, y = m.groups()
        code = book_code(b1)
        if not code or (b2 and book_code(b2) != code):
            continue
        c1, v1 = int(c1), int(v1) if v1 else None
        c2 = v2 = None
        if x:
            if y:                       # ...-Book.C.V or ...-C.V
                c2, v2 = int(x), int(y)
            elif v1 is None or b2:      # chapter range (Job.38-Job.39 / Ps.1-2)
                c2 = int(x)
            else:                       # Gen.1.1-3
                c2, v2 = c1, int(x)
        r = make_ref(code, c1, v1, c2, v2)
        if r:
            out.append(r)
    return out


TEXT_REF_RE = re.compile(
    r"(?<![A-Za-z])((?:[1-3]|I{1,3})\s?)?([A-Z][a-z]+)\.?((?:\s+of\s+(?:Solomon|Songs)))?\s*(\d{1,3})\s*:\s*(\d{1,3})")
CONT_RE = re.compile(r"\s*(?:f{1,2}\.|sqq?\.)?\s*([,;])\s*(?:(\d{1,3})\s*:\s*)?(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?")
RANGE_RE = re.compile(r"\s*[-–]\s*(\d{1,3})(?:\s*:\s*(\d{1,3}))?")


ROMAN_REF_RE = re.compile(r"(?<![A-Za-z])((?:[1-3]|I{1,3})\s?)?([A-Z][a-z]+)\.?\s+([ivxlc]{1,7})\.\s*(\d{1,3})\b")


def text_refs(s):
    """Free-text references: 'Rom. 5:12, 15 ff., 23', 'I Cor. 15:21 f.', '1 Chron. 16:28, 29', 'Psalm 100:3',
    and the 19th-century style with a Roman chapter number, 'Rev. xxii. 18, 19'."""
    s = ROMAN_REF_RE.sub(lambda m: f"{m.group(1) or ''}{m.group(2)} {roman_to_int(m.group(3))}:{m.group(4)}"
                         if book_code((m.group(1) or "") + m.group(2)) else m.group(0), s or "")
    spans = []          # [code, c1, v1, c2, v2]

    def add(code, c1, v1, c2, v2):
        p = spans[-1] if spans else None
        if p and p[0] == code and p[3] == c1 == c2 and v1 == p[4] + 1:
            p[4] = v2                                   # "Luke 7:41, 42" -> LUK.7.41-42
        else:
            spans.append([code, c1, v1, c2, v2])

    for m in TEXT_REF_RE.finditer(s or ""):
        prefix, word, of, c, v = m.groups()
        code = book_code((prefix or "") + word + (of or ""))
        if not code:
            continue
        c, v = int(c), int(v)
        pos = m.end()
        r = RANGE_RE.match(s, pos)
        if r:
            if r.group(2):
                add(code, c, v, int(r.group(1)), int(r.group(2)))
                c = int(r.group(1))
            else:
                add(code, c, v, c, int(r.group(1)))
            pos = r.end()
        else:
            add(code, c, v, c, v)
        while True:
            k = CONT_RE.match(s, pos)
            if not k:
                break
            rest = s[k.end():k.end() + 12]
            # "John 3:16, 1 John 4:9": a number followed by a word that is not f./ff. starts a new ref
            if re.match(r"\s*(?!f{1,2}\.)(?![a-z]{1,3}\b)[A-Za-z]{2,}", rest) and not k.group(2):
                break
            if re.match(r"\s*[A-Z][a-z]+\.?\s*\d", rest):
                break
            if k.group(2):
                c = int(k.group(2))
            v = int(k.group(3))
            add(code, c, v, c, int(k.group(4)) if k.group(4) else v)
            pos = k.end()
    return [r for r in (make_ref(*sp) for sp in spans) if r]


def dedupe(seq):
    seen, out = set(), []
    for x in seq:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out


# ---------------------------------------------------------------------------------------------
# Text helpers
# ---------------------------------------------------------------------------------------------
HTML_TAG_RE = re.compile(
    r"</?(?:p|br|i|b|em|strong|span|div|sup|sub|a|font|u|small|big|blockquote|h[1-6]|ul|ol|li|center|hr)\b[^>]*>",
    re.I)


def clean_text(s):
    """Plain text with paragraphs separated by a blank line."""
    if not s:
        return ""
    s = html.unescape(s.replace("\r", ""))
    s = re.sub(r"<br\s*/?>", "\n", s, flags=re.I)
    s = re.sub(r"</p\s*>", "\n", s, flags=re.I)
    s = HTML_TAG_RE.sub("", s)
    s = s.replace(" ", " ").replace("​", "")
    paras = [re.sub(r"[ \t\f\v]+", " ", p).strip() for p in re.split(r"\n+", s)]
    return "\n\n".join(p for p in paras if p)


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def roman_to_int(s):
    vals = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100}
    s = s.upper()
    if not s or any(ch not in vals for ch in s):
        return None
    total = 0
    for i, ch in enumerate(s):
        v = vals[ch]
        total += -v if i + 1 < len(s) and vals[s[i + 1]] > v else v
    return total


def num_label(s):
    """'IV' -> '4', '12' -> '12', 'A1' -> 'A1'."""
    s = str(s).strip()
    r = roman_to_int(s)
    return str(r) if r else s


def short_intro(s, limit=700):
    s = clean_text(s or "").replace("\n\n", " ")
    if len(s) <= limit:
        return s
    cut = s[:limit]
    end = max(cut.rfind(". "), cut.rfind("? "), cut.rfind("! "))
    return (cut[:end + 1] if end > limit * 0.5 else cut.rsplit(" ", 1)[0] + " …").strip()


def trim(text, cap):
    """Trim a comment to about cap characters at a sentence (or word) boundary."""
    if len(text) <= cap:
        return text
    cut = text[:cap]
    best = -1
    for m in re.finditer(r"[.!?;][\"'”’)\]]*(?=\s)", cut):
        best = m.end()
    if best < cap * 0.6:
        best = cut.rfind(" ")
        if best < cap * 0.6:
            best = cap
    return cut[:best].rstrip() + " […]"


# ---------------------------------------------------------------------------------------------
# 1. Creeds, confessions and catechisms (Creeds.json)
# ---------------------------------------------------------------------------------------------
# Listed in the repo README as under copyright; not redistributed.
COPYRIGHTED_CREEDS = {
    "chicago_statement_on_biblical_inerrancy", "christ_hymn_of_colossians", "christ_hymn_of_philippians",
    "christian_shema", "confession_of_peter", "helvetic_consensus", "savoy_declaration", "shema_yisrael",
}
CREED_IDS = {
    "heidelberg_catechism": "heidelberg", "belgic_confession_of_faith": "belgic-confession",
    "westminster_confession_of_faith": "westminster-confession",
    "westminster_larger_catechism": "westminster-larger-catechism",
    "westminster_shorter_catechism": "westminster-shorter-catechism",
    "london_baptist_1689": "london-baptist-1689", "1695_baptist_catechism": "baptist-catechism-1695",
    "keachs_catechism": "keachs-catechism", "gregorys_declaration_of_faith": "gregory-thaumaturgus-declaration",
    "matthew_henrys_scripture_catechism": "matthew-henry-scripture-catechism",
    "exposition_of_the_assemblies_catechism": "flavel-exposition-of-the-assemblies-catechism",
    "shorter_catechism_explained": "fisher-shorter-catechism-explained",
}
CREED_TRADITION = {
    "apostles_creed": "Ecumenical", "nicene_creed": "Ecumenical", "athanasian_creed": "Ecumenical",
    "chalcedonian_definition": "Ecumenical",
    "gregorys_declaration_of_faith": "Early Church", "ignatius_creed": "Early Church",
    "irenaeus_rule_of_faith": "Early Church", "tertullians_rule_of_faith": "Early Church",
    "council_of_orange": "Early Church", "waldensian_confession": "Waldensian",
    "london_baptist_1689": "Baptist", "1695_baptist_catechism": "Baptist", "keachs_catechism": "Baptist",
    "puritan_catechism": "Baptist", "abstract_of_principles": "Baptist",
    "westminster_confession_of_faith": "Presbyterian", "westminster_larger_catechism": "Presbyterian",
    "westminster_shorter_catechism": "Presbyterian", "scots_confession": "Presbyterian",
    "shorter_catechism_explained": "Presbyterian", "exposition_of_the_assemblies_catechism": "Presbyterian",
    "matthew_henrys_scripture_catechism": "Presbyterian", "catechism_for_young_children": "Presbyterian",
}
CREED_AUTHOR = {
    "heidelberg_catechism": "Zacharias Ursinus & Caspar Olevianus",
    "nicene_creed": "Councils of Nicaea (325) and Constantinople (381)",
    "apostles_creed": "Western baptismal creed (traditional)",
    "athanasian_creed": "Traditionally attributed to Athanasius",
    "london_baptist_1689": "Particular Baptist churches of London",
    "council_of_orange": "Caesarius of Arles et al.",
    "keachs_catechism": "Benjamin Keach & William Collins",
    "1695_baptist_catechism": "William Collins (attr. Benjamin Keach)",
    "french_confession_of_faith": "John Calvin & Antoine de la Roche Chandieu",
    "belgic_confession_of_faith": "Guido de Brès",
    "waldensian_confession": "Waldensian churches",
}
CREED_YEAR = {
    "apostles_creed": "c. 710", "athanasian_creed": "c. 500", "london_baptist_1689": "1677/1689",
    "keachs_catechism": "1693", "canons_of_dort": "1619",
}
DORT_HEADS = ["1", "2", "3/4", "5"]
SCHAFF2 = "Schaff, Creeds of Christendom vol. 2 (1877)"
SCHAFF3 = "Schaff, Creeds of Christendom vol. 3 (1877)"
CREED_SOURCE = {   # default: "Creeds.json (public domain)"
    "tetrapolitan_confession": "Creeds.json (public domain; H. E. Jacobs' translation, Book of Concord vol. 2, 1883)",
    "zwinglis_67_articles": "Creeds.json (public domain; S. M. Jackson's translation, 1901)",
    "consensus_tigurinus": "Creeds.json (public domain; H. Beveridge's translation, 1849)",
    "first_helvetic_confession": "Creeds.json (public domain; George Wishart's translation, c. 1537)",
    "zwinglis_fidei_ratio": "Creeds.json (public domain; Thomas Cotsforde's translation, 1555)",
    "french_confession_of_faith": "Creeds.json (public domain; Emily O. Butler's translation as in Schaff vol. 3)",
    "canons_of_dort": "Creeds.json (public domain; the Reformed Church in America text as in Schaff vol. 3, 1877)",
    "athanasian_creed": "Creeds.json (public domain; the Book of Common Prayer text, as in Schaff vol. 2)",
    "irenaeus_rule_of_faith": "Creeds.json (public domain; Ante-Nicene Fathers translation)",
    "tertullians_rule_of_faith": "Creeds.json (public domain; Ante-Nicene Fathers translation)",
    "gregorys_declaration_of_faith": "Creeds.json (public domain; Ante-Nicene Fathers translation)",
    "ten_theses_of_berne": "Creeds.json (public domain; Schaff, History of the Christian Church vol. 8, 1910)",
}
# Creeds.json texts in a 20th-century translation for which no public-domain English text was found.
DROPPED_CREEDS = {
    "first_confession_of_basel": "modern translation; Schaff gives no English text and none in the public domain was found",
    "council_of_orange": "modern translation (Leith, Creeds of the Churches); Hefele's 1895 English gives only summaries",
}


def join_names(names):
    names = [n.strip() for n in names or [] if n and n.strip()]
    if not names:
        return ""
    if len(names) > 3:
        return names[0] + " et al."
    return names[0] if len(names) == 1 else ", ".join(names[:-1]) + " & " + names[-1]


def nice_title(t):
    t = (t or "").strip()
    t = re.sub(r"^[IVXLC]+\.\s+", "", t)                       # "I. The Scriptures"
    if re.fullmatch(r"(Article|Canon|Chapter)\s+[IVXLC\d]+\.?", t, re.I):
        return ""
    if t.isupper() and len(t) > 3:
        t = re.sub(r"[A-Za-z']+", lambda m: m.group(0).capitalize(), t.lower())
        t = re.sub(r"\b(Of|The|And|In|To|For|A|An|On|By|With|From|Our|Its)\b",
                   lambda m: m.group(0).lower() if m.start() else m.group(0), t)
        t = t[0].upper() + t[1:]
    return t


def proofs_refs(item):
    refs = []
    for p in item.get("Proofs") or []:
        for r in p.get("References") or []:
            refs += osis_refs(r)
    return dedupe(refs)


def creed_doc(key, d):
    meta, data = d["Metadata"], d["Data"]
    fmt = meta.get("CreedFormat")
    doc_type = {"Creed": "creed", "Canon": "confession", "Confession": "confession",
                "Catechism": "catechism", "HenrysCatechism": "catechism"}.get(fmt, "confession")
    if key == "council_of_orange":
        doc_type = "council"
    sections = []
    if fmt == "Creed":
        sections.append({"n": "", "text": clean_text(data.get("Content")), "refs": proofs_refs(data)})
    elif fmt == "Canon":
        for a in data:
            title = (a.get("Title") or "").strip()
            if re.fullmatch(r"Canon \d+", title):
                n, title = title, ""
            else:
                n, title = f"Article {num_label(a.get('Article'))}", nice_title(title)
                if title.lower() == "introduction":
                    n = ""
            sections.append({"n": n, "title": title, "text": clean_text(a.get("Content")), "refs": proofs_refs(a)})
    elif fmt == "Confession":
        for ci, ch in enumerate(data):
            head = DORT_HEADS[ci] if key == "canons_of_dort" and ci < len(DORT_HEADS) else str(ch.get("Chapter"))
            for si, s in enumerate(ch.get("Sections") or []):
                sec = str(s.get("Section"))
                if key == "canons_of_dort":
                    if sec.startswith("R"):
                        continue        # Rejection of Errors: not in Schaff's English; translation of unknown date
                    kind = "Article"
                    n = f"Head {head}, {kind} {sec.lstrip('AR')}"
                else:
                    n = f"Chapter {head}.{sec}"
                item = {"n": n}
                if si == 0 and ch.get("Title"):
                    item["title"] = nice_title(ch["Title"])
                item["text"] = clean_text(s.get("Content"))
                item["refs"] = proofs_refs(s)
                sections.append(item)
    elif fmt == "Catechism":
        for q in data:
            sections.append({"n": f"Q. {q.get('Number')}", "q": clean_text(q.get("Question")),
                             "text": clean_text(q.get("Answer")), "refs": proofs_refs(q)})
    elif fmt == "HenrysCatechism":
        for q in data:
            num = str(q.get("Number") or "").strip()
            real = num and num != "?"
            if real:
                ans = clean_text(q.get("Answer"))
                sections.append({"n": f"Q. {num}", "q": clean_text(q.get("Question")), "text": ans,
                                  "refs": dedupe(text_refs(ans))})
            for sq in q.get("SubQuestions") or []:
                ans = clean_text(sq.get("Answer"))
                sn = str(sq.get("Number") or "").strip()
                sections.append({"n": f"Q. {num}.{sn}" if real and sn else "",
                                 "q": clean_text(sq.get("Question")), "text": ans,
                                 "refs": dedupe(text_refs(ans))})
    for s in sections:
        if not s.get("refs"):           # no proof texts: use references cited in the text itself
            s["refs"] = dedupe(text_refs(s.get("text", "")))
        if not s.get("title"):
            s.pop("title", None)
        if not s.get("refs"):
            s.pop("refs", None)
    sections = [s for s in sections if s.get("text") or s.get("q")]

    intro = short_intro(meta.get("OriginStory"))
    attr = meta.get("SourceAttribution") or ""
    m = re.search(r"Translated by (.*)", attr)
    if m:
        intro = (intro + " " if intro else "") + f"Translation: {m.group(1).strip()}."
    alt = [t for t in meta.get("AlternativeTitles") or [] if t and len(t) < 120]
    if alt and not intro:
        intro = "Also known as: " + "; ".join(alt) + "."
    doc = {
        "id": CREED_IDS.get(key, key.replace("_", "-")),
        "title": meta.get("Title", key),
        "type": doc_type,
        "year": CREED_YEAR.get(key, str(meta.get("Year") or "")),
        "author": CREED_AUTHOR.get(key, join_names(meta.get("Authors"))),
        "tradition": CREED_TRADITION.get(key, "Reformed"),
        "source": CREED_SOURCE.get(key, "Creeds.json (public domain)"),
    }
    if intro:
        doc["intro"] = intro
    doc["sections"] = sections
    return doc


def build_creeds():
    log("Creeds.json …")
    readme = open(fetch(CREEDS_RAW + "README.md", "creeds/README.md"), encoding="utf-8").read()
    names = sorted(set(re.findall(r"\(creeds/([A-Za-z0-9_]+)\.json\)", readme)))
    docs, skipped = [], []
    for key in names:
        if key in COPYRIGHTED_CREEDS:
            skipped.append(key)
            continue
        path = fetch(f"{CREEDS_RAW}creeds/{key}.json", f"creeds/{key}.json")
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
        if "copyright" in (d["Metadata"].get("SourceAttribution") or "").lower():
            skipped.append(key)
            continue
        if key in DROPPED_CREEDS:
            log(f"  dropped {key}: {DROPPED_CREEDS[key]}")
            continue
        doc = creed_doc(key, d)
        if key in SCHAFF_REPLACEMENTS:
            doc = SCHAFF_REPLACEMENTS[key](doc)
        docs.append(doc)
    log(f"  {len(docs)} documents, skipped as copyrighted: {', '.join(skipped)}")
    return docs


# ---------------------------------------------------------------------------------------------
# ThML helpers (CCEL)
# ---------------------------------------------------------------------------------------------
def thml_div(src, div_id):
    m = re.search(r'<div(\d)\b[^>]*\bid="%s"[^>]*>' % re.escape(div_id), src)
    if not m:
        raise KeyError(div_id)
    end = src.find(f"</div{m.group(1)}>", m.end())
    return src[m.end():end if end >= 0 else len(src)]


def thml_prep(h):
    h = re.sub(r"<note\b.*?</note>", "", h, flags=re.S)
    return re.sub(r"<pb\b[^>]*/>", "", h)


def thml_text(h):
    h = re.sub(r"<[^>]+>", "", h)
    return re.sub(r"\s+", " ", html.unescape(h)).replace(" ,", ",").strip()


def thml_refs(h):
    refs = []
    for m in re.finditer(r'<scripRef\b[^>]*\bosisRef="([^"]+)"', h):
        for part in m.group(1).split():
            refs += osis_refs(part.removeprefix("Bible:"))
    return refs


def thml_paras(h):
    """[(class, text, refs)] for each <p> of a (note-stripped) ThML fragment."""
    out = []
    for m in re.finditer(r"<p\b([^>]*)>(.*?)</p>", h, flags=re.S):
        cls = re.search(r'class="([^"]*)"', m.group(1))
        out.append((cls.group(1) if cls else "", thml_text(m.group(2)), thml_refs(m.group(2))))
    return out


# ---------------------------------------------------------------------------------------------
# 2. Ecumenical councils (NPNF2-14)
# ---------------------------------------------------------------------------------------------
NOTES_RE = re.compile(r"^(Notes?\b.{0,12}|Ancient Epitome\b.*|Excursus\b.*|Introductory Note\.?)$")
HEADING_RE = re.compile(r"^(?:Canon|Anathematism|Anathema)?\s*([IVXLC]+)\.?$")
NPNF_SOURCE = ("Text: H. R. Percival (ed.), The Seven Ecumenical Councils, Nicene and Post-Nicene Fathers, "
               "series 2, vol. 14 (1900), public domain, via CCEL; editors' notes and excursuses omitted.")

COUNCILS = [
    {"id": "nicaea-i", "title": "First Council of Nicaea", "year": "325",
     "author": "The 318 Fathers (under Emperor Constantine)",
     "intro": "The First Ecumenical Council, called by Emperor Constantine at Nicaea in Bithynia, condemned "
              "the teaching of Arius, confessed the Son to be of one substance (homoousios) with the Father, "
              "and issued twenty canons on church order and discipline.",
     "parts": [("body", "vii.iii", "The Nicene Creed (325)", r"^We believe"),
               ("canons", "vii.vi", "Canon", None)]},
    {"id": "constantinople-i", "title": "First Council of Constantinople", "year": "381",
     "author": "The 150 Fathers (under Emperor Theodosius I)",
     "intro": "The Second Ecumenical Council reaffirmed the faith of Nicaea, confessed the full divinity of the "
              "Holy Spirit against the Macedonians, and is traditionally credited with the expanded "
              "Niceno-Constantinopolitan Creed.",
     "parts": [("body", "ix.iii", "The Creed of the 150 Fathers (Niceno-Constantinopolitan Creed)", r"^We believe"),
               ("canons", "ix.viii", "Canon", None)]},
    {"id": "ephesus", "title": "Council of Ephesus", "year": "431",
     "author": "About 200 bishops (Cyril of Alexandria presiding)",
     "intro": "The Third Ecumenical Council condemned Nestorius, confessed the Virgin Mary as Theotokos "
              "(God-bearer), and received Cyril of Alexandria's letter to Nestorius and his Twelve "
              "Anathematisms as expressions of the orthodox faith.",
     "parts": [("body", "x.v", "The Epistle of Cyril to Nestorius", None),
               ("canons", "x.ix", "Anathematism", None),
               ("body", "x.xi", "Decree against Nestorius", None),
               ("canons", "x.xvi", "Canon", None),
               ("body", "x.xvi.xv", "Definition against the Messalians", None)]},
    {"id": "chalcedon", "title": "Council of Chalcedon", "year": "451",
     "author": "About 520 bishops (under Emperor Marcian)",
     "intro": "The Fourth Ecumenical Council received the Tome of Pope Leo and defined that Christ is one "
              "person in two natures, without confusion, without change, without division, without separation.",
     "parts": [("body", "xi.vii", "The Tome of St. Leo", None),
               ("body", "xi.xiii", "The Definition of Faith", None),
               ("canons", "xi.xviii", "Canon", None)]},
    {"id": "constantinople-ii", "title": "Second Council of Constantinople", "year": "553",
     "author": "Bishops under Emperor Justinian I",
     "intro": "The Fifth Ecumenical Council condemned the Three Chapters (writings of Theodore of Mopsuestia, "
              "Theodoret and Ibas) and issued fourteen anathemas interpreting Chalcedon in a Cyrilline sense.",
     "parts": [("body", "xii.vi", "The Sentence of the Synod", None),
               ("canons", "xii.vii", "Anathema", None)]},
    {"id": "constantinople-iii", "title": "Third Council of Constantinople", "year": "680–681",
     "author": "Bishops under Emperor Constantine IV",
     "intro": "The Sixth Ecumenical Council condemned Monothelitism, defining that Christ has two natural wills "
              "and two natural operations, divine and human, without division or confusion.",
     "parts": [("body", "xiii.x", "The Definition of Faith", None)]},
    {"id": "nicaea-ii", "title": "Second Council of Nicaea", "year": "787",
     "author": "Bishops under Empress Irene and Patriarch Tarasius",
     "intro": "The Seventh Ecumenical Council ended the first period of Iconoclasm, distinguishing the "
              "veneration (proskynesis) given to holy images from the worship (latreia) due to God alone, "
              "and issued twenty-two canons.",
     "parts": [("body", "xvi.xii", "The Decree of the Synod", None),
               ("canons", "xvi.xiv", "Canon", None)]},
]


def is_editorial(text):
    t = text.strip()
    return (t.startswith("(") and t.endswith(")")) or (t.startswith("[") and t.endswith("]"))


def council_body(h, title, start_re):
    """Creed/definition/letter: paragraphs up to the first editors' notes heading."""
    paras = thml_paras(thml_prep(h))
    out, refs, started = [], [], start_re is None
    for i, (cls, text, r) in enumerate(paras):
        if cls == "endnote" or not text:
            continue
        if NOTES_RE.match(text):
            if started:
                break
            continue
        if not started:
            if re.match(start_re, text):
                started = True
            else:
                continue
        elif i == 0 and start_re is None:
            continue                     # the section's own title paragraph
        if is_editorial(text):
            continue
        out.append(text)
        refs += r
    return {"n": "", "title": title, "text": "\n\n".join(out), "refs": dedupe(refs)}


def canon_items(paras, typed):
    """Split paragraphs into [(number, title, text, refs)] (canon headings, then body until notes)."""
    items, cur, state = [], None, "skip"
    for cls, text, r in paras:
        if cls == "endnote" or not text:
            continue
        m = HEADING_RE.match(text)
        if m and len(text) < 20 and (state != "notes" or not typed):
            if typed and cur:
                break                    # one canon per typed <div>; later numerals belong to notes
            cur = {"num": roman_to_int(m.group(1)), "title": "", "text": [], "refs": []}
            items.append(cur)
            state = "head"
            continue
        if cur is None or state in ("skip", "notes"):
            continue
        if NOTES_RE.match(text):
            state = "notes"
            continue
        if state == "head" and (cls == "c50" or (cls == "c35" and re.match(r"(That|Concerning)\b", text)
                                                 and len(text) < 260)):
            cur["title"] = text.rstrip(".")
            state = "body"
            continue
        state = "body"
        if is_editorial(text):
            continue
        cur["text"].append(text)
        cur["refs"] += r
    return items


def council_canons(src, div_id, label):
    h = thml_div(src, div_id)
    level = int(re.search(r'<div(\d)\b[^>]*\bid="%s"' % re.escape(div_id), src).group(1)) + 1
    subs = list(re.finditer(r"<div%d\b([^>]*)>(.*?)</div%d>" % (level, level), h, flags=re.S))
    items = []
    if subs and any('type="Canon"' in s.group(1) or 'type="Anathematism"' in s.group(1) for s in subs):
        for s in subs:
            if not re.search(r'type="(Canon|Anathematism)"', s.group(1)):
                continue
            items += canon_items(thml_paras(thml_prep(s.group(2))), typed=True)
    else:
        items = canon_items(thml_paras(thml_prep(h)), typed=False)
    out = []
    for it in items:
        if not it["text"]:
            continue
        sec = {"n": f"{label} {it['num']}"}
        if it["title"]:
            sec["title"] = it["title"]
        sec["text"] = "\n\n".join(it["text"])
        sec["refs"] = dedupe(it["refs"])
        out.append(sec)
    return out


def build_councils():
    log("Ecumenical councils (NPNF2-14) …")
    src = open(fetch(NPNF214_URL, "npnf214.xml"), encoding="utf-8").read()
    docs = []
    for c in COUNCILS:
        sections = []
        for kind, div_id, title, start in c["parts"]:
            if kind == "body":
                sec = council_body(thml_div(src, div_id), title, start)
                if sec["text"]:
                    sections.append(sec)
            else:
                secs = council_canons(src, div_id, title)
                if secs and label_title(title):
                    secs[0] = {"n": secs[0]["n"], "title": secs[0].get("title") or label_title(title),
                               **{k: v for k, v in secs[0].items() if k not in ("n", "title")}}
                sections += secs
        for s in sections:
            with_refs(s, s.get("refs", []))
        n_canons = sum(1 for s in sections if s["n"])
        log(f"  {c['id']}: {len(sections)} sections ({n_canons} canons/anathemas)")
        docs.append({"id": c["id"], "title": c["title"], "type": "council", "year": c["year"],
                     "author": c["author"], "tradition": "Ecumenical", "source": "NPNF2 vol. 14 (1900)",
                     "intro": c["intro"] + " " + NPNF_SOURCE, "sections": sections})
    return docs


def label_title(label):
    return {"Anathematism": "The Twelve Anathematisms of St. Cyril against Nestorius",
            "Anathema": "The Capitula (Anathemas) of the Council"}.get(label, "")


# ---------------------------------------------------------------------------------------------
# 2b. Public-domain replacements from Schaff, Creeds of Christendom (CCEL ThML)
# ---------------------------------------------------------------------------------------------
CREEDS2_URL = "https://www.ccel.org/ccel/schaff/creeds2.xml"
_THML = {}


def schaff_src(vol):
    if vol not in _THML:
        url, name = (CREEDS2_URL, "creeds2.xml") if vol == 2 else (CREEDS3_URL, "creeds3.xml")
        with open(fetch(url, name), encoding="utf-8") as f:
            _THML[vol] = f.read()
    return _THML[vol]


def thml_rows(h, col):
    """[(kind, text)] for one column of the parallel-text tables: kind is 'center' (a heading),
    'para' (an indented cell, i.e. a new paragraph) or 'cont' (a paragraph continued after a page break)."""
    out = []
    for row in re.finditer(r"<tr\b([^>]*)>(.*?)</tr>", h, flags=re.S):
        cells = re.findall(r"<(t[hd])\b([^>]*)>(.*?)</t[hd]>", row.group(2), flags=re.S)
        if len(cells) <= col:
            continue
        text = thml_text(cells[col][2])
        if not text:
            continue
        style = cells[col][1] + row.group(1)
        kind = "center" if "center" in style else "para" if "indent" in cells[col][1] else "cont"
        out.append((kind, text))
    return out


def add_text(parts, kind, text):
    if kind == "cont" and parts:
        parts[-1] = (parts[-1] + " " + text).strip()
    else:
        parts.append(text)


def with_refs(sec, extra=()):
    refs = dedupe(list(extra) + text_refs(sec.get("text", "")))
    if refs:
        sec["refs"] = refs
    else:
        sec.pop("refs", None)
    return sec


def schaff_heidelberg(old):
    """Heidelberg Catechism, Schaff's English (the American tercentenary translation, 1863).
    Schaff prints no proof texts; the proofs of the previous version are kept (same Q numbering)."""
    rows = thml_rows(thml_prep(thml_div(schaff_src(3), "iv.vi")), 1)
    old_refs = {s["n"]: s.get("refs", []) for s in old["sections"]}
    qs, cur, field, pending = [], None, None, []
    for kind, text in rows:
        if kind == "center":
            m = re.match(r"\(?Question\s*(\d+)\.?", text)
            if m:
                title = " — ".join(nice_title(t.rstrip(".")) for t in pending if not set(t) <= set("—-–"))
                cur = {"num": int(m.group(1)), "title": title, "q": [], "a": []}
                qs.append(cur)
                field, pending = "q", []
            elif re.match(r"Answer\.?$", text):
                field = "a"
            else:
                pending.append(text)
            continue
        if cur is None:
            continue
        if pending and field == "a":         # headings inside an answer (the Ten Commandments in Q. 92)
            for t in pending:
                if not set(t) <= set("—-–"):
                    cur["a"].append(nice_title(t.rstrip(".")) + ".")
            pending = []
        add_text(cur[field], kind, text)
    sections = []
    for q in qs:
        a = "\n\n".join(q["a"]).strip()
        if a.endswith(")") and a.count(")") > a.count("("):
            a = a[:-1].rstrip()                       # Q. 80 is printed in parentheses
        sec = {"n": f"Q. {q['num']}"}
        if q["title"]:
            sec["title"] = q["title"]
        sec["q"] = re.sub(r"\bthon\b", "thou", " ".join(q["q"]).strip())     # OCR slip in the CCEL text
        sec["text"] = re.sub(r"\bthon\b", "thou", a)
        sections.append(with_refs(sec, old_refs.get(sec["n"], [])))
    assert len(sections) == 129, len(sections)
    old.update(source=SCHAFF3, sections=sections,
               intro="Composed at Heidelberg in 1563 at the command of Elector Frederick III of the Palatinate. "
                     "English text: the translation of the American tercentenary edition (1863) as printed by "
                     "Schaff; Scripture proofs from the standard proof-text edition.")
    return old


def schaff_belgic(old):
    """Belgic Confession, Schaff's English (the Reformed Church in America text)."""
    rows = thml_rows(thml_prep(thml_div(schaff_src(3), "iv.viii")), 1)
    old_refs = {s["n"]: s.get("refs", []) for s in old["sections"]}
    arts, cur = [], None
    for kind, text in rows:
        m = re.match(r"Art\.\s*([IVXLC]+)\.?$", text)
        if kind == "center" and m:
            cur = {"num": roman_to_int(m.group(1)), "title": None, "text": []}
            arts.append(cur)
            continue
        if cur is None:
            continue
        if kind == "center" and cur["title"] is None:
            cur["title"] = nice_title(text.rstrip("."))
            continue
        add_text(cur["text"], kind, text)
    sections = []
    for a in arts:
        sec = {"n": f"Article {a['num']}", "title": a["title"] or "", "text": "\n\n".join(a["text"])}
        if not sec["title"]:
            del sec["title"]
        sections.append(with_refs(sec, old_refs.get(sec["n"], [])))
    assert len(sections) == 37, len(sections)
    old.update(source=SCHAFF3, sections=sections,
               intro="Written in French by Guido de Brès in 1561 for the Reformed churches of the Low Countries "
                     "and revised at the Synod of Dort (1619). English text: the version authorized by the "
                     "Reformed (Dutch) Church in America, as printed by Schaff.")
    return old


def schaff_second_helvetic(old):
    """Second Helvetic Confession, the English version Schaff added in his 3rd edition (1882)."""
    h = thml_prep(thml_div(schaff_src(3), "v.ix"))
    chapters, cur = [], None
    for m in re.finditer(r"<p\b([^>]*)>(.*?)</p>", h, flags=re.S):
        text = thml_text(m.group(2))
        head = re.match(r"CHAPTER\s+([IVXLC]+)\.?\s*[—–-]+\s*(.*)", text)
        if head:
            cur = {"num": roman_to_int(head.group(1)), "title": nice_title(head.group(2).rstrip(".")), "paras": []}
            chapters.append(cur)
        elif cur is not None and text:
            cur["paras"].append(text)
    sections = []
    for ch in chapters:
        for i, para in enumerate(ch["paras"], 1):
            sec = {"n": f"Chapter {ch['num']}.{i}"}
            if i == 1:
                sec["title"] = ch["title"]
            sec["text"] = para
            sections.append(with_refs(sec))
    assert len(chapters) == 30, len(chapters)
    old.update(source="Schaff, Creeds of Christendom vol. 3 (3rd ed., 1882)", sections=sections,
               intro="Written by Heinrich Bullinger in 1562 and published in 1566 as the confession of the Swiss "
                     "Reformed churches. English text: the version Schaff added in 1882, partly from the old "
                     "translation in The Harmony of Confessions (1586).")
    return old


def schaff2_english_rows(div_id, start=None, stop=None, col=1):
    h = thml_prep(thml_div(schaff_src(2), div_id))
    if start:
        h = h[h.find(start):]
    if stop and stop in h:
        h = h[:h.find(stop)]
    return [t for k, t in thml_rows(h, col)]


def schaff_simple(old, text, intro, source=SCHAFF2):
    text = re.sub(r"[ \t]+([,;.])", r"\1", text).strip()
    old.update(source=source, intro=intro, sections=[with_refs({"n": "", "text": text}, [])])
    return old


def schaff_apostles(old):
    h = thml_prep(thml_div(schaff_src(2), "iv.i.i"))
    h = h[re.search(r"APOSTLES' CREED\.\s*\((?:<i>)?a(?:</i>)?\)\s*RECEIVED FORM", h).end():]
    paras = [thml_text(m.group(1)) for m in re.finditer(r"<p\b[^>]*>(.*?)</p>", h, flags=re.S)]
    paras = [p for p in paras if p][:3]
    # Schaff marks variant readings in brackets/parentheses: "his only (begotten) Son", "the body [flesh]"
    paras = [re.sub(r"\s*[\[(][^\])]*[\])]", "", p) for p in paras]
    return schaff_simple(old, "\n\n".join(paras),
                         "The baptismal creed of the Western Church, which grew out of the Old Roman Creed of the "
                         "second century and reached its received form by the eighth century. English text: "
                         "the received form as given by Schaff (his bracketed variant readings omitted).")


def schaff_nicene(old):
    rows = schaff2_english_rows("iv.i.ii.ii")        # (b) Forma Recepta Ecclesiae Occidentalis
    assert rows[0].startswith("The Received Text of the Protestant"), rows[:1]
    paras = []
    for t in rows[1:]:                                   # rows[0] is the column heading
        t = t.replace("worlds [God of God]", "worlds, God of God").replace(" [essence]", "")
        t = re.sub(r"[\[\]]", "", t)                    # Schaff's brackets mark the Western additions
        if paras and not paras[-1].endswith("."):
            paras[-1] += " " + t                         # a sentence split across table rows
        else:
            paras.append(t)
    return schaff_simple(old, "\n\n".join(paras),
                         "The creed of the Council of Nicaea (325) as enlarged by the Council of Constantinople "
                         "(381). English text: the received text of the Protestant churches as given by Schaff, "
                         "including the Western additions (\"God of God\", \"and the Son\").")


def schaff_chalcedon(old):
    rows = schaff2_english_rows("iv.i.iii", stop="VERSIO LATINA")
    return schaff_simple(old, " ".join(rows),
                         "The definition of the person of Christ adopted by the Council of Chalcedon on 22 October "
                         "451: one Christ in two natures, without confusion, change, division or separation. "
                         "English text as given by Schaff.")


def schaff_ignatius(old):
    rows = schaff2_english_rows("iii.i.i")
    text = " ".join(rows)
    text = re.sub(r"\s*\[[^\]]*\]", "", text)                     # interpolations of the longer recension
    text = re.sub(r"\s+", " ", text).strip()
    return schaff_simple(old, text,
                         "Not a creed itself but the summary of the gospel facts in Ignatius of Antioch's Epistle "
                         "to the Trallians, ch. 9 (c. 107). English text as given by Schaff (shorter Greek "
                         "recension; his bracketed additions from the longer recension omitted).")


SCHAFF_REPLACEMENTS = {
    "heidelberg_catechism": schaff_heidelberg,
    "belgic_confession_of_faith": schaff_belgic,
    "second_helvetic_confession": schaff_second_helvetic,
    "apostles_creed": schaff_apostles,
    "nicene_creed": schaff_nicene,
    "chalcedonian_definition": schaff_chalcedon,
    "ignatius_creed": schaff_ignatius,
}


# ---------------------------------------------------------------------------------------------
# 3. The Thirty-Nine Articles (Schaff, Creeds of Christendom III)
# ---------------------------------------------------------------------------------------------
def build_39_articles():
    log("Thirty-Nine Articles (Schaff, Creeds III) …")
    src = open(fetch(CREEDS3_URL, "creeds3.xml"), encoding="utf-8").read()
    h = thml_prep(thml_div(src, "iv.xi"))
    articles, cur = [], None
    for row in re.finditer(r"<tr\b([^>]*)>(.*?)</tr>", h, flags=re.S):
        cells = re.findall(r"<(t[hd])\b([^>]*)>(.*?)</t[hd]>", row.group(2), flags=re.S)
        if len(cells) < 3:
            continue
        kinds = {c[0] for c in cells}
        texts = [thml_text(c[2]) for c in cells]
        if kinds == {"th"}:
            num = roman_to_int(texts[1].rstrip("."))
            if num:
                cur = {"num": num, "title": None, "en": [], "us": []}
                articles.append(cur)
            continue
        if cur is None:
            continue
        style = cells[1][1] + row.group(1)
        if cur["title"] is None and "center" in style:
            cur["title"] = (texts[2] or texts[1]).rstrip(".")
            cur["title_en"] = texts[1].rstrip(".")
            continue
        new_para = "text-indent" in cells[1][1]
        for key, t in (("en", texts[1]), ("us", texts[2])):
            if not t:
                continue
            if new_para or not cur[key]:
                cur[key].append(t)
            else:
                cur[key][-1] += " " + t
    sections = []
    for a in articles:
        us = "\n\n".join(a["us"])
        # The 1801 American revision omits or rewrites VIII, XXI and XXXVII: keep the 1571 English there.
        use_en = a["num"] in (8, 21, 37) or not us or len(us) < 200 and "omitted" in us.lower()
        text = "\n\n".join(a["en"]) if use_en else us
        text = re.sub(r"\s*\[[^\]]*(?:omitted|American)[^\]]*\]", "", text).strip()   # Schaff's notes
        title = a["title_en"] if use_en else a["title"]
        sec = {"n": f"Article {a['num']}", "title": title, "text": text}
        refs = dedupe(text_refs(text))
        if refs:
            sec["refs"] = refs
        sections.append(sec)
    log(f"  {len(sections)} articles")
    return [{
        "id": "thirty-nine-articles", "title": "Thirty-Nine Articles of Religion", "type": "confession",
        "year": "1571", "author": "Church of England (Convocation)", "tradition": "Anglican",
        "source": SCHAFF3,
        "intro": "The doctrinal standard of the Church of England, drafted under Archbishop Thomas Cranmer "
                 "(Forty-two Articles, 1553), revised by Matthew Parker in 1563 and finalised in 1571. "
                 "Text: Schaff, The Creeds of Christendom, vol. 3 (public domain), using the modern-spelling "
                 "American edition of 1801, except Articles 8, 21 and 37, which that edition altered or "
                 "omitted and which are given in the English edition of 1571.",
        "sections": sections,
    }]


# ---------------------------------------------------------------------------------------------
# 4. Church fathers (HistoricalChristianFaith/Commentaries-Database)
# ---------------------------------------------------------------------------------------------
# Hosts of the public-domain texts the comments cite (ANF/NPNF etc.).  Comments with no source URL or
# a Google Books link are the repo's fair-use excerpts of copyrighted translations: skipped.
PD_HOSTS = {"historicalchristian.faith", "newadvent.org", "ccel.org", "tertullian.org",
            "earlychristianwritings.com", "archive.org", "web.archive.org", "sacred-texts.com",
            "catholiclibrary.org", "gutenberg.org"}
# Works hosted on historicalchristian.faith whose own title pages show a modern, copyrighted translation
# (checked against the head of each cited file in the project's Writings-Database, Nov 2026).
COPYRIGHTED_WORKS = (
    "Alcuin of York/Commentary and the Questions and Answers Manual/",   # © Consolamini Publications 2016
    "Theophylact of Ohrid/Commentary on Matthew.html",                   # Chrysostom Press ("please buy")
    "Clement of Alexandria/The Stromata Book 3.html",                    # Library of Christian Classics 1954
    "Augustine of Hippo/Sermons/Sermon 229U.html",                       # placeholder, no text
)
# Thomas Aquinas's own commentaries there are Larcher/Magi Books (1966-80), Mulladay (2002), McInerny
# (Penguin 1998) etc.; only his Catena Aurea (Newman's 1841 translation, public domain) is kept.
CATENA_ONLY_AUTHORS = {"Thomas Aquinas"}
SKIP_CATEGORIES = {"Canonical Scriptures", "Second Temple Judaism"}
SKIP_AUTHORS = {"Book of Biblical Antiquities"}   # Jewish (Pseudo-Philo)
COPYRIGHT_YEAR = 1930                              # authors dated after this are not public domain

DISPLAY_NAMES = {
    "Gregory the Dialogist": "Gregory the Great", "Lucius Caecilius Firmianus Lactantius": "Lactantius",
    "Irenaeus": "Irenaeus of Lyons", "Cyprian": "Cyprian of Carthage", "Bede": "Bede the Venerable",
    "John Damascene": "John of Damascus", "Gregory of Neocaesarea": "Gregory Thaumaturgus",
    "Aphrahat the Persian Sage": "Aphrahat", "Polycrates Of Ephesus": "Polycrates of Ephesus",
    "Martyrdom Of Polycarp": "Martyrdom of Polycarp", "Theognostus Of Alexandria": "Theognostus of Alexandria",
    "Tyrannius Rufinus": "Rufinus of Aquileia", "Marcus Minucius Felix": "Minucius Felix",
    "Gaius Marius Victorinus": "Marius Victorinus", "Hermias Sozomen": "Sozomen",
    "Besa The Copt": "Besa the Copt", "Ishodad of Merv": "Isho'dad of Merv", "JB Lightfoot": "J. B. Lightfoot",
    "The Liturgy Of The Blessed Apostles": "The Liturgy of the Blessed Apostles",
}
FATHER_IDS = {
    "Augustine of Hippo": "augustine", "John Chrysostom": "chrysostom", "Jerome": "jerome",
    "Origen of Alexandria": "origen", "Gregory the Dialogist": "gregory-the-great", "Bede": "bede",
    "Cyril of Alexandria": "cyril-of-alexandria", "Ambrose of Milan": "ambrose", "Ambrosiaster": "ambrosiaster",
    "Thomas Aquinas": "aquinas", "Tertullian": "tertullian", "Irenaeus": "irenaeus", "Cyprian": "cyprian",
    "Athanasius of Alexandria": "athanasius", "Basil of Caesarea": "basil", "Hilary of Poitiers": "hilary",
    "Theodoret of Cyrus": "theodoret", "Clement of Alexandria": "clement-of-alexandria",
    "Hippolytus of Rome": "hippolytus", "Ephrem the Syrian": "ephrem", "Leo the Great": "leo-the-great",
    "Gregory of Nazianzus": "gregory-nazianzen", "Gregory of Nyssa": "gregory-of-nyssa",
    "Eusebius of Caesarea": "eusebius", "John Cassian": "cassian", "Justin Martyr": "justin-martyr",
    "John Damascene": "john-of-damascus", "Theophylact of Ohrid": "theophylact", "Bonaventure": "bonaventure",
    "Cyril of Jerusalem": "cyril-of-jerusalem", "Ignatius of Antioch": "ignatius",
    "Lucius Caecilius Firmianus Lactantius": "lactantius", "Oecumenius": "oecumenius",
}
# Lifespans of the better-known figures (the database itself only has one year, usually the death year).
LIFESPANS = {
    "Clement of Rome": "d. c. 99", "Ignatius of Antioch": "d. c. 108", "Polycarp of Smyrna": "c. 69–155",
    "Justin Martyr": "c. 100–165", "Irenaeus": "c. 130–202", "Clement of Alexandria": "c. 150–215",
    "Tertullian": "c. 155–220", "Hippolytus of Rome": "c. 170–235", "Origen of Alexandria": "c. 185–253",
    "Cyprian": "c. 200–258", "Novatian": "c. 200–258", "Gregory of Neocaesarea": "c. 213–270",
    "Methodius of Olympus": "d. c. 311", "Victorinus of Pettau": "d. 304",
    "Lucius Caecilius Firmianus Lactantius": "c. 250–325", "Eusebius of Caesarea": "c. 260–339",
    "Athanasius of Alexandria": "c. 296–373", "Aphrahat the Persian Sage": "c. 270–345",
    "Ephrem the Syrian": "c. 306–373", "Hilary of Poitiers": "c. 310–367", "Basil of Caesarea": "330–379",
    "Cyril of Jerusalem": "c. 313–386", "Gregory of Nazianzus": "329–390", "Gregory of Nyssa": "c. 335–395",
    "Ambrose of Milan": "c. 339–397", "Didymus the Blind": "c. 313–398", "Ambrosiaster": "fl. c. 366–384",
    "Epiphanius of Salamis": "c. 310–403", "John Chrysostom": "c. 347–407", "Jerome": "c. 347–420",
    "Theodore of Mopsuestia": "c. 350–428", "Augustine of Hippo": "354–430", "John Cassian": "c. 360–435",
    "Cyril of Alexandria": "c. 376–444", "Theodoret of Cyrus": "c. 393–458", "Leo the Great": "c. 400–461",
    "Peter Chrysologus": "c. 380–450", "Maximus of Turin": "d. c. 465", "Caesarius of Arles": "c. 470–542",
    "Fulgentius of Ruspe": "c. 465–533", "Cassiodorus": "c. 485–585", "Gregory the Dialogist": "c. 540–604",
    "Isidore of Seville": "c. 560–636", "Maximus the Confessor": "c. 580–662", "Bede": "c. 673–735",
    "John Damascene": "c. 675–749", "Isaac of Nineveh": "c. 613–700", "Andreas of Caesarea": "563–637",
    "Oecumenius": "fl. 6th c.", "Philoxenus of Mabbug": "c. 440–523", "Severus of Antioch": "c. 465–538",
    "Pelagius": "c. 354–418", "Tyrannius Rufinus": "c. 345–411", "Evagrius Ponticus": "345–399",
    "Paulinus of Nola": "c. 354–431", "Prosper of Aquitaine": "c. 390–455", "Vincent of Lérins": "d. c. 445",
    "Severian of Gabala": "d. c. 425", "Diodorus of Tarsus": "d. c. 390", "Apollinaris of Laodicea": "d. c. 382",
    "Primasius of Hadrumetum": "d. c. 560", "Romanos the Melodist": "d. c. 555",
    "Alcuin of York": "c. 735–804", "Rabanus Maurus": "c. 780–856", "Photios I of Constantinople": "c. 810–893",
    "Symeon the New Theologian": "949–1022", "Theophylact of Ohrid": "c. 1050–1107",
    "Anselm of Canterbury": "1033–1109", "Bernard of Clairvaux": "1090–1153", "Bonaventure": "1221–1274",
    "Thomas Aquinas": "1225–1274", "Nicholas of Lyra": "c. 1270–1349", "Gregory Palamas": "1296–1359",
    "Ulrich Zwingli": "1484–1531", "Erasmus of Rotterdam": "c. 1466–1536", "Martin Luther": "1483–1546",
    "John Calvin": "1509–1564", "John of the Cross": "1542–1591", "John Wesley": "1703–1791",
    "JB Lightfoot": "1828–1889", "Arius": "c. 256–336", "Valentinus": "c. 100–180",
    "Marcus Eremita": "d. c. 430", "Hesychius of Jerusalem": "d. c. 450", "Arnobius of Sicca": "d. c. 330",
    "Gaius Marius Victorinus": "fl. 4th c.", "Chromatius of Aquileia": "d. c. 406", "Tatian the Assyrian": "c. 120–180",
    "Theophilus of Antioch": "d. c. 185", "Melito of Sardis": "d. c. 180", "Athenagoras of Athens": "c. 133–190",
    "Dionysius of Alexandria": "d. 264", "Julian of Eclanum": "c. 386–455", "Salvian the Presbyter": "c. 400–490",
    "Cosmas Indicopleustes": "fl. 6th c.", "Berengaudus": "fl. 9th c.",
}


def era_for(year):
    if year <= 750 or year >= 9999:
        return "patristic"
    if year <= 1500:
        return "medieval"
    if year <= 1700:
        return "reformation"
    return "modern"


def fathers_from_sqlite(path):
    con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    meta = {}
    for name, year, wiki, cat, condemned in con.execute(
            "select name, default_year, wiki_url, father_category, condemned_by_council from father_meta"):
        meta[name] = {"year": int(year), "category": cat or "", "condemned": bool(condemned)}
    rows = []
    for fn, app, ts, book, ls, le, txt, url, title in con.execute(
            "select father_name, append_to_author_name, ts, book, location_start, location_end, txt,"
            " source_url, source_title from commentary"):
        rows.append((fn, book, ls // 1000000, ls % 1000000, le // 1000000, le % 1000000,
                     txt or "", url or "", title or "", app or "", ts))
    con.close()
    return meta, rows


def fathers_from_zip(path):
    meta, rows, bad = {}, [], 0
    with zipfile.ZipFile(path) as z:
        files = [n for n in z.namelist() if n.endswith(".toml")]
        for n in files:
            parts = n.split("/")
            if len(parts) < 3 or parts[-1] != "metadata.toml":
                continue
            try:
                d = tomllib.loads(z.read(n).decode("utf-8"))
            except (tomllib.TOMLDecodeError, UnicodeDecodeError):
                continue
            meta[parts[-2]] = {"year": int(d.get("default_year", 9999)), "category": d.get("father_category", ""),
                               "condemned": bool(d.get("condemned_by_council", False))}
        for n in files:
            parts = n.split("/")
            if len(parts) < 3 or parts[-1] == "metadata.toml":
                continue
            father, stem = parts[-2], parts[-1][:-5]
            m = re.match(r"(.+) (\d+)_(\d+)(?:-(\d+)(?:_(\d+))?)?$", stem)
            if not m:
                continue
            book, c1, v1, x, y = m.groups()
            c1, v1 = int(c1), int(v1)
            c2, v2 = (int(x), int(y)) if y else (c1, int(x) if x else v1)
            try:
                d = tomllib.loads(z.read(n).decode("utf-8"))
            except (tomllib.TOMLDecodeError, UnicodeDecodeError):
                bad += 1
                continue
            default = meta.get(father, {}).get("year", 9999)
            for c in d.get("commentary", []):
                rows.append((father, book.lower().replace(" ", ""), c1, v1, c2, v2, c.get("quote", ""),
                             c.get("source_url", ""), c.get("source_title", ""),
                             c.get("append_to_author_name", ""), c.get("time", default)))
    if bad:
        log(f"  {bad} TOML files could not be parsed")
    return meta, rows


def fathers_source():
    zip_path = os.path.join(CACHE, "Commentaries-Database-master.zip")
    db_path = os.path.join(CACHE, "commentaries.sqlite")
    if not os.path.exists(zip_path) and not os.path.exists(db_path):
        for url in FATHERS_ZIP_URLS:
            if fetch(url, os.path.basename(zip_path), quiet_fail=True):
                break
        else:
            for url in FATHERS_SQLITE_URLS:
                if fetch(url, os.path.basename(db_path), quiet_fail=True):
                    break
    if os.path.exists(zip_path):
        log("  reading", os.path.relpath(zip_path, ROOT))
        return fathers_from_zip(zip_path)
    if os.path.exists(db_path):
        log("  reading", os.path.relpath(db_path, ROOT))
        return fathers_from_sqlite(db_path)
    raise SystemExit("Could not download the Commentaries-Database (zip or sqlite).")


def source_label(title, app):
    s = re.sub(r"\s+", " ", html.unescape(title or "")).strip()
    app = re.sub(r"\s+", " ", app or "").strip()
    m = re.match(r"\(?\s*(?:as )?quot(?:ed|ing) by ([A-Z][\w'-]+)", app, re.I)
    if app.startswith("(") and "quot" in app and not (m and m.group(1).lower() in s.lower()):
        s = f"{s} {app}".strip()
    return s


WRITINGS_RAW = "https://raw.githubusercontent.com/HistoricalChristianFaith/Writings-Database/master/"


def is_accs_style(title):
    """ALL-CAPS citations ("HOMILIES ON NUMBERS 23.5") were imported from a modern anthology."""
    letters = re.sub(r"[^A-Za-z]", "", title or "")
    return len(letters) >= 4 and letters.isupper()


def letters_only(s):
    s = html.unescape(re.sub(r"<[^>]+>", " ", s))
    return re.sub(r"[^a-z]+", "", s.lower())


def found_verbatim(quote, work_letters):
    """True if most of five 40-letter windows of the quote occur in the cited work."""
    q = letters_only(quote)
    if len(q) < 40:
        return q in work_letters
    step = max(40, len(q) // 5)
    wins = [q[i:i + 40] for i in range(0, len(q) - 39, step)][:5]
    return sum(w in work_letters for w in wins) * 2 >= len(wins)


def load_writings(works):
    """Download the cited Writings-Database files (cached) and return {path: letters-only text}."""
    def one(path):
        if path.lower().endswith(".pdf"):
            return path, ""
        local = "writings/" + re.sub(r"[^A-Za-z0-9._-]+", "_", path)
        f = fetch(WRITINGS_RAW + urllib.parse.quote(path), local, quiet_fail=True, verbose=False)
        if not f:
            return path, ""
        with open(f, encoding="utf-8", errors="replace") as fh:
            return path, letters_only(fh.read())
    with ThreadPoolExecutor(8) as ex:
        return dict(ex.map(one, sorted(works)))


def build_fathers(docs_bytes):
    log("Church fathers (Commentaries-Database) …")
    meta, rows = fathers_source()
    skipped = Counter()
    entries = []          # (code, c1, v1, c2, v2, father, text, source, year)
    to_check = {}         # entry index -> cited Writings-Database path ("" if it cannot be checked)
    seen = set()
    for fn, book, c1, v1, c2, v2, txt, url, title, app, ts in rows:
        m = meta.get(fn)
        if not m:
            skipped["no author metadata"] += 1
            continue
        y = m["year"]
        if m["category"] in SKIP_CATEGORIES or fn in SKIP_AUTHORS or y < 50:
            skipped["scripture / Jewish source"] += 1
            continue
        if COPYRIGHT_YEAR <= y < 9999:
            skipped["modern author (copyright)"] += 1
            continue
        host = urllib.parse.urlparse(url).hostname or ""
        host = host.removeprefix("www.")
        if host not in PD_HOSTS:
            skipped["no public-domain source cited (fair-use excerpt)"] += 1
            continue
        work = urllib.parse.unquote(urllib.parse.unquote(
            urllib.parse.parse_qs(urllib.parse.urlparse(url).query).get("file", [""])[0]))
        if work.startswith(COPYRIGHTED_WORKS) or (fn in CATENA_ONLY_AUTHORS and "Catena Aurea" not in work
                                                   and "Catena Aurea" not in title):
            skipped["modern copyrighted translation"] += 1
            continue
        if era_for(y) not in INCLUDE_ERAS:
            skipped["era not included"] += 1
            continue
        code = book_code(book)
        if not code:
            skipped["deuterocanonical / unknown book"] += 1
            continue
        if (c2, v2) < (c1, v1):
            c2, v2 = c1, v1
        ref = make_ref(code, c1, v1, c2, v2)
        if not ref:
            skipped["invalid chapter/verse"] += 1
            continue
        text = clean_text(txt)
        if not text:
            skipped["empty"] += 1
            continue
        key = (fn, code, text)
        if key in seen:
            skipped["duplicate"] += 1
            continue
        seen.add(key)
        rc = re.match(r"[^.]+\.(\d+)\.(\d+)(?:-(?:(\d+)\.)?(\d+))?$", ref)
        c1, v1 = int(rc.group(1)), int(rc.group(2))
        c2 = int(rc.group(3)) if rc.group(3) else c1
        v2 = int(rc.group(4)) if rc.group(4) else v1
        entries.append((code, c1, v1, c2, v2, fn, text, source_label(title, app), y))
        if is_accs_style(title):
            to_check[len(entries) - 1] = work if host == "historicalchristian.faith" else ""

    # ALL-CAPS citations come from a modern anthology; keep them only when the quoted text really is
    # the public-domain translation that the entry links to.
    works = {w for w in to_check.values() if w}
    log(f"  checking {len(to_check)} anthology-style citations against {len(works)} cited texts …")
    texts = load_writings(works)
    drop = {i for i, w in to_check.items() if not (w and texts.get(w) and found_verbatim(entries[i][6], texts[w]))}
    skipped["anthology wording not found in the cited public-domain text"] += len(drop)
    entries = [e for i, e in enumerate(entries) if i not in drop]
    for k, v in skipped.most_common():
        log(f"  skipped {v:6d}  {k}")

    # authors
    counts = Counter(e[5] for e in entries)
    fathers, ids = [], {}
    used = set()
    for fn in sorted(counts, key=lambda n: (meta[n]["year"], n)):
        name = DISPLAY_NAMES.get(fn, fn)
        fid = FATHER_IDS.get(fn) or slug(name)
        while fid in used:
            fid += "-2"
        used.add(fid)
        ids[fn] = fid
        y = meta[fn]["year"]
        years = LIFESPANS.get(fn) or ("" if y >= 9999 else (f"c. {y}" if y > 0 else f"c. {-y} BC"))
        f = {"id": fid, "name": name, "years": years, "era": era_for(y), "count": counts[fn]}
        if meta[fn]["condemned"]:
            f["condemned"] = True
        fathers.append(f)

    # per-book structure and authors' ref lists
    entries.sort(key=lambda e: (BOOK_INDEX[e[0]], e[1], e[2], e[8], ids[e[5]], e[3], e[4]))
    by_book = defaultdict(lambda: defaultdict(list))
    author_refs = defaultdict(list)
    for code, c1, v1, c2, v2, fn, text, src, y in entries:
        item = {"f": ids[fn], "t": text, "s": src}
        if c2 != c1:
            item["c2"], item["v2"] = c2, v2
        elif v2 != v1:
            item["v2"] = v2
        by_book[code][f"{c1}:{v1}"].append(item)
        author_refs[ids[fn]].append(make_ref(code, c1, v1, c2, v2))

    # size budget: trim the longest comments until everything fits
    def dumped(o):
        return len(json.dumps(o, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))

    items = [it for verses in by_book.values() for lst in verses.values() for it in lst]
    fixed = sum(dumped({k: v for k, v in it.items() if k != "t"}) + len('"t":"",') for it in items)
    fixed += sum(dumped(list(v.keys())) + 2 * len(v) for v in by_book.values())
    authors_bytes = sum(dumped(dedupe(r)) for r in author_refs.values())
    index_bytes = dumped(fathers) + 20000
    budget = TOTAL_BUDGET_MB * 1e6 - docs_bytes - authors_bytes - index_bytes - fixed

    def text_bytes(cap):
        return sum(dumped(trim(it["t"], cap)) for it in items)

    cap = MAX_COMMENT_CHARS
    if text_bytes(cap) > budget:
        lo, hi = MIN_COMMENT_CHARS, MAX_COMMENT_CHARS
        while hi - lo > 25:
            mid = (lo + hi) // 2
            if text_bytes(mid) <= budget:
                lo = mid
            else:
                hi = mid
        cap = lo
    trimmed = 0
    for it in items:
        t = trim(it["t"], cap)
        if t != it["t"]:
            trimmed += 1
            it["t"] = t
    log(f"  {len(entries)} comments by {len(fathers)} authors; comments longer than {cap} characters "
        f"trimmed: {trimmed}")

    sizes = {"fathers/<BOOK>.json": 0, "fathers/authors/*.json": 0}
    for code in CODES:
        if code in by_book:
            sizes["fathers/<BOOK>.json"] += write_json(f"fathers/{code}.json", by_book[code])
    for fid, refs in author_refs.items():
        sizes["fathers/authors/*.json"] += write_json(f"fathers/authors/{fid}.json",
                                                      sorted(dedupe(refs), key=ref_sort_key))
    return fathers, sizes, {"comments": len(entries), "cap": cap, "trimmed": trimmed, "skipped": skipped}


# ---------------------------------------------------------------------------------------------
def main():
    for sub in ("docs", "fathers"):
        p = os.path.join(OUT, sub)
        if os.path.isdir(p):
            shutil.rmtree(p)
    os.makedirs(OUT, exist_ok=True)

    docs = build_creeds() + build_39_articles() + build_councils()
    type_order = {"creed": 0, "council": 1, "confession": 2, "catechism": 3}

    def year_key(d):
        m = re.search(r"\d+", d["year"] or "")
        return int(m.group(0)) if m else 9999

    docs.sort(key=lambda d: (type_order[d["type"]], year_key(d), d["title"]))
    ids = Counter(d["id"] for d in docs)
    assert all(v == 1 for v in ids.values()), ids
    sizes = Counter()
    key_order = ["id", "title", "type", "year", "author", "tradition", "source", "intro", "sections"]
    docs = [{k: d[k] for k in key_order if k in d} for d in docs]
    for d in docs:
        sizes["docs/*.json"] += write_json(f"docs/{d['id']}.json", d)
    doc_index = [{"id": d["id"], "title": d["title"], "type": d["type"], "year": d["year"],
                  "author": d["author"], "tradition": d["tradition"], "source": d["source"],
                  "sections": len(d["sections"])}
                 for d in docs]

    fathers, fsizes, fstats = build_fathers(sizes["docs/*.json"])
    sizes.update(fsizes)
    sizes["index.json"] = write_json("index.json", {"docs": doc_index, "fathers": fathers})

    log("")
    by_type = Counter(d["type"] for d in docs)
    log("Documents: " + ", ".join(f"{by_type[t]} {t}s" for t in type_order) + f" ({len(docs)} total, "
        f"{sum(len(d['sections']) for d in docs)} sections, "
        f"{sum(len(s.get('refs', [])) for d in docs for s in d['sections'])} scripture refs)")
    eras = Counter(f["era"] for f in fathers)
    log(f"Fathers: {len(fathers)} authors ({', '.join(f'{v} {k}' for k, v in eras.items())}), "
        f"{fstats['comments']} comments, cap {fstats['cap']} chars ({fstats['trimmed']} trimmed)")
    log("Output sizes (public/data/history/):")
    for k in ("index.json", "docs/*.json", "fathers/<BOOK>.json", "fathers/authors/*.json"):
        log(f"  {k:26s} {sizes[k] / 1e6:8.2f} MB")
    log(f"  {'total':26s} {sum(sizes.values()) / 1e6:8.2f} MB")


if __name__ == "__main__":
    sys.exit(main())
