#!/usr/bin/env python3
"""Old Testament quotations in the New Testament, for italics in every translation.

The World English Bible's USFM (eBible.org, public domain, cached in .cache/eng-web by build_data.py) puts a
cross-reference note right after each Old Testament quotation in the New Testament ("Out of Egypt I called my
son."\\x Hosea 11:1). The quotation is the innermost quoted passage ending there (and any joined to it by "and" or
"again"). Its words carry the Greek Strong's numbers, so for each verse this writes the numbers inside the quotation
(q) and the verse's others (n), and, in the verse where it ends, the passage quoted (e); the reader (src/lib/otquotes.ts) finds those words in whatever
translation is shown and sets them in italics.

Writes public/data/quotes/<BOOK>.json:
  {"chapter:verse": {"q": [...], "n": [...], "e": [{"t": "Hos 11:1", "r": ["HOS.11.1"]}]}}
Run: python3 scripts/build_quotes.py
"""
import re, glob, os, json, sys
from collections import Counter
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, '.cache', 'eng-web')
OUT = os.path.join(ROOT, 'public', 'data', 'quotes')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_data import parse_ref_text  # noqa: E402
NT = ['MAT','MRK','LUK','JHN','ACT','ROM','1CO','2CO','GAL','EPH','PHP','COL','1TH','2TH','1TI','2TI','TIT','PHM','HEB','JAS','1PE','2PE','1JN','2JN','3JN','JUD','REV']
OPEN = {'”': '“', '’': '‘'}
def parse(code):
    f = glob.glob(f'{WEB}/*-{code}eng-web.usfm')[0]
    s = open(f, encoding='utf-8').read()
    s = re.sub(r'\\f .*?\\f\*', '', s, flags=re.S)
    out_text = []  # characters
    toks = []      # (start, end, word, strong, chapter, verse)
    marks = []     # (offset, chapter, verse, target)
    ch = v = 0
    pos = 0
    i = 0
    pat = re.compile(r'\\c (\d+)|\\v (\d+) |\\x .*?\\xt ([^\\]*?)\s*\\x\*|\\\+?w ([^|\\]+)\|strong="([^"]+)"\\\+?w\*|\\[a-z0-9+]+\*?\s?|([^\\]+)', re.S)
    for m in pat.finditer(s):
        if m.group(1): ch = int(m.group(1)); v = 0; continue
        if m.group(2): v = int(m.group(2)); continue
        if m.group(3) is not None: marks.append((pos, ch, v, m.group(3).strip())); continue
        if m.group(4):
            w = m.group(4); a = pos; out_text.append(w); pos += len(w); toks.append((a, pos, w, m.group(5), ch, v)); continue
        if m.group(6):
            t = m.group(6).replace('\n', ' ')
            out_text.append(t); pos += len(t)
    return ''.join(out_text), toks, marks

def segments(text, end):
    """the innermost quotation ending just before `end` (a note), and any joined to it by 'and'"""
    j = end
    while j > 0 and text[j-1] in ' .,;:!?—': j -= 1
    closers = ''
    k = j
    b = None  # end of quoted words (exclusive): the closing mark nearest the words (‘…praise’?” — the inner one)
    while k > 0 and text[k-1] in '”’?!.,;:':
        if text[k-1] in '”’': closers = text[k-1] + closers; b = k - 1
        k -= 1
    if not closers: return []
    inner = closers[0]
    op = OPEN[inner]
    a = text.rfind(op, 0, b)
    if a < 0: return []
    segs = [(a + 1, b)]
    # earlier segments of the same quote: ‘…,’ and, ‘…’ (or “… Immanuel,” which is, being interpreted, “God with us.”)
    while True:
        t = a - 1
        while t > 0 and text[t-1] in ' ,;:': t -= 1
        m = re.search(r'(\band|\bagain|\balso|\bwhich is,? being interpreted)\s*,?\s*$', text[max(0, t-40):t])
        if not m: break
        t2 = t - len(m.group(0))
        while t2 > 0 and text[t2-1] in ' ,': t2 -= 1
        if t2 == 0 or text[t2-1] not in '’”.,!?': break
        e = t2
        while e > 0 and text[e-1] in '.,!?': e -= 1
        if text[e-1] != inner: break
        a2 = text.rfind(op, 0, e - 1)
        if a2 < 0: break
        segs.insert(0, (a2 + 1, e - 1)); a = a2
    return segs

