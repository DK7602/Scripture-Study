/**
 * Old Testament quotations in the New Testament, set in italics in every translation.
 *
 * For each verse with a quotation, scripts/build_quotes.py gives, from the World English Bible, the Greek Strong's
 * numbers of the words inside it (q) and of the verse's other words (n), and the English words of each (qw, nw).
 * The words on screen carry Strong's numbers too (the KJV's own, or matched from it for other translations:
 * align.ts), and modern translations share many of the WEB's English words, so each word leans one way or the
 * other, and the quotation is found again in any translation: where the translation uses quotation marks, the
 * quoted passage whose words best match; otherwise (the KJV, the ASV, the CSB) the run of words that matches best.
 * A verse wholly within a quotation is italic throughout.
 */
import { tryJSON } from './data'
import type { Tok } from './markup'

export interface OtCitation {
  t: string // as printed after the quotation: "Isa 28:16", "Ps 14:1–3; 53:1–3; Eccl 7:20"
  r: string[] // the passages, to open: ["ISA.28.16"]
}

export interface OtQuote {
  q: string[] // Strong's numbers inside the quotation
  n: string[] // the verse's others
  qw?: string[] // the English words inside it (stems, as stem() makes them)
  nw?: string[] // the verse's others
  e?: OtCitation[] // the passages quoted, where a quotation ends in this verse (in order)
}

const byBook = new Map<string, Promise<Record<string, OtQuote>>>()

/** After newer data arrives (datasync.ts). */
export function forgetQuotes() {
  byBook.clear()
}

/** A book's quotations by "chapter:verse" (none for the Old Testament and the New Testament books without any). */
export function otQuotes(book: string): Promise<Record<string, OtQuote>> {
  let p = byBook.get(book)
  if (!p) {
    p = tryJSON<Record<string, OtQuote>>(`quotes/${book}.json`).then((x) => x ?? {})
    byBook.set(book, p)
  }
  return p
}

const OPENERS = new Set(['“', '‘', '"'])

/** A word as compared with the WEB's (scripts/build_quotes.py, stem: the same rules). */
export function stem(word: string): string | null {
  const w = word.toLowerCase().replace(/[^a-z]/g, '')
  if (w.length < 3) return null
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3)
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2)
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
  return w
}

