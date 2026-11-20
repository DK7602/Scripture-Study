import { useSyncExternalStore } from 'react'
import * as db from './db'
import type { Bookmark, Highlight, JournalEntry, Label, Loc, Note, PrayerDay, SermonNote, Settings, Tab } from './types'

export type Popup =
  | { kind: 'strongs'; num: string; word: string; book: string; chapter: number; verse: number; x: number; y: number; version?: string }
  | { kind: 'origwords'; word: string; book: string; chapter: number; verse: number; x: number; y: number }
  | { kind: 'ref'; ref: string; x: number; y: number }
  | { kind: 'notes'; book: string; chapter: number; verse?: number; x: number; y: number }
  | { kind: 'journal'; book: string; chapter: number; verse?: number; x: number; y: number }
  | { kind: 'helps'; book: string; chapter: number; verse: number; x: number; y: number }
  | { kind: 'info'; title: string; text: string; x: number; y: number }

export interface Selection {
  verses: number[] // selected verse numbers (tap on verse number)
  words?: { v1: number; w1: number; v2: number; w2: number; text: string } // a text selection
  x: number
  y: number
}

export interface State {
  ready: boolean
  loc: Loc
  tab: Tab
  settings: Settings
  labels: Label[]
  highlights: Highlight[]
  notes: Note[]
  journal: JournalEntry[]
  bookmarks: Bookmark[]
  prayers: PrayerDay[]
  sermons: SermonNote[]
  popup: Popup | null
  popupStack: Popup[]
  selection: Selection | null
  sidebar: boolean
  panel: boolean
  editor: { kind: 'note'; note: Partial<Note> } | { kind: 'journal'; entry: Partial<JournalEntry> } | null
  focusTick: number // bumps when navigation should scroll to loc.verse
  helpItem: string | null // selected item in Maps / Helps
  helpOverlay: string | null // on a phone: a map or help shown full screen over the Bible (from the "?" chip)
  highlightLabel: string // label used by the highlighter button
}

export const DEFAULT_LABELS: Label[] = [
  { id: 'promise', name: 'Promises of God', color: '#f7dc6f' },
  { id: 'command', name: 'Commands', color: '#b5e09a' },
  { id: 'warning', name: 'Warnings', color: '#f5b3c3' },
  { id: 'truth', name: 'Truths / Doctrine', color: '#a9d3f5' },
  { id: 'character', name: 'Character of God', color: '#d5b8f3' },
  { id: 'application', name: 'My Application', color: '#f9c48b' },
]

export const DEFAULT_SETTINGS: Settings = {
  version: 'KJV',
  primaryCommentary: 'henry',
  namesOfGod: false,
  capsNames: true,
  redLetters: true,
  mode: 'light',
  color: 'green',
  textSize: 20,
  uiSize: 125,
  audioRate: 1,
  audioVoice: '',
  audioNarrator: '',
  audioContinue: true,
  audioLocal: false,
  localVoice: 'ryan',
  audioLocalAsked: false,
  scrollSpeed: 4,
  font: 'serif',
  layout: 'verse',
  strongsUnderline: true,
  marginChips: true,
  placeChips: true,
  journalTemplate: 'oia',
  journalSort: 'desc',
  sermonLinks: [{ id: 'paramount', name: 'Paramount Church sermons', url: 'https://www.sermonaudio.com/broadcasters/paramountchurch/series' }],
  sermonTemplate: null,
  esvKey: '',
  apiBibleKey: '',
  apiBibleIds: {},
}

function loadLocal<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? { ...fallback, ...JSON.parse(v) } : fallback
  } catch {
    return fallback
  }
}

function saveLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}

let state: State = {
  ready: false,
  loc: loadLocal<Loc>('ss:loc', { book: 'JHN', chapter: 15, verse: 1 }),
  tab: 'bible',
  settings: loadLocal<Settings>('ss:settings', DEFAULT_SETTINGS),
  labels: [],
  highlights: [],
  notes: [],
  journal: [],
  bookmarks: [],
  prayers: [],
  sermons: [],
  popup: null,
  popupStack: [],
  selection: null,
  sidebar: true,
  panel: true,
  editor: null,
  focusTick: 0,
  helpItem: null,
  helpOverlay: null,
  highlightLabel: 'promise',
}

const listeners = new Set<() => void>()

export function getState(): State {
  return state
}

