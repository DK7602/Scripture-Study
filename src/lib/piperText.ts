/**
 * Text to the phoneme ids a Piper voice reads, the way Piper itself does it (piper/phonemize_espeak.py and
 * phoneme_ids.py): eSpeak NG phonemes clause by clause, each clause followed by its punctuation (and a space after
 * , : ;), split into sentences at . ! ?, every codepoint a phoneme, and ids as ^ _ (phoneme _)* $.
 * eSpeak runs here through the phonemizer package (eSpeak NG compiled to WebAssembly).
 */
import { phonemize } from 'phonemizer'

export type IdMap = Record<string, number[]>

const CLAUSE = /([^.,;:!?]*)([.,;:!?]+|$)/g

/** Text ready for eSpeak: dashes read as a pause, quotes and brackets dropped, spaces tidied. */
export function tidy(text: string): string {
  return text
    .replace(/\s*[—–]\s*/g, ', ') // eSpeak runs words across a dash; a reader pauses
    .replace(/[“”"‘’'()[\]{}«»]/g, (c) => (c === '’' || c === "'" ? "'" : ''))
    .replace(/\s+/g, ' ')
    .trim()
}

/** Adjacent vowels the voice knows as one sound (its "vowel_clusters": a + ɪ -> aɪ), merged as Piper does. */
function mergeClusters(ph: string[], clusters: string[][]): string[] {
  if (!clusters.length) return ph
  const max = Math.max(...clusters.map((c) => c.length))
  const known = new Set(clusters.map((c) => c.join('\u0000')))
  const out: string[] = []
  for (let i = 0; i < ph.length; ) {
    let n = 0
    for (let len = Math.min(max, ph.length - i); len >= 2 && !n; len--) if (known.has(ph.slice(i, i + len).join('\u0000'))) n = len
    if (n) {
      out.push(ph.slice(i, i + n).join(''))
      i += n
    } else out.push(ph[i++])
  }
  return out
}

/** Phonemes per sentence. */
export async function sentencesOf(text: string, clusters: string[][] = []): Promise<string[][]> {
  const out: string[][] = []
  let cur: string[] = []
  for (const m of tidy(text).matchAll(CLAUSE)) {
    const words = m[1].trim()
    const term = m[2] ? m[2][0] : ''
    if (!words && !term) continue
    let ph = words ? (await phonemize(words, 'en-us')).join(' ').trim() : ''
    ph += term
    if (term === ',' || term === ':' || term === ';') ph += ' '
    cur.push(...[...ph.normalize('NFD')])
    if (term === '.' || term === '!' || term === '?') {
      out.push(mergeClusters(cur, clusters))
      cur = []
    }
  }
  if (cur.length) out.push(mergeClusters(cur, clusters))
  return out.filter((s) => s.some((p) => p.trim()))
}

export function idsOf(phonemes: string[], map: IdMap): number[] {
  const ids = [...map['^'], ...map['_']]
  for (const p of phonemes) {
    const id = map[p]
    if (!id) continue // a symbol this voice does not know (Piper skips it too)
    ids.push(...id, ...map['_'])
  }
  ids.push(...map['$'])
  return ids
}
