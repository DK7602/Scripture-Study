export interface Book {
  id: string
  osis: string
  name: string
  abbr: string
  title: string
  t: 'OT' | 'NT'
  v: number[] // verse counts per chapter (KJV versification)
}

export interface VersionInfo {
  id: string
  name: string
  strongs?: boolean
  redLetter?: boolean
  licensed?: 'esv' | 'apibible'
  note?: string
}

export interface Loc {
  book: string
  chapter: number
  verse: number
}

/** A parsed reference: book + chapter[:verse] [– chapter[:verse]] (inclusive). */
export interface Ref {
  book: string
  c1: number
  v1?: number
  c2?: number
  v2?: number
}

export interface ChapterText {
  c: string[][]
  t?: Record<string, string>
  p?: Record<string, number[]>
  n?: Record<string, string[]>
}

export interface Label {
  id: string
  name: string
  color: string
}

export interface Highlight {
  id: string
  label: string
  book: string
  chapter: number
  v1: number
  v2: number
  /** word-level highlights: token indexes in v1 / v2 for `version` */
  w1?: number
  w2?: number
  version?: string
  created: number
}

export interface Note {
  id: string
  book: string
  chapter: number
  verse?: number // undefined = whole chapter
  v2?: number
  text: string
  created: number
  updated: number
}

export type JournalTemplateId = 'blank' | 'oia' | 'study'

export interface JournalEntry {
  id: string
  template: JournalTemplateId
  book: string
  chapter: number
  verse?: number
  v2?: number
  title?: string
  fields: Record<string, string>
  created: number
  updated: number
}

export interface Bookmark {
  id: string
  book: string
  chapter: number
  verse: number
  created: number
}

export type Tab = 'bible' | 'study' | 'maps' | 'notes' | 'journal' | 'search' | 'resources' | 'settings'

/**
 * One day of the prayer list. id = 'day-YYYY-MM-DD', so each day is one record on every device.
 * The weekly prayers are one more record in the same list, id 'weekly' (date ''), whose items have days; the answered
 * prayers added on their own (or weekly prayers marked answered) another, id 'answered', shown on their days.
 */
export interface PrayerDay {
  id: string
  date: string // YYYY-MM-DD (local)
  items: PrayerItem[]
  verses: string[] // encouraging verses, compact refs (PHP.4.6-7)
  prayed?: string[] // weekly prayers (ids) ticked on this day
  created: number
  updated: number
}

export interface PrayerItem {
  id: string
  text: string
  answered?: boolean
  answeredOn?: string // YYYY-MM-DD, the day it was ticked as answered
  note?: string // how it was answered
  days?: number[] // weekly prayers: the weekdays it comes back on (0 Sunday … 6 Saturday); answered prayers: the weekdays it shows on
}

/** Sermon notes: titled sections (the reader's template), each with its own text colour. */
export interface SermonNote {
  id: string
  title: string
  date: string // YYYY-MM-DD
  speaker?: string
  sections: SermonSection[]
  sermon?: SermonRef // the sermon these notes are on (from the church's SermonAudio page)
  created: number
  updated: number
}

/** A sermon from SermonAudio (see src/lib/sermons.ts). */
export interface SermonRef {
  id: string
  title: string
  speaker: string
  series: string
  date: string // ISO
  duration: number // seconds
  audio: string
  url: string
}

export interface SermonSection {
  id: string
  title: string
  text: string
  color: string // '' = the page's ink colour
  rule?: boolean // a line above the section
}

export interface SermonLink {
  id: string
  name: string
  url: string
}

export type ThemeMode = 'light' | 'dark' | 'sepia'
export type ThemeColor = 'green' | 'blue' | 'burgundy' | 'purple' | 'brown' | 'slate'

export interface Settings {
  version: string
  primaryCommentary: string
  namesOfGod: boolean
  capsNames: boolean // GOD, JESUS CHRIST, HOLY SPIRIT in capitals
  redLetters: boolean
  mode: ThemeMode
  color: ThemeColor
  textSize: number // px, Bible text
  uiSize: number // percent, all other text in the app
  audioRate: number // reading speed for the audio Bible
  audioVoice: string // device voice (voiceURI)
  audioNarrator: string // '' automatic (recorded Michael), 'local' Michael made on this device, 'device' the device's own voice
  localVoice: string // the voice made on the phone: 'ryan' (Piper) or Supertonic 'st:M1'…'st:M5', 'st:F1'…'st:F5'
  audioLocal: boolean // chapters with no recording: Michael made on this device (true) or the device's own voice (false)
  audioLocalAsked: boolean // the listener has chosen between the two, so stop offering
  audioContinue: boolean // read on into the next chapter
  scrollSpeed: number // auto-scroll speed, 1..10
  font: 'serif' | 'sans'
  layout: 'verse' | 'paragraph'
  strongsUnderline: boolean
  marginChips: boolean
  placeChips: boolean
  journalTemplate: JournalTemplateId
  journalSort: 'desc' | 'asc'
  sermonLinks: SermonLink[] // Resources > Sermons
  sermonTemplate: Omit<SermonSection, 'id' | 'text'>[] | null // the reader's own layout for new sermon notes
  esvKey: string
  apiBibleKey: string
  apiBibleIds: Record<string, string> // version id -> api.bible bible id
}

export interface StrongsEntry {
  l: string // lemma
  x: string // transliteration
  p: string // pronunciation
  d: string // Strong's definition
  k: string // KJV renderings (Strong's)
  r: string // derivation
  u: [string, number][] // KJV usage by word (computed)
  b: [string, number][] // usage by book (computed)
}

export interface CommentaryInfo {
  id: string
  name: string
  author: string
  year: string
  books: Record<string, number[]>
}

export interface CommentaryChapter {
  i?: string
  e?: [number, number, string][]
}

export interface Place {
  n: string
  a: string[]
  lon: number
  lat: number
  m: string
  ty: string
  c: number
  v: string[]
  ph?: { f: string; c: string; d: string } // Wikimedia Commons photo of the site today
}
