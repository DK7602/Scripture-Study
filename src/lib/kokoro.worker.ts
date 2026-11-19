/// <reference lib="webworker" />
/**
 * Michael's voice made on this device, for translations whose publishers do not allow stored audio.
 * Kokoro (Apache-2.0) runs in this worker so the page never freezes. Nothing about the text leaves the device.
 *
 * Everything is served by this site (scripts/fetch_voice_model.py puts it in /voice-model/): the kokoro-js browser
 * build, the ONNX Runtime WebAssembly files and the 88 MB model (in parts). Some phones and networks cannot reach the
 * Hugging Face file servers, so the files are downloaded from here once and placed in the browser cache under their
 * Hugging Face addresses, which is where kokoro-js looks first. Without /voice-model/ (local development) the library,
 * runtime and model come from jsDelivr and Hugging Face directly.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
const CDN_LIB = 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js'
const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX'
const SITE = new URL(`${import.meta.env.BASE_URL}voice-model/`, self.location.origin).href

interface Manifest {
  hf: string
  files: Record<string, number>
  model: { path: string; size: number; parts: number }
  ort: string
  lib: string
}

let ready: Promise<any> | null = null

function progress(loaded: number, total: number) {
  postMessage({ type: 'progress', loaded, total })
}

/** Reads a response body, reporting bytes as they arrive. */
async function readAll(r: Response, onBytes: (n: number) => void): Promise<Uint8Array[]> {
  if (!r.ok || !r.body) throw new Error(`download failed (${r.status})`)
  const reader = r.body.getReader()
  const chunks: Uint8Array[] = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    onBytes(value.length)
  }
  return chunks
}

/** Copies the voice files from this site into the browser cache, unless they are there already. */
async function seedFromSite(): Promise<Manifest | null> {
  let man: Manifest
  try {
    const r = await fetch(SITE + 'manifest.json')
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return null
    man = await r.json()
  } catch {
    return null
  }
  const models = await caches.open('transformers-cache')
  const voices = await caches.open('kokoro-voices')
  const total = man.model.size + Object.values(man.files).reduce((a, b) => a + b, 0)
  let done = 0
  const bump = (n: number) => {
    done += n
    progress(done, total)
  }
  for (const [file, size] of Object.entries(man.files)) {
    const cache = file.startsWith('voices/') ? voices : models
    const key = man.hf + file
    if (await cache.match(key)) {
      bump(size)
      continue
    }
    const chunks = await readAll(await fetch(SITE + 'hf/' + file), bump)
    const blob = new Blob(chunks as BlobPart[])
    await cache.put(key, new Response(blob, { headers: { 'content-type': file.endsWith('.json') ? 'application/json' : 'application/octet-stream', 'content-length': String(blob.size) } }))
  }
  const key = man.hf + man.model.path
  if (await models.match(key)) bump(man.model.size)
  else {
    const chunks: Uint8Array[] = []
    for (let i = 0; i < man.model.parts; i++) {
      const url = `${SITE}hf/${man.model.path}.${String(i).padStart(3, '0')}`
      chunks.push(...(await readAll(await fetch(url), bump)))
    }
    const blob = new Blob(chunks as BlobPart[])
    if (blob.size !== man.model.size) throw new Error('the voice download was incomplete; please try again')
    await models.put(key, new Response(blob, { headers: { 'content-type': 'application/octet-stream', 'content-length': String(blob.size) } }))
  }
  return man
}

function load() {
  ready ??= (async () => {
    const man = await seedFromSite()
    const { KokoroTTS, env } = await import(/* @vite-ignore */ man ? SITE + man.lib : CDN_LIB)
    if (man) env.wasmPaths = SITE + man.ort
    const tts = await KokoroTTS.from_pretrained(MODEL, {
      dtype: 'q8',
      device: 'wasm',
      // only reached when the files are not in the cache yet (no /voice-model/ on this site)
      progress_callback: (p: any) => {
        if (!man && p.status === 'progress' && p.total) progress(p.loaded, p.total)
      },
    })
    postMessage({ type: 'mode', device: 'wasm', source: man ? 'site' : 'cdn' })
    return tts
  })()
  ready.catch(() => (ready = null))
  return ready
}

onmessage = async (e: MessageEvent) => {
  const m = e.data
  try {
    if (m.type === 'load') {
      await load()
      postMessage({ type: 'ready' })
    } else if (m.type === 'speak') {
      const tts = await load()
      const out = await tts.generate(m.text, { voice: m.voice, speed: m.speed })
      const audio = out.audio as Float32Array
      postMessage({ type: 'audio', id: m.id, audio, sr: out.sampling_rate }, [audio.buffer])
    }
  } catch (err) {
    postMessage({ type: 'error', id: m.id, error: String((err as Error)?.message ?? err) })
  }
}
