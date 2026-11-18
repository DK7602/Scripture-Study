#!/usr/bin/env node
/**
 * One-time (and re-runnable) Cloudflare setup for Scripture Study sync, then deploy.
 *
 *   CLOUDFLARE_API_TOKEN=...  [CLOUDFLARE_ACCOUNT_ID=...]  [OWNER_EMAIL=you@example.com]  node scripts/cloudflare_setup.mjs
 *
 * Token permissions (Account): Cloudflare Pages Edit, D1 Edit, Access: Apps and Policies Edit,
 * Access: Organizations, Identity Providers, and Groups Edit, Account Settings Read.
 *
 * What it does — everything on Cloudflare's free plans, nothing that bills by usage:
 *   1. D1 database "scripture-study" + tables (cloudflare/schema.sql)
 *   2. Pages project "scripture-study"
 *   3. Zero Trust (Access) one-time-code email login in front of /api only
 *   4. writes wrangler.toml, builds the app and deploys it with `wrangler pages deploy`
 *
 * Steps that already exist are left alone, so it is safe to run again (e.g. from CI).
 */
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const TOKEN = process.env.CLOUDFLARE_API_TOKEN
const PROJECT = process.env.CF_PROJECT || 'scripture-study'
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

// 3. Pages project
step('Pages project')
let project
try {
  project = await cf(`${A}/pages/projects/${PROJECT}`)
  console.log('  exists', project.subdomain)
} catch (e) {
  if (e.status !== 404) throw e
  project = await cf(`${A}/pages/projects`, { method: 'POST', body: JSON.stringify({ name: PROJECT, production_branch: 'main' }) })
  console.log('  created', project.subdomain)
}
const host = project.subdomain // e.g. scripture-study.pages.dev (or with a suffix if the name was taken)

// 4. Zero Trust organization (team domain)
step('Zero Trust (Access)')
let org
try {
  org = await cf(`${A}/access/organizations`)
} catch (e) {
  if (e.status !== 404) throw e
}
if (!org || !org.auth_domain) {
  const team = `${PROJECT}-${account.slice(0, 6)}`
  try {
    org = await cf(`${A}/access/organizations`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Scripture Study', auth_domain: `${team}.cloudflareaccess.com` }),
    })
    console.log('  created team', org.auth_domain)
  } catch (e) {
    console.error(`  Could not create a Zero Trust organization automatically (${e.message}).`)
    console.error('  In the Cloudflare dashboard open Zero Trust, choose a team name and the FREE plan, then run this again.')
    process.exit(2)
  }
} else console.log('  team', org.auth_domain)

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
let app = apps.find((a) => a.domain === appDomain)
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

// 5. config for the Pages Function
step('wrangler.toml')
writeFileSync(
  new URL('../wrangler.toml', import.meta.url),
  `# Generated by scripts/cloudflare_setup.mjs — Cloudflare Pages config for Scripture Study
name = "${PROJECT}"
pages_build_output_dir = "dist"
compatibility_date = "2025-06-01"

[[d1_databases]]
binding = "DB"
database_name = "${DB_NAME}"
database_id = "${db.uuid}"

[vars]
TEAM_DOMAIN = "${org.auth_domain}"
POLICY_AUD = "${app.aud}"
MAX_USERS = "25"
`,
)
console.log('  written')

if (OWNER) {
  step('Owner')
  await cf(`${A}/pages/projects/${PROJECT}`, {
    method: 'PATCH',
    body: JSON.stringify({ deployment_configs: { production: { env_vars: { OWNER_EMAIL: { type: 'secret_text', value: OWNER } } } } }),
  })
  console.log('  owner email saved as a secret')
}

if (DEPLOY) {
  step('Build & deploy')
  const env = { ...process.env, CLOUDFLARE_ACCOUNT_ID: account }
  execSync('npm run build', { stdio: 'inherit', env })
  execSync(`npx --yes wrangler@4 pages deploy dist --project-name ${PROJECT} --branch main --commit-dirty=true`, { stdio: 'inherit', env })
}

console.log(`\n✓ Scripture Study is at https://${host}`)
console.log(`  Sign in there (Settings → Sync across devices). ${OWNER ? 'Your owner email' : 'The first person to sign in'} becomes the owner and sees the invite link to share.`)
