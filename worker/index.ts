/**
 * Scripture Study — Cloudflare Worker entry.
 *
 * The app (dist/) is served as static assets: those requests never run this code and are free.
 * Only /api/* reaches the Worker (see run_worker_first in wrangler.toml), where the sync API lives.
 */
import { onRequest } from '../functions/api/[[route]]'

interface Env {
  ASSETS: { fetch(req: Request): Promise<Response> }
  DB: unknown
  TEAM_DOMAIN: string
  POLICY_AUD: string
  OWNER_EMAIL?: string
  MAX_USERS?: string
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/')) {
      return onRequest({ request, env: env as never })
    }
    return env.ASSETS.fetch(request)
  },
}
