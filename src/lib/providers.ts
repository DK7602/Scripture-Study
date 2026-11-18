import { bibleBook, book, versionInfo } from './data'
import { getState } from './store'
import { reportFums, sharedVersions } from './shared'

/**
 * Chapter text for any version. Public-domain versions ship with the app; licensed versions
 * (ESV, NKJV, NASB, CSB, NIV) are fetched live with the reader's own API key and are kept in
 * memory only, as their licences require.
 */
export interface ChapterResult {
  verses: string[]
  title?: string
  paras?: number[]
  notes?: Record<string, string[]>
  error?: string
  copyright?: string
}

const memo = new Map<string, Promise<ChapterResult>>()

export function chapterText(version: string, bookId: string, chapter: number): Promise<ChapterResult> {
  const key = `${version}/${bookId}/${chapter}`
  let p = memo.get(key)
  if (!p) {
    p = load(version, bookId, chapter)
    p.then((r) => r.error && memo.delete(key))
    memo.set(key, p)
  }
  return p
}

async function load(version: string, bookId: string, chapter: number): Promise<ChapterResult> {
  const info = versionInfo(version)
  if (!info?.licensed) {
    const b = await bibleBook(version, bookId)
    const notes: Record<string, string[]> = {}
    if (b.n) for (const [k, v] of Object.entries(b.n)) if (k.startsWith(chapter + ':')) notes[k.split(':')[1]] = v
    return { verses: b.c[chapter - 1] ?? [], title: b.t?.[chapter], paras: b.p?.[chapter], notes }
  }
  const s = getState().settings
  try {
    if (info.licensed === 'esv') {
      if (!s.esvKey) return { verses: [], error: 'needs-key' }
      return await esv(bookId, chapter, s.esvKey)
    }
    const id = s.apiBibleIds[version]
    if (s.apiBibleKey && id) return await apiBible(id, bookId, chapter, s.apiBibleKey)
    if (sharedVersions().includes(version)) return await sharedChapter(version, bookId, chapter)
    return { verses: [], error: 'needs-key' }
  } catch (e) {
    return { verses: [], error: String((e as Error).message || e) }
  }
}

function splitNumbered(text: string, count: number): string[] {
  const verses: string[] = Array(count).fill('')
  const parts = text.split(/\[(\d+)\]/)
  for (let k = 1; k < parts.length; k += 2) {
    const n = +parts[k]
    if (n >= 1 && n <= count) verses[n - 1] = (verses[n - 1] + ' ' + parts[k + 1]).replace(/\s+/g, ' ').trim()
  }
  return verses
}

async function esv(bookId: string, chapter: number, key: string): Promise<ChapterResult> {
  const b = book(bookId)
  const q = encodeURIComponent(`${b.name} ${chapter}`)
  const url =
    `https://api.esv.org/v3/passage/text/?q=${q}&include-passage-references=false&include-verse-numbers=true` +
    `&include-first-verse-numbers=true&include-footnotes=false&include-headings=false&include-short-copyright=false` +
    `&include-selahs=true&indent-paragraphs=0&indent-poetry=false&indent-declares=0&indent-psalm-doxology=0`
  const r = await fetch(url, { headers: { Authorization: `Token ${key}` } })
  if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'The ESV API key was not accepted.' : `ESV API error ${r.status}`)
  const d = await r.json()
  const text: string = (d.passages ?? [])[0] ?? ''
  return {
    verses: splitNumbered(text, b.v[chapter - 1]),
    copyright: 'Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway. Used by permission. All rights reserved.',
  }
}

async function apiBible(bibleId: string, bookId: string, chapter: number, key: string): Promise<ChapterResult> {
  const b = book(bookId)
  const url =
    `https://rest.api.bible/v1/bibles/${bibleId}/chapters/${bookId}.${chapter}` +
    `?content-type=text&include-notes=false&include-titles=false&include-chapter-numbers=false&include-verse-numbers=true&include-verse-spans=false`
  const r = await fetch(url, { headers: { 'api-key': key } })
  if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'The API.Bible key was not accepted for this version.' : `API.Bible error ${r.status}`)
  const d = await r.json()
  reportFums(d.meta?.fumsToken ?? (d.meta?.fumsId ? `v2:${d.meta.fumsId}` : null))
  return { verses: splitNumbered(d.data?.content ?? '', b.v[chapter - 1]), copyright: d.data?.copyright }
}

/** A licensed chapter through the group's shared key (members only; cached up to 25 days on the server). */
async function sharedChapter(version: string, bookId: string, chapter: number): Promise<ChapterResult> {
  const b = book(bookId)
  const r = await fetch(`${import.meta.env.BASE_URL}api/licensed/chapter?v=${version}&book=${bookId}&ch=${chapter}`, {
    redirect: 'manual',
    credentials: 'same-origin',
  })
  if (r.type === 'opaqueredirect' || r.status === 401) return { verses: [], error: 'needs-signin' }
  const d = await r.json().catch(() => ({}))
  if (!r.ok) return { verses: [], error: d.error || `Error ${r.status}` }
  reportFums(d.fums)
  return { verses: splitNumbered(d.content ?? '', b.v[chapter - 1]), copyright: d.copyright ?? undefined }
}

export interface ApiBibleVersion {
  id: string
  abbreviation: string
  name: string
}

export async function listApiBibles(key: string): Promise<ApiBibleVersion[]> {
  const r = await fetch('https://rest.api.bible/v1/bibles?language=eng', { headers: { 'api-key': key } })
  if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'The API.Bible key was not accepted.' : `API.Bible error ${r.status}`)
  const d = await r.json()
  return (d.data ?? []).map((x: { id: string; abbreviation: string; abbreviationLocal?: string; name: string }) => ({
    id: x.id,
    abbreviation: x.abbreviationLocal || x.abbreviation,
    name: x.name,
  }))
}
