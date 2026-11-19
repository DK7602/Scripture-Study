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
  versions: Record<string, 'all' | Record<string, number[] | 'all'>> // version -> 'all' or book -> chapters
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
  engine: 'narration' | 'local' | 'device' | null
  label: string
  error: string
  info: string // e.g. download progress of Michael's on-device voice
  offerLocal: boolean // no recording here: offer Michael made on this device
}

let state: AudioState = { open: false, playing: false, loading: false, verse: 0, count: 0, engine: null, label: '', error: '', info: '', offerLocal: false }
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
  const vv = v.versions[version]
  if (vv === 'all') return true
  const c = vv?.[book]
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
const bookCache = new Map<string, Promise<Record<string, Timings>>>()
function bookTimings(url: string) {
  let p = bookCache.get(url)
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`timings ${r.status}`)
      return r.json()
    })
    p.catch(() => bookCache.delete(url))
    bookCache.set(url, p)
  }
  return p
}

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
  for (const u of localUrls) URL.revokeObjectURL(u)
  localUrls.clear()
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
  if (audioEl && state.engine === 'narration') audioEl.playbackRate = rate
  if (state.playing && state.engine !== 'narration') void play(state.verse)
}

/** Agree to download Michael's voice and use it where there is no recording. */
export function useLocalMichael() {
  updateSettings({ audioLocal: true, audioNarrator: '' })
  set({ offerLocal: false })
  void play(state.verse || startVerse())
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
  set({ open: true, playing: true, loading: true, verse: v, count: chapter.verses.length, label: labelFor(), error: '', offerLocal: false })
  const voices = await narratorsFor(chapter.version, chapter.book, chapter.chapter)
  if (my !== runId) return
  const wantDevice = s.audioNarrator === 'device'
  const local = !wantDevice && canLocal && (s.audioLocal || s.audioNarrator === 'local')
  const pick = wantDevice ? undefined : voices[0]
  if (pick) await playNarration(pick, v, my, local)
  else if (local) playLocal(v, my, v === 1)
  else {
    playDevice(v, my, v === 1)
    if (!wantDevice && canLocal) set({ offerLocal: true })
  }
  mediaSession()
}

async function playNarration(voice: NarratorVoice, v: number, my: number, local = false) {
  const m = await narrationManifest()
  const root = m.base ? `${m.base.replace(/\/$/, '')}/` : siteUrl('audio/')
  const bookDir = `${root}${voice.id}/${chapter!.version}/${chapter!.book}`
  const base = `${bookDir}/${chapter!.chapter}`
  try {
    // a fully recorded translation keeps the verse timings in one file per book; samples have one per chapter
    const t =
      voice.versions[chapter!.version] === 'all'
        ? ((await bookTimings(bookDir + '.json'))[String(chapter!.chapter)] as Timings)
        : await fetch(base + '.json').then((r) => r.json() as Promise<Timings>)
    if (!t) throw new Error('no timings')
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
    // a browser that blocks playback, or a missing file: make Michael's voice here, or use the device voice
    if (local) playLocal(v, my, v === 1)
    else playDevice(v, my, v === 1, `Narration unavailable (${(e as Error).message || e}); using the device voice.`)
  }
}

// ---------------------------------------------------------------------------------------------
// Michael made on this device (Kokoro in a worker): every translation, nothing stored
// ---------------------------------------------------------------------------------------------
export const canLocal = typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined'

/** Size of the one-time download for Michael's on-device voice: the full model with WebGPU, else the compact one. */
let sizeP: Promise<number> | null = null
export function localDownloadMB(): Promise<number> {
  sizeP ??= (async () => {
    try {
      const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu
      return gpu && (await gpu.requestAdapter()) ? 310 : 90
    } catch {
      return 90
    }
  })()
  return sizeP
}
let worker: Worker | null = null
let reqId = 0
const waiting = new Map<number, { res: (r: { audio: Float32Array; sr: number }) => void; rej: (e: Error) => void }>()
const localUrls = new Set<string>()

