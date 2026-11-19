/**
 * Audio Bible: reads the chapter aloud, verse by verse, with the verse being read highlighted.
 *
 * Two engines:
 *  - "narration": pre-recorded chapters (Kokoro narrator, optionally in a VoxaVersa voice) listed in
 *    /audio/index.json, each an MP3 with the start time of every verse (scripts/narrate.py);
 *  - "device": the phone's or computer's own text-to-speech (Web Speech API), for every other chapter and
 *    every translation, including the licensed ones (nothing is recorded or stored).
 *
 * The reader registers the text of the chapter on screen (setChapterText); the player reads from that, so no
 * text is fetched twice. Continuing into the next chapter navigates there and starts when its text arrives.
 */
import { useSyncExternalStore } from 'react'
import { books, siteUrl } from './data'
import { plainText } from './markup'
import { getState, go, updateSettings } from './store'

export interface NarratorVoice {
  id: string
  name: string
  note?: string
  credit?: string
  versions: Record<string, Record<string, number[] | 'all'>> // version -> book -> chapters
}
interface Manifest {
  base?: string
  voices: NarratorVoice[]
}
interface Timings {
  d: number
  v: [number, number, number][]
}

export interface AudioState {
  open: boolean
  playing: boolean
  loading: boolean
  verse: number
  count: number
  engine: 'narration' | 'device' | null
  label: string
  error: string
}

let state: AudioState = { open: false, playing: false, loading: false, verse: 0, count: 0, engine: null, label: '', error: '' }
const subs = new Set<() => void>()
function set(p: Partial<AudioState>) {
  state = { ...state, ...p }
  subs.forEach((f) => f())
}
const subscribe = (f: () => void) => {
  subs.add(f)
  return () => subs.delete(f)
}
export function useAudio(): AudioState {
  return useSyncExternalStore(subscribe, () => state)
}
export function audioState(): AudioState {
  return state
}

// ---------------------------------------------------------------------------------------------
// chapter text, registered by the reader
// ---------------------------------------------------------------------------------------------
let chapter: { version: string; book: string; chapter: number; verses: string[] } | null = null
let pendingStart = false

export function setChapterText(version: string, book: string, ch: number, verses: string[]) {
  const changed = !chapter || chapter.version !== version || chapter.book !== book || chapter.chapter !== ch
  chapter = { version, book, chapter: ch, verses }
  if (!changed) return
  if (pendingStart) {
    pendingStart = false
    void play(1)
  } else if (state.open) {
    // the reader moved to another chapter (or version): stop, ready to read the new one
    stopEngines()
    set({ playing: false, verse: 0, count: verses.length, label: labelFor(), engine: null, error: '' })
  }
}

function labelFor() {
  if (!chapter) return ''
  const b = books().find((x) => x.id === chapter!.book)
  return `${b?.name ?? chapter.book} ${chapter.chapter} · ${chapter.version}`
}

/** What a voice should read: plain words, LORD/GOD in ordinary case so it isn't spelled out. */
export function speakable(markup: string): string {
  return plainText(markup)
    .replace(/¶/g, '')
    .replace(/\b([A-Z])([A-Z]+)\b/g, (w, a: string, b: string) => (w === 'II' || w === 'III' ? w : a + b.toLowerCase()))
}

// ---------------------------------------------------------------------------------------------
// narration manifest
// ---------------------------------------------------------------------------------------------
let manifestP: Promise<Manifest> | null = null
export function narrationManifest(): Promise<Manifest> {
  manifestP ??= fetch(siteUrl('audio/index.json'))
    .then((r) => (r.ok && (r.headers.get('content-type') ?? '').includes('json') ? r.json() : { voices: [] }))
    .catch(() => ({ voices: [] }))
  return manifestP
}
function hasChapter(v: NarratorVoice, version: string, book: string, ch: number) {
  const c = v.versions[version]?.[book]
  return c === 'all' || (Array.isArray(c) && c.includes(ch))
}
/** Narrator voices that have the given chapter recorded. */
export async function narratorsFor(version: string, book: string, ch: number): Promise<NarratorVoice[]> {
  const m = await narrationManifest()
  return m.voices.filter((v) => hasChapter(v, version, book, ch))
}

