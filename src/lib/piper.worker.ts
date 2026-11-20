/// <reference lib="webworker" />
/**
 * Ryan's voice made on this device (Piper, MIT; the voice "en_US-ryan-medium" from rhasspy/piper-voices), for
 * translations whose publishers do not allow stored audio. Piper is small and fast (many times faster than real
 * time even on a phone's processor), so whole chapters are ready ahead of the reading and keep playing with the
 * screen off. Nothing about the text leaves the device.
 *
 * The voice is served by this site in parts (scripts/fetch_voice_model.py writes /voice-model/piper/), kept in the
 * browser's cache after the first time. ONNX Runtime (onnxruntime-web, MIT) runs it; eSpeak NG (through the
 * phonemizer package) turns the words into sounds, the way Piper does (piperText.ts).
 *
 * Messages in:  {type:'load'} | {type:'speak', id, run, text, speed} | {type:'cancel', run}
 * Messages out: {type:'progress', loaded, total} | {type:'mode', device} | {type:'ready'}
 *               | {type:'audio', id, audio, sr, ms} | {type:'error', id, error}
 */
import * as ort from 'onnxruntime-web-wasm'
import { idsOf, sentencesOf, type IdMap } from './piperText'

const SITE = new URL(`${import.meta.env.BASE_URL}voice-model/piper/`, self.location.origin).href
const HF = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/medium/'
const VOICE = 'en_US-ryan-medium'
const CACHE = 'piper-voice-v1'
const PACE = 0.85

ort.env.wasm.wasmPaths = {
  wasm: new URL('../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm', import.meta.url).href,
  mjs: new URL('../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs', import.meta.url).href,
}
// several processor cores where the page is cross-origin isolated (it is: public/_headers)
ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)) : 1

interface Config {
  audio: { sample_rate: number }
  inference: { noise_scale: number; length_scale: number; noise_w: number }
  phoneme_id_map: IdMap
  vowel_clusters?: string[][]
}
interface Manifest {
  voice: string
  config: string
  model: { path: string; size: number; parts: number }
}

let lastPost = 0
function progress(loaded: number, total: number) {
  const now = Date.now()
  if (now - lastPost < 250 && loaded < total) return
  lastPost = now
  postMessage({ type: 'progress', loaded, total })
}

/** A file from the browser's cache, else downloaded (with progress) and kept there. */
async function cachedBytes(url: string, onBytes: (n: number) => void): Promise<Uint8Array> {
  let cache: Cache | null = null
  try {
    cache = await caches.open(CACHE)
    const hit = await cache.match(url)
    if (hit) {
      const b = new Uint8Array(await hit.arrayBuffer())
      onBytes(b.length)
      return b
    }
  } catch {
    cache = null // no cache here (private window): download every time
  }
  const r = await fetch(url)
  if (!r.ok || !r.body) throw new Error(`voice download failed (${r.status})`)
  const chunks: Uint8Array[] = []
  const reader = r.body.getReader()
  let n = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    n += value.length
    onBytes(value.length)
  }
  const out = new Uint8Array(n)
  let o = 0
  for (const c of chunks) {
    out.set(c, o)
    o += c.length
  }
  try {
    await cache?.put(url, new Response(out, { headers: { 'content-type': 'application/octet-stream' } }))
  } catch {
    /* full: it is downloaded again next time */
  }
  return out
}

let ready: Promise<{ session: ort.InferenceSession; config: Config }> | null = null

