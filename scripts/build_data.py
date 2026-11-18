#!/usr/bin/env python3
"""Build Scripture Study's offline data from public-domain sources.

Downloads into .cache/ (git-ignored) and writes compact JSON into public/data/.
Run:  python3 scripts/build_data.py            (everything)
      python3 scripts/build_data.py bibles     (one stage: bibles, strongs, xref,
                                                 commentaries, topics, geo, maps)

Sources (all public domain unless noted):
  * eBible.org USFM: KJV 1769 with Strong's numbers (eng-kjv2006), Berean Standard
    Bible (engbsb, dedicated to the public domain 2023), World English Bible (eng-web),
    American Standard Version 1901 (eng-asv)
  * Open Scriptures Strong's Greek & Hebrew dictionaries (CC-BY-SA, from public-domain Strong's)
  * OpenBible.info cross references (CC-BY) and Bible Geocoding data (CC-BY)
  * CrossWire SWORD modules: Matthew Henry Complete, Barnes' Notes, Calvin's Commentaries,
    Jamieson-Fausset-Brown, Geneva Bible notes (1599), Nave's Topical Bible,
    Torrey's New Topical Textbook, Easton's Bible Dictionary
  * Natural Earth (public domain) for modern borders, coastlines, lakes and rivers
"""
import glob
import html
import io
import json
import os
import re
import sys
import urllib.request
import zipfile
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(__file__))
from sword import ZVerse, ZLD, RawLD, kjv_index  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CACHE = os.path.join(ROOT, ".cache")
OUT = os.path.join(ROOT, "public", "data")

BOOKS = [
    # (usfm code, osis, name, short abbreviation)
    ("GEN", "Gen", "Genesis", "Gen"), ("EXO", "Exod", "Exodus", "Exod"), ("LEV", "Lev", "Leviticus", "Lev"),
    ("NUM", "Num", "Numbers", "Num"), ("DEU", "Deut", "Deuteronomy", "Deut"), ("JOS", "Josh", "Joshua", "Josh"),
    ("JDG", "Judg", "Judges", "Judg"), ("RUT", "Ruth", "Ruth", "Ruth"), ("1SA", "1Sam", "1 Samuel", "1 Sam"),
    ("2SA", "2Sam", "2 Samuel", "2 Sam"), ("1KI", "1Kgs", "1 Kings", "1 Kgs"), ("2KI", "2Kgs", "2 Kings", "2 Kgs"),
    ("1CH", "1Chr", "1 Chronicles", "1 Chr"), ("2CH", "2Chr", "2 Chronicles", "2 Chr"), ("EZR", "Ezra", "Ezra", "Ezra"),
    ("NEH", "Neh", "Nehemiah", "Neh"), ("EST", "Esth", "Esther", "Esth"), ("JOB", "Job", "Job", "Job"),
    ("PSA", "Ps", "Psalms", "Ps"), ("PRO", "Prov", "Proverbs", "Prov"), ("ECC", "Eccl", "Ecclesiastes", "Eccl"),
    ("SNG", "Song", "Song of Solomon", "Song"), ("ISA", "Isa", "Isaiah", "Isa"), ("JER", "Jer", "Jeremiah", "Jer"),
    ("LAM", "Lam", "Lamentations", "Lam"), ("EZK", "Ezek", "Ezekiel", "Ezek"), ("DAN", "Dan", "Daniel", "Dan"),
    ("HOS", "Hos", "Hosea", "Hos"), ("JOL", "Joel", "Joel", "Joel"), ("AMO", "Amos", "Amos", "Amos"),
    ("OBA", "Obad", "Obadiah", "Obad"), ("JON", "Jonah", "Jonah", "Jonah"), ("MIC", "Mic", "Micah", "Mic"),
    ("NAM", "Nah", "Nahum", "Nah"), ("HAB", "Hab", "Habakkuk", "Hab"), ("ZEP", "Zeph", "Zephaniah", "Zeph"),
    ("HAG", "Hag", "Haggai", "Hag"), ("ZEC", "Zech", "Zechariah", "Zech"), ("MAL", "Mal", "Malachi", "Mal"),
    ("MAT", "Matt", "Matthew", "Matt"), ("MRK", "Mark", "Mark", "Mark"), ("LUK", "Luke", "Luke", "Luke"),
    ("JHN", "John", "John", "John"), ("ACT", "Acts", "Acts", "Acts"), ("ROM", "Rom", "Romans", "Rom"),
    ("1CO", "1Cor", "1 Corinthians", "1 Cor"), ("2CO", "2Cor", "2 Corinthians", "2 Cor"), ("GAL", "Gal", "Galatians", "Gal"),
    ("EPH", "Eph", "Ephesians", "Eph"), ("PHP", "Phil", "Philippians", "Phil"), ("COL", "Col", "Colossians", "Col"),
    ("1TH", "1Thess", "1 Thessalonians", "1 Thess"), ("2TH", "2Thess", "2 Thessalonians", "2 Thess"),
    ("1TI", "1Tim", "1 Timothy", "1 Tim"), ("2TI", "2Tim", "2 Timothy", "2 Tim"), ("TIT", "Titus", "Titus", "Titus"),
    ("PHM", "Phlm", "Philemon", "Phlm"), ("HEB", "Heb", "Hebrews", "Heb"), ("JAS", "Jas", "James", "Jas"),
    ("1PE", "1Pet", "1 Peter", "1 Pet"), ("2PE", "2Pet", "2 Peter", "2 Pet"), ("1JN", "1John", "1 John", "1 John"),
    ("2JN", "2John", "2 John", "2 John"), ("3JN", "3John", "3 John", "3 John"), ("JUD", "Jude", "Jude", "Jude"),
    ("REV", "Rev", "Revelation", "Rev"),
]
CODES = [b[0] for b in BOOKS]
OSIS2CODE = {b[1]: b[0] for b in BOOKS}
OT, NT = CODES[:39], CODES[39:]

