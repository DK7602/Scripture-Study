/**
 * Scripture Study sync API — Cloudflare Pages Function (only /api/* runs here; see public/_routes.json).
 *
 * Sign-in is handled by Cloudflare Access (one-time code sent by email) in front of /api.
 * This function verifies the Access token, then only lets in people who joined with the
 * owner's invite link. Guard rails keep usage (and cost) small:
 *   - per-person and whole-site request limits, request and storage size caps,
 *   - static pages never invoke this function, so reading the Bible costs nothing.
 *
 * Routes:
 *   GET  /api/me                    who am I (+ the invite link, for the owner)
 *   GET  /api/login?invite=CODE     after Access sign-in: join with an invite, then back to the app
 *   GET  /api/sync?since=N          changes since cursor N
 *   POST /api/sync                  { items: [{ coll, id, data|null, updated, deleted }] }
 *   POST /api/invite                owner only: make a new invite link (old one stops working)
 *   GET  /api/licensed              which licensed Bibles (CSB, NKJV…) the group can read
 *   GET  /api/licensed/chapter?v=CSB&book=JHN&ch=15   a chapter, via the owner's API.Bible key
 *   POST /api/licensed/key          owner: save/replace the API.Bible key (returns the Bibles it unlocks)
 *   POST /api/licensed/ids          owner: { ids: { CSB: "<bible id>", … } }
 *   POST /api/licensed/public       owner: { on } share the licensed translations with everyone (default) or members only
 *
 * And, outside the sign-in (worker/index.ts sends /feed/licensed* here), unless the owner turned it off:
 *   GET  /feed/licensed             which licensed Bibles anyone opening the app can read
 *   GET  /feed/licensed/chapter?v=CSB&book=JHN&ch=15   a chapter, with the same caps (per connection instead of per person)
 */

interface D1Result<T> {
  results: T[]
}
interface D1Stmt {
  bind(...v: unknown[]): D1Stmt
  first<T>(): Promise<T | null>
  all<T>(): Promise<D1Result<T>>
  run(): Promise<unknown>
}
interface D1 {
  prepare(sql: string): D1Stmt
  batch(stmts: D1Stmt[]): Promise<unknown>
}
interface Env {
  DB: D1
  TEAM_DOMAIN: string // e.g. scripture-study.cloudflareaccess.com
  POLICY_AUD: string // Access application audience tag
  OWNER_EMAIL?: string // optional: this email may sign in without an invite and is the owner
  MAX_USERS?: string // default 25
}
interface Ctx {
  request: Request
  env: Env
}

const COLLS = new Set(['labels', 'highlights', 'notes', 'journal', 'bookmarks', 'prayers', 'sermons', 'settings'])
const LIMITS = {
  perMinute: 30, // requests per person per minute
  siteDay: 20000, // requests per day for the whole site (well inside Cloudflare's free tier)
  bodyBytes: 512 * 1024,
  itemBytes: 64 * 1024,
  itemsPerPush: 500,
  itemsPerUser: 50000,
  pageSize: 1000,
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } })

// ---------------------------------------------------------------------------------------------
// Cloudflare Access token verification (RS256 against the team's public keys)
// ---------------------------------------------------------------------------------------------
let jwks: { keys: (JsonWebKey & { kid: string })[]; at: number } | null = null

function b64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))
  return Uint8Array.from(b, (c) => c.charCodeAt(0))
}

async function verifyAccess(req: Request, env: Env): Promise<string | null> {
  const token = req.headers.get('cf-access-jwt-assertion')
  if (!token || !env.TEAM_DOMAIN || !env.POLICY_AUD) return null
  const [h, p, sig] = token.split('.')
  if (!h || !p || !sig) return null
  const header = JSON.parse(new TextDecoder().decode(b64url(h)))
  const payload = JSON.parse(new TextDecoder().decode(b64url(p)))
  if (!jwks || Date.now() - jwks.at > 3600_000 || !jwks.keys.some((k) => k.kid === header.kid)) {
    const r = await fetch(`https://${env.TEAM_DOMAIN}/cdn-cgi/access/certs`)
    jwks = { keys: ((await r.json()) as { keys: (JsonWebKey & { kid: string })[] }).keys, at: Date.now() }
  }
  const jwk = jwks.keys.find((k) => k.kid === header.kid)
  if (!jwk) return null
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(sig), new TextEncoder().encode(`${h}.${p}`))
  if (!ok) return null
  const aud: string[] = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
  if (!aud.includes(env.POLICY_AUD)) return null
  if (payload.iss !== `https://${env.TEAM_DOMAIN}`) return null
  if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return null
  return typeof payload.email === 'string' ? payload.email.toLowerCase() : null
}