const endsClause = (t: string) => /[,;:.!?—]["”’)]*$/.test(t)
const endsSentence = (t: string) => /[.!?]["”’)]*$/.test(t)
// words before a quotation: "It is written:", "…said,", "It also says,"
const INTRO = /^(said|says|saying|say|saith|spake|written|told|declares|declared|spoken|spoke|answered|replied|commanded|wrote|writes|promised|swore|sworn|cried|asks|asked)[,:]["”’)]*$/i
const introduces = (t: string) => /:["”’)]*$/.test(t) || INTRO.test(t)

/** A verse's clauses: [first word, last word], split after , ; : . ? ! and dashes. */
function clausesOf(words: Tok[]): [number, number][] {
  const out: [number, number][] = []
  let from = 0
  words.forEach((t, k) => {
    if (endsClause(t.t) || k === words.length - 1) {
      out.push([from, k])
      from = k + 1
    }
  })
  return out
}

/** The tokens (their `i`) of a verse that belong to its Old Testament quotation. */
export function quoteTokens(toks: Tok[], quote: OtQuote): Set<number> {
  const out = new Set<number>()
  const words = toks.filter((t) => !t.sp)
  if (!words.length) return out
  // the verse is all quotation
  if (!quote.n.length) {
    for (const t of words) out.add(t.i)
    return out
  }
  const q = new Set(quote.q)
  const n = new Set(quote.n)
  const qw = new Set(quote.qw ?? [])
  const nw = new Set(quote.nw ?? [])
  const lean = (inQ: boolean, inN: boolean) => (inQ && !inN ? 1 : inN && !inQ ? -1 : inQ ? 0.2 : 0)
  // each word: by its Strong's number, and by its English (both agreeing count for more)
  const weight = (t: Tok): number => {
    const byNum = t.s?.length ? lean(t.s.some((x) => q.has(x)), t.s.some((x) => n.has(x))) : 0
    const st = stem(t.t)
    const byWord = st ? lean(qw.has(st), nw.has(st)) : 0
    return Math.max(-1.5, Math.min(1.5, byNum + byWord))
  }
  const w = words.map(weight)
  const positive = w.reduce((a, b) => a + Math.max(0, b), 0)

  // quoted passages in this translation: [first word, last word] (positions in `words`)
  const segs: [number, number][] = []
  const stack: { at: number; ch: string }[] = []
  let sawCloser = false
  words.forEach((t, k) => {
    const text = t.t
    for (let c = 0; c < text.length; c++) {
      const ch = text[c]
      const atStart = c === 0 || /[\s(—–-]/.test(text[c - 1])
      const atEnd = c === text.length - 1 || /[\s.,;:!?)—–\-”’"]/.test(text[c + 1])
      if (ch === '"') {
        if (stack.length && stack[stack.length - 1].ch === '"' && !atStart) segs.push([stack.pop()!.at, k])
        else stack.push({ at: k, ch })
      } else if (OPENERS.has(ch) && atStart) stack.push({ at: k, ch })
      else if (ch === '”' || (ch === '’' && atEnd && stack.some((s) => s.ch === '‘'))) {
        const want = ch === '”' ? '“' : '‘'
        let j = stack.length - 1
        while (j >= 0 && stack[j].ch !== want) j--
        if (j >= 0) {
          for (let x = j; x < stack.length; x++) segs.push([stack[x].at, k]) // (an inner one left open ends here too)
          stack.splice(j)
        } else if (ch === '”' && !sawCloser) segs.push([0, k]) // a quotation begun in an earlier verse
        sawCloser = true
      }
    }
  })
  for (const s of stack) segs.push([s.at, words.length - 1]) // one going on into the next verse

  const score = ([a, b]: [number, number]) => w.slice(a, b + 1).reduce((x, y) => x + y, 0)
  const chosen: [number, number][] = []
  const byScore = [...segs].sort((x, y) => score(y) - score(x) || x[1] - x[0] - (y[1] - y[0]))
  for (const s of byScore) {
    const sc = score(s)
    // the best-matching quoted passage, and others nearly as good ("…," and again, "…")
    if (!chosen.length ? sc < Math.max(0.4, positive * 0.25) : sc < Math.max(1.2, score(chosen[0]) * 0.4)) continue
    if (chosen.some(([a, b]) => s[0] <= b && a <= s[1])) continue
    chosen.push(s)
  }
  if (!chosen.length && segs.length) {
    // few of the words matched (another translation, its words not the KJV's): a quoted passage with none of the
    // verse's other words in it, where it is the one choice (“You shall love your neighbor as yourself.”)
    const clean = segs.filter(([a, b]) => b - a + 1 < words.length && !w.slice(a, b + 1).some((x) => x < 0))
    const matched = clean.filter((s) => w.slice(s[0], s[1] + 1).some((x) => x > 0))
    if (matched.length) chosen.push(matched.sort((x, y) => score(y) - score(x))[0])
    else if (clean.length === 1) chosen.push(clean[0])
  }
  // no quotation marks around it (the KJV, the ASV, the CSB): found from the words
  const clauses = clausesOf(words)
  const clauseAt = (k: number) => clauses.findIndex(([a, b]) => a <= k && k <= b)
  // how a clause ends: its last word with what follows it ("said," — the KJV's stops are words of their own)
  const tail = (c: number) => {
    const [a, b] = clauses[c]
    let k = b
    while (k > a && !/\p{L}/u.test(words[k].t)) k--
    return words.slice(k, b + 1).map((t) => t.t).join('')
  }
  const sumOf = (a: number, b: number) => w.slice(a, b + 1).reduce((x, y) => x + y, 0)
  const strong = (a: number, b: number, sign: 1 | -1) => w.slice(a, b + 1).some((x) => x * sign >= 1)
  if (!chosen.length && positive >= 1) {
    // the run of words that matches best (largest sum), a sentence ending inside it counting against it
    // ("…the God of Jacob? GOD is not the God of the dead") ...
    let best = 0
    let bestAt: [number, number] | null = null
    let sum = 0
    let from = 0
    w.forEach((x, k) => {
      if (sum <= 0) {
        sum = 0
        if (x < 1) return // (begun and ended on a word of the quotation only, not one it shares with the rest)
        from = k
      }
      if (k > from && endsSentence(words[k - 1].t)) sum -= 0.5
      sum += x
      if (x >= 1 && sum >= best) {
        best = sum
        bestAt = [from, k]
      }
    })
    if (bestAt && best >= 2) {
      // ... and the words at its edges with nothing to match ("Out" of "Out of Egypt"), to the nearest break
      let [a, b] = bestAt as [number, number]
      for (let n = 0; n < 8 && a > 0 && w[a - 1] >= 0 && !endsClause(words[a - 1].t); n++) a--
      for (let n = 0; n < 8 && b < words.length - 1 && w[b + 1] >= 0 && !endsClause(words[b].t); n++) b++
      chosen.push([a, b])
    }
  }
  if (!chosen.length && positive >= 1) {
    // too few words matched for that (the translation's words far from the KJV's and the WEB's): whole clauses —
    // those after "It is written:" or "…said," that match best, or a sentence with words of the quotation and none
    // of the rest ("…you are blessed. Do not fear them or be intimidated,")
    let best = 0
    let bestAt: [number, number] | null = null
    for (let s0 = 0; s0 < clauses.length; s0++) {
      // (begun on a clause with a word of the quotation; after "It is written:", or "…: but,")
      if (!strong(clauses[s0][0], clauses[s0][1], 1)) continue
      const linking = (c: number) => clauses[c][1] - clauses[c][0] < 3 && !strong(clauses[c][0], clauses[c][1], 1)
      const intro = s0 > 0 && (introduces(tail(s0 - 1)) || (s0 > 1 && linking(s0 - 1) && introduces(tail(s0 - 2))))
      let raw = 0
      for (let e = s0; e < clauses.length; e++) {
        const [a, b] = clauses[e]
        if (e > s0 && /:["”’)]*$/.test(tail(e - 1))) break // (a colon begins another)
        if (e > s0 && endsSentence(tail(e - 1))) raw -= 0.5
        raw += sumOf(a, b)
        const span: [number, number] = [clauses[s0][0], b]
        // (ended on a clause with a word of the quotation, or one finishing the sentence: not on "and,")
        if (!strong(a, b, 1) && !(e === clauses.length - 1 || endsSentence(tail(e)))) continue
        const clean = !strong(...span, -1)
        if (!(raw >= 1.5 || (raw > 0 && (intro || clean)))) continue
        const score = raw + (intro ? 0.75 : 0) + (clean ? 0.5 : 0)
        if (score > best) {
          best = score
          bestAt = span
        }
      }
    }
    if (bestAt) chosen.push(bestAt)
  }
  if (chosen.length === 1 && !segs.length) {
    // the clauses on either side that belong with it: leaning to the quotation's words, not the rest's, and not
    // after a full stop or a colon ("Do not fear what they fear; do not be shaken.")
    let [a, b] = chosen[0]
    let ca = clauseAt(a)
    let cb = clauseAt(b)
    const joins = (c: number) => /[,;]["”’)]*$/.test(tail(c)) && !introduces(tail(c))
    const fits = (c: number) => {
      const sc = sumOf(clauses[c][0], clauses[c][1])
      // more of the quotation's words than the rest's; or as many (or none either way), finishing the sentence ("do not
      // be shaken.", "because I am holy.")
      const last = c === clauses.length - 1 || endsSentence(tail(c))
      return sc >= 0.5 || (Math.abs(sc) < 0.5 && last && (strong(clauses[c][0], clauses[c][1], 1) || !strong(clauses[c][0], clauses[c][1], -1)))
    }
    if (b === clauses[cb][1]) while (cb + 1 < clauses.length && joins(cb) && fits(cb + 1)) b = clauses[++cb][1]
    // (before it, only a clause with a word of the quotation: not "Saying," or "but,")
    const before = (c: number) => fits(c) && strong(clauses[c][0], clauses[c][1], 1)
    if (a === clauses[ca][0]) while (ca > 0 && joins(ca - 1) && before(ca - 1)) a = clauses[--ca][0]
    chosen[0] = [a, b]
  }
  for (const [a, b] of chosen) for (let k = a; k <= b; k++) out.add(words[k].i)
  return out
}

/**
 * Where the passages quoted are printed: after the last word of each quotation (the runs of italics, in order, when
 * there are as many as passages: "…open graves; their tongues practice deceit.” Ps 5:9 “The venom of vipers is on
 * their lips.” Ps 140:3); otherwise all together after the last (or, with none found, at the end of the verse).
 * Returns the token (`i`) each is printed after.
 */
export function citationsAfter(toks: Tok[], quoted: Set<number>, count: number): Map<number, number[]> {
  const at = new Map<number, number[]>()
  const words = toks.filter((t) => !t.sp)
  if (!count || !words.length) return at
  const ends: number[] = []
  words.forEach((t, k) => {
    if (!quoted.has(t.i)) return
    const next = words[k + 1]
    // the end of a run, or of one quotation where the next begins at once (“…deceit.” “The venom…”)
    if (!next || !quoted.has(next.i) || (/[”’"]$/.test(t.t) && /^[“‘"]/.test(next.t))) ends.push(t.i)
  })
  const all = Array.from({ length: count }, (_, k) => k)
  if (ends.length === count) ends.forEach((i, k) => at.set(i, [k]))
  else at.set(ends.length ? ends[ends.length - 1] : words[words.length - 1].i, all)
  return at
}