# Alternate book spellings found in commentary cross references (ThML "passage" attributes etc.)
ALIASES = {}
for code, osis, name, abbr in BOOKS:
    for a in {code, osis, name, abbr, abbr.replace(" ", ""), name.replace(" ", "")}:
        ALIASES[a.lower()] = code
for a, c in {
    "ge": "GEN", "gn": "GEN", "ex": "EXO", "exo": "EXO", "le": "LEV", "lv": "LEV", "nu": "NUM", "nm": "NUM",
    "de": "DEU", "dt": "DEU", "deu": "DEU", "jos": "JOS", "jg": "JDG", "jdg": "JDG", "jud": "JDG", "ru": "RUT",
    "rth": "RUT", "1sa": "1SA", "1s": "1SA", "2sa": "2SA", "2s": "2SA", "1ki": "1KI", "1k": "1KI", "2ki": "2KI",
    "2k": "2KI", "1ch": "1CH", "2ch": "2CH", "ezr": "EZR", "ne": "NEH", "es": "EST", "est": "EST", "jb": "JOB",
    "ps": "PSA", "psa": "PSA", "psalm": "PSA", "pr": "PRO", "pro": "PRO", "pv": "PRO", "ec": "ECC", "ecc": "ECC",
    "so": "SNG", "song": "SNG", "sos": "SNG", "ca": "SNG", "cant": "SNG", "is": "ISA", "isa": "ISA", "je": "JER",
    "jer": "JER", "jr": "JER", "la": "LAM", "lam": "LAM", "eze": "EZK", "ezek": "EZK", "ezk": "EZK", "da": "DAN",
    "dan": "DAN", "dn": "DAN", "ho": "HOS", "joe": "JOL", "jl": "JOL", "am": "AMO", "ob": "OBA", "jon": "JON",
    "jnh": "JON", "mic": "MIC", "mi": "MIC", "na": "NAM", "nah": "NAM", "hab": "HAB", "zep": "ZEP", "zph": "ZEP",
    "hag": "HAG", "hg": "HAG", "zec": "ZEC", "zch": "ZEC", "mal": "MAL", "ml": "MAL", "mt": "MAT", "mat": "MAT",
    "mr": "MRK", "mk": "MRK", "mar": "MRK", "lu": "LUK", "lk": "LUK", "luk": "LUK", "joh": "JHN", "jn": "JHN",
    "jhn": "JHN", "ac": "ACT", "act": "ACT", "ro": "ROM", "rm": "ROM", "1co": "1CO", "2co": "2CO", "ga": "GAL",
    "eph": "EPH", "ep": "EPH", "php": "PHP", "phil": "PHP", "php": "PHP", "col": "COL", "1th": "1TH", "2th": "2TH",
    "1ti": "1TI", "2ti": "2TI", "tit": "TIT", "phm": "PHM", "phlm": "PHM", "philem": "PHM", "heb": "HEB",
    "jas": "JAS", "jam": "JAS", "jm": "JAS", "1pe": "1PE", "1pet": "1PE", "2pe": "2PE", "2pet": "2PE", "1jo": "1JN",
    "1jn": "1JN", "2jo": "2JN", "2jn": "2JN", "3jo": "3JN", "3jn": "3JN", "jude": "JUD", "jud": "JUD", "re": "REV",
    "rev": "REV", "rv": "REV", "apoc": "REV", "1 jn": "1JN", "2 jn": "2JN", "3 jn": "3JN",
    "lu": "LUK", "ac": "ACT", "mt": "MAT", "1ch": "1CH", "2ch": "2CH", "1sam": "1SA", "2sam": "2SA",
    "1kin": "1KI", "2kin": "2KI", "1kgs": "1KI", "2kgs": "2KI", "neh": "NEH", "nehem": "NEH",
    "deut": "DEU", "gen": "GEN", "exod": "EXO", "lev": "LEV", "num": "NUM", "josh": "JOS", "judg": "JDG",
    "matt": "MAT", "mark": "MRK", "luke": "LUK", "john": "JHN", "acts": "ACT", "rom": "ROM", "gal": "GAL",
    "eph": "EPH", "col": "COL", "1thes": "1TH", "2thes": "2TH", "1thess": "1TH", "2thess": "2TH",
    "1tim": "1TI", "2tim": "2TI", "1joh": "1JN", "2joh": "2JN", "3joh": "3JN", "1john": "1JN",
    "2john": "2JN", "3john": "3JN", "zech": "ZEC", "zeph": "ZEP", "hab": "HAB", "hos": "HOS",
    "obad": "OBA", "mic": "MIC", "jona": "JON", "jonah": "JON", "eccl": "ECC", "eccles": "ECC",
    "prov": "PRO", "psalms": "PSA", "isai": "ISA", "jerem": "JER", "lament": "LAM", "ezr": "EZR",
    "esth": "EST", "rut": "RUT", "phi": "PHP", "philip": "PHP", "tit": "TIT", "jas": "JAS",
}.items():
    ALIASES.setdefault(a, c)
# Prefer Judges for "jud" only where ambiguous? Jude is far more common in NT commentaries; keep Jude.
ALIASES["jud"] = "JUD"


def log(*a):
    print(*a, flush=True)


def fetch(url, name=None):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name or url.rsplit("/", 1)[-1])
    if not os.path.exists(path):
        log("  downloading", url)
        req = urllib.request.Request(url, headers={"User-Agent": "ScriptureStudy-databuild/1.0"})
        with urllib.request.urlopen(req, timeout=300) as r, open(path + ".part", "wb") as f:
            f.write(r.read())
        os.replace(path + ".part", path)
    return path


def unzip(path, dest):
    if not os.path.isdir(dest):
        with zipfile.ZipFile(path) as z:
            z.extractall(dest)
    return dest


