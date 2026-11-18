/**
 * Sync across devices (Cloudflare Pages Function + D1, sign-in by Cloudflare Access email code).
 *
 * Built to stay cheap and calm:
 *  - nothing is sent unless something changed (changes are batched for a few seconds),
 *  - other devices' changes are fetched on sign-in, when the app is reopened, and every 15 minutes
 *    while it is open — never in a loop,
 *  - a hard budget of 40 server requests per hour per device, with back-off after any error.
 */
import * as db from './db'
import { getState, setChangeListener, setState, type State } from './store'
import type { Settings } from './types'
import { setSharedVersions } from './shared'

type Coll = 'labels' | 'highlights' | 'notes' | 'journal' | 'bookmarks' | 'settings'
interface Change {
  coll: Coll
  id: string
  data: unknown
  updated: number
  deleted?: boolean
}

export type SyncStatus = 'checking' | 'unavailable' | 'signed-out' | 'not-invited' | 'signed-in' | 'error'

export interface SyncInfo {
  status: SyncStatus
  email?: string
  role?: string
  invite?: string
  last?: number
  message?: string
  busy?: boolean
}

let info: SyncInfo = { status: 'checking' }
const listeners = new Set<() => void>()
export function syncInfo() {
  return info
}
export function onSync(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}
function set(p: Partial<SyncInfo>) {
  info = { ...info, ...p }
  listeners.forEach((l) => l())
}

// ---------------------------------------------------------------------------------------------
// Request budget
// ---------------------------------------------------------------------------------------------
const BUDGET_PER_HOUR = 40
const recent: number[] = []
let backoffUntil = 0
let failures = 0

function allowRequest(): boolean {
  const now = Date.now()
  while (recent.length && recent[0] < now - 3600_000) recent.shift()
  if (now < backoffUntil || recent.length >= BUDGET_PER_HOUR) return false
  recent.push(now)
  return true
}

