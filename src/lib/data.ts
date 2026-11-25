import type { Book, ChapterText, CommentaryChapter, CommentaryInfo, Place, StrongsEntry, VersionInfo } from './types'

const BASE = import.meta.env.BASE_URL

export function dataUrl(path: string): string {
  return `${BASE}data/${path}`
}

/** A file served from the site root (audio, icons), respecting the deploy base path. */
export function siteUrl(path: string): string {
  return `${BASE}${path}`
}

const cache = new Map<string, Promise<unknown>>()

export function getJSON<T>(path: string): Promise<T> {
  let p = cache.get(path)
  if (!p) {
    p = fetch(dataUrl(path)).then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${path}`)
      return r.json()
    })
    p.catch(() => cache.delete(path))
    cache.set(path, p)
  }
  return p as Promise<T>
}

/** Files replaced by newer ones (src/lib/datasync.ts): read again when next asked for. */
export function forgetJSON(paths: string[]) {
  for (const p of paths) cache.delete(p)
}

/** Like getJSON but resolves to null when the file does not exist. */
export function tryJSON<T>(path: string): Promise<T | null> {
  return getJSON<T>(path).catch(() => null)
}

let booksCache: Book[] = []
let bookMap: Record<string, Book> = {}

export async function loadBooks(): Promise<Book[]> {
  booksCache = await getJSON<Book[]>('books.json')
  bookMap = Object.fromEntries(booksCache.map((b) => [b.id, b]))
  return booksCache
}

export function books(): Book[] {
  return booksCache
}

export function book(id: string): Book {
  return bookMap[id]
}

export function bookIndex(id: string): number {
  return booksCache.findIndex((b) => b.id === id)
}

export const LICENSED_VERSIONS: VersionInfo[] = [
  { id: 'NKJV', name: 'New King James Version', licensed: 'apibible' },
  { id: 'ESV', name: 'English Standard Version', licensed: 'esv' },
  { id: 'NASB', name: 'New American Standard Bible', licensed: 'apibible' },
  { id: 'CSB', name: 'Christian Standard Bible', licensed: 'apibible' },
  { id: 'NIV', name: 'New International Version', licensed: 'apibible' },
]

let versionList: VersionInfo[] = []

export async function loadVersions(): Promise<VersionInfo[]> {
  const pd = await getJSON<VersionInfo[]>('versions.json')
  versionList = [...pd, ...LICENSED_VERSIONS]
  return versionList
}

export function versions(): VersionInfo[] {
  return versionList
}

export function versionInfo(id: string): VersionInfo | undefined {
  return versionList.find((v) => v.id === id)
}

export function bibleBook(version: string, bookId: string): Promise<ChapterText> {
  return getJSON<ChapterText>(`bibles/${version}/${bookId}.json`)
}

export async function strongs(num: string): Promise<StrongsEntry | null> {
  const prefix = num[0]
  const n = parseInt(num.slice(1), 10)
  const chunk = await tryJSON<Record<string, StrongsEntry>>(`strongs/${prefix}${Math.floor(n / 250)}.json`)
  return chunk?.[`${prefix}${n}`] ?? null
}

export async function concordance(num: string): Promise<Record<string, number[]> | null> {
  const prefix = num[0]
  const n = parseInt(num.slice(1), 10)
  const chunk = await tryJSON<Record<string, Record<string, number[]>>>(`conc/${prefix}${Math.floor(n / 250)}.json`)
  return chunk?.[`${prefix}${n}`] ?? null
}

export function crossRefs(bookId: string): Promise<Record<string, string[]>> {
  return tryJSON<Record<string, string[]>>(`xref/${bookId}.json`).then((x) => x ?? {})
}

export function commentaryIndex(): Promise<CommentaryInfo[]> {
  return getJSON<CommentaryInfo[]>('comm/index.json')
}

export function commentaryChapter(id: string, bookId: string, chapter: number): Promise<CommentaryChapter | null> {
  return tryJSON<CommentaryChapter>(`comm/${id}/${bookId}/${chapter}.json`)
}

export function places(): Promise<Place[]> {
  return getJSON<Place[]>('geo/places.json')
}

export function placesByChapter(): Promise<Record<string, number[]>> {
  return getJSON<Record<string, number[]>>('geo/byChapter.json')
}

export function topicIndex(): Promise<Record<string, string[]>> {
  return getJSON<Record<string, string[]>>('topics/index.json')
}

export function topicEntry(source: string, name: string): Promise<string | null> {
  const letter = (name[0] || '_').toUpperCase().replace(/[^A-Z]/, '_')
  return tryJSON<Record<string, string>>(`topics/${source}/${letter}.json`).then((d) => d?.[name] ?? null)
}

/** Fetches every file of the given data folders so the service worker caches them for offline use. */
export async function prefetchAll(paths: string[], onProgress: (done: number, total: number) => void): Promise<void> {
  let done = 0
  const queue = [...paths]
  const total = queue.length
  const worker = async () => {
    while (queue.length) {
      const p = queue.shift()!
      try {
        await fetch(dataUrl(p))
      } catch {
        /* keep going */
      }
      done++
      onProgress(done, total)
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))
}