def write_json(rel, obj):
    path = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    return os.path.getsize(path)


# ---------------------------------------------------------------------------------------------
# Bibles
# ---------------------------------------------------------------------------------------------
VERSIONS = [
    # id, ebible id, name, keep strong's tags
    ("KJV", "eng-kjv2006", "King James Version (1769)", True),
    ("BSB", "engbsb", "Berean Standard Bible", False),
    ("WEB", "eng-web", "World English Bible", False),
    ("ASV", "eng-asv", "American Standard Version (1901)", False),
]

W_RE = re.compile(r'\\\+?w ([^|\\]*)\|strong="([^"]*)"\\\+?w\*')
W_PLAIN_RE = re.compile(r'\\\+?w ([^|\\]*)(\|[^\\]*)?\\\+?w\*')


def clean_usfm_verse(text, keep_strongs):
    """Convert one verse of USFM to Scripture Study's compact markup.

    {words|G3306}  Strong's-tagged words     [words]  translators' added words (italics)
    «...»          words of Christ (red)     ¶        paragraph start
    """
    footnotes = []

    def fn(m):
        body = m.group(1)
        body = re.sub(r"\\fr [^\\]*", "", body)
        body = re.sub(r"\\f[a-z]+\*?", "", body)
        body = re.sub(r"\\\+?w ([^|\\]*)(\|[^\\]*)?\\\+?w\*", r"\1", body)
        body = re.sub(r"\\[a-z+]+\*?", "", body)
        body = re.sub(r"\s+", " ", body).strip()
        if body:
            footnotes.append(body)
        return ""

    text = re.sub(r"\\f \+ (.*?)\\f\*", fn, text)
    text = re.sub(r"\\x .*?\\x\*", "", text)
    text = text.replace("«", '"').replace("»", '"').replace("{", "(").replace("}", ")")
    if not keep_strongs:
        text = text.replace("[", "(").replace("]", ")")

    def w(m):
        word = m.group(1)
        nums = []
        for n in m.group(2).split():
            n = n.split(":")[-1]
            mm = re.match(r"([GH])0*(\d+)([a-z]?)", n)
            if mm:
                nums.append(mm.group(1) + mm.group(2))
        if keep_strongs and nums and word.strip():
            return "{" + word + "|" + ",".join(nums) + "}"
        return word

    text = W_RE.sub(w, text)
    text = W_PLAIN_RE.sub(r"\1", text)
    if keep_strongs:
        text = re.sub(r"\\\+?add (.*?)\\\+?add\*", r"[\1]", text)
    text = re.sub(r"\\\+?wj\*", "»", text)
    text = re.sub(r"\\\+?wj\s*", "«", text)
    # closing markers (\x*) never own the following space; opening markers own one space
    text = re.sub(r"\\\+?[a-z]+[0-9]*\*", "", text)
    text = re.sub(r"\\\+?[a-z]+[0-9]*\s?", "", text)
    para = "¶" in text
    text = text.replace("¶", "")
    text = re.sub(r"\s+", " ", text).strip()
    text = text.replace("« ", "«").replace(" »", "»").replace("«»", "")
    return text, para, footnotes


def parse_usfm_book(path, keep_strongs):
    chapters = []  # list of list of verse strings
    titles = {}
    paras = {}
    notes = {}
    cur = None
    pending_para = False
    buf_d = []
    lines = open(path, encoding="utf-8").read().split("\n")
    # join continuation lines into the verse they belong to
    verse_text = None

    def flush():
        nonlocal verse_text, cur
        if verse_text is None:
            return
        ch, vn, raw, para = verse_text
        t, p, fns = clean_usfm_verse(raw, keep_strongs)
        while len(chapters[ch - 1]) < vn - 1:
            chapters[ch - 1].append("")
        if len(chapters[ch - 1]) >= vn:  # merged/duplicate verse numbers
            chapters[ch - 1][vn - 1] += " " + t
        else:
            chapters[ch - 1].append(t)
        if p or para:
            paras.setdefault(ch, []).append(vn)
        if fns:
            notes.setdefault(f"{ch}:{vn}", []).extend(fns)
        verse_text = None

    for line in lines:
        line = line.rstrip()
        m = re.match(r"\\c (\d+)", line)
        if m:
            flush()
            cur = int(m.group(1))
            while len(chapters) < cur:
                chapters.append([])
            pending_para = False
            continue
        if cur is None:
            continue
        if re.match(r"\\(p|m|pi\d?|nb|q\d?|li\d?|pmo|pc)\s*$", line) or re.match(r"\\(p|m)\s", line):
            if re.match(r"\\p\b", line):
                pending_para = True
            rest = re.sub(r"^\\[a-z0-9]+\s*", "", line)
            if not rest:
                continue
            line = rest
        if line.startswith("\\d "):
            flush()
            t, _, _ = clean_usfm_verse(line[3:], False)
            titles[cur] = re.sub(r"[\[\]]", "", t)
            continue
        if re.match(r"\\(s\d?|ms\d?|mr|r|sp|cl|qa|mt\d?|toc\d|h|id|ide|is\d?|ip|imt\d?|iot|io\d?|rem|b)\b", line):
            continue
        m = re.match(r"\\v (\d+)(?:-\d+)?\s?(.*)", line)
        if m:
            flush()
            verse_text = [cur, int(m.group(1)), m.group(2), pending_para]
            pending_para = False
            continue
        if verse_text is not None and line.strip():
            line = re.sub(r"^\\(q\d?|m|pi\d?|li\d?|pmo|pc|qr|qc)\s+", "", line)
            verse_text[2] += " " + line
    flush()
    return chapters, titles, paras, notes


