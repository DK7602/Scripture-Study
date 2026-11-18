import { book, versionInfo } from './data'
import { plainText } from './markup'
import { chapterText } from './providers'
import { parseRef } from './refs'
import { getState } from './store'

export interface PassageVerse {
  c: number
  v: number
  text: string // raw markup (for KJV) or plain
}

/** Loads the verses of a reference in the reader's version (falling back to KJV for licensed versions without a key). */
export async function loadPassage(refStr: string, max = 40): Promise<{ verses: PassageVerse[]; version: string }> {
  const r = parseRef(refStr)
  if (!r) return { verses: [], version: 'KJV' }
  let version = getState().settings.version
  const b = book(r.book)
  const out: PassageVerse[] = []
  const c2 = r.c2 ?? r.c1
  for (let c = r.c1; c <= c2 && c <= b.v.length; c++) {
    let res = await chapterText(version, r.book, c)
    if (res.error && versionInfo(version)?.licensed) {
      version = 'KJV'
      res = await chapterText(version, r.book, c)
    }
    const vStart = c === r.c1 ? r.v1 ?? 1 : 1
    let vEnd = res.verses.length
    if (c === c2 && r.v2 !== undefined) vEnd = r.v2
    else if (c === r.c1 && r.v1 !== undefined && r.c2 === undefined) vEnd = r.v1
    for (let v = vStart; v <= vEnd && v <= res.verses.length; v++) {
      if (res.verses[v - 1]) out.push({ c, v, text: res.verses[v - 1] })
      if (out.length >= max) return { verses: out, version }
    }
  }
  return { verses: out, version }
}

export function passagePlain(v: PassageVerse): string {
  return plainText(v.text)
}
