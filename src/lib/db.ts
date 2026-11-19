/** Tiny IndexedDB key-value layer for the user's own data (falls back to localStorage). */
const DB_NAME = 'scripture-study'
const STORES = ['highlights', 'labels', 'notes', 'journal', 'bookmarks', 'prayers', 'sermons'] as const
export type StoreName = (typeof STORES)[number]

let dbp: Promise<IDBDatabase | null> | null = null

function open(): Promise<IDBDatabase | null> {
  if (dbp) return dbp
  dbp = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 2) // 2: prayer list and sermon notes
      req.onupgradeneeded = () => {
        for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s, { keyPath: 'id' })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbp
}

function lsKey(store: StoreName) {
  return `ss:${store}`
}

function lsRead<T>(store: StoreName): T[] {
  try {
    return JSON.parse(localStorage.getItem(lsKey(store)) || '[]')
  } catch {
    return []
  }
}

function lsWrite<T>(store: StoreName, items: T[]) {
  try {
    localStorage.setItem(lsKey(store), JSON.stringify(items))
  } catch {
    /* storage unavailable */
  }
}

export async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await open()
  if (!db) return lsRead<T>(store)
  return new Promise((resolve) => {
    const req = db.transaction(store).objectStore(store).getAll()
    req.onsuccess = () => resolve(req.result as T[])
    req.onerror = () => resolve([])
  })
}

export async function put<T extends { id: string }>(store: StoreName, item: T): Promise<void> {
  const db = await open()
  if (!db) {
    const items = lsRead<T>(store).filter((x) => x.id !== item.id)
    items.push(item)
    lsWrite(store, items)
    return
  }
  await new Promise<void>((resolve) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).put(item)
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
}

export async function remove(store: StoreName, id: string): Promise<void> {
  const db = await open()
  if (!db) {
    lsWrite(store, lsRead<{ id: string }>(store).filter((x) => x.id !== id))
    return
  }
  await new Promise<void>((resolve) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
}

export async function replaceAll<T extends { id: string }>(store: StoreName, items: T[]): Promise<void> {
  const db = await open()
  if (!db) {
    lsWrite(store, items)
    return
  }
  await new Promise<void>((resolve) => {
    const tx = db.transaction(store, 'readwrite')
    const os = tx.objectStore(store)
    os.clear()
    for (const it of items) os.put(it)
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
}

export const ALL_STORES = STORES

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}