def stage_bibles():
    log("== Bibles")
    kjv_counts = None
    kjv_titles = {}
    versions_meta = []
    for vid, eid, name, keep in VERSIONS:
        path = fetch(f"https://ebible.org/Scriptures/{eid}_usfm.zip")
        d = unzip(path, os.path.join(CACHE, eid))
        total = 0
        for code in CODES:
            files = glob.glob(os.path.join(d, f"*-{code}*.usfm")) or glob.glob(os.path.join(d, f"*{code}*.usfm"))
            files = [f for f in files if os.path.basename(f)[3:6] == code or os.path.basename(f)[2:5] == code]
            if not files:
                log("  missing", vid, code)
                continue
            chapters, titles, paras, notes = parse_usfm_book(files[0], keep)
            obj = {"c": chapters}
            if titles:
                obj["t"] = titles
            if paras:
                obj["p"] = paras
            if notes and vid == "KJV":
                obj["n"] = notes
            total += write_json(f"bibles/{vid}/{code}.json", obj)
            if vid == "KJV":
                kjv_counts = kjv_counts or {}
                kjv_counts[code] = [len(c) for c in chapters]
                m = re.search(r"^\\toc1 (.*)$", open(files[0], encoding="utf-8").read(), flags=re.M)
                kjv_titles[code] = re.sub(r"\s+", " ", m.group(1)).strip().rstrip(".") if m else ""
        versions_meta.append({"id": vid, "name": name, "strongs": keep, "redLetter": vid in ("KJV", "WEB")})
        log(f"  {vid}: {total/1e6:.1f} MB")
    books = []
    for code, osis, name, abbr in BOOKS:
        books.append({"id": code, "osis": osis, "name": name, "abbr": abbr, "title": kjv_titles.get(code, ""),
                      "t": "OT" if code in OT else "NT", "v": kjv_counts[code]})
    write_json("books.json", books)
    write_json("versions.json", versions_meta)


def load_books():
    return json.load(open(os.path.join(OUT, "books.json"), encoding="utf-8"))


# ---------------------------------------------------------------------------------------------
# Strong's dictionary + KJV usage concordance
# ---------------------------------------------------------------------------------------------
STOP_LEAD = set("""the a an ye he she it they i we you thou thee him them his her its their my thy your our me us
shall will should would may might must can could have hath has had be is was are were been being shalt wilt
hast didst did do doeth doth dost art not unto to of that which who whom what there this these those so
let""".split())


def rendering(phrase):
    words = re.findall(r"[A-Za-z’'\-]+", phrase)
    words = [w.replace("’", "'") for w in words]
    if not words:
        return None
    trimmed = list(words)
    while len(trimmed) > 1 and trimmed[0].lower() in STOP_LEAD:
        trimmed.pop(0)
    out = " ".join(trimmed)
    return re.sub(r"'s$", "", out)


def merge_case(counter):
    """Fold case variants ('Abide' at a sentence start, 'abide') into the most frequent spelling."""
    groups = defaultdict(Counter)
    for word, n in counter.items():
        groups[word.lower()][word] += n
    merged = Counter()
    for variants in groups.values():
        merged[variants.most_common(1)[0][0]] = sum(variants.values())
    return merged


def parse_strongs_js(path):
    src = open(path, encoding="utf-8").read()
    start = src.index("{", src.index("Dictionary = ") if "Dictionary = " in src else src.index("= {"))
    end = src.rindex("};")
    return json.loads(src[start:end + 1])