OT = ['GEN','EXO','LEV','NUM','DEU','JOS','JDG','RUT','1SA','2SA','1KI','2KI','1CH','2CH','EZR','NEH','EST','JOB','PSA','PRO',
      'ECC','SNG','ISA','JER','LAM','EZK','DAN','HOS','JOL','AMO','OBA','JON','MIC','NAM','HAB','ZEP','HAG','ZEC','MAL']
STOP = set("the a an and of to in on for is are was were be been will shall i you he she it we they me him her them my your his "
           "their our its that this who whom which what not no with as by from at but or so all thou thee thy ye one isn don didn "
           "won can aren wasn haven doesn shouldn couldn wouldn".split())


def words_of(text):
    out = []
    for w in re.findall(r"[a-z]+", text.lower().replace("’", "'")):
        if w in STOP or len(w) < 3:
            continue
        out.append(w[:-1] if len(w) > 4 and w.endswith('s') else w)
    return out


# notes after a speech that echo a passage without quoting it
NOT_QUOTES = {
    'JHN 7:52',  # "Search and see that no prophet has arisen out of Galilee" (Isaiah 9:1)
    'JHN 10:21',  # "It isn't possible for a demon to open the eyes of the blind" (Exodus 4:11)
}

_ot = {}


def ot_verses(code):
    """The WEB's Old Testament verses of a book: {(chapter, verse): plain text}."""
    if code not in _ot:
        s = open(glob.glob(f'{WEB}/*-{code}eng-web.usfm')[0], encoding='utf-8').read()
        s = re.sub(r'\\(f|x) .*?\\\1\*', '', s, flags=re.S)
        s = re.sub(r'\|[a-z-]+="[^"]*"', '', s)
        d = {}
        ch = 0
        for m in re.finditer(r'\\c (\d+)|\\v (\d+) ([^\\]*(?:\\(?![cv] )[^\\]*)*)', s):
            if m.group(1):
                ch = int(m.group(1))
            else:
                d[(ch, int(m.group(2)))] = re.sub(r'\\[a-z0-9+]+\*?', ' ', m.group(3))
        _ot[code] = d
    return _ot[code]


def target_words(target):
    """The words of the Old Testament passages a note points to ("Exodus 20:12; Deuteronomy 5:16-20; 66:10,13")."""
    words = set()
    code = None
    for part in target.split(';'):
        part = re.sub(r'^See\s+|\s+LXX$', '', part.strip())
        m = re.match(r'^((?:[1-3]\s)?[A-Za-z][A-Za-z ]*?)\s+(\d.*)$', part)
        if m:
            r = parse_ref_text(m.group(1) + ' 1:1')
            code = r.split('.')[0] if r else None
            part = m.group(2)
        if code not in OT:
            continue
        ch = None
        for piece in part.split(','):
            piece = piece.strip()
            mm = re.match(r'^(?:(\d+):)?(\d+)(?:-(?:(\d+):)?(\d+))?$', piece)
            if not mm:
                continue
            if mm.group(1):
                ch = int(mm.group(1))
            if ch is None:
                continue
            v1 = int(mm.group(2))
            v2 = int(mm.group(4) or v1)
            c2 = int(mm.group(3) or ch)
            for (c, v), t in ot_verses(code).items():
                if (c, v) >= (ch, v1) and (c, v) <= (c2, v2):
                    words.update(words_of(t))
    if 'yahweh' in words:
        words.add('lord')  # the New Testament's "Lord" for the Old's name
    return words


BOOKS = json.load(open(os.path.join(ROOT, 'public', 'data', 'books.json'), encoding='utf-8'))
BY_NAME = {b['name']: b for b in BOOKS}


