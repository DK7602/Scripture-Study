/**
 * Bringing the data kept on the phone up to date.
 *
 * Data files are kept "cache first" (read once, then from the phone, offline too), so a file changed since a phone
 * first read it would stay old for good. Each build publishes the files' fingerprints (vite.config.ts: data/hashes.json
 * by group, data/hashes/<group>.json by file). At start, for each group whose fingerprint differs from the one last
 * seen, every file kept of it is checked, and one that differs is replaced (fetched again, so what was downloaded
 * for offline use stays). Then the app hears of it (`ss:data-refreshed`, with the files' paths) to show the new.
 */
import { dataUrl, forgetJSON } from './data'
import { forgetQuotes } from './otquotes'

const SEEN = 'ss:dataHashes'
const CACHE = 'scripture-data' // vite.config.ts, runtimeCaching

async function fingerprint(r: Response): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', await r.arrayBuffer()))
  return Array.from(d.slice(0, 6), (b) => b.toString(16).padStart(2, '0')).join('')
}

async function getFresh<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(dataUrl(path), { cache: 'no-cache' })
    return r.ok ? ((await r.json()) as T) : null
  } catch {
    return null // offline
  }
}

export async function refreshStaleData(): Promise<string[]> {
  if (!('caches' in window) || !crypto?.subtle) return []
  const now = await getFresh<Record<string, string>>('hashes.json')
  if (!now) return []
  let seen: Record<string, string> = {}
  try {
    seen = JSON.parse(localStorage.getItem(SEEN) || '{}')
  } catch {
    /* none yet */
  }
  const changed = Object.keys(now).filter((g) => seen[g] !== now[g])
  if (!changed.length) return []

  const cache = await caches.open(CACHE)
  const kept = new Map<string, Request>() // path under data/ -> the request it is kept under
  for (const req of await cache.keys()) {
    const m = new URL(req.url).pathname.match(/\/data\/(.+)$/)
    if (m) kept.set(decodeURIComponent(m[1]), req)
  }
  const replaced: string[] = []
  for (const g of changed) {
    const files = await getFresh<Record<string, string>>(`hashes/${g.replace(':', '_')}.json`)
    if (!files) return replaced // (try again next time)
    for (const [path, hash] of Object.entries(files)) {
      const req = kept.get(path)
      const res = req && (await cache.match(req))
      if (!req || !res || (await fingerprint(res)) === hash) continue
      await cache.delete(req)
      try {
        await fetch(req.url) // kept again, the new one
      } catch {
        /* offline: fetched when next read */
      }
      replaced.push(path)
    }
    seen[g] = now[g]
    try {
      localStorage.setItem(SEEN, JSON.stringify(seen))
    } catch {
      /* private mode: checked again next time */
    }
  }
  if (replaced.length) {
    forgetJSON(replaced)
    forgetQuotes()
    window.dispatchEvent(new CustomEvent('ss:data-refreshed', { detail: replaced }))
  }
  return replaced
}