// ---------------------------------------------------------------------------------------------
// Rate limits
// ---------------------------------------------------------------------------------------------
async function bump(db: D1, key: string, ttlMs: number): Promise<number> {
  const now = Date.now()
  const row = await db
    .prepare(
      `INSERT INTO hits (k, n, exp) VALUES (?1, 1, ?2)
       ON CONFLICT(k) DO UPDATE SET n = CASE WHEN exp < ?3 THEN 1 ELSE n + 1 END,
                                    exp = CASE WHEN exp < ?3 THEN ?2 ELSE exp END
       RETURNING n`,
    )
    .bind(key, now + ttlMs, now)
    .first<{ n: number }>()
  return row?.n ?? 1
}

async function limited(db: D1, who: string): Promise<boolean> {
  const minute = Math.floor(Date.now() / 60000)
  const day = Math.floor(Date.now() / 86400000)
  const [site, perMin] = await Promise.all([bump(db, `site:${day}`, 86400000), bump(db, `m:${who}:${minute}`, 120000)])
  if (Math.random() < 0.02) await db.prepare('DELETE FROM hits WHERE exp < ?1').bind(Date.now()).run()
  return site > LIMITS.siteDay || perMin > LIMITS.perMinute
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------
async function inviteCode(db: D1): Promise<string> {
  const row = await db.prepare("SELECT v FROM config WHERE k = 'invite'").first<{ v: string }>()
  if (row) return row.v
  return rotateInvite(db)
}

async function rotateInvite(db: D1): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(18))
  const code = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  await db.prepare("INSERT INTO config (k, v) VALUES ('invite', ?1) ON CONFLICT(k) DO UPDATE SET v = ?1").bind(code).run()
  return code
}