def stage_strongs():
    log("== Strong's")
    books = load_books()
    g = parse_strongs_js(fetch("https://raw.githubusercontent.com/openscriptures/strongs/master/greek/strongs-greek-dictionary.js"))
    h = parse_strongs_js(fetch("https://raw.githubusercontent.com/openscriptures/strongs/master/hebrew/strongs-hebrew-dictionary.js"))
    renders = defaultdict(Counter)
    bookc = defaultdict(Counter)
    occ = defaultdict(lambda: defaultdict(list))
    tok = re.compile(r"\{([^|}]*)\|([^}]*)\}")
    # first pass: which renderings ever appear in lower case (so 'Abide' folds into 'abide',
    # while 'God' and proper names keep their capital)
    lower_forms = Counter()
    for b in books:
        data = json.load(open(os.path.join(OUT, f"bibles/KJV/{b['id']}.json"), encoding="utf-8"))
        for ch in data["c"]:
            for verse in ch:
                for m in tok.finditer(verse):
                    r = rendering(re.sub(r"[\[\]«»]", "", m.group(1)))
                    if r:
                        lower_forms[r] += 1
    for bi, b in enumerate(books):
        data = json.load(open(os.path.join(OUT, f"bibles/KJV/{b['id']}.json"), encoding="utf-8"))
        for ci, ch in enumerate(data["c"]):
            for vi, verse in enumerate(ch):
                ref = (bi + 1) * 1000000 + (ci + 1) * 1000 + (vi + 1)
                seen = set()
                for m in tok.finditer(verse):
                    r = rendering(re.sub(r"[\[\]«»]", "", m.group(1)))
                    if r and not r.isupper():
                        r = r.lower() if lower_forms[r.lower()] >= lower_forms[r] else r
                    for num in m.group(2).split(","):
                        if r:
                            renders[num][r] += 1
                        bookc[num][b["id"]] += 1
                        key = (num, r)
                        if key not in seen:
                            seen.add(key)
                            occ[num][r or "?"].append(ref)
    total_lex = 0
    total_conc = 0
    word_index = defaultdict(Counter)
    for prefix, dic in (("G", g), ("H", h)):
        chunk = 0
        lex = {}
        conc = {}
        nums = sorted(dic.keys(), key=lambda k: int(re.sub(r"\D", "", k) or 0))
        maxn = max(int(re.sub(r"\D", "", k)) for k in nums)
        by_chunk = defaultdict(dict)
        conc_chunk = defaultdict(dict)
        for k in nums:
            n = int(re.sub(r"\D", "", k))
            e = dic[k]
            ent = {
                "l": e.get("lemma", ""),
                "x": e.get("xlit") or e.get("translit", ""),
                "p": e.get("pron", ""),
                "d": (e.get("strongs_def") or "").strip(),
                "k": (e.get("kjv_def") or "").strip(),
                "r": (e.get("derivation") or "").strip(),
            }
            key = f"{prefix}{n}"
            ent["u"] = merge_case(renders[key]).most_common()
            ent["b"] = [[bk, c] for bk, c in sorted(bookc[key].items(), key=lambda kv: CODES.index(kv[0]))]
            by_chunk[n // 250][key] = ent
            if occ[key]:
                conc_chunk[n // 250][key] = occ[key]
        for c, entries in by_chunk.items():
            total_lex += write_json(f"strongs/{prefix}{c}.json", entries)
            for key, ent in entries.items():
                for word, n in ent["u"]:
                    for w in re.findall(r"[a-z']+", word.lower()):
                        if len(w) > 2 and w not in STOP_LEAD:
                            word_index[w][key] += n
        for c, entries in conc_chunk.items():
            total_conc += write_json(f"conc/{prefix}{c}.json", entries)
        log(f"  {prefix}: {len(nums)} entries, max {maxn}")
    # English word -> Strong's numbers that the KJV renders with it (for topical search)
    idx = {w: [k for k, _ in c.most_common(12)] for w, c in word_index.items()}
    size = write_json("strongs/words.json", idx)
    log(f"  lexicon {total_lex/1e6:.1f} MB, concordance {total_conc/1e6:.1f} MB, word index {size/1e3:.0f} KB")


# ---------------------------------------------------------------------------------------------
# Cross references
# ---------------------------------------------------------------------------------------------
def osis_ref_to_compact(ref):
    """'John.6.56' -> 'JHN.6.56'; 'John.6.56-John.6.58' -> 'JHN.6.56-58' (same chapter) or 'JHN.6.56-JHN.7.2'."""
    parts = ref.split("-")
    out = []
    for p in parts:
        bits = p.split(".")
        if len(bits) < 2 or bits[0] not in OSIS2CODE:
            return None
        out.append([OSIS2CODE[bits[0]]] + bits[1:])
    a = out[0]
    s = ".".join(a)
    if len(out) > 1:
        b = out[1]
        if b[0] == a[0] and len(a) == 3 and len(b) == 3 and b[1] == a[1]:
            s += "-" + b[2]
        else:
            s += "-" + ".".join(b)
    return s


def stage_xref():
    log("== Cross references")
    path = fetch("https://a.openbible.info/data/cross-references.zip")
    with zipfile.ZipFile(path) as z:
        name = [n for n in z.namelist() if n.endswith(".txt")][0]
        lines = z.read(name).decode("utf-8").splitlines()
    per = defaultdict(list)
    for line in lines[1:]:
        cols = line.split("\t")
        if len(cols) < 3:
            continue
        try:
            votes = int(cols[2])
        except ValueError:
            continue
        if votes < 1:
            continue
        frm = cols[0].split(".")
        if frm[0] not in OSIS2CODE:
            continue
        to = osis_ref_to_compact(cols[1])
        if not to:
            continue
        per[(OSIS2CODE[frm[0]], int(frm[1]), int(frm[2]))].append((votes, to))
    books = defaultdict(dict)
    for (code, c, v), refs in per.items():
        refs.sort(key=lambda x: -x[0])
        books[code][f"{c}:{v}"] = [r for _, r in refs[:12]]
    total = 0
    for code, obj in books.items():
        total += write_json(f"xref/{code}.json", obj)
    log(f"  {sum(len(v) for v in books.values())} verses, {total/1e6:.1f} MB")


# ---------------------------------------------------------------------------------------------
# Commentaries (and topical / dictionary markup conversion)
# ---------------------------------------------------------------------------------------------
COMMENTARIES = [
    # id, module zip, data path, zCom4?, display name, author, year
    ("henry", "MHC", "modules/comments/zcom4/mhc", True, "Matthew Henry's Commentary", "Matthew Henry", "1706"),
    ("barnes", "Barnes", "modules/comments/zcom/barnes", False, "Barnes' Notes on the New Testament", "Albert Barnes", "1834"),
    ("calvin", "CalvinCommentaries", "modules/comments/zcom/calvincommentaries", False, "Calvin's Commentaries", "John Calvin", "1540–1564"),
    ("jfb", "JFB", "modules/comments/zcom/jfb", True, "Jamieson, Fausset & Brown Commentary", "Robert Jamieson, A. R. Fausset, David Brown", "1871"),
    ("geneva", "Geneva", "modules/comments/zcom/geneva", False, "Geneva Bible Notes (1599)", "Reformation translators", "1599"),
]

REF_PATTERN = re.compile(
    r"^\s*((?:[123]\s?)?[A-Za-z]+)\.?\s*(\d+)(?:[:.](\d+))?(?:\s*[-–]\s*(\d+)(?:[:.](\d+))?)?")


def parse_ref_text(s, default_book=None):
    """Parse 'Jn 15:1', 'John 6:56', '1 Jn 2:6', 'Is 5:1' -> compact 'JHN.15.1' (or None)."""
    s = s.strip().replace("\u00a0", " ")
    m = REF_PATTERN.match(s)
    if not m:
        return None
    book = m.group(1).lower().replace(" ", "")
    code = ALIASES.get(book) or ALIASES.get(m.group(1).lower())
    if not code:
        return None
    ch = m.group(2)
    v = m.group(3)
    out = f"{code}.{ch}" + (f".{v}" if v else "")
    if m.group(4):
        if m.group(5):
            out += f"-{code}.{m.group(4)}.{m.group(5)}"
        elif v:
            out += f"-{m.group(4)}"
    return out


def osis_attr_to_compact(osis):
    osis = osis.replace("Bible:", "").split(" ")[0]
    osis = re.sub(r"!.*", "", osis)
    return osis_ref_to_compact(osis) if osis else None


def markup_to_html(t):
    """Convert OSIS / ThML / GBF fragments from SWORD modules into a small, safe HTML subset."""
    # references
    def osisref(m):
        ref = osis_attr_to_compact(m.group(1))
        inner = m.group(2)
        if not ref:
            return inner
        return f'<a data-r="{ref}">{inner}</a>'

    t = re.sub(r'<reference[^>]*osisRef="([^"]*)"[^>]*>(.*?)</reference>', osisref, t, flags=re.S)

    def scrip(m):
        attrs = m.group(1)
        inner = m.group(2)
        pm = re.search(r'passage="([^"]*)"', attrs)
        plain = re.sub(r"<[^>]+>", "", inner)
        if pm and not re.search(r"[;,]", pm.group(1)) and not re.search(r"[;,]\s*\d", plain):
            ref = parse_ref_text(pm.group(1))
            if ref:
                return f'<a data-r="{ref}">{inner}</a>'
        return inner  # several references: linkify() links each one

    t = re.sub(r"<scripRef([^>]*)>(.*?)</scripRef>", scrip, t, flags=re.S | re.I)
    t = re.sub(r'<hi type="(bold)">(.*?)</hi>', r"<b>\2</b>", t, flags=re.S)
    t = re.sub(r'<hi type="(italic|emphasis)">(.*?)</hi>', r"<i>\2</i>", t, flags=re.S)
    t = re.sub(r'<hi type="super">(.*?)</hi>', r"<sup>\1</sup>", t, flags=re.S)
    t = re.sub(r'<hi type="small-caps">(.*?)</hi>', r'<span class="sc">\1</span>', t, flags=re.S)
    t = re.sub(r'<hi type="[^"]*">(.*?)</hi>', r"\1", t, flags=re.S)
    t = re.sub(r'<foreign[^>]*>(.*?)</foreign>', r'<i class="fx">\1</i>', t, flags=re.S)
    t = re.sub(r'<title[^>]*>(.*?)</title>', r"<h4>\1</h4>", t, flags=re.S)
    t = re.sub(r'<(lb|br)\s*/?>', "<br>", t)
    t = re.sub(r'<div[^>]*type="x-p"[^>]*sID[^>]*/>', "<p>", t)
    t = re.sub(r'<div[^>]*type="x-p"[^>]*eID[^>]*/>', "</p>", t)
    t = re.sub(r'<p[^>]*>', "<p>", t)
    t = re.sub(r'<(/?)(b|i|em|strong|sup|sub|h4|p|br|a|span)\b([^>]*)>', lambda m: "<%s%s%s>" % (
        m.group(1), {"em": "i", "strong": "b"}.get(m.group(2), m.group(2)),
        m.group(3) if m.group(2) in ("a", "span") else ""), t)
    # drop every other tag
    t = re.sub(r"<(?!/?(b|i|sup|sub|h4|p|br|a|span)\b)[^>]*>", "", t)
    t = re.sub(r"<p>\s*</p>", "", t)
    t = re.sub(r"(<br>\s*){3,}", "<br><br>", t)
    t = re.sub(r"\s+", " ", t).strip()
    # balance <p>
    opens = len(re.findall(r"<p>", t))
    closes = len(re.findall(r"</p>", t))
    if closes > opens:
        t = re.sub(r"</p>", "", t, count=closes - opens)
    elif opens > closes:
        t += "</p>" * (opens - closes)
    return linkify(t)


BOOK_TOKEN = r"(?:[1-3]\s?)?[A-Z][a-z]{1,13}\.?"
REF_RUN = re.compile(
    r"\b(" + BOOK_TOKEN + r")\s(\d{1,3}):(\d{1,3})(?:\s?[-–]\s?(\d{1,3}))?"
    r"((?:\s?[,;]\s?(?:\d{1,3}:)?\d{1,3}(?:\s?[-–]\s?\d{1,3})?(?![:\d]))*)")
CONT = re.compile(r"(\s?[,;]\s?)(?:(\d{1,3}):)?(\d{1,3})(?:\s?[-–]\s?(\d{1,3}))?")


def linkify(h):
    """Turn plain-text references ('Ps 10:17; 65:2', 'Acts 2:32, 4:20,33') into links,
    skipping text already inside <a> tags."""
    out = []
    pos = 0
    for m in re.finditer(r"<a\b[^>]*>.*?</a>|<[^>]+>", h, flags=re.S):
        out.append(_linkify_text(h[pos:m.start()]))
        out.append(m.group(0))
        pos = m.end()
    out.append(_linkify_text(h[pos:]))
    return "".join(out)


def _linkify_text(t):
    def rep(m):
        code = ALIASES.get(m.group(1).rstrip(".").lower().replace(" ", ""))
        if not code:
            return m.group(0)
        ch = m.group(2)
        first = f"{code}.{ch}.{m.group(3)}" + (f"-{m.group(4)}" if m.group(4) else "")
        head_end = m.start(5) - m.start(0)
        res = f'<a data-r="{first}">{m.group(0)[:head_end]}</a>'
        for c in CONT.finditer(m.group(5)):
            if c.group(2):
                ch = c.group(2)
            ref = f"{code}.{ch}.{c.group(3)}" + (f"-{c.group(4)}" if c.group(4) else "")
            label = c.group(0)[len(c.group(1)):]
            res += c.group(1) + f'<a data-r="{ref}">{label}</a>'
        return res
    return REF_RUN.sub(rep, t)


def stage_commentaries():
    log("== Commentaries")
    books = load_books()
    chapters = {b["id"]: b["v"] for b in books}
    meta = []
    for cid, mod, dpath, four, name, author, year in COMMENTARIES:
        zp = fetch(f"https://www.crosswire.org/ftpmirror/pub/sword/packages/rawzip/{mod}.zip")
        d = unzip(zp, os.path.join(CACHE, "sword", mod))
        zv = ZVerse(os.path.join(d, dpath), four=four)
        total = 0
        covered = {}
        for code in CODES:
            t = "ot" if code in OT else "nt"
            if zv.entry_count(t) == 0:
                continue
            lst = OT if t == "ot" else NT
            pos = lst.index(code)
            out = {}
            intro = zv.text(t, kjv_index(chapters, lst, pos, 0, 0))
            if intro.strip():
                out["i"] = markup_to_html(intro)
            chs = {}
            for ci, nverses in enumerate(chapters[code], start=1):
                cobj = {}
                cintro = zv.text(t, kjv_index(chapters, lst, pos, ci, 0))
                ch_html = markup_to_html(cintro)
                if re.sub(r"<[^>]+>", "", ch_html).strip():
                    cobj["i"] = ch_html
                entries = []
                last_key = None
                for v in range(1, nverses + 1):
                    idx = kjv_index(chapters, lst, pos, ci, v)
                    key = zv.raw_entry(t, idx)
                    if key[2] == 0:
                        last_key = None
                        continue
                    if key == last_key and entries:
                        entries[-1][1] = v
                        continue
                    last_key = key
                    # the JFB module links verse ranges to their first paragraph only; the rest of
                    # the range's notes follow it unindexed in the same block
                    h = markup_to_html(zv.text(t, idx, recover_orphans=(cid == "jfb")))
                    if re.sub(r"<[^>]+>", "", h).strip():
                        entries.append([v, v, h])
                    else:
                        last_key = None
                if entries:
                    cobj["e"] = entries
                if cobj:
                    chs[str(ci)] = cobj
            if chs or out:
                # one file per chapter keeps phone downloads small; 0.json is the book introduction
                for ch_num, cobj in chs.items():
                    total += write_json(f"comm/{cid}/{code}/{ch_num}.json", cobj)
                if out.get("i"):
                    total += write_json(f"comm/{cid}/{code}/0.json", {"i": out["i"]})
                covered[code] = ([0] if out.get("i") else []) + sorted(int(c) for c in chs)
        meta.append({"id": cid, "name": name, "author": author, "year": year, "books": covered})
        log(f"  {cid}: {len(covered)} books, {total/1e6:.1f} MB")
    write_json("comm/index.json", meta)


def stage_topics():
    log("== Topical (Nave, Torrey) & Easton's dictionary")
    out_index = {}
    sources = [
        ("nave", "Nave", "modules/lexdict/zld/nave/dict", "zld"),
        ("torrey", "Torrey", "modules/lexdict/rawld/torrey/torrey", "rawld"),
        ("easton", "Easton", "modules/lexdict/zld/easton/easton", "zld"),
    ]
    for sid, mod, base, kind in sources:
        zp = fetch(f"https://www.crosswire.org/ftpmirror/pub/sword/packages/rawzip/{mod}.zip")
        d = unzip(zp, os.path.join(CACHE, "sword", mod))
        reader = ZLD(os.path.join(d, base)) if kind == "zld" else RawLD(os.path.join(d, base))
        chunks = defaultdict(dict)
        names = []
        for key, text in reader.entries():
            k = key.strip()
            if not k or k.startswith("0000") or not text.strip():
                continue
            h = markup_to_html(text)
            # Torrey/Nave entries begin by repeating the heading; drop it
            h = re.sub(r"^<b>\s*" + re.escape(k) + r"\s*</b>\s*(<br>)*", "", h, flags=re.I)
            display = k.title() if k.isupper() else k
            letter = re.sub(r"[^A-Z]", "", k.upper()[:1]) or "_"
            chunks[letter][display] = h
            names.append(display)
        total = 0
        for letter, obj in chunks.items():
            total += write_json(f"topics/{sid}/{letter}.json", obj)
        out_index[sid] = names
        log(f"  {sid}: {len(names)} entries, {total/1e6:.1f} MB")
    write_json("topics/index.json", out_index)


# ---------------------------------------------------------------------------------------------
# Places (OpenBible.info geocoding)
# ---------------------------------------------------------------------------------------------
def stage_geo():
    log("== Places")
    path = fetch("https://raw.githubusercontent.com/openbibleinfo/Bible-Geocoding-Data/main/data/ancient.jsonl")
    places = []
    by_chapter = defaultdict(list)
    for line in open(path, encoding="utf-8"):
        d = json.loads(line)
        lonlat = None
        modern = None
        conf = 0
        for ident in d.get("identifications", []):
            for res in ident.get("resolutions", []):
                if res.get("lonlat"):
                    lonlat = res["lonlat"]
                    desc = res.get("description", "")
                    modern = re.sub(r"<[^>]+>", "", desc)
                    break
            if lonlat:
                conf = ident.get("score", {}).get("vote_average", 0)
                break
        if not lonlat:
            continue
        lon, lat = [round(float(x), 3) for x in lonlat.split(",")]
        types = d.get("types", [])
        verses = []
        for v in d.get("verses", []):
            ref = osis_ref_to_compact(v.get("osis", ""))
            if ref:
                verses.append(ref)
        idx = len(places)
        names = d.get("translation_name_counts", {})
        # photo of the site today (Wikimedia Commons), shown with its credit
        photo = None
        thumb = (d.get("media") or {}).get("thumbnail") or {}
        if not thumb:
            for a in json.loads(d.get("extra") or "{}").get("associations", []):
                if a.get("thumbnail"):
                    thumb = a["thumbnail"]
                    break
        cu = thumb.get("credit_url") or ""
        if "commons.wikimedia.org/wiki/File:" in cu:
            photo = {"f": cu.split("File:", 1)[1], "c": thumb.get("credit", ""),
                     "d": re.sub(r"<[^>]+>", "", thumb.get("description", ""))}
        alt = [n for n in names if n != d["friendly_id"]][:3]
        places.append({
            "n": d["friendly_id"], "a": alt, "lon": lon, "lat": lat,
            "m": modern or "", "ty": types[0] if types else "", "c": conf, "v": verses[:400],
            **({"ph": photo} if photo else {}),
        })
        for ref in set(".".join(r.split(".")[:2]) for r in verses):
            by_chapter[ref].append(idx)
    write_json("geo/places.json", places)
    write_json("geo/byChapter.json", by_chapter)
    log(f"  {len(places)} places with coordinates")


# ---------------------------------------------------------------------------------------------
# Base map (Natural Earth) projected to an SVG for the Bible lands
# ---------------------------------------------------------------------------------------------
NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"
BBOX = (9.0, 22.0, 56.0, 43.0)  # lon0, lat0, lon1, lat1  (Rome .. Persia, Egypt .. Black Sea)


def stage_maps():
    log("== Base map")
    import math
    lon0, lat0, lon1, lat1 = BBOX
    W = 1600
    # equirectangular with cos(mid-lat) scaling
    k = math.cos(math.radians((lat0 + lat1) / 2))
    H = round(W * (lat1 - lat0) / ((lon1 - lon0) * k))

    def proj(lon, lat):
        return ((lon - lon0) / (lon1 - lon0) * W, (lat1 - lat) / (lat1 - lat0) * H)

    def ring_path(ring, tol=1.2):
        pts = []
        last = None
        for lon, lat in ring:
            x, y = proj(lon, lat)
            if last is None or abs(x - last[0]) + abs(y - last[1]) > tol:
                pts.append((x, y))
                last = (x, y)
        if len(pts) < 3:
            return ""
        return "M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in pts) + "Z"

    def line_path(coords, tol=1.0):
        pts = []
        last = None
        for lon, lat in coords:
            x, y = proj(lon, lat)
            if last is None or abs(x - last[0]) + abs(y - last[1]) > tol:
                pts.append((x, y))
                last = (x, y)
        if len(pts) < 2:
            return ""
        return "M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in pts)

    def in_box(coords):
        for lon, lat in coords:
            if lon0 - 5 <= lon <= lon1 + 5 and lat0 - 5 <= lat <= lat1 + 5:
                return True
        return False

    def polys(geom):
        if geom["type"] == "Polygon":
            return [geom["coordinates"]]
        if geom["type"] == "MultiPolygon":
            return geom["coordinates"]
        return []

    countries = json.load(open(fetch(NE + "ne_50m_admin_0_countries.geojson"), encoding="utf-8"))
    out = {"w": W, "h": H, "bbox": BBOX, "countries": [], "lakes": [], "rivers": []}
    for f in countries["features"]:
        d = ""
        for poly in polys(f["geometry"]):
            if not in_box(poly[0]):
                continue
            d += ring_path(poly[0])
        if d:
            p = f["properties"]
            lx, ly = proj(p.get("LABEL_X", 0) or 0, p.get("LABEL_Y", 0) or 0)
            out["countries"].append({"n": p.get("NAME", ""), "d": d, "lx": round(lx), "ly": round(ly)})
    lakes = json.load(open(fetch(NE + "ne_10m_lakes.geojson"), encoding="utf-8"))
    for f in lakes["features"]:
        for poly in polys(f["geometry"]):
            if in_box(poly[0]):
                d = ring_path(poly[0], tol=0.4)
                if d:
                    out["lakes"].append({"n": f["properties"].get("name", ""), "d": d})
    rivers = json.load(open(fetch(NE + "ne_10m_rivers_lake_centerlines.geojson"), encoding="utf-8"))
    for f in rivers["features"]:
        g = f["geometry"]
        lines = [g["coordinates"]] if g["type"] == "LineString" else g["coordinates"] if g["type"] == "MultiLineString" else []
        for ln in lines:
            if in_box(ln) and (f["properties"].get("scalerank", 9) <= 6 or f["properties"].get("name") in ("Jordan",)):
                d = line_path(ln)
                if d:
                    out["rivers"].append({"n": f["properties"].get("name", ""), "d": d})
    size = write_json("geo/basemap.json", out)
    log(f"  basemap {W}x{H}, {len(out['countries'])} countries, {len(out['lakes'])} lakes, "
        f"{len(out['rivers'])} rivers, {size/1e3:.0f} KB")


def stage_manifest():
    """List every data file by group so the app can download a group for offline use."""
    groups = defaultdict(list)
    sizes = defaultdict(int)
    for dirpath, _, files in os.walk(OUT):
        for f in files:
            full = os.path.join(dirpath, f)
            rel = os.path.relpath(full, OUT).replace(os.sep, "/")
            if rel == "manifest.json":
                continue
            parts = rel.split("/")
            if parts[0] == "bibles":
                g = "bible:" + parts[1]
            elif parts[0] == "comm" and len(parts) > 2:
                g = "comm:" + parts[1]
            elif parts[0] in ("strongs", "conc"):
                g = "strongs"
            else:
                g = "core"
            groups[g].append(rel)
            sizes[g] += os.path.getsize(full)
    out = {g: {"files": sorted(v), "bytes": sizes[g]} for g, v in sorted(groups.items())}
    write_json("manifest.json", out)
    log("== Manifest", {g: len(v["files"]) for g, v in out.items()})


STAGES = {
    "bibles": stage_bibles,
    "strongs": stage_strongs,
    "xref": stage_xref,
    "commentaries": stage_commentaries,
    "topics": stage_topics,
    "geo": stage_geo,
    "maps": stage_maps,
    "manifest": stage_manifest,
}

if __name__ == "__main__":
    wanted = sys.argv[1:] or list(STAGES)
    for s in wanted:
        STAGES[s]()
