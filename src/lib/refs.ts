import { book, books } from './data'
import type { Ref } from './types'

/** Parse compact refs: JHN.15 | JHN.15.4 | JHN.15.4-7 | JHN.15-17 | JHN.15.4-16.2 | JHN.15.4-JHN.16.2 */
export function parseRef(s: string): Ref | null {
  if (!s) return null
  const [left, right] = s.split('-')
  const a = left.split('.')
  if (a.length < 2 || !book(a[0])) return null
  const ref: Ref = { book: a[0], c1: +a[1] }
  if (a[2]) ref.v1 = +a[2]
  if (right) {
    const b = right.split('.')
    if (b.length === 1) {
      if (ref.v1 !== undefined) {
        ref.c2 = ref.c1
        ref.v2 = +b[0]
      } else ref.c2 = +b[0]
    } else if (b.length === 2 && /^\d+$/.test(b[0])) {
      ref.c2 = +b[0]
      ref.v2 = +b[1]
    } else if (b.length >= 2) {
      // other-book end: clamp to this book's chapter range (rare)
      if (b[0] === ref.book) {
        ref.c2 = +b[1]
        if (b[2]) ref.v2 = +b[2]
      }
    }
  }
  return ref
}

export function refToString(r: Ref): string {
  let s = `${r.book}.${r.c1}`
  if (r.v1) s += `.${r.v1}`
  if (r.c2 !== undefined) {
    if (r.v1 && r.v2 !== undefined) s += r.c2 === r.c1 ? `-${r.v2}` : `-${r.c2}.${r.v2}`
    else if (!r.v1 && r.c2 !== r.c1) s += `-${r.c2}`
  }
  return s
}

export function formatRef(r: Ref | string | null, short = false): string {
  const ref = typeof r === 'string' ? parseRef(r) : r
  if (!ref) return typeof r === 'string' ? r : ''
  const b = book(ref.book)
  const name = short ? b.abbr : b.name
  const single = b.v.length === 1
  let s = name + ' '
  if (single && ref.v1) s += `${ref.v1}`
  else s += `${ref.c1}${ref.v1 ? ':' + ref.v1 : ''}`
  if (ref.c2 !== undefined) {
    if (ref.v1 && ref.v2 !== undefined) {
      if (ref.c2 === ref.c1 || single) s += `–${ref.v2}`
      else s += `–${ref.c2}:${ref.v2}`
    } else if (ref.c2 !== ref.c1) s += `–${ref.c2}`
  }
  return s
}

export function locString(bookId: string, chapter: number, verse?: number, v2?: number): string {
  return formatRef({ book: bookId, c1: chapter, v1: verse, c2: v2 ? chapter : undefined, v2 })
}

// ---------------------------------------------------------------------------------------------
// Human-typed references ("John 3:16", "1 Jn 2:6", "Rom 8:28-30", "ps 23")
// ---------------------------------------------------------------------------------------------
const EXTRA: Record<string, string> = {
  gn: 'GEN', ge: 'GEN', ex: 'EXO', exo: 'EXO', lv: 'LEV', le: 'LEV', nu: 'NUM', nm: 'NUM', dt: 'DEU', de: 'DEU',
  deu: 'DEU', jsh: 'JOS', jos: 'JOS', jdg: 'JDG', jg: 'JDG', judg: 'JDG', rth: 'RUT', ru: 'RUT', '1sa': '1SA',
  '2sa': '2SA', '1sm': '1SA', '2sm': '2SA', '1ki': '1KI', '2ki': '2KI', '1kgs': '1KI', '2kgs': '2KI', '1ch': '1CH',
  '2ch': '2CH', ezr: 'EZR', ne: 'NEH', est: 'EST', es: 'EST', jb: 'JOB', ps: 'PSA', psa: 'PSA', psalm: 'PSA',
  pss: 'PSA', pr: 'PRO', prv: 'PRO', pro: 'PRO', ec: 'ECC', ecc: 'ECC', qoh: 'ECC', so: 'SNG', sos: 'SNG',
  song: 'SNG', songofsongs: 'SNG', canticles: 'SNG', is: 'ISA', isa: 'ISA', je: 'JER', jer: 'JER', jr: 'JER',
  la: 'LAM', lam: 'LAM', eze: 'EZK', ezk: 'EZK', ezek: 'EZK', da: 'DAN', dan: 'DAN', dn: 'DAN', ho: 'HOS',
  hos: 'HOS', jl: 'JOL', joe: 'JOL', am: 'AMO', amo: 'AMO', ob: 'OBA', oba: 'OBA', jon: 'JON', jnh: 'JON',
  mi: 'MIC', mic: 'MIC', na: 'NAM', nah: 'NAM', hab: 'HAB', zep: 'ZEP', zph: 'ZEP', hg: 'HAG', hag: 'HAG',
  zec: 'ZEC', zch: 'ZEC', ml: 'MAL', mal: 'MAL', mt: 'MAT', mat: 'MAT', mk: 'MRK', mr: 'MRK', mrk: 'MRK',
  lk: 'LUK', lu: 'LUK', luk: 'LUK', jn: 'JHN', jhn: 'JHN', joh: 'JHN', ac: 'ACT', act: 'ACT', ro: 'ROM',
  rm: 'ROM', rom: 'ROM', '1co': '1CO', '2co': '2CO', ga: 'GAL', gal: 'GAL', eph: 'EPH', php: 'PHP', phil: 'PHP',
  pp: 'PHP', col: 'COL', '1th': '1TH', '2th': '2TH', '1thes': '1TH', '2thes': '2TH', '1ti': '1TI', '2ti': '2TI',
  tit: 'TIT', phm: 'PHM', philem: 'PHM', heb: 'HEB', jas: 'JAS', jm: 'JAS', jam: 'JAS', '1pe': '1PE',
  '2pe': '2PE', '1pt': '1PE', '2pt': '2PE', '1jn': '1JN', '2jn': '2JN', '3jn': '3JN', '1jo': '1JN', '2jo': '2JN',
  '3jo': '3JN', jud: 'JUD', jude: 'JUD', re: 'REV', rev: 'REV', rv: 'REV', revelations: 'REV',
}