// ---------------------------------------------------------------------------------------------
// device voices
// ---------------------------------------------------------------------------------------------
const synth: SpeechSynthesis | undefined = typeof window !== 'undefined' ? window.speechSynthesis : undefined
export const canSpeak = !!synth

export function deviceVoices(): SpeechSynthesisVoice[] {
  if (!synth) return []
  const all = synth.getVoices().filter((v) => /^en(-|_|$)/i.test(v.lang))
  const score = (v: SpeechSynthesisVoice) =>
    (/natural|neural|premium|enhanced|siri/i.test(v.name) ? 0 : /google|microsoft/i.test(v.name) ? 1 : 2) + (v.localService ? 0 : 0.5)
  return all.sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name))
}
export function onVoicesChanged(f: () => void) {
  if (!synth) return () => {}
  synth.addEventListener?.('voiceschanged', f)
  return () => synth.removeEventListener?.('voiceschanged', f)
}

// ---------------------------------------------------------------------------------------------
// playback
// ---------------------------------------------------------------------------------------------
let audioEl: HTMLAudioElement | null = null
let timings: Timings | null = null
let raf = 0
let utter: SpeechSynthesisUtterance | null = null // kept referenced: some browsers drop callbacks otherwise
let runId = 0

function stopEngines() {
  runId++
  cancelAnimationFrame(raf)
  if (audioEl) {
    audioEl.pause()
    audioEl.onended = null
  }
  if (utter) utter.onend = null
  if (synth && (synth.speaking || synth.pending)) synth.cancel()
  utter = null
}

export function openPlayer() {
  set({ open: true, label: labelFor(), count: chapter?.verses.length ?? 0, error: '' })
}

export function closePlayer() {
  stopEngines()
  pendingStart = false
  set({ open: false, playing: false, loading: false, verse: 0, engine: null })
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none'
}

export function pause() {
  stopEngines()
  set({ playing: false })
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
}

export function toggle() {
  if (state.playing) pause()
  else void play(state.verse || startVerse())
}

function startVerse() {
  const v = getState().loc.verse
  return v > 1 ? v : 1
}

export function skip(dir: number) {
  if (!chapter) return
  const v = Math.min(Math.max(1, (state.verse || 1) + dir), chapter.verses.length)
  if (state.playing) void play(v)
  else set({ verse: v })
}

export function setRate(rate: number) {
  updateSettings({ audioRate: rate })
  if (audioEl) audioEl.playbackRate = rate
  if (state.playing && state.engine === 'device') void play(state.verse)
}

export function setNarrator(id: string) {
  updateSettings({ audioNarrator: id })
  if (state.playing) void play(state.verse || 1)
}

/** Start reading at verse v of the chapter on screen. */
export async function play(v = 1) {
  if (!chapter) return
  stopEngines()
  const my = runId
  const s = getState().settings
  set({ open: true, playing: true, loading: true, verse: v, count: chapter.verses.length, label: labelFor(), error: '' })
  const voices = await narratorsFor(chapter.version, chapter.book, chapter.chapter)
  if (my !== runId) return
  const pick = s.audioNarrator === 'device' ? undefined : voices.find((x) => x.id === s.audioNarrator) ?? (s.audioNarrator ? voices[0] : voices[0])
  if (pick) await playNarration(pick, v, my)
  else playDevice(v, my, v === 1)
  mediaSession()
}

