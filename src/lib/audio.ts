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
import { chapterText } from './providers'
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
  info: string // e.g. download progress of the on-device voice
  offerLocal: boolean // no recording here: offer a voice made on this device
  slow: boolean // this device makes the voice slower than it reads: offer the device voice
  localDevice: '' | 'webgpu' | 'wasm' // where the on-device voice runs
  mini: boolean // the player is minimized to the small floating bar (it keeps playing)
}

let state: AudioState = { open: false, playing: false, loading: false, verse: 0, count: 0, engine: null, label: '', error: '', info: '', offerLocal: false, localDevice: '', slow: false, mini: false }
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
/** One field only, so the Bible page does not redraw on every progress update of the player. */
export function useAudioField<K extends keyof AudioState>(k: K): AudioState[K] {
  return useSyncExternalStore(subscribe, () => state[k])
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
  const sameWords = !changed && chapter!.verses.length === verses.length && chapter!.verses[0] === verses[0] && chapter!.verses[verses.length - 1] === verses[verses.length - 1]
  chapter = { version, book, chapter: ch, verses }
  if (!changed) {
    // the right words arrived after the reading began with others: read on from here with these
    if (!sameWords && state.playing && (state.engine === 'local' || state.engine === 'device')) void play(Math.min(state.verse || 1, verses.length))
    return
  }
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
  manifestP ??= fetch(siteUrl('audio/index.json'), { cache: 'no-cache' }) // newly recorded translations show up at once
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

// Phones stop their own voice when the browser leaves the screen (it cannot be kept going in the background).
// Coming back to the app, the reading carries on from the verse it had reached instead of staying silent.
if (typeof document !== 'undefined')
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !synth) return
    setTimeout(() => {
      if (state.playing && state.engine === 'device' && !synth.speaking && !synth.pending) void play(state.verse || 1)
    }, 400)
  })

// Browsers do not say whether a voice is a man's or a woman's; these are the well-known voices by name
// (Windows, Edge, Apple, Google). Android's Chrome lists only languages: its voice is chosen in the phone's settings.
const MALE = /\b(david|mark|guy|andrew|brian|christopher|eric|roger|steffan|davis|jason|tony|ryan|aaron|evan|nathan|tom|alex|fred|ralph|reed|rocko|eddy|grandpa|junior|daniel|arthur|oliver|george|thomas|james|lee|male)\b/i
const FEMALE = /\b(zira|aria|jenny|emma|ava|michelle|samantha|allison|susan|victoria|karen|moira|tessa|serena|kate|zoe|nicky|joelle|sara|libby|sonia|catherine|natasha|nancy|ana|jane|female|google us english)\b/i
export function voiceGender(v: SpeechSynthesisVoice): 'male' | 'female' | '' {
  return MALE.test(v.name) ? 'male' : FEMALE.test(v.name) ? 'female' : ''
}
const american = (v: SpeechSynthesisVoice) => /^en[-_]US/i.test(v.lang)

/** American voices (others only if there are none), best first: natural-sounding, then a man's voice. */
export function deviceVoices(): SpeechSynthesisVoice[] {
  if (!synth) return []
  const english = synth.getVoices().filter((v) => /^en(-|_|$)/i.test(v.lang))
  const us = english.filter(american)
  const all = us.length ? us : english
  const score = (v: SpeechSynthesisVoice) =>
    (american(v) ? 0 : 10) +
    (/natural|neural|premium|enhanced|siri|online/i.test(v.name) ? 0 : /google|microsoft/i.test(v.name) ? 2 : 3) +
    (voiceGender(v) === 'male' ? 0 : voiceGender(v) === 'female' ? 1.5 : 1) +
    (v.localService ? 0 : 0.3)
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
  worker?.postMessage({ type: 'cancel', run: runId }) // the voice engine drops what it was making for the old reading
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
  keepAlive?.pause()
}

/**
 * The phone's own voice is not an audio stream, so a phone may suspend the page once the screen is off. While it
 * reads, an inaudible 20 Hz tone plays on an audio element: the page then counts as playing media (it keeps running,
 * and the lock screen shows the controls).
 */
let keepAlive: HTMLAudioElement | null = null
function keepAliveOn() {
  if (!keepAlive) {
    const sr = 8000
    const x = new Float32Array(sr * 2)
    for (let i = 0; i < x.length; i++) x[i] = 0.003 * Math.sin((2 * Math.PI * 20 * i) / sr)
    keepAlive = new Audio(wavUrl(x, sr, false))
    keepAlive.loop = true
  }
  void keepAlive.play().catch(() => {})
}

