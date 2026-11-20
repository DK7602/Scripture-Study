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
  redStems: Set<string> // the same words reduced to a common form ("sayest", "saith" -> "say"; "thou" -> "you")
  plainStems: Set<string>
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
          redStems: stems(reds.map((x) => x.w)),
          plainStems: stems(ws.filter((x) => !x.red).map((x) => x.w)),
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

/** Words too common to tell one speaker from another. */
const STOP = new Set('the and of to a an in that it is was be as for on at by with this but or so then there not no'.split(' '))
const ARCHAIC: Record<string, string> = {
  thou: 'you', thee: 'you', ye: 'you', thy: 'your', thine: 'your', yourselves: 'you', yourself: 'you',
  hath: 'have', hast: 'have', has: 'have', had: 'have', doth: 'do', dost: 'do', did: 'do', does: 'do',
  art: 'are', saith: 'say', sayest: 'say', said: 'say', says: 'say', shalt: 'shall', wilt: 'will', canst: 'can',
  told: 'tell', spake: 'speak', spoke: 'speak', spoken: 'speak', came: 'come', went: 'go', goest: 'go',
}
/** A word reduced to a common form, so the KJV's "sayest" meets a modern "say", "thou" meets "you". */
export function stem(w: string): string {
  if (ARCHAIC[w]) return ARCHAIC[w]
  for (const suf of ['eth', 'est', 'ing', 'ed', 'es', 's']) if (w.length - suf.length >= 3 && w.endsWith(suf)) return w.slice(0, -suf.length)
  return w
}
function stems(ws: string[]): Set<string> {
  return new Set(ws.map(stem).filter((w) => w.length >= 2 && !STOP.has(w)))
}