export function setState(patch: Partial<State> | ((s: State) => Partial<State>)) {
  const p = typeof patch === 'function' ? patch(state) : patch
  state = { ...state, ...p }
  if (p.loc) saveLocal('ss:loc', state.loc)
  if (p.settings) saveLocal('ss:settings', state.settings)
  listeners.forEach((l) => l())
}

export function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => sel(state))
}

export async function initUserData() {
  const [labels, highlights, notes, journal, bookmarks, prayers, sermons] = await Promise.all([
    db.getAll<Label>('labels'),
    db.getAll<Highlight>('highlights'),
    db.getAll<Note>('notes'),
    db.getAll<JournalEntry>('journal'),
    db.getAll<Bookmark>('bookmarks'),
    db.getAll<PrayerDay>('prayers'),
    db.getAll<SermonNote>('sermons'),
  ])
  if (!labels.length) {
    for (const l of DEFAULT_LABELS) await db.put('labels', l)
  }
  setState({
    labels: labels.length ? labels : DEFAULT_LABELS,
    highlights,
    notes,
    journal,
    bookmarks,
    prayers,
    sermons,
  })
}

// ---------------------------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------------------------
export function go(loc: Partial<Loc>, opts: { tab?: Tab } = {}) {
  setState((s) => ({
    loc: { ...s.loc, verse: 1, ...loc },
    focusTick: s.focusTick + 1,
    selection: null,
    popup: null,
    popupStack: [],
    helpOverlay: null,
    ...(opts.tab ? { tab: opts.tab } : {}),
  }))
}

export function setVerse(verse: number) {
  setState((s) => ({ loc: { ...s.loc, verse } }))
}

export function setTab(tab: Tab) {
  setState({ tab, popup: null, popupStack: [] })
}

export function updateSettings(p: Partial<Settings>) {
  setState((s) => ({ settings: { ...s.settings, ...p } }))
}

export function openPopup(p: Popup, stack = false) {
  setState((s) => ({ popup: p, popupStack: stack && s.popup ? [...s.popupStack, s.popup] : [] }))
}

export function closePopup() {
  setState((s) => {
    const stack = [...s.popupStack]
    const prev = stack.pop() ?? null
    return { popup: prev, popupStack: stack }
  })
}

export function closeAllPopups() {
  setState({ popup: null, popupStack: [] })
}

export const COLLECTIONS = ['labels', 'highlights', 'notes', 'journal', 'bookmarks', 'prayers', 'sermons'] as const
export type Collection = (typeof COLLECTIONS)[number]

/** Notified of every local add/edit/delete (used by sync). item is null for a delete. */
let changeListener: ((coll: Collection, id: string, item: unknown | null) => void) | null = null
export function setChangeListener(fn: typeof changeListener) {
  changeListener = fn
}

export async function saveItem<K extends Collection>(coll: K, item: State[K][number]) {
  setState((s) => {
    const list = (s[coll] as { id: string }[]).filter((x) => x.id !== item.id)
    return { [coll]: [...list, item] } as Partial<State>
  })
  await db.put(coll, item as { id: string })
  changeListener?.(coll, (item as { id: string }).id, item)
}

export async function deleteItem(coll: Collection, id: string) {
  setState((s) => ({ [coll]: (s[coll] as { id: string }[]).filter((x) => x.id !== id) }) as Partial<State>)
  await db.remove(coll, id)
  changeListener?.(coll, id, null)
}

export async function exportData(): Promise<string> {
  const s = getState()
  return JSON.stringify(
    {
      app: 'Scripture Study',
      exported: new Date().toISOString(),
      settings: { ...s.settings, esvKey: '', apiBibleKey: '' },
      labels: s.labels,
      highlights: s.highlights,
      notes: s.notes,
      journal: s.journal,
      bookmarks: s.bookmarks,
      prayers: s.prayers,
      sermons: s.sermons,
    },
    null,
    1,
  )
}

/** Merges a backup into the current data (items with the same id are replaced). */
export async function importData(json: string): Promise<number> {
  const d = JSON.parse(json)
  if (d.app !== 'Scripture Study') throw new Error('This is not a Scripture Study backup file.')
  let n = 0
  for (const coll of COLLECTIONS) {
    const incoming = (d[coll] ?? []) as { id: string }[]
    if (!incoming.length) continue
    const map = new Map((getState()[coll] as { id: string }[]).map((x) => [x.id, x]))
    for (const it of incoming) map.set(it.id, it)
    const merged = [...map.values()]
    await db.replaceAll(coll, merged)
    setState({ [coll]: merged } as Partial<State>)
    n += incoming.length
  }
  return n
}

export function newId() {
  return db.uid()
}
