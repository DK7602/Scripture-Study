/**
 * Strong's numbers for versions that don't carry them (CSB, NIV, NKJV, BSB, WEB, ASV…).
 *
 * The KJV is tagged word-by-word with Strong's numbers. For another translation we take the
 * Strong's numbers that occur in the same KJV verse, and match each word against the English
 * renderings the KJV uses for those numbers (strongs/words.json). Example: CSB John 15:4
 * "Remain in me" -> "remain" is a KJV rendering of G3306 (μένω), which occurs in KJV John 15:4.
 */
import { bibleBook, getJSON } from './data'
import { tokenize, type Tok } from './markup'

export interface VerseAlign {
  nums: Set<string>
  toks: { t: string; s: string[] }[] // the KJV's tagged words in this verse, in order
  red: 'all' | 'none' | 'part' // words of Christ in the KJV
  redWords: Set<string>
  plainWords: Set<string>
  redSegs: { start: string[]; end: string[]; toEnd: boolean }[] // each stretch of His words (for translations without quotation marks)
  redFrac: number
}

export interface ChapterAlign {
  verses: Map<number, VerseAlign>
  words: Record<string, string[]>
  paras: number[] // the KJV's paragraph starts
}

export const norm = (w: string) =>
  w
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z]/g, '')

function segments(ws: { w: string; red: boolean }[]) {
  const out: { start: string[]; end: string[]; toEnd: boolean }[] = []
  let cur: string[] | null = null
  ws.forEach((x, i) => {
    if (x.red) (cur ??= []).push(x.w)
    if (cur && (!x.red || i === ws.length - 1)) {
      out.push({ start: cur.slice(0, 3), end: cur.slice(-3), toEnd: x.red && i === ws.length - 1 })
      cur = null
    }
  })
  return out
}

const cache = new Map<string, Promise<ChapterAlign>>()