function sameCode(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

async function user(db: D1, email: string) {
  return db.prepare('SELECT email, role FROM users WHERE email = ?1').bind(email).first<{ email: string; role: string }>()
}

// ---------------------------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------------------------
export const onRequest = async ({ request, env }: Ctx): Promise<Response> => {
  const url = new URL(request.url)
  const route = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '')
  if (!env.DB || !env.TEAM_DOMAIN || !env.POLICY_AUD) return json({ error: 'Sync is not configured on this site yet.' }, 503)

  const email = await verifyAccess(request, env).catch(() => null)
  if (!email) return json({ error: 'Not signed in.' }, 401)
  if (await limited(env.DB, email)) return json({ error: 'Too many requests — please wait a minute.' }, 429, { 'retry-after': '60' })

  const me = await user(env.DB, email)
  const origin = url.origin

  if (route === 'me') {
    const body: Record<string, unknown> = { email, registered: !!me, role: me?.role ?? null }
    if (me?.role === 'owner') body.invite = `${origin}/?invite=${await inviteCode(env.DB)}`
    return json(body)
  }

  if (route === 'login') {
    if (!me) {
      const count = (await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>())?.n ?? 0
      const max = parseInt(env.MAX_USERS || '25', 10)
      const isOwner = !!env.OWNER_EMAIL && env.OWNER_EMAIL.toLowerCase() === email
      const firstUser = count === 0 && !env.OWNER_EMAIL
      const code = url.searchParams.get('invite') || ''
      const invited = !!code && sameCode(code, await inviteCode(env.DB))
      if (!(isOwner || firstUser || invited)) return Response.redirect(`${origin}/?sync=not-invited`, 302)
      if (count >= max && !isOwner) return Response.redirect(`${origin}/?sync=full`, 302)
      await env.DB.prepare('INSERT INTO users (email, role, created) VALUES (?1, ?2, ?3)')
        .bind(email, isOwner || firstUser ? 'owner' : 'member', Date.now())
        .run()
    }
    return Response.redirect(`${origin}/?sync=signed-in`, 302)
  }

  if (!me) return json({ error: 'You need an invitation link to sync.' }, 403)

  if (route === 'invite' && request.method === 'POST') {
    if (me.role !== 'owner') return json({ error: 'Only the owner can make invite links.' }, 403)
    return json({ invite: `${origin}/?invite=${await rotateInvite(env.DB)}` })
  }

  if (route.startsWith('licensed')) return licensed(route, request, env, me.role === 'owner', email)

  if (route === 'sync' && request.method === 'GET') {
    const since = parseInt(url.searchParams.get('since') || '0', 10) || 0
    const rows = await env.DB.prepare(
      'SELECT coll, id, data, updated, deleted, stamp FROM items WHERE email = ?1 AND stamp > ?2 ORDER BY stamp LIMIT ?3',
    )
      .bind(email, since, LIMITS.pageSize)
      .all<{ coll: string; id: string; data: string | null; updated: number; deleted: number; stamp: number }>()
    const items = rows.results
    const cursor = items.length ? items[items.length - 1].stamp : since
    return json({
      cursor,
      more: items.length === LIMITS.pageSize,
      items: items.map((r) => ({ coll: r.coll, id: r.id, data: r.data ? JSON.parse(r.data) : null, updated: r.updated, deleted: !!r.deleted })),
    })
  }

  if (route === 'sync' && request.method === 'POST') {
    const len = parseInt(request.headers.get('content-length') || '0', 10)
    if (len > LIMITS.bodyBytes) return json({ error: 'Too much at once.' }, 413)
    const text = await request.text()
    if (text.length > LIMITS.bodyBytes) return json({ error: 'Too much at once.' }, 413)
    let body: { items?: { coll: string; id: string; data: unknown; updated: number; deleted?: boolean }[] }
    try {
      body = JSON.parse(text)
    } catch {
      return json({ error: 'Bad request.' }, 400)
    }
    const items = (body.items ?? []).slice(0, LIMITS.itemsPerPush)
    const total = (await env.DB.prepare('SELECT COUNT(*) AS n FROM items WHERE email = ?1').bind(email).first<{ n: number }>())?.n ?? 0
    if (total + items.length > LIMITS.itemsPerUser) return json({ error: 'Storage limit reached.' }, 507)
    const now = Date.now()
    const stmts: D1Stmt[] = []
    for (const it of items) {
      if (!COLLS.has(it.coll) || typeof it.id !== 'string' || it.id.length > 80 || typeof it.updated !== 'number') continue
      const data = it.deleted ? null : JSON.stringify(it.data)
      if (data && data.length > LIMITS.itemBytes) continue
      stmts.push(
        env.DB.prepare(
          `INSERT INTO items (email, coll, id, data, updated, deleted, stamp) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
           ON CONFLICT(email, coll, id) DO UPDATE SET data = ?4, updated = ?5, deleted = ?6, stamp = ?7
           WHERE excluded.updated >= items.updated`,
        ).bind(email, it.coll, it.id, data, Math.floor(it.updated), it.deleted ? 1 : 0, now),
      )
    }
    if (stmts.length) await env.DB.batch(stmts)
    return json({ ok: true, saved: stmts.length })
  }

  return json({ error: 'Not found.' }, 404)
}

// ---------------------------------------------------------------------------------------------
// Licensed translations through the owner's API.Bible key
// ---------------------------------------------------------------------------------------------
const LIC = {
  cacheDays: 25, // API.Bible: cached text must be refreshed at least every 30 days
  monthLive: 4500, // live API.Bible calls per month for the whole group (free plan: 5,000)
  dayLivePerUser: 120, // live calls per person per day (cached chapters don't count)
}
const LIC_VERSIONS = ['NKJV', 'NASB', 'CSB', 'NIV']
const ABIBLE = 'https://rest.api.bible/v1'

async function cfg(db: D1, k: string): Promise<string | null> {
  return (await db.prepare('SELECT v FROM config WHERE k = ?1').bind(k).first<{ v: string }>())?.v ?? null
}
async function setCfg(db: D1, k: string, v: string) {
  await db.prepare('INSERT INTO config (k, v) VALUES (?1, ?2) ON CONFLICT(k) DO UPDATE SET v = ?2').bind(k, v).run()
}

/** Forget cached chapters only for versions whose API.Bible edition changed. */
async function clearChanged(db: D1, before: Record<string, string>, after: Record<string, string>) {
  for (const v of LIC_VERSIONS) if ((before[v] || '') !== (after[v] || '')) await db.prepare('DELETE FROM lic_cache WHERE v = ?1').bind(v).run()
}

async function listBibles(key: string) {
  const r = await fetch(`${ABIBLE}/bibles?language=eng`, { headers: { 'api-key': key } })
  if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'That API.Bible key was not accepted.' : `API.Bible error ${r.status}`)
  const d = (await r.json()) as { data?: { id: string; abbreviation: string; abbreviationLocal?: string; name: string }[] }
  return (d.data ?? []).map((b) => ({ id: b.id, abbreviation: b.abbreviationLocal || b.abbreviation, name: b.name }))
}