async function api(path: string, init: RequestInit = {}): Promise<Response | null> {
  if (!allowRequest()) return null
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}api/${path}`, { ...init, redirect: 'manual', credentials: 'same-origin', cache: 'no-store' })
    if (r.status >= 500 || r.status === 429) {
      failures++
      backoffUntil = Date.now() + Math.min(30 * 60_000, 30_000 * 2 ** failures)
    } else failures = 0
    return r
  } catch {
    failures++
    backoffUntil = Date.now() + Math.min(30 * 60_000, 30_000 * 2 ** failures)
    return null
  }
}

// ---------------------------------------------------------------------------------------------
// Outbox (local changes waiting to be sent) and cursor
// ---------------------------------------------------------------------------------------------
const OUTBOX = 'ss:outbox'
const CURSOR = 'ss:cursor'
const SEEDED = 'ss:seeded'

function readOutbox(): Record<string, Change> {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX) || '{}')
  } catch {
    return {}
  }
}
function writeOutbox(o: Record<string, Change>) {
  try {
    localStorage.setItem(OUTBOX, JSON.stringify(o))
  } catch {
    /* ignore */
  }
}
function settingsForSync(s: Settings) {
  // API keys stay on the device
  const { esvKey: _e, apiBibleKey: _a, apiBibleIds: _i, ...rest } = s
  void _e
  void _a
  void _i
  return rest
}

function track(c: Change) {
  const o = readOutbox()
  o[`${c.coll}:${c.id}`] = c
  writeOutbox(o)
  schedulePush()
}

// ---------------------------------------------------------------------------------------------
// Push / pull
// ---------------------------------------------------------------------------------------------
let pushTimer: ReturnType<typeof setTimeout> | null = null
function schedulePush(delay = 5000) {
  if (info.status !== 'signed-in') return
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => void syncNow(), delay)
}

let applying = false

async function applyRemote(items: Change[]) {
  const pending = readOutbox()
  const patch: Partial<State> = {}
  const s = getState()
  for (const it of items) {
    if (pending[`${it.coll}:${it.id}`]) continue // our newer local edit wins until it is sent
    if (it.coll === 'settings') {
      if (!it.deleted && it.data) patch.settings = { ...(patch.settings ?? s.settings), ...(it.data as Partial<Settings>) }
      continue
    }
    const coll = it.coll as Exclude<Coll, 'settings'>
    const list = ((patch[coll] as { id: string }[] | undefined) ?? (s[coll] as { id: string }[])).filter((x) => x.id !== it.id)
    if (it.deleted) await db.remove(coll, it.id)
    else {
      list.push(it.data as { id: string })
      await db.put(coll, it.data as { id: string })
    }
    ;(patch as Record<string, unknown>)[coll] = list
  }
  if (Object.keys(patch).length) {
    applying = true
    setState(patch)
    applying = false
  }
}

let running: Promise<void> | null = null

export function syncNow(): Promise<void> {
  if (running) return running
  running = (async () => {
    if (info.status !== 'signed-in') return
    set({ busy: true })
    try {
      // 1. send local changes
      const out = Object.values(readOutbox())
      for (let i = 0; i < out.length; i += 200) {
        const chunk = out.slice(i, i + 200)
        const r = await api('sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: chunk }) })
        if (!r || !r.ok) return handleFail(r)
        const o = readOutbox()
        for (const c of chunk) if (o[`${c.coll}:${c.id}`]?.updated === c.updated) delete o[`${c.coll}:${c.id}`]
        writeOutbox(o)
      }
      // 2. fetch other devices' changes
      let cursor = parseInt(localStorage.getItem(CURSOR) || '0', 10) || 0
      for (let page = 0; page < 20; page++) {
        const r = await api(`sync?since=${cursor}`)
        if (!r || !r.ok) return handleFail(r)
        const d = (await r.json()) as { cursor: number; more: boolean; items: Change[] }
        await applyRemote(d.items)
        cursor = d.cursor
        localStorage.setItem(CURSOR, String(cursor))
        if (!d.more) break
      }
      set({ last: Date.now(), message: undefined })
    } finally {
      set({ busy: false })
      running = null
    }
  })()
  return running
}

function handleFail(r: Response | null) {
  if (!r) set({ message: 'Sync paused for a moment (limit reached or offline). It will retry automatically.' })
  else if (r.type === 'opaqueredirect' || r.status === 401) set({ status: 'signed-out', message: 'Your sign-in expired — please sign in again.' })
  else if (r.status === 403) set({ status: 'not-invited' })
  else set({ message: `Sync error (${r.status}). It will retry later.` })
}

// ---------------------------------------------------------------------------------------------
// Sign-in state
// ---------------------------------------------------------------------------------------------
export async function checkSignIn(): Promise<void> {
  const r = await api('me')
  if (!r) return set({ status: 'error', message: 'Could not reach the sync service.' })
  if (r.status === 404 || (r.headers.get('content-type') || '').includes('text/html')) return set({ status: 'unavailable' })
  if (r.type === 'opaqueredirect' || r.status === 401) return set({ status: 'signed-out' })
  if (r.status === 503) return set({ status: 'unavailable' })
  if (!r.ok) return set({ status: 'error', message: `Sync error (${r.status})` })
  const me = (await r.json()) as { email: string; registered: boolean; role: string | null; invite?: string }
  if (!me.registered) return set({ status: 'not-invited', email: me.email })
  set({ status: 'signed-in', email: me.email, role: me.role ?? undefined, invite: me.invite })
  void refreshLicensed()
  // first sync on this device: send everything already saved here
  if (!localStorage.getItem(SEEDED)) {
    const s = getState()
    for (const coll of ['labels', 'highlights', 'notes', 'journal', 'bookmarks'] as const)
      for (const it of s[coll] as { id: string; updated?: number; created?: number }[])
        track({ coll, id: it.id, data: it, updated: it.updated ?? it.created ?? Date.now() })
    localStorage.setItem(SEEDED, '1')
  }
  await syncNow()
}

export function pendingInvite(): string | null {
  try {
    return localStorage.getItem('ss:invite')
  } catch {
    return null
  }
}

export function signIn() {
  const invite = pendingInvite()
  window.location.href = `${import.meta.env.BASE_URL}api/login${invite ? `?invite=${encodeURIComponent(invite)}` : ''}`
}

export function signOut() {
  for (const k of [CURSOR, SEEDED, OUTBOX]) localStorage.removeItem(k)
  setSharedVersions([])
  window.location.href = `${import.meta.env.BASE_URL}cdn-cgi/access/logout`
}

export async function newInvite(): Promise<void> {
  const r = await api('invite', { method: 'POST' })
  if (r?.ok) set({ invite: ((await r.json()) as { invite: string }).invite })
}

// ---------------------------------------------------------------------------------------------
// Licensed translations shared by the owner
// ---------------------------------------------------------------------------------------------
export interface LicensedInfo {
  versions: string[]
  hasKey?: boolean
  hasEsvKey?: boolean
  ids?: Record<string, string>
  usedThisMonth?: number
  monthLimit?: number
  bibles?: { id: string; abbreviation: string; name: string }[]
  error?: string
}

async function licApi(path: string, init: RequestInit = {}): Promise<LicensedInfo & { ok?: boolean }> {
  const r = await fetch(`${import.meta.env.BASE_URL}api/${path}`, { ...init, redirect: 'manual', credentials: 'same-origin', cache: 'no-store' })
  if (r.type === 'opaqueredirect' || r.status === 401) throw new Error('Please sign in again.')
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || `Error ${r.status}`)
  return d
}

export async function refreshLicensed(withBibles = false): Promise<LicensedInfo | null> {
  try {
    const d = await licApi(`licensed${withBibles ? '?bibles=1' : ''}`)
    setSharedVersions(d.versions ?? [])
    return d
  } catch {
    return null
  }
}

export async function saveLicensedKey(key: string): Promise<LicensedInfo> {
  const d = await licApi('licensed/key', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key }) })
  await refreshLicensed()
  return d
}

export async function saveEsvKey(key: string): Promise<void> {
  await licApi('licensed/esv', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key }) })
  await refreshLicensed()
}

export async function saveLicensedIds(ids: Record<string, string>): Promise<void> {
  await licApi('licensed/ids', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids }) })
  await refreshLicensed()
}

// ---------------------------------------------------------------------------------------------
// Start-up
// ---------------------------------------------------------------------------------------------
let started = false

export function startSync() {
  if (started) return
  started = true
  // invite links: /?invite=CODE ; return from sign-in: /?sync=signed-in | not-invited | full
  const url = new URL(window.location.href)
  const invite = url.searchParams.get('invite')
  const result = url.searchParams.get('sync')
  if (invite) localStorage.setItem('ss:invite', invite)
  if (invite || result) {
    url.searchParams.delete('invite')
    url.searchParams.delete('sync')
    history.replaceState(null, '', url.pathname + (url.search || '') + url.hash)
  }
  if (result === 'not-invited') set({ message: 'That email has not been invited yet. Open the invitation link you were sent, then sign in.' })
  if (result === 'full') set({ message: 'This Scripture Study has reached its member limit.' })
  if (result === 'signed-in') localStorage.removeItem('ss:invite')
  if (invite || result) setState({ tab: 'settings', panel: true })

  // local edits -> outbox
  setChangeListener((coll, id, item) => {
    if (applying) return
    const now = Date.now()
    track({ coll, id, data: item, updated: now, deleted: !item })
  })
  let settingsTimer: ReturnType<typeof setTimeout> | null = null
  let lastSettings = JSON.stringify(settingsForSync(getState().settings))
  // settings changes are folded into one change after a quiet period
  import('./store').then(({ subscribe }) =>
    subscribe(() => {
      if (applying) return
      const cur = JSON.stringify(settingsForSync(getState().settings))
      if (cur === lastSettings) return
      lastSettings = cur
      if (settingsTimer) clearTimeout(settingsTimer)
      settingsTimer = setTimeout(() => track({ coll: 'settings', id: 'settings', data: JSON.parse(cur), updated: Date.now() }), 3000)
    }),
  )

  void checkSignIn()
  let lastPull = Date.now()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastPull > 2 * 60_000 && info.status === 'signed-in') {
      lastPull = Date.now()
      void syncNow()
    }
    if (document.visibilityState === 'hidden' && Object.keys(readOutbox()).length && info.status === 'signed-in') void syncNow()
  })
  setInterval(() => {
    if (document.visibilityState === 'visible' && info.status === 'signed-in') {
      lastPull = Date.now()
      void syncNow()
    }
  }, 15 * 60_000)
}
