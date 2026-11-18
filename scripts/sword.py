"""Minimal readers for CrossWire SWORD module formats (zCom/zCom4/zText, zLD, RawLD).

Only what Scripture Study's data build needs; KJV versification only.
"""
import os
import struct
import zlib


class ZVerse:
    """zText / zCom (10-byte verse index) and zCom4 (12-byte verse index)."""

    def __init__(self, path, four=False):
        self.path = path
        self.four = four
        self.files = {}
        for t in ("ot", "nt"):
            for prefix in ("b", "c", "v"):
                s = os.path.join(path, f"{t}.{prefix}zs")
                if os.path.exists(s):
                    self.files[t] = (
                        open(s, "rb").read(),
                        open(os.path.join(path, f"{t}.{prefix}zv"), "rb").read(),
                        open(os.path.join(path, f"{t}.{prefix}zz"), "rb"),
                    )
        self._cache = {}

    def entry_count(self, t):
        if t not in self.files:
            return 0
        return len(self.files[t][1]) // (12 if self.four else 10)

    def raw_entry(self, t, idx):
        """Returns (block, start, size) for verse-index slot idx."""
        zs, zv, zz = self.files[t]
        if self.four:
            return struct.unpack_from("<III", zv, idx * 12)
        return struct.unpack_from("<IIH", zv, idx * 10)

    def block(self, t, b):
        key = (t, b)
        if key not in self._cache:
            zs, zv, zz = self.files[t]
            off, size, _uc = struct.unpack_from("<III", zs, b * 12)
            zz.seek(off)
            self._cache = {}  # keep memory small: one block at a time
            self._cache[key] = zlib.decompress(zz.read(size))
        return self._cache[key]

    def text(self, t, idx, recover_orphans=False):
        """Entry text. With recover_orphans, also return text stored after the entry that no
        verse points to (some modules link a verse range to its first paragraph only)."""
        if t not in self.files:
            return ""
        b, start, size = self.raw_entry(t, idx)
        if size == 0:
            return ""
        data = self.block(t, b)
        end = start + size
        if recover_orphans:
            nxt = self._next_start(t, b, start)
            end = max(end, nxt if nxt is not None else len(data))
        return data[start:end].decode("utf-8", "replace")

    def _next_start(self, t, b, start):
        if not hasattr(self, "_starts"):
            self._starts = {}
        if t not in self._starts:
            import bisect  # noqa: F401
            starts = {}
            for i in range(self.entry_count(t)):
                bb, ss, nn = self.raw_entry(t, i)
                if nn:
                    starts.setdefault(bb, set()).add(ss)
            self._starts[t] = {k: sorted(v) for k, v in starts.items()}
        import bisect
        lst = self._starts[t].get(b, [])
        i = bisect.bisect_right(lst, start)
        return lst[i] if i < len(lst) else None


def kjv_index(book_chapters, testament_books, book_pos, ch, v):
    """SWORD testament index for (book, ch, v) in KJV versification.

    book_chapters: dict book -> [verse counts]; testament_books: ordered list of books in testament.
    v == 0 gives chapter heading, ch == 0 gives book intro.
    """
    idx = 2
    for b in testament_books[:book_pos]:
        idx += 1 + sum(1 + n for n in book_chapters[b])
    if ch == 0:
        return idx
    idx += 1
    for n in book_chapters[testament_books[book_pos]][: ch - 1]:
        idx += 1 + n
    return idx + v


class ZLD:
    """Compressed lexicon/dictionary (zLD)."""

    def __init__(self, base):
        self.idx = open(base + ".idx", "rb").read()
        self.dat = open(base + ".dat", "rb").read()
        self.zdx = open(base + ".zdx", "rb").read()
        self.zdt = open(base + ".zdt", "rb")
        self._blocks = {}

    def _block(self, n):
        if n not in self._blocks:
            off, size = struct.unpack_from("<II", self.zdx, n * 8)
            self.zdt.seek(off)
            self._blocks[n] = zlib.decompress(self.zdt.read(size))
        return self._blocks[n]

    def entries(self):
        for i in range(len(self.idx) // 8):
            off, size = struct.unpack_from("<II", self.idx, i * 8)
            rec = self.dat[off:off + size]
            nl = rec.find(b"\n")
            key = rec[:nl].rstrip(b"\r").decode("utf-8", "replace")
            body = rec[nl + 1:]
            if len(body) < 8:
                continue
            bnum, enum = struct.unpack_from("<II", body, 0)
            blk = self._block(bnum)
            count = struct.unpack_from("<I", blk, 0)[0]
            if enum >= count:
                continue
            eoff, esize = struct.unpack_from("<II", blk, 4 + enum * 8)
            text = blk[eoff:eoff + esize].rstrip(b"\x00").decode("utf-8", "replace")
            yield key, text


class RawLD:
    """Uncompressed lexicon/dictionary (RawLD, 6-byte index; RawLD4, 8-byte index)."""

    def __init__(self, base, four=False):
        self.idx = open(base + ".idx", "rb").read()
        self.dat = open(base + ".dat", "rb").read()
        self.four = four

    def entries(self):
        w = 8 if self.four else 6
        fmt = "<II" if self.four else "<IH"
        for i in range(len(self.idx) // w):
            off, size = struct.unpack_from(fmt, self.idx, i * w)
            rec = self.dat[off:off + size]
            nl = rec.find(b"\n")
            key = rec[:nl].rstrip(b"\r").decode("utf-8", "replace")
            yield key, rec[nl + 1:].decode("utf-8", "replace")
