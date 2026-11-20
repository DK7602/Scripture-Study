import { getJSON, tryJSON, books } from './data'

export type DocType = 'creed' | 'council' | 'confession' | 'catechism'

export interface DocMeta {
  id: string
  title: string
  type: DocType
  year: string
  author: string
  tradition: string
  source?: string
  sections: number
}

export interface FatherMeta {
  id: string
  name: string
  years: string
  era: string
  count: number
}

export interface DocSection {
  n: string
  title?: string
  q?: string
  text: string
  refs?: string[]
}

export interface HistoryDoc extends Omit<DocMeta, 'sections'> {
  intro?: string
  sections: DocSection[]
}

export interface FatherComment {
  f: string
  t: string
  s?: string
  v2?: number
}

export interface HistoryIndex {
  docs: DocMeta[]
  fathers: FatherMeta[]
}

export const TYPE_LABEL: Record<string, string> = {
  creed: 'Creed',
  council: 'Council',
  confession: 'Confession',
  catechism: 'Catechism',
  father: 'Church Father',
}

export function historyIndex(): Promise<HistoryIndex | null> {
  return tryJSON<HistoryIndex>('history/index.json')
}

export function historyDoc(id: string): Promise<HistoryDoc> {
  return getJSON<HistoryDoc>(`history/docs/${id}.json`)
}

export function fathersForBook(book: string): Promise<Record<string, FatherComment[]>> {
  return tryJSON<Record<string, FatherComment[]>>(`history/fathers/${book}.json`).then((x) => x ?? {})
}

/** The chapters of each book the Fathers comment on (a small file: the comments themselves are large). */
export function fathersChapters(): Promise<Record<string, number[]>> {
  return tryJSON<Record<string, number[]>>('history/fathers/chapters.json').then((x) => x ?? {})
}

export function fatherRefs(id: string): Promise<string[]> {
  return tryJSON<string[]>(`history/fathers/authors/${id}.json`).then((x) => x ?? [])
}

export interface HistoryHit {
  kind: 'doc' | 'father'
  id: string // doc id or father id
  title: string // document title or father name
  type: string
  where: string // section label or verse reference
  section?: number
  ref?: string // compact ref for father comments
  text: string
}

function words(q: string): RegExp[] {
  const phrase = /^".*"$/.test(q)
  const parts = phrase ? [q.slice(1, -1)] : q.split(/\s+/).filter((w) => w.length > 1)
  return parts.map((w) => new RegExp(`(?<![\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'iu'))
}

export function snippet(text: string, q: string, len = 220): string {
  const res = words(q)
  let at = -1
  for (const r of res) {
    const m = r.exec(text)
    if (m && (at < 0 || m.index < at)) at = m.index
  }
  if (at < 0) return text.slice(0, len) + (text.length > len ? '…' : '')
  const start = Math.max(0, at - 70)
  return (start > 0 ? '…' : '') + text.slice(start, start + len) + (start + len < text.length ? '…' : '')
}

/** Searches every creed, council, confession and catechism (and optionally the Fathers' comments). */
export async function searchHistory(
  q: string,
  opts: { types: Set<string>; fathers: boolean; isLive: () => boolean; onProgress: (p: number, hits: HistoryHit[]) => void },
): Promise<HistoryHit[]> {
  const index = await historyIndex()
  if (!index) return []
  const res = words(q)
  if (!res.length) return []
  const match = (s: string) => res.every((r) => r.test(s))
  const hits: HistoryHit[] = []
  const docs = index.docs.filter((d) => opts.types.has(d.type))
  const fatherBooks = opts.fathers && opts.types.has('father') ? books().map((b) => b.id) : []
  const total = docs.length + fatherBooks.length
  let done = 0
  for (const d of docs) {
    if (!opts.isLive()) return hits
    const doc = await historyDoc(d.id).catch(() => null)
    doc?.sections.forEach((s, i) => {
      const body = `${s.title ?? ''} ${s.q ?? ''} ${s.text}`
      if (match(body)) hits.push({ kind: 'doc', id: d.id, title: d.title, type: d.type, where: [s.n, s.title].filter(Boolean).join(' — '), section: i, text: snippet(`${s.q ? s.q + ' ' : ''}${s.text}`, q) })
    })
    opts.onProgress(++done / total, hits)
  }
  const names = Object.fromEntries(index.fathers.map((f) => [f.id, f.name]))
  for (const b of fatherBooks) {
    if (!opts.isLive()) return hits
    const data = await fathersForBook(b)
    for (const [cv, list] of Object.entries(data)) {
      for (const c of list) {
        if (!match(c.t)) continue
        const [ch, v] = cv.split(':')
        const ref = `${b}.${ch}.${v}${c.v2 ? '-' + c.v2 : ''}`
        hits.push({ kind: 'father', id: c.f, title: names[c.f] ?? c.f, type: 'father', where: ref, ref, text: snippet(c.t, q) })
      }
    }
    opts.onProgress(++done / total, hits)
    if (hits.length > 1500) break
  }
  return hits
}
