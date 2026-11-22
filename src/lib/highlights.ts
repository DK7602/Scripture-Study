/**
 * Highlights with up to three colours on a verse (Main Theme and Salvation Truths together, say): each label is
 * its own highlight record; a verse shows the labels on it, oldest first, the line split into two or three bands.
 */
import { deleteItem, getState, newId, saveItem } from './store'
import type { Highlight } from './types'

export const MAX_COLOURS = 3

/**
 * Before this, a newer highlight on a verse covered an older one (both were kept, only the newer showed). Those
 * made before then are trimmed once to what was shown, so old re-colourings do not turn up as two-tone verses;
 * highlights made since are never touched.
 */
const MULTI_SINCE = 1795354275455 // 2026-11-22 13:31 UTC

/** A chapter's highlights, oldest first. */
export function chapterHighlights(all: Highlight[], book: string, chapter: number): Highlight[] {
  return all.filter((h) => h.book === book && h.chapter === chapter).sort((a, b) => a.created - b.created)
}

/** The labels on a verse, in the order they were added (at most `max`: the most recent ones). */
export function verseLabels(hs: Highlight[], v: number, max = MAX_COLOURS): string[] {
  const out: string[] = []
  for (const h of hs) if (h.v1 <= v && v <= h.v2 && !out.includes(h.label)) out.push(h.label)
  return out.slice(Math.max(0, out.length - max))
}

/** The background of highlighted words: one colour, or the line split into equal bands, top to bottom. */
export function hlBackground(colors: string[]): string {
  if (colors.length <= 1) return colors[0] ?? 'transparent'
  const n = colors.length
  const stops = colors.map((c, i) => `${c} ${((i * 100) / n).toFixed(2)}% ${(((i + 1) * 100) / n).toFixed(2)}%`)
  return `linear-gradient(to bottom, ${stops.join(', ')})`
}

function runsOf(verses: number[]): [number, number][] {
  const out: [number, number][] = []
  for (const v of [...verses].sort((a, b) => a - b)) {
    const last = out[out.length - 1]
    if (last && last[1] === v - 1) last[1] = v
    else out.push([v, v])
  }
  return out
}

/** Takes a label off some verses, keeping the rest of each highlight it was part of. */
async function removeLabel(book: string, chapter: number, label: string, verses: number[]) {
  const off = new Set(verses)
  for (const h of chapterHighlights(getState().highlights, book, chapter)) {
    if (h.label !== label) continue
    const kept: number[] = []
    let touched = false
    for (let v = h.v1; v <= h.v2; v++) (off.has(v) ? (touched = true) : kept.push(v))
    if (!touched) continue
    await deleteItem('highlights', h.id)
    if (h.w1 !== undefined) continue // a few words: taken off whole
    for (const [a, z] of runsOf(kept)) await saveItem('highlights', { ...h, id: newId(), v1: a, v2: z })
  }
}

/**
 * A colour chosen for some verses: off them if they all have it already; otherwise on the ones without it. A verse
 * that already has three colours lets go of its oldest.
 */
export async function toggleLabel(book: string, chapter: number, label: string, verses: number[]) {
  const on = (v: number) => verseLabels(chapterHighlights(getState().highlights, book, chapter), v, Infinity)
  if (verses.every((v) => on(v).includes(label))) return removeLabel(book, chapter, label, verses)
  const need = verses.filter((v) => !on(v).includes(label))
  for (const v of need) {
    const has = on(v)
    for (const old of has.slice(0, Math.max(0, has.length - MAX_COLOURS + 1))) await removeLabel(book, chapter, old, [v])
  }
  const now = Date.now()
  for (const [a, z] of runsOf(need)) await saveItem('highlights', { id: newId(), label, book, chapter, v1: a, v2: z, created: now })
}

/** Once: highlights from before several colours, trimmed to the one colour each verse showed (see MULTI_SINCE). */
export async function trimCoveredHighlights() {
  const old = getState().highlights.filter((h) => h.w1 === undefined && h.created < MULTI_SINCE)
  const byChapter = new Map<string, Highlight[]>()
  for (const h of old) {
    const k = `${h.book}.${h.chapter}`
    byChapter.set(k, [...(byChapter.get(k) ?? []), h])
  }
  for (const list of byChapter.values()) {
    list.sort((a, b) => a.created - b.created)
    const shown = new Map<number, Highlight>() // the highlight each verse showed: the newest on it
    for (const h of list) for (let v = h.v1; v <= h.v2; v++) shown.set(v, h)
    for (const h of list) {
      const kept: number[] = []
      let covered = false
      for (let v = h.v1; v <= h.v2; v++) {
        const top = shown.get(v)!
        if (top.id !== h.id && top.label !== h.label) covered = true
        else kept.push(v)
      }
      if (!covered) continue
      await deleteItem('highlights', h.id)
      for (const [a, z] of runsOf(kept)) await saveItem('highlights', { ...h, id: newId(), v1: a, v2: z })
    }
  }
}
