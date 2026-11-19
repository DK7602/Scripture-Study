import { useSyncExternalStore } from 'react'
import { audioState, closePlayer, onBibleAudioStart } from './audio'
import type { SermonRef } from './types'

/**
 * Sermons from SermonAudio inside the app: the church's newest sermons (read through this site's /feed/sermons,
 * see worker/sermons.ts) and a player that keeps going on other tabs and with the screen off. The audio plays
 * straight from SermonAudio. Where each sermon was left off is remembered on this device.
 */
export type FeedSermon = SermonRef
export interface Feed {
  broadcaster: string
  title: string
  image: string
  url: string
  sermons: FeedSermon[]
}

/** The SermonAudio broadcaster in a link (sermonaudio.com/broadcasters/<id>/…, /solo/<id>, /source/<id>), if any. */
export function saBroadcaster(url: string): string | null {
  const m = url.match(/sermonaudio\.com\/(?:broadcasters|solo|source)\/([a-z0-9_-]+)/i)
  return m ? m[1] : null
}

// ---------------------------------------------------------------------------------------------
// The feed (kept on the device, refreshed every 30 minutes)
// ---------------------------------------------------------------------------------------------
const FRESH = 30 * 60_000

function cached(b: string): { at: number; feed: Feed } | null {
  try {
    const v = localStorage.getItem(`ss:feed:${b}`)
    return v ? JSON.parse(v) : null
  } catch {
    return null
  }
}

export function cachedFeed(b: string): Feed | null {
  return cached(b)?.feed ?? null
}