export function setMini(mini: boolean) {
  set({ mini })
}

export function openPlayer() {
  set({ open: true, label: labelFor(), count: chapter?.verses.length ?? 0, error: '' })
}

export function closePlayer() {
  stopEngines()
  pendingStart = false
  set({ open: false, playing: false, loading: false, verse: 0, engine: null, mini: false })
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

/** Agree to download Ryan's voice and use it where there is no recording. */
export function useLocalMichael() {
  updateSettings({ audioLocal: true, audioLocalAsked: true })
  set({ offerLocal: false })
  void play(state.verse || startVerse())
}

export function setNarrator(id: string) {
  updateSettings({ audioNarrator: id })
  if (state.playing) void play(state.verse || 1)
}

/** Chapters with no recording: read them with the device's own voice (optionally a particular one). */
export function useDeviceVoice(voiceURI?: string) {
  updateSettings({ audioLocal: false, audioLocalAsked: true, ...(voiceURI !== undefined ? { audioVoice: voiceURI } : {}) })
  set({ slow: false, offerLocal: false })
  if (state.playing || state.loading) void play(state.verse || 1)
}

/** Start reading at verse v of the chapter on screen. */
/** Called when the audio Bible starts reading (the sermon player stops then). */
const startHooks = new Set<() => void>()
export function onBibleAudioStart(fn: () => void) {
  startHooks.add(fn)
  return () => void startHooks.delete(fn)
}

export async function play(v = 1) {
  if (!chapter) return
  startHooks.forEach((f) => f())
  stopEngines()
  const my = runId
  const s = getState().settings
  set({ open: true, playing: true, loading: true, verse: v, count: chapter.verses.length, label: labelFor(), error: '', offerLocal: false })
  const voices = await narratorsFor(chapter.version, chapter.book, chapter.chapter)
  if (my !== runId) return
  // recorded chapters: the recording, unless the listener chose a device voice for them;
  // other chapters: Ryan's voice made on this device if chosen, else the device's own voice
  const local = canLocal && s.audioLocal
  const pick = s.audioNarrator === 'device' ? undefined : voices[0]
  if (pick) await playNarration(pick, v, my, local)
  else if (local && !voices.length) playLocal(v, my, v === 1)
  else {
    playDevice(v, my, v === 1)
    if (!voices.length && canLocal && !s.audioLocalAsked) set({ offerLocal: true })
  }
  mediaSession()
}

async function playNarration(voice: NarratorVoice, v: number, my: number, local = false) {
  const m = await narrationManifest()
  const root = m.base ? `${m.base.replace(/\/$/, '')}/` : siteUrl('audio/')
  const bookDir = `${root}${voice.id}/${chapter!.version}/${chapter!.book}`
  const base = `${bookDir}/${chapter!.chapter}`
  try {
    // recordings from Kaggle keep the verse timings in one file per book; the first samples had one per chapter
    const full = voice.versions[chapter!.version] === 'all'
    const book: Record<string, Timings> = await bookTimings(bookDir + '.json').catch((e) => (full ? Promise.reject(e) : {}))
    let t: Timings | undefined = book[String(chapter!.chapter)]
    if (!t && !full) t = await fetch(base + '.json').then((r) => (r.ok ? (r.json() as Promise<Timings>) : undefined))
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
    // a browser that blocks playback, or a missing file: make Ryan's voice here, or use the device voice
    if (local) playLocal(v, my, v === 1)
    else playDevice(v, my, v === 1, `Narration unavailable (${(e as Error).message || e}); using the device voice.`)
  }
}

// ---------------------------------------------------------------------------------------------
// Voices made on this device (Ryan by Piper, piper.worker.ts; Supertonic's ten, supertonic.worker.ts): every translation, nothing stored.
// Piper is fast enough on a phone to make a chapter well ahead of the reading, and its sound plays from an
// ordinary audio element, so the reading goes on with the screen off (the phone's own voice stops there).
// (Before it, Michael's Kokoro voice was made here, but on phones far slower than he reads.)
// ---------------------------------------------------------------------------------------------
export const canLocal = typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined'
/** The voices made on the phone: Ryan (Piper, small) and Supertonic's five men and five women (one larger model). */
export interface LocalVoice {
  id: string
  name: string
  engine: 'piper' | 'supertonic'
  mb: number // the one-time download
  man: boolean
}
export const LOCAL_VOICES: LocalVoice[] = [
  { id: 'ryan', name: 'Ryan', engine: 'piper', mb: 75, man: true },
  ...[1, 2, 3, 4, 5].map((n) => ({ id: `st:M${n}`, name: `Supertonic M${n}`, engine: 'supertonic' as const, mb: 265, man: true })),
  ...[1, 2, 3, 4, 5].map((n) => ({ id: `st:F${n}`, name: `Supertonic F${n}`, engine: 'supertonic' as const, mb: 265, man: false })),
]
export function localVoice(): LocalVoice {
  const id = getState().settings.localVoice
  return LOCAL_VOICES.find((v) => v.id === id) ?? LOCAL_VOICES[0]
}
/** The chosen voice's name ("Ryan", "Supertonic M3"). */
export function localName(): string {
  return localVoice().name
}

/** Size of the one-time download for the chosen voice (the model, ONNX Runtime, eSpeak), in MB. */
export function localDownloadMB(): Promise<number> {
  return Promise.resolve(localVoice().mb)
}

/** Choose the voice made on the phone (and use it where there is no recording). */
export function useLocalVoice(id: string) {
  updateSettings({ localVoice: id, audioLocal: true, audioLocalAsked: true })
  set({ offerLocal: false, slow: false })
  madeSec = spentSec = piecesMade = 0
  void play(state.verse || startVerse())
}
let worker: Worker | null = null
let workerEngine: LocalVoice['engine'] | null = null
let voiceLoading = false // the voice is downloading or starting: its progress is shown, not the wait for a verse
let reqId = 0
const waiting = new Map<number, { res: (r: { audio: Float32Array; sr: number }) => void; rej: (e: Error) => void }>()
const localUrls = new Set<string>()

function voiceWorker(): Worker {
  const engine = localVoice().engine
  if (worker && workerEngine !== engine) {
    // another voice engine was chosen: let the old one go (its model memory with it)
    worker.terminate()
    worker = null
    voiceLoading = false
    for (const w of waiting.values()) w.rej(new Error('another voice was chosen'))
    waiting.clear()
  }
  if (!worker) {
    workerEngine = engine
    worker =
      engine === 'supertonic'
        ? new Worker(new URL('./supertonic.worker.ts', import.meta.url), { type: 'module' })
        : new Worker(new URL('./piper.worker.ts', import.meta.url), { type: 'module' })
    // if the voice engine dies (out of memory, say), give up on it at once instead of waiting forever
    worker.onerror = (e) => {
      e.preventDefault?.()
      voiceLoading = false
      for (const w of waiting.values()) w.rej(new Error('the voice engine stopped, perhaps for lack of memory'))
      waiting.clear()
      worker?.terminate()
      worker = null
    }
    worker.onmessage = (e: MessageEvent) => {
      const m = e.data
      if (m.type === 'mode') voiceLoading = false
      if (m.type === 'mode') set({ localDevice: m.device, info: state.loading ? `${localName()}'s voice is ready, starting…` : '' })
      else if (m.type === 'progress') {
        voiceLoading = true
        const pct = Math.round((m.loaded / Math.max(m.total, 1)) * 100)
        const info =
          pct >= 100
            ? `Preparing ${localName()}'s voice…`
            : `Downloading ${localName()}'s voice: ${pct}% (once, about ${Math.round(m.total / 2 ** 20)} MB)`
        if (info !== state.info) set({ info })
      }
      else if (m.type === 'audio') {
        // how fast this device makes speech, against how long the speech lasts
        madeSec += m.audio.length / m.sr
        spentSec += m.ms / 1000
        if (++piecesMade > 3 && madeSec / spentSec < 0.85 && !state.slow) set({ slow: true })
        waiting.get(m.id)?.res({ audio: m.audio, sr: m.sr })
        waiting.delete(m.id)
      } else if (m.type === 'dropped') {
        waiting.delete(m.id) // a piece for a reading the listener has left
      } else if (m.type === 'error') {
        voiceLoading = false
        set({ info: '' })
        waiting.get(m.id)?.rej(new Error(m.error))
        waiting.delete(m.id)
      }
    }
  }
  return worker
}

let madeSec = 0
let spentSec = 0
let piecesMade = 0

function speakLocal(text: string, speed: number, run: number) {
  const id = ++reqId
  const w = voiceWorker() // first: a change of voice engine lets go of the old engine's pieces, not this one
  return new Promise<{ audio: Float32Array; sr: number }>((res, rej) => {
    waiting.set(id, { res, rej })
    w.postMessage({ type: 'speak', id, run, text, speed, voice: localVoice().id.replace(/^st:/, '') })
  })
}

/** 16-bit PCM WAV, so an ordinary audio element can play it (lock screen, speed). */
function wavUrl(x: Float32Array, sr: number, track = true): string {
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
  if (track) localUrls.add(url)
  return url
}

/** Splits a long verse at sentence ends (and, if still long, at semicolons/colons), keeping pieces of a useful size. */
function pieces(text: string): string[] {
  if (text.length <= 160) return text ? [text] : []
  const parts = text.match(/[^.!?;:]+[.!?;:]+["'”’)]*\s*|[^.!?;:]+$/g) ?? [text]
  const out: string[] = []
  for (const p of parts.map((x) => x.trim()).filter(Boolean)) {
    const last = out[out.length - 1]
    if (last !== undefined && (last.length < 60 || p.length < 30)) out[out.length - 1] = `${last} ${p}`
    else out.push(p)
  }
  return out
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
    // long verses in sentence-sized pieces: the first sound comes sooner and the reading keeps pace
    for (const piece of pieces(t)) items.push({ verse: i, text: piece })
  }
  const ready = new Map<number, Promise<string>>()
  const make = (k: number) => {
    if (k >= items.length || ready.has(k)) return
    const url = speakLocal(items[k].text, speed, my).then((r) => wavUrl(r.audio, r.sr))
    url.catch(() => {}) // pieces made ahead and never reached (the voice was changed): not an error
    ready.set(k, url)
  }
  const next = async (k: number) => {
    if (my !== runId) return
    if (k >= items.length) return chapterDone()
    // the rest of the chapter is made in order, well ahead of the reading: with the screen off the phone may slow
    // the page down, but what is ready keeps playing
    for (let j = k; j < items.length; j++) make(j)
    let url: string
    // while a piece is being made, say so and count the seconds; a very slow device gets the offer at once
    let t0 = Date.now()
    const tick = setInterval(() => {
      if (my !== runId) return clearInterval(tick)
      if (voiceLoading) return void (t0 = Date.now()) // the first download is not the device being slow
      const sec = Math.round((Date.now() - t0) / 1000)
      if (sec >= 2) set({ info: `${localName()} is getting verse ${items[k].verse} ready… ${sec} s`, ...(sec >= 25 && !state.slow ? { slow: true } : {}) })
    }, 1000)
    try {
      url = await ready.get(k)!
    } catch (e) {
      clearInterval(tick)
      if (my !== runId) return
      playDevice(items[k].verse, my, false, `${localName()}'s voice could not be made on this device (${(e as Error).message}); using the phone's voice.`)
      return
    } finally {
      clearInterval(tick)
    }
    if (my !== runId) return
    audioEl ??= new Audio()
    audioEl.src = url
    audioEl.playbackRate = 1
    // highlight the verse the moment its sound starts
    audioEl.onplaying = () => {
      if (my === runId && (state.verse !== items[k].verse || state.loading || state.info)) set({ verse: items[k].verse, loading: false, info: '' })
    }
    if (state.loading) set({ loading: false })
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

/** "male:us": a real American man's voice if the device has one, else its American voice made deeper. */
export const MALE_US = 'male:us'
export function realMaleVoice(): SpeechSynthesisVoice | undefined {
  return deviceVoices().find((x) => american(x) && voiceGender(x) === 'male')
}
function pickDeviceVoice(choice: string): { voice?: SpeechSynthesisVoice; pitch: number } {
  const list = deviceVoices()
  if (!choice || choice === MALE_US) {
    const male = realMaleVoice()
    if (male) return { voice: male, pitch: 1 }
    return { voice: list[0], pitch: 0.75 } // a lower pitch: the phone's voice as a man's
  }
  return { voice: list.find((x) => x.voiceURI === choice) ?? list[0], pitch: 1 }
}

function playDevice(v: number, my: number, withHeading: boolean, note = '') {
  if (!synth || !chapter) {
    set({ playing: false, loading: false, error: 'This browser cannot read aloud.' })
    return
  }
  set({ engine: 'device', loading: false, error: note })
  keepAliveOn()
  const s = getState().settings
  const { voice, pitch } = pickDeviceVoice(s.audioVoice)
  const say = (text: string, onEnd: () => void, onStart?: () => void) => {
    const u = new SpeechSynthesisUtterance(text)
    if (voice) {
      u.voice = voice
      u.lang = voice.lang
    } else u.lang = 'en-US'
    u.rate = s.audioRate || 1
    u.pitch = pitch
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
  const version = chapter.version
  go({ book: bk.id, chapter: ch, verse: 1 })
  // the Bible page may not be showing (another tab, or the screen off): fetch the next chapter's text here as well
  chapterText(version, bk.id, ch)
    .then((d) => {
      if (pendingStart && !d.error && d.verses.length) setChapterText(version, bk.id, ch, d.verses)
    })
    .catch(() => {})
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
