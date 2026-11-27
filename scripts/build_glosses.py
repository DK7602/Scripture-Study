#!/usr/bin/env python3
"""Modern English glosses of the Hebrew and Greek words, for finding them in translations that don't carry Strong's
numbers (CSB, NIV, NKJV, NASB, BSB, WEB, ASV).

The app matches each word of such a translation to the Strong's numbers in the same verse of the KJV (align.ts), at
first by the English the KJV uses for them (strongs/words.json). Where a translation chooses other words ("Shepherd
God's flock" for the KJV's "Feed the flock of God", 1 Peter 5:2), those find nothing; these glosses are a second
chance: "to shepherd" for ποιμαίνω, "eagerly" for προθύμως, "greedily" for αἰσχροκερδῶς.

From STEPBible's Translators Brief lexicons of Extended Strongs (TBESG for Greek, TBESH for Hebrew), Tyndale House
Cambridge / STEPBible.org, CC BY 4.0: their short gloss and the glosses in bold in their definitions.
Downloaded once into .cache/stepbible from github.com/STEPBible/STEPBible-Data (Lexicons).

Writes public/data/strongs/glosses.json: {stem: "G4290 H7462|G147 ..."}, the words reduced by gstem() (the same
rules as gstem in src/lib/align.ts): before the "|" the numbers whose short gloss has it ("eagerly", προθύμως), after
it those with it only in their definitions ("from eagerness for base gain", αἰσχροκερδῶς), tried only after.
Run: python3 scripts/build_glosses.py
"""
import json, os, re
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, '.cache', 'stepbible')
FILES = {
    'G': 'TBESG - Translators Brief lexicon of Extended Strongs for Greek - STEPBible.org CC BY.txt',
    'H': 'TBESH - Translators Brief lexicon of Extended Strongs for Hebrew - STEPBible.org CC BY.txt',
}
OUT = os.path.join(ROOT, 'public', 'data', 'strongs', 'glosses.json')

# words that say nothing of a word's meaning (and the lexicons' own abbreviations)
STOP = set("""the a an and of to in on for is are was were be been being by with as at from that this these those it its or
nor not no but if so than then into upon one who whom which what whose his her their our your my me him them us you he she
they we also very much more most only such any all some other another out up down over under about after before through
against among within without between there here thing things something someone etc lxx syn see cf esp prob lit fig
used use make made way kind sort part person people man men say said said whom do does did have has had can may might must
shall should will would let where when how why while until because just now still yet same each every both either
neither whether even""".split())


def gstem(word):
    """A word reduced to a rough stem, the same on both sides (src/lib/align.ts, gstem): "greedily", "greedy", "greed"
    -> "greed"; "eagerly", "eagerness" -> "eager"; "overseeing", "oversees", "oversee" -> "overse"."""
    w = re.sub(r'[^a-z]', '', word.lower())
    if len(w) < 3:
        return None
    for suf in ('ingly', 'edly', 'fully', 'ily', 'ly', 'ness', 'ings', 'ing', 'ied', 'ies', 'ed', 's', 'y'):
        if w.endswith(suf) and len(w) - len(suf) >= 4:
            w = w[: -len(suf)]
            break
    if w.endswith('e') and len(w) > 4:
        w = w[:-1]
    return w


def base_number(code, prefix):
    """"G0147" -> "G147"; "H0430G" -> "H430" (the KJV's form)."""
    m = re.match(r'^([GH])0*(\d+)', code)
    return f'{m.group(1)}{m.group(2)}' if m and m.group(1) == prefix else None


def main():
    index = defaultdict(set)  # stem -> numbers, from the short glosses
    more = defaultdict(set)  # ... from the glosses in the definitions
    entries = 0
    for prefix, name in FILES.items():
        with open(os.path.join(SRC, name), encoding='utf-8') as f:
            for line in f:
                cols = line.rstrip('\n').split('\t')
                if len(cols) < 7:
                    continue
                num = base_number(cols[0], prefix)
                if not num:
                    continue
                entries += 1
                text = [(cols[6], index)]
                if len(cols) > 7:
                    text += [(b, more) for b in re.findall(r'<b>([^<]+)</b>', cols[7]) if re.search(r'[a-z]', b)]
                for phrase, into in text:
                    phrase = re.sub(r'\([^)]*\)|\[[^\]]*\]', ' ', phrase)  # "(LORD)-Elohe", "[in LXX …]"
                    for w in re.findall(r"[A-Za-z]+", phrase):
                        if w.lower() in STOP or not w.isascii():
                            continue
                        st = gstem(w)
                        if st and st not in STOP:
                            into[st].add(num)
    # a stem that stands for very many words tells nothing (common words of the glosses)
    order = lambda nums: ' '.join(sorted(nums, key=lambda n: (n[0], int(n[1:]))))
    out = {}
    for st in sorted(set(index) | set(more)):
        first, then = index.get(st, set()), more.get(st, set()) - index.get(st, set())
        if len(first) + len(then) > 60:
            continue
        out[st] = order(first) + ('|' + order(then) if then else '')
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print(f'{entries} lexicon rows, {len(out)} stems, {os.path.getsize(OUT) / 1e3:.0f} KB')


if __name__ == '__main__':
    main()
