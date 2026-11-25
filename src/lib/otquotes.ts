/**
 * Old Testament quotations in the New Testament, set in italics in every translation.
 *
 * For each verse with a quotation, scripts/build_quotes.py gives the Greek Strong's numbers of the words inside it
 * (q) and of the verse's other words (n), from the World English Bible. The words on screen carry Strong's numbers
 * too (the KJV's own, or matched from it for other translations: align.ts), so the quotation is found again in any
 * translation: where the translation uses quotation marks, the quoted passage whose words best match; otherwise
 * (the KJV, the ASV) the run of words that matches best. A verse wholly within a quotation is italic throughout.
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
  const weight = (t: Tok): number => {
    if (!t.s?.length) return 0
    const inQ = t.s.some((x) => q.has(x))
    const inN = t.s.some((x) => n.has(x))
    return inQ && !inN ? 1 : inN && !inQ ? -1 : inQ ? 0.2 : 0
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
  if (!chosen.length && positive >= 1) {
    // no quotation marks around it: the run of words that matches best (largest sum),
    // a sentence ending inside it counting against it ("…the God of Jacob? GOD is not the God of the dead") ...
    const ends = (k: number) => /[.,;:!?]["”’]?$/.test(words[k].t)
    const stops = (k: number) => /[.!?]["”’]?$/.test(words[k].t)
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
      if (k > from && stops(k - 1)) sum -= 0.5
      sum += x
      if (x >= 1 && sum >= best) {
        best = sum
        bestAt = [from, k]
      }
    })
    if (bestAt && best >= 2) {
      // ... and the words at its edges with nothing to match ("Out" of "Out of Egypt"), to the nearest break
      let [a, b] = bestAt as [number, number]
      for (let n = 0; n < 8 && a > 0 && w[a - 1] >= 0 && !ends(a - 1); n++) a--
      for (let n = 0; n < 8 && b < words.length - 1 && w[b + 1] >= 0 && !ends(b); n++) b++
      chosen.push([a, b])
    }
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
