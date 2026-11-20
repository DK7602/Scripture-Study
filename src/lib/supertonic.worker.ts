/// <reference lib="webworker" />
/**
 * Supertonic voices made on this device (Supertone's Supertonic 2; model OpenRAIL-M, see /voice-model/supertonic/
 * LICENSE): five men and five women, natural-sounding and fast enough on a phone's processor to make a chapter
 * ahead of the reading, which then keeps playing with the screen off. Nothing about the text leaves the device.
 *
 * The same steps as Supertone's reference (py/helper.py): the text as characters (unicode_indexer.json), the
 * duration predictor, the text encoder, a few steps of the flow-matching vector estimator from noise, the vocoder.
 * The model (about 250 MB) is served by this site in parts (scripts/fetch_voice_model.py) and kept in the browser's
 * cache after the first time.
 *
 * Messages in:  {type:'speak', id, run, text, speed, voice: 'M1'…'F5', ids?, texts?} | {type:'cancel', run}
 *               (ids and texts: short verses made as one and cut apart, an 'audio' message for each id)
 * Messages out: {type:'progress', loaded, total} | {type:'mode', device} | {type:'audio', id, audio, sr, ms}
 *               | {type:'error', id, error} | {type:'dropped', id}
 */
import * as ort from 'onnxruntime-web-wasm'

const SITE = new URL(`${import.meta.env.BASE_URL}voice-model/supertonic/`, self.location.origin).href
const CACHE = 'supertonic-voice-v1'
// denoising steps: Supertone's default. With 5 (a quarter quicker) a word or two went missing in about one verse in
// six ("by his Son. God has appointed" heard as "by Han, has appointed"); with 8, none in the same tests
const STEPS = 8

ort.env.wasm.wasmPaths = {
  wasm: new URL('../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm', import.meta.url).href,
  mjs: new URL('../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs', import.meta.url).href,
}
ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)) : 1

interface Part {
  path: string
  size: number
  parts: number
}
interface Manifest {
  models: Record<'duration_predictor' | 'text_encoder' | 'vector_estimator' | 'vocoder', Part>
  config: string
  indexer: string
  styles: Record<string, string>
}
interface Config {
  ae: { sample_rate: number; base_chunk_size: number }
  ttl: { chunk_compress_factor: number; latent_dim: number }
}

let lastPost = 0
function progress(loaded: number, total: number) {
  const now = Date.now()
  if (now - lastPost < 250 && loaded < total) return
  lastPost = now
  postMessage({ type: 'progress', loaded, total })
}

/** A file from the browser's cache, else downloaded (counting its bytes) and kept there. */
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
    cache = null
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
  const out = join(chunks, n)
  try {
    await cache?.put(url, new Response(out, { headers: { 'content-type': 'application/octet-stream' } }))
  } catch {
    /* full: downloaded again next time */
  }
  return out
}

function join(chunks: Uint8Array[], n = chunks.reduce((t, c) => t + c.length, 0)): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(n)
  let o = 0
  for (const c of chunks) {
    out.set(c, o)
    o += c.length
  }
  return out
}

interface Engine {
  dp: ort.InferenceSession
  enc: ort.InferenceSession
  est: ort.InferenceSession
  voc: ort.InferenceSession
  cfg: Config
  indexer: number[]
  man: Manifest
}
let ready: Promise<Engine> | null = null