async function licensed(route: string, request: Request, env: Env, owner: boolean, email: string): Promise<Response> {
  const db = env.DB
  const ids: Record<string, string> = JSON.parse((await cfg(db, 'apibible_ids')) || '{}')
  const key = await cfg(db, 'apibible_key')

  if (route === 'licensed' && request.method === 'GET') {
    const esvKey = await cfg(db, 'esv_key')
    const body: Record<string, unknown> = {
      versions: [...(key ? Object.keys(ids).filter((v) => ids[v]) : []), ...(esvKey ? ['ESV'] : [])],
      public: (await cfg(db, 'lic_public')) !== '0',
    }
    if (owner) {
      body.hasKey = !!key
      body.hasEsvKey = !!esvKey
      body.ids = ids
      const month = new Date().toISOString().slice(0, 7)
      body.usedThisMonth = Number((await cfg(db, `lic_month_${month}`)) || 0)
      body.monthLimit = LIC.monthLive
      if (key && new URL(request.url).searchParams.get('bibles')) {
        try {
          body.bibles = await listBibles(key)
        } catch (e) {
          body.error = (e as Error).message
        }
      }
    }
    return json(body)
  }

  if (route === 'licensed/esv' && request.method === 'POST') {
    if (!owner) return json({ error: 'Only the owner can set the ESV key.' }, 403)
    const { key: esv } = (await request.json().catch(() => ({}))) as { key?: string }
    if (!esv || esv.length > 200) return json({ error: 'Paste your ESV API key.' }, 400)
    const r = await fetch('https://api.esv.org/v3/passage/text/?q=John+3:16&include-footnotes=false', { headers: { Authorization: `Token ${esv.trim()}` } })
    if (!r.ok) return json({ error: r.status === 401 || r.status === 403 ? 'That ESV key was not accepted.' : `ESV API error ${r.status}` }, 400)
    await setCfg(db, 'esv_key', esv.trim())
    return json({ ok: true })
  }

  if (route === 'licensed/chapter' && request.method === 'GET' && new URL(request.url).searchParams.get('v')?.toUpperCase() === 'ESV') {
    return esvChapter(request, db, email)
  }

  if (route === 'licensed/key' && request.method === 'POST') {
    if (!owner) return json({ error: 'Only the owner can set the API.Bible key.' }, 403)
    const { key: newKey } = (await request.json().catch(() => ({}))) as { key?: string }
    if (!newKey || newKey.length > 200) return json({ error: 'Paste your API.Bible key.' }, 400)
    try {
      const bibles = await listBibles(newKey.trim())
      await setCfg(db, 'apibible_key', newKey.trim())
      // pick the obvious matches automatically
      const auto: Record<string, string> = { ...ids }
      for (const v of LIC_VERSIONS) if (!auto[v]) auto[v] = bibles.find((b) => b.abbreviation.toUpperCase() === v)?.id ?? ''
      await setCfg(db, 'apibible_ids', JSON.stringify(auto))
      await clearChanged(db, ids, auto)
      return json({ ok: true, bibles, ids: auto })
    } catch (e) {
      return json({ error: (e as Error).message }, 400)
    }
  }

  if (route === 'licensed/public' && request.method === 'POST') {
    if (!owner) return json({ error: 'Only the owner can change who may read them.' }, 403)
    const { on } = (await request.json().catch(() => ({}))) as { on?: boolean }
    await setCfg(db, 'lic_public', on === false ? '0' : '1')
    return json({ ok: true, public: on !== false })
  }

  if (route === 'licensed/ids' && request.method === 'POST') {
    if (!owner) return json({ error: 'Only the owner can choose versions.' }, 403)
    const { ids: next } = (await request.json().catch(() => ({}))) as { ids?: Record<string, string> }
    const clean: Record<string, string> = {}
    for (const v of LIC_VERSIONS) if (typeof next?.[v] === 'string' && next[v].length < 80) clean[v] = next[v]
    await setCfg(db, 'apibible_ids', JSON.stringify(clean))
    await clearChanged(db, ids, clean)
    return json({ ok: true, ids: clean })
  }

  if (route === 'licensed/chapter' && request.method === 'GET') {
    const u = new URL(request.url)
    const v = (u.searchParams.get('v') || '').toUpperCase()
    const book = (u.searchParams.get('book') || '').toUpperCase()
    const ch = parseInt(u.searchParams.get('ch') || '', 10)
    if (!key || !ids[v]) return json({ error: 'This translation is not shared with the group.' }, 404)
    if (!/^[1-3A-Z]{3}$/.test(book) || !(ch >= 1 && ch <= 150)) return json({ error: 'Bad reference.' }, 400)
    const ref = `${book}.${ch}`
    const cached = await db
      .prepare('SELECT content, copyright, fums, fetched FROM lic_cache WHERE v = ?1 AND ref = ?2')
      .bind(v, ref)
      .first<{ content: string; copyright: string | null; fums: string | null; fetched: number }>()
    if (cached && Date.now() - cached.fetched < LIC.cacheDays * 86400000) {
      return json({ content: cached.content, copyright: cached.copyright, fums: cached.fums, cached: true })
    }
    // live call: protect the group's monthly allowance
    const month = new Date().toISOString().slice(0, 7)
    const used = Number((await cfg(db, `lic_month_${month}`)) || 0)
    if (used >= LIC.monthLive) return json({ error: 'The group has used this month’s licensed-translation allowance. The KJV, BSB, WEB and ASV are always available.' }, 429)
    const today = await bump(db, `lic:${email}:${Math.floor(Date.now() / 86400000)}`, 86400000)
    if (today > LIC.dayLivePerUser) return json({ error: 'Daily limit for licensed translations reached — try again tomorrow.' }, 429)
    const r = await fetch(
      `${ABIBLE}/bibles/${encodeURIComponent(ids[v])}/chapters/${ref}?content-type=text&include-notes=false&include-titles=false&include-chapter-numbers=false&include-verse-numbers=true&include-verse-spans=false`,
      { headers: { 'api-key': key } },
    )
    await setCfg(db, `lic_month_${month}`, String(used + 1))
    if (!r.ok) return json({ error: `API.Bible error ${r.status}` }, r.status === 404 ? 404 : 502)
    const d = (await r.json()) as { data?: { content?: string; copyright?: string }; meta?: { fumsToken?: string; fumsId?: string } }
    const content = d.data?.content ?? ''
    const fums = d.meta?.fumsToken ?? (d.meta?.fumsId ? `v2:${d.meta.fumsId}` : null)
    await db
      .prepare(
        `INSERT INTO lic_cache (v, ref, content, copyright, fums, fetched) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(v, ref) DO UPDATE SET content = ?3, copyright = ?4, fums = ?5, fetched = ?6`,
      )
      .bind(v, ref, content, d.data?.copyright ?? null, fums, Date.now())
      .run()
    return json({ content, copyright: d.data?.copyright ?? null, fums, cached: false })
  }

  return json({ error: 'Not found.' }, 404)
}

