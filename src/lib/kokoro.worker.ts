/// <reference lib="webworker" />
/**
 * Michael's voice made on this device, for translations whose publishers do not allow stored audio.
 * Kokoro (Apache-2.0) runs in this worker so the page never freezes. Nothing about the text leaves the device.
 *
 * Everything is served by this site (scripts/fetch_voice_model.py puts it in /voice-model/): the kokoro-js browser
 * build, the ONNX Runtime WebAssembly files and the model (in parts): the full model (310 MB) on devices with a real
 * graphics chip (WebGPU), many times faster than real time, otherwise the compact one (88 MB) on the processor. Some
 * phones and networks cannot reach the Hugging Face file servers, so this worker answers kokoro-js's requests for them
 * from this site. Without /voice-model/ (local development) the library,
 * runtime and model come from jsDelivr and Hugging Face directly.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
const CDN_LIB = 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js'
const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX'
const SITE = new URL(`${import.meta.env.BASE_URL}voice-model/`, self.location.origin).href

interface Model {
  path: string
  size: number
  parts: number
}
interface Manifest {
  hf: string
  files: Record<string, number>
  models: Record<'q8' | 'fp32', Model>
  ort: string
  lib: string
}

/** A real graphics chip with WebGPU (software ones are slower than the processor). */
async function hasGpu(allowSoftware: boolean): Promise<boolean> {
  try {
    const gpu = (self.navigator as any).gpu
    const a = gpu && (await gpu.requestAdapter({ powerPreference: 'high-performance' }))
    if (!a) return false
    const soft = a.isFallbackAdapter || /swiftshader/i.test(`${a.info?.vendor} ${a.info?.architecture} ${a.info?.description}`)
    return !soft || allowSoftware
  } catch {
    return false
  }
}

let ready: Promise<any> | null = null

function progress(loaded: number, total: number) {
  postMessage({ type: 'progress', loaded, total })
}

/** What this site hosts (/voice-model/manifest.json), or null to use jsDelivr and Hugging Face directly. */
async function manifest(): Promise<Manifest | null> {
  try {
    const r = await fetch(SITE + 'manifest.json')
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return null
    const m = await r.json()
    return m.models ? m : null
  } catch {
    return null
  }
}

const realFetch = self.fetch.bind(self)
let man: Manifest | null = null

/** One model file, streamed from its parts on this site as if it were a single download. */
function partsResponse(model: Model): Response {
  let i = 0
  const body = new ReadableStream<Uint8Array>({
    async pull(ctrl) {
      if (i >= model.parts) return ctrl.close()
      const r = await realFetch(`${SITE}hf/${model.path}.${String(i).padStart(3, '0')}`)
      if (!r.ok || !r.body) return ctrl.error(new Error(`voice download failed (${r.status})`))
      const reader = r.body.getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        ctrl.enqueue(value)
      }
      i++
    },
  })
  return new Response(body, { headers: { 'content-type': 'application/octet-stream', 'content-length': String(model.size) } })
}

// kokoro-js asks Hugging Face for its files: answer from this site instead (then it caches them itself, if there is room)
self.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (man && url.startsWith(man.hf)) {
    const file = decodeURIComponent(url.slice(man.hf.length).split('?')[0])
    const model = Object.values(man.models).find((m) => m.path === file)
    if (model) return partsResponse(model)
    if (file in man.files) return realFetch(SITE + 'hf/' + file)
  }
  return realFetch(input as RequestInfo, init)
}) as typeof fetch

const loaded = new Map<string, { loaded: number; total: number }>()
function onProgress(p: any) {
  if (p.status !== 'progress' || !p.file || !p.total) return
  loaded.set(p.file, { loaded: p.loaded, total: p.total })
  let a = 0
  let b = 0
  for (const v of loaded.values()) {
    a += v.loaded
    b += v.total
  }
  progress(a, b)
}

function load(allowSoftwareGpu = false) {
  ready ??= (async () => {
    man = await manifest()
    const { KokoroTTS, env } = await import(/* @vite-ignore */ man ? SITE + man.lib : CDN_LIB)
    if (man) env.wasmPaths = SITE + man.ort
    const make = async (device: 'webgpu' | 'wasm', dtype: 'fp32' | 'q8') => {
      loaded.clear()
      const tts = await KokoroTTS.from_pretrained(MODEL, { dtype, device, progress_callback: onProgress })
      postMessage({ type: 'mode', device, source: man ? 'site' : 'cdn' })
      return tts
    }
    if (await hasGpu(allowSoftwareGpu)) {
      try {
        return await make('webgpu', 'fp32')
      } catch (e) {
        console.warn('WebGPU voice failed, using the processor', e)
      }
    }
    return make('wasm', 'q8')
  })()
  ready.catch(() => (ready = null))
  return ready
}

onmessage = async (e: MessageEvent) => {
  const m = e.data
  try {
    if (m.type === 'load') {
      await load(m.softwareGpu)
      postMessage({ type: 'ready' })
    } else if (m.type === 'speak') {
      const tts = await load(m.softwareGpu)
      const out = await tts.generate(m.text, { voice: m.voice, speed: m.speed })
      const audio = out.audio as Float32Array
      postMessage({ type: 'audio', id: m.id, audio, sr: out.sampling_rate }, [audio.buffer])
    }
  } catch (err) {
    postMessage({ type: 'error', id: m.id, error: String((err as Error)?.message ?? err) })
  }
}