function load() {
  ready ??= (async () => {
    const man: Manifest = await (await fetch(SITE + 'manifest.json', { cache: 'no-cache' })).json()
    const total = Object.values(man.models).reduce((t, m) => t + m.size, 0)
    let loaded = 0
    const count = (n: number) => progress((loaded += n), total)
    const session = async (m: Part) => {
      const parts: Uint8Array[] = []
      for (let i = 0; i < m.parts; i++) parts.push(await cachedBytes(`${SITE}${m.path}.${String(i).padStart(3, '0')}`, count))
      return ort.InferenceSession.create(join(parts), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' })
    }
    const cfg: Config = await (await fetch(SITE + man.config)).json()
    const indexer: number[] = await (await fetch(SITE + man.indexer)).json()
    const dp = await session(man.models.duration_predictor)
    const enc = await session(man.models.text_encoder)
    const est = await session(man.models.vector_estimator)
    const voc = await session(man.models.vocoder)
    progress(total, total)
    postMessage({ type: 'mode', device: 'wasm', threads: ort.env.wasm.numThreads })
    return { dp, enc, est, voc, cfg, indexer, man }
  })()
  ready.catch(() => (ready = null))
  return ready
}

const styles = new Map<string, Promise<{ ttl: ort.Tensor; dp: ort.Tensor }>>()
function style(e: Engine, voice: string) {
  const name = e.man.styles[voice] ? voice : 'M1'
  let s = styles.get(name)
  if (!s) {
    s = (async () => {
      const j = await (await fetch(SITE + e.man.styles[name])).json()
      const t = (x: { data: number[] | number[][][]; dims: number[] }) => new ort.Tensor('float32', Float32Array.from((x.data as number[]).flat(3)), x.dims)
      return { ttl: t(j.style_ttl), dp: t(j.style_dp) }
    })()
    s.catch(() => styles.delete(name))
    styles.set(name, s)
  }
  return s
}

/** Supertone's text clean-up (UnicodeProcessor._preprocess_text), for English. */
function prepare(text: string): string {
  let t = text.normalize('NFKD')
  const swap: Record<string, string> = { '–': '-', '‑': '-', '—': '-', _: ' ', '“': '"', '”': '"', '‘': "'", '’': "'", '´': "'", '`': "'", '[': ' ', ']': ' ', '|': ' ', '/': ' ', '#': ' ', '→': ' ', '←': ' ' }
  t = [...t].map((c) => swap[c] ?? c).join('')
  t = t.replace(/[♥☆♡©\\]/g, '').replace(/@/g, ' at ')
  t = t.replace(/ ,/g, ',').replace(/ \./g, '.').replace(/ !/g, '!').replace(/ \?/g, '?').replace(/ ;/g, ';').replace(/ :/g, ':').replace(/ '/g, "'")
  while (t.includes('""')) t = t.replace('""', '"')
  while (t.includes("''")) t = t.replace("''", "'")
  t = t.replace(/\s+/g, ' ').trim()
  if (!/[.!?;:,'")\]}…]$/.test(t)) t += '.'
  return `<en>${t}</en>`
}

/** Sentences of at most 300 characters (Supertone's chunk_text). */
function chunks(text: string, max = 300): string[] {
  const out: string[] = []
  let cur = ''
  for (const s of text.split(/(?<=[.!?])\s+/)) {
    if (cur && cur.length + s.length + 1 > max) {
      out.push(cur)
      cur = s
    } else cur = cur ? `${cur} ${s}` : s
  }
  if (cur) out.push(cur)
  return out
}

function randn(n: number): Float32Array {
  const a = new Float32Array(n)
  for (let i = 0; i < n; i += 2) {
    const u = 1 - Math.random()
    const v = Math.random()
    const r = Math.sqrt(-2 * Math.log(u))
    a[i] = r * Math.cos(2 * Math.PI * v)
    if (i + 1 < n) a[i + 1] = r * Math.sin(2 * Math.PI * v)
  }
  return a
}

async function infer(e: Engine, st: { ttl: ort.Tensor; dp: ort.Tensor }, text: string, speed: number): Promise<Float32Array> {
  const s = prepare(text)
  // each character's id (characters the voice does not know are left out)
  const ids = BigInt64Array.from([...s].map((c) => e.indexer[c.charCodeAt(0)] ?? -1).filter((x) => x >= 0).map(BigInt))
  const L = ids.length
  const textIds = new ort.Tensor('int64', ids, [1, L])
  const textMask = new ort.Tensor('float32', new Float32Array(L).fill(1), [1, 1, L])
  const dur = ((await e.dp.run({ text_ids: textIds, style_dp: st.dp, text_mask: textMask }))[e.dp.outputNames[0]].data as Float32Array)[0] / speed
  const emb = (await e.enc.run({ text_ids: textIds, style_ttl: st.ttl, text_mask: textMask }))[e.enc.outputNames[0]]
  const sr = e.cfg.ae.sample_rate
  const chunk = e.cfg.ae.base_chunk_size * e.cfg.ttl.chunk_compress_factor
  const wavLen = Math.floor(dur * sr)
  const latentLen = Math.floor((dur * sr + chunk - 1) / chunk)
  const dim = e.cfg.ttl.latent_dim * e.cfg.ttl.chunk_compress_factor
  const used = Math.min(latentLen, Math.floor((wavLen + chunk - 1) / chunk))
  const maskData = new Float32Array(latentLen).map((_, i) => (i < used ? 1 : 0))
  const latentMask = new ort.Tensor('float32', maskData, [1, 1, latentLen])
  const noise = randn(dim * latentLen)
  for (let d = 0; d < dim; d++) for (let i = used; i < latentLen; i++) noise[d * latentLen + i] = 0
  let xt: ort.Tensor = new ort.Tensor('float32', noise, [1, dim, latentLen])
  const total = new ort.Tensor('float32', new Float32Array([STEPS]), [1])
  for (let step = 0; step < STEPS; step++) {
    const out = await e.est.run({
      noisy_latent: xt,
      text_emb: emb,
      style_ttl: st.ttl,
      text_mask: textMask,
      latent_mask: latentMask,
      current_step: new ort.Tensor('float32', new Float32Array([step]), [1]),
      total_step: total,
    })
    xt = out[e.est.outputNames[0]]
  }
  const wav = (await e.voc.run({ latent: xt }))[e.voc.outputNames[0]].data as Float32Array
  return wav.slice(0, Math.min(wav.length, wavLen))
}

async function speak(text: string, speed: number, voice: string): Promise<{ audio: Float32Array; sr: number }> {
  const e = await load()
  const st = await style(e, voice)
  const sr = e.cfg.ae.sample_rate
  const parts: Float32Array[] = []
  for (const c of chunks(text)) {
    if (parts.length) parts.push(new Float32Array(Math.round(sr * 0.3)))
    parts.push(await infer(e, st, c, Math.max(0.5, Math.min(2, speed || 1))))
  }
  parts.push(new Float32Array(Math.round(sr * 0.2))) // a breath between verses
  return { audio: concat(parts), sr }
}

/**
 * Several short verses made as one (the model drops words from a very short text: "Jesus wept." came out "Wept."
 * nearly every time, Supertone's own code alike), then cut apart again at the pauses between them, so each verse
 * still has its own sound (and its own highlight).
 */
async function speakGroup(texts: string[], speed: number, voice: string): Promise<{ audios: Float32Array[]; sr: number }> {
  const e = await load()
  const st = await style(e, voice)
  const sr = e.cfg.ae.sample_rate
  const joined = texts.join(' ')
  const wav = await infer(e, st, joined, Math.max(0.5, Math.min(2, speed || 1)))
  // where each verse should end, by its share of the letters; then the quiet stretch nearest to that
  const ends: number[] = []
  let n = 0
  for (const t of texts.slice(0, -1)) {
    n += t.length + 1
    ends.push(n / joined.length)
  }
  const cuts = pausesNear(wav, sr, ends)
  const tail = new Float32Array(Math.round(sr * 0.2))
  const audios: Float32Array[] = []
  let a = 0
  for (const c of [...cuts, wav.length]) {
    audios.push(concat([wav.subarray(a, c), tail]))
    a = c
  }
  return { audios, sr }
}

/**
 * For each place (a share of the sound), the middle of the pause between the verses there. The pauses between verses
 * are long (0.6 to 1.2 s); short ones (under 0.2 s) come within them, after a comma or before the t of "wept": the
 * longest pause near the place is taken, nearness counting a quarter of a second per second away.
 */
function pausesNear(wav: Float32Array, sr: number, at: number[]): number[] {
  const frame = Math.round(sr * 0.01) // 10 ms
  const n = Math.floor(wav.length / frame)
  const rms = new Float32Array(n)
  let peak = 0
  for (let i = 0; i < n; i++) {
    let sum = 0
    for (let j = i * frame; j < (i + 1) * frame; j++) sum += wav[j] * wav[j]
    rms[i] = Math.sqrt(sum / frame)
    peak = Math.max(peak, rms[i])
  }
  const quiet = peak * 0.06
  const runs: { a: number; b: number; mid: number }[] = []
  for (let i = 0; i < n; ) {
    if (rms[i] >= quiet) {
      i++
      continue
    }
    let j = i
    while (j < n && rms[j] < quiet) j++
    if (i > 0 && j < n) runs.push({ a: i, b: j, mid: (i + j) / 2 }) // not the silence before or after the speech
    i = j
  }
  const cuts: number[] = []
  let last = 0
  for (const f of at) {
    const target = f * n
    const after = runs.filter((r) => r.mid > last + 20)
    const score = (r: { a: number; b: number; mid: number }) => r.b - r.a - 0.25 * Math.abs(r.mid - target)
    const long = after.filter((r) => r.b - r.a >= 20)
    const pick = (long.length ? long : after).reduce<(typeof runs)[number] | null>((best, r) => (!best || score(r) > score(best) ? r : best), null)
    const mid = pick ? pick.mid : Math.max(target, last + 20)
    last = mid
    cuts.push(Math.round(mid) * frame)
  }
  return cuts
}

function concat(parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((t, p) => t + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

// One piece at a time, only for the current reading (pieces of readings the listener has left are dropped), with a
// step back to the event loop between pieces so a skip or pause is heard at once (as in piper.worker.ts).
let latestRun = 0
// a group: ids and texts of short verses made together (see speakGroup)
const pending: { type: string; id?: number; run?: number; text?: string; speed?: number; voice?: string; ids?: number[]; texts?: string[] }[] = []
let busy = false

function dropOld() {
  for (let i = pending.length - 1; i >= 0; i--) {
    const m = pending[i]
    if (m.type === 'speak' && m.run !== latestRun) {
      pending.splice(i, 1)
      for (const id of m.ids ?? [m.id]) postMessage({ type: 'dropped', id })
    }
  }
}

async function pump() {
  if (busy) return
  busy = true
  try {
    while (pending.length) {
      await new Promise((r) => setTimeout(r, 0))
      // a cancel (a pause, a skip) can arrive during that step back and empty the queue
      const m = pending.shift()
      if (!m) continue
      if (m.type === 'speak' && m.run !== latestRun) {
        for (const id of m.ids ?? [m.id]) postMessage({ type: 'dropped', id })
        continue
      }
      try {
        if (m.type === 'load') await load()
        else if (m.type === 'speak') {
          await load() // the time to make speech is counted without the first download
          const t0 = performance.now()
          if (m.ids && m.texts && m.ids.length > 1) {
            const { audios, sr } = await speakGroup(m.texts, m.speed ?? 1, m.voice ?? 'M1')
            const ms = (performance.now() - t0) / audios.length
            audios.forEach((audio, i) => postMessage({ type: 'audio', id: m.ids![i], audio, sr, ms }, [audio.buffer]))
          } else {
            const { audio, sr } = await speak(m.text ?? '', m.speed ?? 1, m.voice ?? 'M1')
            postMessage({ type: 'audio', id: m.id, audio, sr, ms: performance.now() - t0 }, [audio.buffer])
          }
        }
      } catch (err) {
        for (const id of m.ids ?? [m.id]) postMessage({ type: 'error', id, error: String((err as Error)?.message ?? err) })
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