/**
 * The licensed translations for everyone who opens the app, without signing in (the owner can turn this off).
 * The key never leaves the server; the group's monthly allowance and the 25-day cache apply as for members, and
 * the daily per-person limit counts per connection (a hash of the address, kept a day).
 */
export async function publicLicensed(request: Request, env: Env): Promise<Response> {
  const route = new URL(request.url).pathname.replace(/^\/feed\//, '').replace(/\/$/, '')
  if (request.method !== 'GET' || (route !== 'licensed' && route !== 'licensed/chapter')) return json({ error: 'Not found.' }, 404)
  if (!env.DB) return json({ versions: [], public: false }, route === 'licensed' ? 200 : 404)
  if ((await cfg(env.DB, 'lic_public')) === '0') {
    if (route !== 'licensed') return json({ error: 'Shared with signed-in members only.', public: false }, 403)
    // say which ones members can read, so the app can tell others to sign in for them
    const listed = (await (await licensed('licensed', request, env, false, 'public')).json()) as { versions?: string[] }
    return json({ versions: [], public: false, members: listed.versions ?? [] })
  }
  const ip = request.headers.get('cf-connecting-ip') || 'unknown'
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`scripture-study:${ip}`)))
  const who = 'ip:' + [...digest.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('')
  if (await limited(env.DB, who)) return json({ error: 'Too many requests — please wait a minute.' }, 429, { 'retry-after': '60' })
  return licensed(route, request, env, false, who)
}

