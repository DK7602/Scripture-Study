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

const COLLS = new Set(['labels', 'highlights', 'notes', 'journal', 'bookmarks', 'settings'])
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
