import { useStore } from './store'
import type { Tok } from './markup'

/**
 * Shows the names of GOD, JESUS CHRIST and the HOLY SPIRIT in capitals everywhere in the app
 * (display only — stored notes and the underlying text are not changed).
 *
 * "God" is capitalised only when written with a capital G (the true God); "god"/"gods" stay.
 * Words that merely contain a name (Christian, Godhead, godly, Antichrist) are left alone.
 */
const NAMES = /\b(God|Jesus|Christ)(?![\p{L}\d])|\b(Holy|holy) (Spirit|Ghost)\b/gu

/** Verses where "Jesus" is another person: Joshua (Acts 7:45; Heb 4:8) and Jesus called Justus (Col 4:11). */
const NOT_THE_LORD = new Set(['ACT.7.45', 'HEB.4.8', 'COL.4.11'])

export function capsText(s: string, ref?: string): string {
  if (!s) return s
  return s.replace(NAMES, (m, name: string | undefined) => {
    if (name === 'Jesus' && ref && NOT_THE_LORD.has(ref)) return m
    return m.toUpperCase()
  })
}

/** Applies capsText to the text between tags of an HTML fragment. */
export function capsHtml(html: string): string {
  return html.replace(/(^|>)([^<]+)/g, (_m, gt: string, text: string) => gt + capsText(text))
}

/** Token-level version for the reader, where "Holy" and "Ghost" may be separate tokens. */
export function capsTokens(toks: Tok[], ref: string): Tok[] {
  const words = toks.filter((t) => !t.sp)
  const out = toks.map((t) => ({ ...t }))
  const byI = new Map(out.map((t) => [t.i, t]))
  for (let k = 0; k < words.length; k++) {
    const t = byI.get(words[k].i)!
    if (t.name) {
      t.t = t.t.replace(t.name, t.name.toUpperCase())
      continue
    }
    t.t = capsText(t.t, ref)
    // "Holy" + "Ghost"/"Spirit" split across tokens
    if (/(^|\s)Holy$/.test(t.t) && words[k + 1] && /^(Spirit|Ghost)\b/.test(words[k + 1].t)) {
      const nx = byI.get(words[k + 1].i)!
      t.t = t.t.replace(/Holy$/, 'HOLY')
      nx.t = nx.t.replace(/^(Spirit|Ghost)/, (m) => m.toUpperCase())
    }
  }
  return out
}

/** Hook returning the display transform for plain strings (identity when the setting is off). */
export function useCaps(): (s: string, ref?: string) => string {
  const on = useStore((s) => s.settings.capsNames)
  return on ? capsText : (s: string) => s
}

export function useCapsHtml(): (html: string) => string {
  const on = useStore((s) => s.settings.capsNames)
  return on ? capsHtml : (h: string) => h
}
