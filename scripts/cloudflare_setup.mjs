#!/usr/bin/env node
/**
 * One-time (and re-runnable) Cloudflare setup for Scripture Study sync, then deploy.
 *
 *   CLOUDFLARE_API_TOKEN=...  [CLOUDFLARE_ACCOUNT_ID=...]  [OWNER_EMAIL=you@example.com]  node scripts/cloudflare_setup.mjs
 *
 * Token permissions (Account): Workers Scripts Edit, D1 Edit, Access: Apps and Policies Edit,
 * Access: Organizations, Identity Providers, and Groups Edit, Account Settings Read.
 *
 * What it does — everything on Cloudflare's free plans:
 *   1. D1 database "scripture-study" + tables (cloudflare/schema.sql)
 *   2. finds the account's workers.dev subdomain (the site is scripture-study.<sub>.workers.dev)
 *   3. Zero Trust (Access) one-time-code email login in front of /api only
 *   4. writes wrangler.toml, builds the app and deploys the Worker (static assets + /api)
 *
 * Steps that already exist are left alone, so it is safe to run again (e.g. from CI).
 */
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const TOKEN = process.env.CLOUDFLARE_API_TOKEN
const PROJECT = process.env.CF_WORKER || 'scripture-study'
const DB_NAME = process.env.CF_DB || 'scripture-study'
const OWNER = (process.env.OWNER_EMAIL || '').trim().toLowerCase()
const DEPLOY = process.argv.includes('--no-deploy') ? false : true
if (!TOKEN) {
  console.error('Set CLOUDFLARE_API_TOKEN first.')
  process.exit(1)
}

async function cf(path, init = {}) {
  const r = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  })
  const d = await r.json().catch(() => ({}))
  if (!d.success) {
    const msg = (d.errors || []).map((e) => `${e.code}: ${e.message}`).join('; ') || r.status
    const err = new Error(`${init.method || 'GET'} ${path} -> ${msg}`)
    err.status = r.status
    err.codes = (d.errors || []).map((e) => e.code)
    throw err
  }
  return d.result
}

const step = (s) => console.log(`\n▸ ${s}`)

// 1. account
step('Account')
let account = process.env.CLOUDFLARE_ACCOUNT_ID
if (!account) {
  const accounts = await cf('/accounts')
  if (!accounts.length) throw new Error('The token cannot see any account (add Account Settings: Read).')
  account = accounts[0].id
  console.log(`  using ${accounts[0].name}`)
}
const A = `/accounts/${account}`

// 2. D1
step('D1 database')
let db = (await cf(`${A}/d1/database?name=${DB_NAME}`)).find((d) => d.name === DB_NAME)
if (!db) {
  db = await cf(`${A}/d1/database`, { method: 'POST', body: JSON.stringify({ name: DB_NAME }) })
  console.log('  created', db.uuid)
} else console.log('  exists', db.uuid)
const schema = readFileSync(new URL('../cloudflare/schema.sql', import.meta.url), 'utf8')
await cf(`${A}/d1/database/${db.uuid}/query`, { method: 'POST', body: JSON.stringify({ sql: schema }) })
console.log('  tables ready')

// 3. workers.dev hostname
step('workers.dev subdomain')
let sub
try {
  sub = (await cf(`${A}/workers/subdomain`)).subdomain
} catch (e) {
  if (e.status !== 404) throw e
}
if (!sub) {
  const wanted = `scripture-study-${account.slice(0, 6)}`
  sub = (await cf(`${A}/workers/subdomain`, { method: 'PUT', body: JSON.stringify({ subdomain: wanted }) })).subdomain
  console.log('  created', sub)
}
const host = `${PROJECT}.${sub}.workers.dev`
console.log('  site will be https://' + host)

// 4. Zero Trust organization (team domain) + email one-time-code login in front of /api
step('Zero Trust (Access)')
let org = null
let app = null
try {
  org = await cf(`${A}/access/organizations`)
} catch (e) {
  if (String(e.message).includes('not_enabled')) {
    console.warn('  Access is not enabled on this account yet — deploying without sign-in/sync.')
    console.warn('  Enable it once in the dashboard (Zero Trust → choose a team name → Free plan), then run this script again.')
  } else if (e.status !== 404) throw e
}
if (org && !org.auth_domain) org = null
if (org) {
  console.log('  team', org.auth_domain)
  const idps = await cf(`${A}/access/identity_providers`)
  let otp = idps.find((i) => i.type === 'onetimepin')
  if (!otp) {
    otp = await cf(`${A}/access/identity_providers`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Email one-time code', type: 'onetimepin', config: {} }),
    })
    console.log('  added email one-time code login')
  } else console.log('  email one-time code login present')

  const appDomain = `${host}/api`
  const apps = await cf(`${A}/access/apps`)
  app = apps.find((a) => a.domain === appDomain)
  if (!app) {
    app = await cf(`${A}/access/apps`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Scripture Study sync',
        domain: appDomain,
        type: 'self_hosted',
        session_duration: '720h', // stay signed in for 30 days per device
        allowed_idps: [otp.id],
        auto_redirect_to_identity: true,
        app_launcher_visible: false,
      }),
    })
    // Anyone may request a code; the app itself only lets in people who joined with the invite link.
    await cf(`${A}/access/apps/${app.id}/policies`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Email code', decision: 'allow', include: [{ everyone: {} }], precedence: 1 }),
    })
    console.log('  protected', appDomain)
  } else console.log('  already protecting', appDomain)
}

// 5. Worker config
step('wrangler.toml')
writeFileSync(
  new URL('../wrangler.toml', import.meta.url),
  `# Scripture Study — Cloudflare Worker with static assets (written by scripts/cloudflare_setup.mjs)
name = "${PROJECT}"
main = "worker/index.ts"
compatibility_date = "2025-06-01"
workers_dev = true

[assets]
directory = "./dist"
binding = "ASSETS"
not_found_handling = "single-page-application"
run_worker_first = ["/api/*"]

[[d1_databases]]
binding = "DB"
database_name = "${DB_NAME}"
database_id = "${db.uuid}"

[vars]
TEAM_DOMAIN = "${org ? org.auth_domain : ''}"
POLICY_AUD = "${app ? app.aud : ''}"
MAX_USERS = "25"
`,
)
console.log('  written')

const env = { ...process.env, CLOUDFLARE_ACCOUNT_ID: account, CI: '1', WRANGLER_SEND_METRICS: 'false' }
if (DEPLOY) {
  step('Build & deploy')
  execSync('npm run build', { stdio: 'inherit', env })
  execSync('npx --yes wrangler@4 deploy', { stdio: 'inherit', env })
}

if (OWNER) {
  step('Owner')
  await cf(`${A}/workers/scripts/${PROJECT}/secrets`, {
    method: 'PUT',
    body: JSON.stringify({ name: 'OWNER_EMAIL', text: OWNER, type: 'secret_text' }),
  })
  console.log('  owner email saved as a secret')
}

console.log(`\n✓ Scripture Study is at https://${host}`)
if (!org) console.log('  (Sign-in/sync will appear after Access is enabled and this script is run again.)')
console.log(`  Sign in there (Settings → Sync across devices). ${OWNER ? 'Your owner email' : 'The first person to sign in'} becomes the owner and sees the invite link to share.`)