const OPEN = /^[“"]/
const CLOSE = /[”"][)\].,;:!?—–’']*$|[”"]$/

// who speaks a quotation, from the words around it ("Jesus told him", "they said to him", "which means")
const SPEECH = 'said|says|saying|say|answered|answering|answers|replied|replies|replying|told|tells|asked|asks|asking|cried|cries|crying|called|calls|declared|declares|commanded|commands|spoke|speaks|exclaimed|warned|began|continued|added|responded|rebuked|ordered|charged|taught|prayed|shouted|whispered|insisted|instructed|directed'
const VERB_LAST = new RegExp(`\\b(${SPEECH})\\b(?![\\s\\S]*\\b(${SPEECH})\\b)`)
const VERB_FIRST = new RegExp(`^\\s*(?:\\S+\\s+){0,4}?(${SPEECH})\\b`)
const MEANS = /\b(which means|that is|which is|being interpreted|translated|meaning)\b[^.?!]*$/

type Who = 'jesus' | 'other' | 'unknown'

const LEAD = /^(?:(?:and|then|but|so|now|again|also|immediately|therefore|thus|yet|for)\s+)+/i
/** Jesus as the one acting (at the start of a clause), not as the one spoken to ("they answered Jesus"). */
const JESUS_SUBJ = /(?:^|[,;]\s*|\b(?:and|then|but|so|now|when|while|as|again|also|immediately|for)\s+)(?:jesus|the lord|the master)\b/
/** Capitalised words that start sentences without naming anyone. */
const STARTERS = new Set('for again now then but and so when while as after being looking taking seeing turning coming going immediately therefore truly behold in on at with without afterward later meanwhile yet still also here there this that these those once soon if because since although though even only just indeed moreover finally first next'.split(' '))

/** Words that sit between a speaker and the verb ("Jesus therefore said", "he also asked"). */
const BETWEEN = new Set('also again then therefore immediately quickly still now further once more himself herself themselves indeed finally openly plainly gently sternly has have had was is will would shall did does'.split(' '))

/** Who speaks, from the words just before the speech verb: "Jesus" / "the Lord", "he" (anyone: unknown), or
 * someone else named (they, she, Peter, the governor, the blind man). */
function subjectWho(phrase: string): Who {
  const ws = phrase.replace(LEAD, '').replace(/[^A-Za-z’'\s]/g, ' ').split(/\s+/).filter(Boolean)
  while (ws.length && BETWEEN.has(ws[ws.length - 1].toLowerCase())) ws.pop()
  if (!ws.length) return 'unknown'
  if (/^(he|him)$/i.test(ws[0]) || /\b(lord)\b/i.test(ws.join(' '))) return /\blord\b/i.test(ws.join(' ')) && !/^(he|him)$/i.test(ws[0]) ? 'jesus' : 'unknown' // "He who testifies…", "the Lord God"
  const last = ws[ws.length - 1]
  const two = ws.slice(-2).join(' ').toLowerCase()
  if (/^(jesus|lord|master)$/i.test(last) && (last.toLowerCase() === 'jesus' || /^the (lord|master)$/.test(two))) return 'jesus'
  if (/^(he|him)$/i.test(last)) return 'unknown'
  if (/^(they|she|we|i|you|someone|others|all|many)$/i.test(last)) return 'other'
  if (/^(voice|one|man)$/i.test(last) && /^(a|the)$/i.test(ws[ws.length - 2] ?? '') && last.toLowerCase() === 'voice') return 'unknown' // "a voice saying" (Acts 9:4)
  if (STARTERS.has(last.toLowerCase()) || /^(and|or|of|to|in|on|at|by|with|a|an|the|his|her|their|who|which|that|when|as)$/i.test(last)) return 'unknown'
  return 'other' // a name or a noun: Peter, Pilate, the woman, the blind man, the governor
}

/** The speaker named next to a speech verb before a quotation ("Jesus said to her," / "They said to him,"). */
function speakerBefore(narr: string): Who {
  const clause = narr.split(/[.!?;:]\s+(?=\S)/).pop() ?? ''
  const m = VERB_LAST.exec(clause.toLowerCase())
  if (!m) return 'unknown'
  const head = clause.slice(0, m.index)
  if (JESUS_SUBJ.test(head.toLowerCase())) return 'jesus'
  // the words just before the verb ("he", "the blind man"); with nothing there ("…, saying,") it is left to the KJV
  return subjectWho((head.split(',').pop() ?? '').replace(LEAD, '').trim())
}

/** The speaker named just after a quotation ("…,” Jesus told him / “…?” they asked / “…,” said Peter). */
function speakerAfter(narr: string): Who {
  const clause = (narr.split(/[.!?;“"]/)[0] ?? '').trim()
  const m = VERB_FIRST.exec(clause.toLowerCase())
  if (!m) return 'unknown'
  const verbAt = m.index + m[0].length - m[1].length
  const subj = clause.slice(0, verbAt).trim()
  if (subj) return subjectWho(subj)
  const rest = clause.slice(m.index + m[0].length).trim() // "said Jesus", "replied the man"
  if (!rest || /^(to|unto|him|her|them|again|this|these|that)\b/i.test(rest)) return 'unknown'
  if (/^(jesus|the lord)\b/i.test(rest)) return 'jesus'
  return subjectWho(rest)
}

/**
 * The KJV marks which words Jesus speaks. In a translation with quotation marks, each quotation is His if the
 * words around it say so ("Jesus told him", "said Jesus"), not if they name someone else ("they said to him"),
 * and otherwise if its words match the KJV's red words rather than its plain ones (on common word forms). A
 * quotation explained by another ("Talitha cumi", which means "Little girl, get up") goes with it. Whole-verse
 * speeches are red throughout, but not the narration around a quotation in them; translations without
 * quotation marks (ASV) are matched on the KJV's first and last red words.
 */
export function applyRed(toks: Tok[], va: VerseAlign | undefined): Tok[] {
  if (!va) return toks
  const words = toks.map((t, i) => ({ i, w: t.sp ? '' : norm(t.t) })).filter((x) => x.w)
  const text = (a: number, z: number) => toks.slice(a, z).map((t) => t.t).join('')
  const paint = (out: Tok[], a: number, z: number) => out.map((t, i) => (i >= a && i <= z && !t.sp ? { ...t, red: true } : t))

  // quotation marks: [first token, last token] of each quotation
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

  if (va.red === 'all') {
    if (!segs.length) return paint(toks, 0, toks.length - 1)
    // a speech filling the verse in the KJV: red, except narration before its opening mark ("He said to them,")
    // and after its closing mark ("The crowd heard him gladly")
    // the KJV's verse is all His words (quotations in it are ones He quotes): narration here is rare
    return paint(toks, 0, toks.length - 1)
  }

  if (segs.length) {
    const who: Who[] = segs.map(([a, z], k) => {
      const before = speakerBefore(text(k ? segs[k - 1][1] + 1 : 0, a))
      // words after the quotation name its speaker only when they finish its sentence (“Get up,” Jesus told him /
      // “Who?” they asked); a new sentence ("She said to him, …") introduces the next quotation
      const narr = text(z + 1, k + 1 < segs.length ? segs[k + 1][0] : toks.length)
      const closing = toks[z].t
      const continues = /,[”"’']*$/.test(closing) || (/[?!][”"’']*$/.test(closing) && /^\s*[a-z]/.test(narr))
      const after = continues ? speakerAfter(narr) : 'unknown'
      return before === 'jesus' || after === 'jesus' ? 'jesus' : before === 'other' || after === 'other' ? 'other' : 'unknown'
    })
    // one sentence quoted in two parts around an aside ("Rabbi" (which means Teacher), "where are you staying?")
    for (let k = 1; k < segs.length; k++) {
      const gap = text(segs[k - 1][1] + 1, segs[k][0])
      if (who[k] === 'unknown' && who[k - 1] !== 'unknown' && !/[.!?]/.test(gap.replace(/\([^)]*\)/g, '')) && !/[.!?][”"’']*$/.test(toks[segs[k - 1][1]].t)) who[k] = who[k - 1]
    }
    // dialogue: a quotation by "he" just before one Jesus is named for ("He said, “Which ones?” Jesus said, …")
    // is the other person's
    for (let k = 0; k + 1 < segs.length; k++) if (who[k] === 'unknown' && who[k + 1] === 'jesus' && speakerBefore(text(segs[k][1] + 1, segs[k + 1][0])) === 'jesus') who[k] = 'other'
    const red = segs.map(([a, z], k) => {
      if (who[k] === 'jesus') return true
      if (who[k] === 'other' || va.red === 'none') return false
      const seg = words.filter((x) => x.i >= a && x.i <= z).map((x) => stem(x.w)).filter((w) => w.length >= 2 && !STOP.has(w))
      const r = seg.filter((w) => va.redStems.has(w)).length
      const p = seg.filter((w) => va.plainStems.has(w) && !va.redStems.has(w)).length
      return (r > 0 && r >= p) || (segs.length === 1 && va.redFrac >= 0.3)
    })
    // "Talitha cumi!" which means, "Little girl, get up!": the explanation goes with what it explains
    for (let k = 1; k < segs.length; k++) if (red[k - 1] && who[k] !== 'other' && MEANS.test(text(segs[k - 1][1] + 1, segs[k][0]).toLowerCase())) red[k] = true
    if (red.some(Boolean)) return segs.reduce((out, [a, z], k) => (red[k] ? paint(out, a, z) : out), toks)
    if (va.red === 'none' || who.some((w) => w === 'other')) return toks
  }
  if (va.red === 'none') return toks

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
    out = paint(out, words[s].i, words[e].i)
    pos = e + 1
    found = true
  }
  if (found) return out
  // 3. mostly His words: colour the verse
  return va.redFrac >= 0.6 ? toks.map((t) => (t.sp ? t : { ...t, red: true })) : toks
}
