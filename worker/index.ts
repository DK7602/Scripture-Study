/**
 * Scripture Study — Cloudflare Worker entry.
 *
 * The app (dist/) is served as static assets: those requests never run this code and are free.
 * Only /api/* (the sync API) and /audio/* reach the Worker (see run_worker_first in wrangler.toml).
 * Audio goes through here because the static-asset server ignores Range requests, and Safari (iPhone,
 * iPad, Mac) will only play media from a server that answers them with 206 Partial Content.
 */
import { onRequest } from '../functions/api/[[route]]'
import { serveAudio } from './audio'

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
    if (url.pathname.startsWith('/audio/')) return serveAudio(request, env)
    return env.ASSETS.fetch(request)
  },
}
