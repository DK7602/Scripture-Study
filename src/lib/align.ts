/**
 * Strong's numbers for versions that don't carry them (CSB, NIV, NKJV, BSB, WEB, ASV…).
 *
 * The KJV is tagged word-by-word with Strong's numbers. For another translation we take the
 * Strong's numbers that occur in the same KJV verse, and match each word against the English
 * renderings the KJV uses for those numbers (strongs/words.json). Example: CSB John 15:4
 * "Remain in me" -> "remain" is a KJV rendering of G3306 (μένω), which occurs in KJV John 15:4.
 */
import { bibleBook, getJSON } from './data'
import { tokenize } from './markup'

export interface VerseAlign {
  nums: Set<string>
  toks: { t: string; s: string[] }[] // the KJV's tagged words in this verse, in order
}

export interface ChapterAlign {
  verses: Map<number, VerseAlign>
  words: Record<string, string[]>
}

const cache = new Map<string, Promise<ChapterAlign>>()

export function chapterAlign(book: string, chapter: number): Promise<ChapterAlign> {
  const key = `${book}.${chapter}`
  let p = cache.get(key)
  if (!p) {
    p = Promise.all([bibleBook('KJV', book), getJSON<Record<string, string[]>>('strongs/words.json')]).then(([kjv, words]) => {
      const verses = new Map<number, VerseAlign>()
      ;(kjv.c[chapter - 1] ?? []).forEach((text, i) => {
        const toks = tokenize(text)
          .filter((t) => t.s?.length)
          .map((t) => ({ t: t.t.replace(/[^\p{L}\s'’-]/gu, '').trim(), s: t.s! }))
        verses.set(i + 1, { nums: new Set(toks.flatMap((t) => t.s)), toks })
      })
      return { verses, words }
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