async function playNarration(voice: NarratorVoice, v: number, my: number) {
  const m = await narrationManifest()
  const base = m.base ? `${m.base.replace(/\/$/, '')}/${voice.id}/${chapter!.version}/${chapter!.book}/${chapter!.chapter}` : siteUrl(`audio/${voice.id}/${chapter!.version}/${chapter!.book}/${chapter!.chapter}`)
  try {
    const t = await fetch(base + '.json').then((r) => r.json() as Promise<Timings>)
    if (my !== runId) return
    timings = t
    audioEl ??= new Audio()
    audioEl.preload = 'auto'
    if (!audioEl.src.endsWith(base.split('/').slice(-4).join('/') + '.mp3')) audioEl.src = base + '.mp3'
    audioEl.playbackRate = getState().settings.audioRate || 1
    const start = v <= 1 ? 0 : t.v.find((x) => x[0] >= v)?.[1] ?? 0
    audioEl.currentTime = start
    audioEl.onended = () => my === runId && chapterDone()
    await audioEl.play()
    set({ engine: 'narration', loading: false })
    const tick = () => {
      if (my !== runId || !audioEl || !timings) return
      const now = audioEl.currentTime
      let cur = state.verse
      for (const [vv, a] of timings.v) if (now >= a - 0.05) cur = vv
      if (cur !== state.verse) set({ verse: cur })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
  } catch (e) {
    if (my !== runId) return
    // a browser that blocks playback, or a missing file: fall back to the device voice
    playDevice(v, my, v === 1, `Narration unavailable (${(e as Error).message || e}); using the device voice.`)
  }
}

function playDevice(v: number, my: number, withHeading: boolean, note = '') {
  if (!synth || !chapter) {
    set({ playing: false, loading: false, error: 'This browser cannot read aloud.' })
    return
  }
  set({ engine: 'device', loading: false, error: note })
  const s = getState().settings
  const voice = deviceVoices().find((x) => x.voiceURI === s.audioVoice) ?? deviceVoices()[0]
  const say = (text: string, onEnd: () => void, onStart?: () => void) => {
    const u = new SpeechSynthesisUtterance(text)
    if (voice) {
      u.voice = voice
      u.lang = voice.lang
    } else u.lang = 'en-US'
    u.rate = s.audioRate || 1
    u.onstart = () => my === runId && onStart?.()
    u.onend = () => my === runId && onEnd()
    u.onerror = (e) => {
      if (my !== runId || e.error === 'interrupted' || e.error === 'canceled') return
      set({ error: `The device voice stopped (${e.error}).`, playing: false })
    }
    utter = u
    synth.speak(u)
  }
  const verseAt = (n: number) => {
    if (my !== runId || !chapter) return
    let i = n
    while (i <= chapter.verses.length && !speakable(chapter.verses[i - 1] ?? '')) i++
    if (i > chapter.verses.length) return chapterDone()
    set({ verse: i })
    say(speakable(chapter.verses[i - 1]), () => verseAt(i + 1))
  }
  if (withHeading) {
    const b = books().find((x) => x.id === chapter!.book)
    const head = b?.id === 'PSA' ? `Psalm ${chapter.chapter}.` : `${b?.name ?? ''}, chapter ${chapter.chapter}.`
    say(head, () => verseAt(v))
  } else verseAt(v)
}

function chapterDone() {
  const s = getState().settings
  if (!s.audioContinue || !chapter) {
    set({ playing: false, verse: 0 })
    return
  }
  const list = books()
  const bi = list.findIndex((b) => b.id === chapter!.book)
  let bk = list[bi]
  let ch = chapter.chapter + 1
  if (ch > bk.v.length) {
    if (bi === list.length - 1) {
      set({ playing: false, verse: 0 })
      return
    }
    bk = list[bi + 1]
    ch = 1
  }
  pendingStart = true
  set({ loading: true, verse: 0 })
  go({ book: bk.id, chapter: ch, verse: 1 })
}

function mediaSession() {
  if (!('mediaSession' in navigator) || !chapter) return
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: labelFor().split(' · ')[0],
      artist: 'Scripture Study',
      album: chapter.version,
      artwork: [{ src: siteUrl('icons/icon-512.png'), sizes: '512x512', type: 'image/png' }],
    })
    navigator.mediaSession.playbackState = 'playing'
    navigator.mediaSession.setActionHandler('play', () => toggle())
    navigator.mediaSession.setActionHandler('pause', () => pause())
    navigator.mediaSession.setActionHandler('previoustrack', () => skip(-1))
    navigator.mediaSession.setActionHandler('nexttrack', () => skip(1))
  } catch {
    /* not supported */
  }
}