function load() {
  ready ??= (async () => {
    let man: Manifest | null = null
    try {
      const r = await fetch(SITE + 'manifest.json', { cache: 'no-cache' })
      if (r.ok && (r.headers.get('content-type') ?? '').includes('json')) man = await r.json()
    } catch {
      man = null
    }
    const config: Config = await (await fetch(man ? SITE + man.config : HF + `${VOICE}.onnx.json`)).json()
    const total = man?.model.size ?? 63_201_294
    let loaded = 0
    const count = (n: number) => progress((loaded += n), total)
    let model: Uint8Array
    if (man) {
      const parts: Uint8Array[] = []
      for (let i = 0; i < man.model.parts; i++) parts.push(await cachedBytes(`${SITE}${man.model.path}.${String(i).padStart(3, '0')}`, count))
      model = new Uint8Array(parts.reduce((t, p) => t + p.length, 0))
      let o = 0
      for (const p of parts) {
        model.set(p, o)
        o += p.length
      }
    } else model = await cachedBytes(HF + `${VOICE}.onnx`, count) // local development: straight from Hugging Face
    progress(total, total)
    const session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' })
    postMessage({ type: 'mode', device: 'wasm', threads: ort.env.wasm.numThreads })
    return { session, config }
  })()
  ready.catch(() => (ready = null))
  return ready
}

/** One piece of text (a verse, or part of a long one) to audio. */
async function speak(text: string, speed: number): Promise<{ audio: Float32Array; sr: number }> {
  const { session, config } = await load()
  const sr = config.audio.sample_rate
  const inf = config.inference
  // Ryan's own pace is quick for Scripture: 1x is his 0.85x
  const scales = new Float32Array([inf.noise_scale, inf.length_scale / (Math.max(0.5, Math.min(2, speed || 1)) * PACE), inf.noise_w])
  const gap = new Float32Array(Math.round(sr * 0.12)) // between sentences
  const tail = new Float32Array(Math.round(sr * 0.2)) // after the piece: a verse ends, the next begins
  const parts: Float32Array[] = []
  for (const phonemes of await sentencesOf(text, config.vowel_clusters ?? [])) {
    const ids = idsOf(phonemes, config.phoneme_id_map)
    const out = await session.run({
      input: new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
      input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
      scales: new ort.Tensor('float32', scales, [3]),
    })
    if (parts.length) parts.push(gap)
    parts.push(out[session.outputNames[0]].data as Float32Array)
  }
  parts.push(tail)
  const audio = new Float32Array(parts.reduce((t, p) => t + p.length, 0))
  let o = 0
  for (const p of parts) {
    audio.set(p, o)
    o += p.length
  }
  return { audio, sr }
}

// One piece at a time, in the order asked, and only for the current reading: when the listener skips, pauses or
// the chapter changes, a newer run arrives and the pieces queued for older runs are dropped unmade. The engine's
// work does not let messages in while it runs, so the loop steps back to the event loop between pieces.
let latestRun = 0
const pending: { type: string; id?: number; run?: number; text?: string; speed?: number }[] = []
let busy = false

function dropOld() {
  for (let i = pending.length - 1; i >= 0; i--) {
    const m = pending[i]
    if (m.type === 'speak' && m.run !== latestRun) {
      pending.splice(i, 1)
      postMessage({ type: 'dropped', id: m.id })
    }
  }
}

async function pump() {
  if (busy) return
  busy = true
  try {
    while (pending.length) {
      await new Promise((r) => setTimeout(r, 0)) // let a newer run (a skip, a pause) arrive first
      // a cancel (a pause, a skip) can arrive during that step back and empty the queue
      const m = pending.shift()
      if (!m) continue
      if (m.type === 'speak' && m.run !== latestRun) {
        postMessage({ type: 'dropped', id: m.id })
        continue
      }
      try {
        if (m.type === 'load') {
          await load()
          postMessage({ type: 'ready' })
        } else if (m.type === 'speak') {
          const t0 = performance.now()
          const { audio, sr } = await speak(m.text ?? '', m.speed ?? 1)
          postMessage({ type: 'audio', id: m.id, audio, sr, ms: performance.now() - t0 }, [audio.buffer])
        }
      } catch (err) {
        postMessage({ type: 'error', id: m.id, error: String((err as Error)?.message ?? err) })
      }
    }
  } finally {
    busy = false // never left busy: it would then ignore every later request
  }
}

onmessage = (e: MessageEvent) => {
  const m = e.data
  if (typeof m.run === 'number' && m.run > latestRun) {
    latestRun = m.run
    dropOld()
  }
  if (m.type === 'cancel') return
  pending.push(m)
  void pump()
}
