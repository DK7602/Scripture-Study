import { formatRef } from './refs'
import { getState, newId } from './store'
import type { PrayerDay, SermonNote, SermonSection } from './types'

/** Text colours for sermon notes ('' is the page's own ink, which follows light and dark mode). */
export const BLUE = '#1d5fd1'
export const RED = '#d32f2f'
export const GREEN = '#1f9a48'
export const COLORS: { value: string; name: string }[] = [
  { value: '', name: 'Ink' },
  { value: BLUE, name: 'Blue' },
  { value: RED, name: 'Red' },
  { value: GREEN, name: 'Green' },
  { value: '#7b3fb5', name: 'Purple' },
  { value: '#e07a10', name: 'Orange' },
  { value: '#0e8a8c', name: 'Teal' },
  { value: '#a0522d', name: 'Brown' },
]
/** Points take these colours in turn (1 blue, 2 red, 3 green, …), as in the printed template. */
export const POINT_COLORS = [BLUE, RED, GREEN, '#7b3fb5', '#e07a10', '#0e8a8c']

/** A chosen colour, lightened in dark mode so it stays easy to read on the dark page. */
export function inkColor(color: string, dark: boolean): string | undefined {
  if (!color) return undefined
  return dark ? `color-mix(in srgb, ${color} 62%, white)` : color
}

/** The church's template: Bible passage, notes with three points and their applications, group questions. */
export const DEFAULT_SERMON_TEMPLATE: Omit<SermonSection, 'id' | 'text'>[] = [
  { title: 'Bible passage', color: '' },
  { title: 'Notes', color: '', rule: true },
  { title: '1)', color: BLUE },
  { title: 'Application', color: BLUE },
  { title: '2)', color: RED },
  { title: 'Application', color: RED },
  { title: '3)', color: GREEN },
  { title: 'Application', color: GREEN },
  { title: 'Community group questions', color: '', rule: true },
]

export function today(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function shiftDay(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return today(new Date(y, m - 1, d + days))
}

export function longDate(date: string, withYear = false): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) })
}

export function shortDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const thisYear = new Date().getFullYear() === y
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(thisYear ? {} : { year: 'numeric' }) })
}

export function emptyDay(date: string): PrayerDay {
  const now = Date.now()
  return { id: `day-${date}`, date, items: [], verses: [], created: now, updated: now }
}

export function newSermonNote(): SermonNote {
  const now = Date.now()
  const layout = getState().settings.sermonTemplate?.length ? getState().settings.sermonTemplate! : DEFAULT_SERMON_TEMPLATE
  return { id: newId(), title: '', date: today(), speaker: '', sections: layout.map((s) => ({ ...s, id: newId(), text: '' })), created: now, updated: now }
}

/** The heading as printed: upper case, with a colon unless it already ends in a mark ("1)", "Questions?"). */
export function heading(title: string): string {
  const t = title.trim().toUpperCase()
  if (!t) return ''
  return /[):?.!]$/.test(t) ? t : `${t}:`
}

/** Plain text of a sermon note, for sharing or copying. */
export function sermonText(n: SermonNote): string {
  const head = [n.title || 'Sermon notes', [shortDate(n.date), n.speaker].filter(Boolean).join(' · ')].filter(Boolean).join('\n')
  const body = n.sections.map((s) => `${s.rule ? '————————————\n' : ''}${heading(s.title)}\n${s.text.trim()}`.trim()).join('\n\n')
  return `${head}\n\n${body}\n`
}

export function prayerText(d: PrayerDay, verseTexts: Record<string, string> = {}): string {
  const items = d.items.map((it) => `• ${it.text}${it.answered ? ' (answered)' : ''}`).join('\n')
  const verses = d.verses.map((r) => `${formatRef(r)}${verseTexts[r] ? ` — ${verseTexts[r]}` : ''}`).join('\n')
  return [`Prayer list — ${longDate(d.date)}`, items, verses && `Encouraging verses:\n${verses}`].filter(Boolean).join('\n\n') + '\n'
}

/** Verses of encouragement to pray with (compact references). */
export const ENCOURAGING = [
  'PHP.4.6-7',
  'ISA.41.10',
  'MAT.11.28-30',
  'JER.29.11',
  'ROM.8.28',
  'JOS.1.9',
  'PSA.46.1',
  '1PE.5.7',
  'LAM.3.22-23',
  '2CO.12.9',
  'ISA.40.31',
  'PSA.34.18',
  'JHN.14.27',
  'ROM.15.13',
  'PRO.3.5-6',
  'HEB.4.16',
  '1JN.5.14-15',
  'PSA.121.1-2',
  'DEU.31.8',
  'NUM.6.24-26',
  'ZEP.3.17',
  'PHP.4.19',
  'PSA.23.1-4',
  'MAT.6.33-34',
  'ROM.8.38-39',
  '2TI.1.7',
  'PSA.55.22',
  'JAS.5.16',
  'MRK.11.24',
  'JHN.16.33',
  'PSA.27.1',
  'ISA.26.3',
  '2CO.4.16-18',
  'GAL.6.9',
  'PSA.91.1-2',
  'EPH.3.20-21',
]

/** Shares text with the phone's share sheet, or copies it where there is none. Returns what happened. */
export async function shareText(title: string, text: string): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (navigator.share) {
      await navigator.share({ title, text })
      return 'shared'
    }
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return 'failed'
  }
  try {
    await navigator.clipboard.writeText(text)
    return 'copied'
  } catch {
    return 'failed'
  }
}
