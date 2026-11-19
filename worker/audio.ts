/**
 * /audio/* through the Worker: the static-asset server ignores Range requests, and Safari (iPhone, iPad, Mac)
 * only plays media from a server that answers them with 206 Partial Content. The file is streamed, never
 * buffered, so long chapters cost almost no CPU time.
 */
interface AssetsEnv {
  ASSETS: { fetch(req: Request): Promise<Response> }
}

/** Passes on only bytes [start, end] of a stream, without buffering the whole file. */
function sliceStream(start: number, end: number): TransformStream<Uint8Array, Uint8Array> {
  let pos = 0
  return new TransformStream({
    transform(chunk, ctrl) {
      const a = Math.max(start - pos, 0)
      const b = Math.min(end + 1 - pos, chunk.length)
      if (b > a) ctrl.enqueue(chunk.subarray(a, b))
      pos += chunk.length
      if (pos > end) ctrl.terminate()
    },
  })
}

export async function serveAudio(request: Request, env: AssetsEnv): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 })
  const url = new URL(request.url)
  const res = await env.ASSETS.fetch(new Request(url.toString(), { method: 'GET' }))
  const type = res.headers.get('content-type') ?? ''
  // a missing file would come back as the app's index page: answer 404 instead
  if (!res.ok || type.startsWith('text/html')) return new Response('Not found', { status: 404 })
  const headers = new Headers(res.headers)
  headers.set('accept-ranges', 'bytes')
  headers.delete('content-length')
  headers.set('cache-control', 'public, max-age=604800')
  const m = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') ?? '')
  if (!m) return new Response(request.method === 'HEAD' ? null : res.body, { status: 200, headers })
  let size = Number(res.headers.get('content-length'))
  let whole: Uint8Array | null = null
  if (!size) {
    // the asset server streams without a length: read the file (chapters are 1-10 MB) to know its size
    whole = new Uint8Array(await res.arrayBuffer())
    size = whole.length
  }
  let start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]))
  let end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1
  if (!m[1] && !m[2]) {
    start = 0
    end = size - 1
  }
  if (start >= size || start > end) {
    if (!whole) res.body?.cancel()
    return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } })
  }
  headers.set('content-range', `bytes ${start}-${end}/${size}`)
  headers.set('content-length', String(end - start + 1))
  if (whole) return new Response(request.method === 'HEAD' ? null : whole.subarray(start, end + 1), { status: 206, headers })
  if (request.method === 'HEAD' || !res.body) {
    res.body?.cancel()
    return new Response(null, { status: 206, headers })
  }
  return new Response(res.body.pipeThrough(sliceStream(start, end)), { status: 206, headers })
}

