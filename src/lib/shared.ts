/**
 * Licensed translations shared by the owner (through the Worker and the owner's API.Bible key),
 * plus API.Bible's required Fair Use Management System (FUMS) view reporting.
 */
let shared: string[] = (() => {
  try {
    return JSON.parse(localStorage.getItem('ss:shared-versions') || '[]')
  } catch {
    return []
  }
})()
const listeners = new Set<() => void>()

/** Translations the owner keeps for signed-in members (when not shared with everyone). */
let membersOnly: string[] = []
export function membersOnlyVersions(): string[] {
  return membersOnly
}

export function sharedVersions(): string[] {
  return shared
}
export function onShared(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}
/**
 * The translations the owner shares with everyone who opens the app (no sign-in), unless the owner keeps them for
 * signed-in members; a member's own list (sync.ts) is left alone when they are members-only.
 */
export async function loadPublicShared() {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}feed/licensed`, { cache: 'no-store' })
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return
    const d = (await r.json()) as { versions?: string[]; public?: boolean; members?: string[] }
    membersOnly = d.public ? [] : d.members ?? []
    if (d.public && Array.isArray(d.versions)) setSharedVersions(d.versions)
    else listeners.forEach((l) => l())
  } catch {
    /* offline: keep what was known */
  }
}

export function setSharedVersions(v: string[]) {
  shared = v
  try {
    localStorage.setItem('ss:shared-versions', JSON.stringify(v))
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l())
}

// ---------------------------------------------------------------------------------------------
// FUMS: API.Bible asks web apps to report each display of copyrighted text
// ---------------------------------------------------------------------------------------------
type FumsFn = (cmd: string, arg: unknown) => void
declare global {
  interface Window {
    fums?: FumsFn
    fumsData?: unknown[]
    _BAPI?: { t: (id: string) => void }
  }
}
let fumsLoaded = false
let legacyLoaded: Promise<void> | null = null

function loadScript(src: string): Promise<void> {
  return new Promise((resolve) => {
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => resolve()
    document.head.appendChild(s)
  })
}

export function reportFums(token?: string | null) {
  if (!token) return
  try {
    if (token.startsWith('v2:')) {
      legacyLoaded ??= loadScript('https://cdn.scripture.api.bible/fums/fumsv2.min.js')
      void legacyLoaded.then(() => window._BAPI?.t(token.slice(3)))
      return
    }
    if (!fumsLoaded) {
      fumsLoaded = true
      window.fumsData = window.fumsData || []
      window.fums =
        window.fums ||
        function (...args: unknown[]) {
          window.fumsData!.push(args)
        }
      void loadScript('https://pkg.api.bible/fumsV3.min.js')
    }
    window.fums!('trackView', token)
  } catch {
    /* reporting must never break reading */
  }
}