export function chapterAlign(book: string, chapter: number): Promise<ChapterAlign> {
  const key = `${book}.${chapter}`
  let p = cache.get(key)
  if (!p) {
    p = Promise.all([bibleBook('KJV', book), getJSON<Record<string, string[]>>('strongs/words.json')]).then(([kjv, words]) => {
      const verses = new Map<number, VerseAlign>()
      ;(kjv.c[chapter - 1] ?? []).forEach((text, i) => {
        const all = tokenize(text)
        const toks = all.filter((t) => t.s?.length).map((t) => ({ t: t.t.replace(/[^\p{L}\s'’-]/gu, '').trim(), s: t.s! }))
        // words of Christ: KJV tokens carry red flags; split phrases into single words
        const ws: { w: string; red: boolean }[] = []
        for (const t of all) if (!t.sp) for (const w of t.t.split(/\s+/)) if (norm(w)) ws.push({ w: norm(w), red: !!t.red })
        const reds = ws.filter((x) => x.red)
        const red = reds.length === 0 ? 'none' : reds.length === ws.length ? 'all' : 'part'
        verses.set(i + 1, {
          nums: new Set(toks.flatMap((t) => t.s)),
          toks,
          red,
          redWords: new Set(reds.map((x) => x.w).filter((w) => w.length > 2)),
          plainWords: new Set(ws.filter((x) => !x.red).map((x) => x.w).filter((w) => w.length > 2)),
          redSegs: segments(ws),
          redFrac: ws.length ? reds.length / ws.length : 0,
        })
      })
      return { verses, words, paras: kjv.p?.[chapter] ?? [] }
    })
    p.catch(() => cache.delete(key))
    cache.set(key, p)
  }
  return p
}

function variants(word: string): string[] {
  const w = word
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z']/g, '')
    .replace(/'s$/, '')
    .replace(/^'+|'+$/g, '')
  if (w.length < 3) return []
  const out = [w]
  const add = (x: string) => x.length > 2 && !out.includes(x) && out.push(x)
  if (w.endsWith('ies')) add(w.slice(0, -3) + 'y')
  if (w.endsWith('es')) add(w.slice(0, -2))
  if (w.endsWith('s')) {
    add(w.slice(0, -1))
    add(w.slice(0, -1) + 'eth')
    add(w.slice(0, -1) + 'th')
  }
  if (w.endsWith('ed')) {
    add(w.slice(0, -2))
    add(w.slice(0, -1))
  }
  if (w.endsWith('ing')) {
    add(w.slice(0, -3))
    add(w.slice(0, -3) + 'e')
  }
  add(w + 'eth')
  add(w + 's')
  return out
}

/** The Strong's number for a word of another translation, if the same verse in the KJV supports it. */
export function matchWord(word: string, v: VerseAlign | undefined, words: Record<string, string[]>): string | null {
  if (!v || !v.nums.size) return null
  for (const form of variants(word)) {
    const cands = words[form]
    if (!cands) continue
    const hit = cands.find((n) => v.nums.has(n))
    if (hit) return hit
  }
  return null
}

// ---------------------------------------------------------------------------------------------
// Words of Christ in red for translations without red-letter markup
// ---------------------------------------------------------------------------------------------
const OPEN = /^[“"]/
const CLOSE = /[”"][)\].,;:!?]*$|[”"]$/

/**
 * The KJV marks which words Jesus speaks. Whole-verse speeches are red throughout; for verses that
 * are only partly His words, modern translations put the speech in quotation marks (each quoted part
 * is compared with the KJV's red and plain words), and translations without quotation marks (ASV)
 * are matched on the KJV's first and last red words.
 */
export function applyRed(toks: Tok[], va: VerseAlign | undefined): Tok[] {
  if (!va || va.red === 'none') return toks
  if (va.red === 'all') return toks.map((t) => (t.sp ? t : { ...t, red: true }))
  const words = toks.map((t, i) => ({ i, w: t.sp ? '' : norm(t.t) })).filter((x) => x.w)

  // 1. quotation marks
  const segs: [number, number][] = []
  let open: number | null = null
  toks.forEach((t, i) => {
    if (t.sp) return
    if (OPEN.test(t.t) && open === null) open = i
    if (CLOSE.test(t.t) && !(OPEN.test(t.t) && t.t.length < 2)) {
      segs.push([open ?? 0, i])
      open = null
    }
  })
  if (open !== null) segs.push([open, toks.length - 1])
  if (segs.length) {
    let out = toks
    let any = false
    for (const [a, z] of segs) {
      const seg = words.filter((x) => x.i >= a && x.i <= z).map((x) => x.w).filter((w) => w.length > 2)
      const r = seg.filter((w) => va.redWords.has(w)).length
      const p = seg.filter((w) => va.plainWords.has(w) && !va.redWords.has(w)).length
      if ((r > 0 && r >= p) || (segs.length === 1 && va.redFrac >= 0.3)) {
        out = out.map((t, i) => (i >= a && i <= z && !t.sp ? { ...t, red: true } : t))
        any = true
      }
    }
    if (any) return out
  }

  // 2. no quotation marks: find each stretch of His words by the KJV's first and last red words
  const find = (seq: string[], from: number) => {
    for (let n = Math.min(3, seq.length); n >= 2; n--) {
      const want = seq.slice(0, n)
      for (let k = from; k + n <= words.length; k++) if (want.every((w, j) => words[k + j].w === w)) return k
    }
    return -1
  }
  const plainOnly = (w: string) => w.length > 3 && va.plainWords.has(w) && !va.redWords.has(w)
  let out = toks
  let pos = 0
  let found = false
  for (const seg of va.redSegs) {
    const s = find(seg.start, pos)
    if (s < 0) continue
    let e = words.length - 1
    if (!seg.toEnd) {
      let hit = -1
      for (let k = words.length - seg.end.length; k >= s; k--) {
        if (seg.end.length && seg.end.every((w, j) => words[k + j]?.w === w)) {
          hit = k + seg.end.length - 1
          break
        }
      }
      if (hit >= 0) e = hit
      else {
        // wording differs: stop before the narration that follows (e.g. "saith the Lord")
        const stop = words.findIndex((x, k) => k > s && plainOnly(x.w))
        if (stop > s) e = stop - 1
      }
    }
    out = out.map((t, i) => (i >= words[s].i && i <= words[e].i && !t.sp ? { ...t, red: true } : t))
    pos = e + 1
    found = true
  }
  if (found) return out
  // 3. mostly His words: colour the verse
  return va.redFrac >= 0.6 ? toks.map((t) => (t.sp ? t : { ...t, red: true })) : toks
}