let aliasMap: Record<string, string> | null = null

function aliases(): Record<string, string> {
  if (aliasMap) return aliasMap
  const m: Record<string, string> = { ...EXTRA }
  for (const b of books()) {
    for (const a of [b.id, b.osis, b.name, b.abbr]) m[a.toLowerCase().replace(/[\s.]/g, '')] = b.id
    // "first john", "1st john"
    const num = b.name.match(/^([123]) (.*)$/)
    if (num) {
      const words = ['', 'first', 'second', 'third'][+num[1]]
      const ord = ['', '1st', '2nd', '3rd'][+num[1]]
      m[(words + num[2]).toLowerCase().replace(/\s/g, '')] = b.id
      m[(ord + num[2]).toLowerCase().replace(/\s/g, '')] = b.id
    }
  }
  m['psalms'] = 'PSA'
  aliasMap = m
  return m
}

export function bookFromName(name: string): string | null {
  const key = name.toLowerCase().replace(/[\s.]/g, '')
  return aliases()[key] ?? null
}

const HUMAN = /^\s*((?:[123]|i{1,3}|first|second|third|1st|2nd|3rd)?\s*[a-z]+(?:\s+of\s+[a-z]+)?)\.?\s*(\d+)?(?:\s*[:.]\s*(\d+))?(?:\s*[-–]\s*(\d+)(?:\s*[:.]\s*(\d+))?)?\s*$/i

export function parseHumanRef(s: string): Ref | null {
  const m = s.replace(/ /g, ' ').match(HUMAN)
  if (!m) return null
  let name = m[1].replace(/^iii\s*/i, '3').replace(/^ii\s*/i, '2').replace(/^i\s+/i, '1')
  const id = bookFromName(name)
  if (!id) return null
  const b = book(id)
  let c1 = m[2] ? +m[2] : 1
  let v1 = m[3] ? +m[3] : undefined
  if (b.v.length === 1 && m[2] && !m[3]) {
    // "Jude 3" means verse 3
    v1 = c1
    c1 = 1
  }
  if (c1 < 1 || c1 > b.v.length) return null
  const ref: Ref = { book: id, c1, v1 }
  if (m[4]) {
    if (m[5]) {
      ref.c2 = +m[4]
      ref.v2 = +m[5]
    } else if (v1 !== undefined) {
      ref.c2 = c1
      ref.v2 = +m[4]
    } else ref.c2 = +m[4]
  }
  return ref
}

/** Finds references inside free text; returns alternating plain strings and refs. */
const IN_TEXT = /\b((?:[123]\s?)?[A-Z][a-z]{1,14}\.?)\s(\d{1,3})(?::(\d{1,3})(?:\s?[-–]\s?(\d{1,3}))?)?/g

export type TextPart = string | { text: string; ref: string }

export function splitRefs(text: string): TextPart[] {
  const out: TextPart[] = []
  let last = 0
  for (const m of text.matchAll(IN_TEXT)) {
    const id = bookFromName(m[1])
    if (!id) continue
    const b = book(id)
    const c = +m[2]
    if (c < 1 || (c > b.v.length && b.v.length > 1)) continue
    const r: Ref = b.v.length === 1 && !m[3] ? { book: id, c1: 1, v1: c } : { book: id, c1: c, v1: m[3] ? +m[3] : undefined }
    if (m[4] && r.v1) {
      r.c2 = r.c1
      r.v2 = +m[4]
    }
    out.push(text.slice(last, m.index))
    out.push({ text: m[0], ref: refToString(r) })
    last = m.index! + m[0].length
  }
  out.push(text.slice(last))
  return out.filter((p) => p !== '')
}

/** Numeric verse id used by the concordance: book(1-66)*1e6 + chapter*1e3 + verse */
export function decodeVid(n: number): { book: string; chapter: number; verse: number } {
  const bi = Math.floor(n / 1e6) - 1
  return { book: books()[bi].id, chapter: Math.floor(n / 1e3) % 1e3, verse: n % 1e3 }
}

export function refContains(r: Ref, chapter: number, verse: number): boolean {
  const c2 = r.c2 ?? r.c1
  if (chapter < r.c1 || chapter > c2) return false
  if (r.v1 === undefined) return true
  if (chapter === r.c1 && verse < r.v1) return false
  const v2 = r.v2 ?? (r.c2 === undefined ? r.v1 : 999)
  if (chapter === c2 && verse > v2) return false
  return true
}