export async function loadFeed(b: string, force = false): Promise<Feed> {
  const c = cached(b)
  if (c && !force && Date.now() - c.at < FRESH) return c.feed
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}feed/sermons?b=${encodeURIComponent(b)}`)
    const d = await r.json().catch(() => null)
    if (!r.ok || !d?.sermons) throw new Error(d?.error || `error ${r.status}`)
    try {
      localStorage.setItem(`ss:feed:${b}`, JSON.stringify({ at: Date.now(), feed: d }))
    } catch {
      /* storage full: fine */
    }
    return d as Feed
  } catch (e) {
    if (c) return c.feed
    throw e
  }
}

// ---------------------------------------------------------------------------------------------
// Where each sermon was left off
// ---------------------------------------------------------------------------------------------
type Positions = Record<string, { t: number; done?: boolean }>
function positions(): Positions {
  try {
    return JSON.parse(localStorage.getItem('ss:sermonpos') || '{}')
  } catch {
    return {}
  }
}
function savePosition(id: string, t: number, duration: number) {
  const p = positions()
  const done = duration > 0 && t > duration - 45
  p[id] = { t: done ? 0 : Math.floor(t), ...(done || p[id]?.done ? { done: true } : {}) }
  // keep the 200 most recent
  const keys = Object.keys(p)
  if (keys.length > 200) for (const k of keys.slice(0, keys.length - 200)) delete p[k]
  try {
    localStorage.setItem('ss:sermonpos', JSON.stringify(p))
  } catch {
    /* ignore */
  }
  posVersion++
}
let posVersion = 0
export function sermonPosition(id: string): { t: number; done?: boolean } | undefined {
  return positions()[id]
}

// ---------------------------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------------------------
export interface SermonPlayer {
  current: (FeedSermon & { image?: string; church?: string }) | null
  playing: boolean
  loading: boolean
  time: number
  duration: number
  rate: number
  error: string
  positions: number // bumps when saved positions change (lists re-read them)
}

let state: SermonPlayer = { current: null, playing: false, loading: false, time: 0, duration: 0, rate: readRate(), error: '', positions: 0 }
const listeners = new Set<() => void>()
function set(p: Partial<SermonPlayer>) {
  state = { ...state, ...p }
  listeners.forEach((l) => l())
}
function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}
export function useSermonPlayer(): SermonPlayer {
  return useSyncExternalStore(subscribe, () => state)
}
export function sermonPlayer() {
  return state
}

function readRate(): number {
  try {
    return +(localStorage.getItem('ss:sermonrate') || 1) || 1
  } catch {
    return 1
  }
}

let el: HTMLAudioElement | null = null
let lastSaved = 0
function audio(): HTMLAudioElement {
  if (el) return el
  el = new Audio()
  el.preload = 'metadata'
  el.ontimeupdate = () => {
    const a = el!
    set({ time: a.currentTime, duration: a.duration || state.duration })
    if (state.current && Math.abs(a.currentTime - lastSaved) > 10) {
      lastSaved = a.currentTime
      savePosition(state.current.id, a.currentTime, a.duration)
      set({ positions: posVersion })
    }
    updatePosition()
  }
  el.onplaying = () => set({ playing: true, loading: false, error: '' })
  el.onwaiting = () => set({ loading: true })
  el.onpause = () => {
    set({ playing: false })
    if (state.current) savePosition(state.current.id, el!.currentTime, el!.duration)
    set({ positions: posVersion })
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
  }
  el.onended = () => {
    if (state.current) savePosition(state.current.id, el!.duration, el!.duration)
    set({ playing: false, positions: posVersion })
  }
  el.onerror = () => set({ playing: false, loading: false, error: 'This sermon could not be played. Check the connection and try again.' })
  el.onloadedmetadata = () => set({ duration: el!.duration })
  return el
}

/** Plays a sermon (from where it was left off), or pauses/resumes it if it is the one already loaded. */
export function playSermon(s: FeedSermon, extra: { image?: string; church?: string } = {}) {
  const a = audio()
  if (state.current?.id === s.id) {
    if (a.paused) void resume()
    else a.pause()
    return
  }
  if (audioState().open) closePlayer() // one thing at a time: stop the audio Bible
  if (state.current) savePosition(state.current.id, a.currentTime, a.duration)
  const from = sermonPosition(s.id)?.t ?? 0
  a.src = s.audio
  a.playbackRate = state.rate
  lastSaved = from
  set({ current: { ...s, ...extra }, playing: false, loading: true, time: from, duration: s.duration, error: '' })
  const start = () => {
    a.removeEventListener('loadedmetadata', start)
    if (from > 0 && from < (a.duration || s.duration) - 5) a.currentTime = from
  }
  a.addEventListener('loadedmetadata', start)
  mediaSession()
  void a.play().catch((e) => set({ loading: false, playing: false, error: e?.name === 'NotAllowedError' ? '' : 'This sermon could not be played.' }))
}

async function resume() {
  if (audioState().open) closePlayer()
  const a = audio()
  a.playbackRate = state.rate
  mediaSession()
  try {
    await a.play()
  } catch {
    set({ error: 'This sermon could not be played.' })
  }
}

export function toggleSermon() {
  if (!state.current) return
  const a = audio()
  if (a.paused) void resume()
  else a.pause()
}

export function seekSermonBy(sec: number) {
  const a = audio()
  if (!state.current) return
  a.currentTime = Math.max(0, Math.min((a.duration || state.duration) - 1, a.currentTime + sec))
  set({ time: a.currentTime })
}

export function seekSermonTo(sec: number) {
  const a = audio()
  if (!state.current) return
  a.currentTime = sec
  set({ time: sec })
}

export function setSermonRate(rate: number) {
  audio().playbackRate = rate
  set({ rate })
  try {
    localStorage.setItem('ss:sermonrate', String(rate))
  } catch {
    /* ignore */
  }
}

/** Stops and puts the sermon away (its place is kept). */
export function closeSermon() {
  const a = audio()
  if (state.current) savePosition(state.current.id, a.currentTime, a.duration)
  a.pause()
  a.removeAttribute('src')
  a.load()
  set({ current: null, playing: false, loading: false, positions: posVersion })
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none'
}

// the audio Bible and a sermon never talk over each other
onBibleAudioStart(() => state.current && closeSermon())

function updatePosition() {
  if (!('mediaSession' in navigator) || !el || !el.duration || !navigator.mediaSession.setPositionState) return
  try {
    navigator.mediaSession.setPositionState({ duration: el.duration, position: Math.min(el.currentTime, el.duration), playbackRate: el.playbackRate })
  } catch {
    /* ignore */
  }
}

function mediaSession() {
  if (!('mediaSession' in navigator) || !state.current) return
  const s = state.current
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: s.title,
      artist: s.speaker,
      album: s.series || s.church || 'Sermon',
      artwork: s.image ? [{ src: s.image, sizes: '512x512', type: 'image/jpeg' }] : [],
    })
    navigator.mediaSession.setActionHandler('play', () => void resume())
    navigator.mediaSession.setActionHandler('pause', () => el?.pause())
    navigator.mediaSession.setActionHandler('seekbackward', () => seekSermonBy(-15))
    navigator.mediaSession.setActionHandler('seekforward', () => seekSermonBy(30))
    navigator.mediaSession.setActionHandler('previoustrack', () => seekSermonBy(-15))
    navigator.mediaSession.setActionHandler('nexttrack', () => seekSermonBy(30))
    try {
      navigator.mediaSession.setActionHandler('seekto', (d) => d.seekTime !== undefined && seekSermonTo(d.seekTime))
    } catch {
      /* not supported */
    }
  } catch {
    /* not supported */
  }
}

export function clock(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

export function minutes(sec: number): string {
  const m = Math.round(sec / 60)
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`
}

/** Whether the Sermons page is on screen (then the small floating player is not needed). */
let viewing = 0
export function sermonsOnScreen(on: boolean) {
  viewing += on ? 1 : -1
  listeners.forEach((l) => l())
}
export function useSermonsOnScreen(): boolean {
  return useSyncExternalStore(subscribe, () => viewing > 0)
}