// ---------------------------------------------------------------------------------------------
// ESV (Crossway API): free for non-commercial use; 5,000 queries a day; an app may store at most
// 500 verses, so only a small rolling in-memory set of recent chapters is kept (no database copy).
// ---------------------------------------------------------------------------------------------
const ESV_NAMES: Record<string, string> = {
  GEN: 'Genesis', EXO: 'Exodus', LEV: 'Leviticus', NUM: 'Numbers', DEU: 'Deuteronomy', JOS: 'Joshua', JDG: 'Judges', RUT: 'Ruth',
  '1SA': '1 Samuel', '2SA': '2 Samuel', '1KI': '1 Kings', '2KI': '2 Kings', '1CH': '1 Chronicles', '2CH': '2 Chronicles', EZR: 'Ezra',
  NEH: 'Nehemiah', EST: 'Esther', JOB: 'Job', PSA: 'Psalm', PRO: 'Proverbs', ECC: 'Ecclesiastes', SNG: 'Song of Solomon', ISA: 'Isaiah',
  JER: 'Jeremiah', LAM: 'Lamentations', EZK: 'Ezekiel', DAN: 'Daniel', HOS: 'Hosea', JOL: 'Joel', AMO: 'Amos', OBA: 'Obadiah', JON: 'Jonah',
  MIC: 'Micah', NAM: 'Nahum', HAB: 'Habakkuk', ZEP: 'Zephaniah', HAG: 'Haggai', ZEC: 'Zechariah', MAL: 'Malachi', MAT: 'Matthew',
  MRK: 'Mark', LUK: 'Luke', JHN: 'John', ACT: 'Acts', ROM: 'Romans', '1CO': '1 Corinthians', '2CO': '2 Corinthians', GAL: 'Galatians',
  EPH: 'Ephesians', PHP: 'Philippians', COL: 'Colossians', '1TH': '1 Thessalonians', '2TH': '2 Thessalonians', '1TI': '1 Timothy',
  '2TI': '2 Timothy', TIT: 'Titus', PHM: 'Philemon', HEB: 'Hebrews', JAS: 'James', '1PE': '1 Peter', '2PE': '2 Peter', '1JN': '1 John',
  '2JN': '2 John', '3JN': '3 John', JUD: 'Jude', REV: 'Revelation',
}
const ESV_COPYRIGHT =
  'Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved.'
const esvMemo = new Map<string, { content: string; verses: number }>() // in-memory only, ≤ 450 verses
const ESV_LIMITS = { siteDay: 3000, userDay: 150 }

async function esvChapter(request: Request, db: D1, email: string): Promise<Response> {
  const u = new URL(request.url)
  const book = (u.searchParams.get('book') || '').toUpperCase()
  const ch = parseInt(u.searchParams.get('ch') || '', 10)
  const key = await cfg(db, 'esv_key')
  if (!key) return json({ error: 'The ESV is not shared with the group.' }, 404)
  if (!ESV_NAMES[book] || !(ch >= 1 && ch <= 150)) return json({ error: 'Bad reference.' }, 400)
  const ref = `${book}.${ch}`
  const hit = esvMemo.get(ref)
  if (hit) {
    esvMemo.delete(ref)
    esvMemo.set(ref, hit)
    return json({ content: hit.content, copyright: ESV_COPYRIGHT, cached: true })
  }
  const day = Math.floor(Date.now() / 86400000)
  if ((await bump(db, `esv:${day}`, 86400000)) > ESV_LIMITS.siteDay) return json({ error: 'The group has reached today’s ESV limit — try again tomorrow.' }, 429)
  if ((await bump(db, `esvu:${email}:${day}`, 86400000)) > ESV_LIMITS.userDay) return json({ error: 'Daily ESV limit reached — try again tomorrow.' }, 429)
  const q = encodeURIComponent(`${ESV_NAMES[book]} ${ch}`)
  const r = await fetch(
    `https://api.esv.org/v3/passage/text/?q=${q}&include-passage-references=false&include-verse-numbers=true&include-first-verse-numbers=true` +
      `&include-footnotes=false&include-headings=false&include-short-copyright=false&include-selahs=true&indent-paragraphs=0&indent-poetry=false` +
      `&indent-declares=0&indent-psalm-doxology=0`,
    { headers: { Authorization: `Token ${key}` } },
  )
  if (!r.ok) return json({ error: `ESV API error ${r.status}` }, 502)
  const d = (await r.json()) as { passages?: string[] }
  const content = (d.passages ?? [])[0] ?? ''
  const verses = (content.match(/\[\d+\]/g) ?? []).length
  esvMemo.set(ref, { content, verses })
  let total = 0
  for (const e of esvMemo.values()) total += e.verses
  for (const k of esvMemo.keys()) {
    if (total <= 450) break
    total -= esvMemo.get(k)!.verses
    esvMemo.delete(k)
  }
  return json({ content, copyright: ESV_COPYRIGHT, cached: false })
}
