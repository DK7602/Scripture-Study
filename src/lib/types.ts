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

export type Tab = 'bible' | 'study' | 'maps' | 'notes' | 'journal' | 'search' | 'settings'

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
  audioNarrator: string // narrated recording voice id, 'device' for the device voice, '' for automatic
  audioContinue: boolean // read on into the next chapter
  scrollSpeed: number // auto-scroll speed, 1..10
  font: 'serif' | 'sans'
  layout: 'verse' | 'paragraph'
  strongsUnderline: boolean
  marginChips: boolean
  placeChips: boolean
  journalTemplate: JournalTemplateId
  journalSort: 'desc' | 'asc'
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