def citation(target):
    """A note's passages, abbreviated as printed after the quotation, and as references to open:
    "Isaiah 61:2; 66:10,13" -> ("Isa 61:2; 66:10, 13", ["ISA.61.2", "ISA.66.10", "ISA.66.13"])."""
    label = []
    refs = []
    bk = None
    for part in target.split(';'):
        part = re.sub(r'^See\s+', '', part.strip())
        lxx = part.endswith(' LXX')
        part = re.sub(r'\s+LXX$', '', part)
        m = re.match(r'^((?:[1-3] )?[A-Z][A-Za-z ]*?) (\d.*)$', part)
        if m:
            bk = BY_NAME.get(m.group(1)) or BY_NAME.get(m.group(1).replace('Psalm', 'Psalms'))
            part = m.group(2)
        if not bk:
            continue
        ch = None
        shown = []
        for piece in part.split(','):
            mm = re.match(r'^(?:(\d+):)?(\d+)(?:[-—–](?:(\d+):)?(\d+))?$', piece.strip())
            if not mm:
                continue
            ch = int(mm.group(1)) if mm.group(1) else ch
            if ch is None:
                continue
            v1 = int(mm.group(2))
            ref = f"{bk['id']}.{ch}.{v1}"
            if mm.group(4):
                ref += f"-{mm.group(3)}.{mm.group(4)}" if mm.group(3) else f"-{mm.group(4)}"
            refs.append(ref)
            shown.append(piece.strip().replace('-', '–').replace('—', '–'))
        if shown:
            text = ', '.join(shown) + (' LXX' if lxx else '')
            label.append(text if m is None else f"{bk['abbr']} {text}")
    return '; '.join(label), refs


def main(words_out=None):
    """(words_out, if given, gets each verse's quoted words: "BOOK.chapter.verse" -> [...], for checking the reader)"""
    os.makedirs(OUT, exist_ok=True)
    dropped = []
    total = verses = 0
    for code in NT:
        text, toks, marks = parse(code)
        book = {}
        for (off, ch, v, target) in marks:
            segs = segments(text, off)
            if not segs:
                continue
            # Some notes follow a speech that only echoes a passage, or point to another New Testament one: left out
            # are those to no Old Testament passage, and speeches sharing no words with the passage noted. (The
            # apostles often quote the Greek Old Testament, so a real quotation can share few words with the WEB's,
            # translated from the Hebrew: "perfected praise" for "established strength".)
            said = [w for (a, b) in segs for w in words_of(text[a:b])]
            ot = target_words(target)
            lxx = target.endswith('LXX')
            if (not (ot or lxx) or f'{code} {ch}:{v}' in NOT_QUOTES
                    or (not lxx and len(said) >= 8 and not any(w in ot for w in said))):
                dropped.append(f'{code} {ch}:{v} -> {target}: {" ".join(text[a:b] for a, b in segs)[:70]}')
                continue
            total += 1
            inside = {}  # verse -> its words in the quoted passage
            for (a, b) in segs:
                for (ta, tb, w, sn, c, vv) in toks:
                    if ta >= a and tb <= b:
                        inside.setdefault((c, vv), []).append((w, sn))
            # a quoted passage over several verses is often a whole speech with the quotation at its end ("I came to
            # throw fire on the earth … father against son" for Micah 7:6): its other verses only where they share
            # any of the passage's words
            touched = set()
            for (c, vv), ws in inside.items():
                said = words_of(' '.join(w for w, sn in ws))
                if (c, vv) != (ch, v) and not lxx and len(said) >= 3 and not any(x in ot for x in said):
                    dropped.append(f'{code} {c}:{vv} (part of {ch}:{v} -> {target}): {" ".join(w for w, sn in ws)[:60]}')
                    continue
                d = book.setdefault(f'{c}:{vv}', {'q': []})
                d['q'].extend(sn for w, sn in ws)
                touched.add(f'{c}:{vv}')
                if words_out is not None:
                    words_out.setdefault(f'{code}.{c}.{vv}', []).extend(w for w, sn in ws)
            # the passage quoted, printed after the quotation where it ends (in the verse of the note)
            if touched:
                last = f'{ch}:{v}' if f'{ch}:{v}' in touched else max(touched, key=lambda k: tuple(map(int, k.split(':'))))
                label, refs = citation(target)
                if label:
                    book[last].setdefault('e', []).append({'t': label, 'r': refs})
        # the verse's other Strong's numbers (those outside the quotation)
        allsn = {}
        for (ta, tb, w, sn, c, vv) in toks:
            allsn.setdefault(f'{c}:{vv}', []).append(sn)
        for k, d in book.items():
            rest = Counter(allsn.get(k, [])) - Counter(d['q'])
            d['n'] = sorted(rest.elements())
            d['q'] = sorted(d['q'])
        if book:
            json.dump(book, open(os.path.join(OUT, f'{code}.json'), 'w'), separators=(',', ':'))
        verses += len(book)
    print(f'{total} quotations in {verses} verses; {len(dropped)} notes not quotations:')
    for d in dropped:
        print('  ', d)


if __name__ == '__main__':
    main()