function kokoro(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./kokoro.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent) => {
      const m = e.data
      if (m.type === 'progress') set({ info: `Downloading Michael's voice: ${Math.round((m.loaded / Math.max(m.total, 1)) * 100)}% (once, about ${Math.round(m.total / 2 ** 20)} MB)` })
      else if (m.type === 'audio') {
        set({ info: '' })
        waiting.get(m.id)?.res({ audio: m.audio, sr: m.sr })
        waiting.delete(m.id)
      } else if (m.type === 'error') {
        set({ info: '' })
        waiting.get(m.id)?.rej(new Error(m.error))
        waiting.delete(m.id)
      }
    }
  }
  return worker
}

function speakLocal(text: string, speed: number) {
  const id = ++reqId
  return new Promise<{ audio: Float32Array; sr: number }>((res, rej) => {
    waiting.set(id, { res, rej })
    kokoro().postMessage({ type: 'speak', id, text, voice: 'am_michael', speed })
  })
}

/** 16-bit PCM WAV, so an ordinary audio element can play it (lock screen, speed). */
function wavUrl(x: Float32Array, sr: number): string {
  const buf = new ArrayBuffer(44 + x.length * 2)
  const d = new DataView(buf)
  const str = (o: number, s: string) => [...s].forEach((c, i) => d.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  d.setUint32(4, 36 + x.length * 2, true)
  str(8, 'WAVEfmt ')
  d.setUint32(16, 16, true)
  d.setUint16(20, 1, true)
  d.setUint16(22, 1, true)
  d.setUint32(24, sr, true)
  d.setUint32(28, sr * 2, true)
  d.setUint16(32, 2, true)
  d.setUint16(34, 16, true)
  str(36, 'data')
  d.setUint32(40, x.length * 2, true)
  for (let i = 0; i < x.length; i++) d.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x[i])) * 0x7fff, true)
  const url = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }))
  localUrls.add(url)
  return url
}

function playLocal(v: number, my: number, withHeading: boolean) {
  if (!chapter) return
  set({ engine: 'local', loading: true, error: '' })
  const speed = getState().settings.audioRate || 1
  const items: { verse: number; text: string }[] = []
  if (withHeading) {
    const b = books().find((x) => x.id === chapter!.book)
    items.push({ verse: v, text: b?.id === 'PSA' ? `Psalm ${chapter.chapter}.` : `${b?.name ?? ''}, chapter ${chapter.chapter}.` })
  }
  for (let i = v; i <= chapter.verses.length; i++) {
    const t = speakable(chapter.verses[i - 1] ?? '')
    if (t) items.push({ verse: i, text: t })
  }
  const made = new Map<number, Promise<string>>()
  const make = (k: number) => {
    if (k < items.length && !made.has(k)) made.set(k, speakLocal(items[k].text, speed).then((r) => wavUrl(r.audio, r.sr)))
  }
  const next = async (k: number) => {
    if (my !== runId) return
    if (k >= items.length) return chapterDone()
    make(k)
    make(k + 1) // the next verse is made while this one plays
    make(k + 2)
    let url: string
    try {
      url = await made.get(k)!
    } catch (e) {
      if (my !== runId) return
      playDevice(items[k].verse, my, false, `Michael's voice could not be made on this device (${(e as Error).message}); using the device voice.`)
      return
    }
    if (my !== runId) return
    set({ verse: items[k].verse, loading: false })
    audioEl ??= new Audio()
    audioEl.src = url
    audioEl.playbackRate = 1
    audioEl.onended = () => {
      URL.revokeObjectURL(url)
      localUrls.delete(url)
      void next(k + 1)
    }
    try {
      await audioEl.play()
    } catch (e) {
      if (my === runId) set({ playing: false, error: `Playback was blocked (${(e as Error).message}). Tap play again.` })
    }
  }
  void next(0)
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
