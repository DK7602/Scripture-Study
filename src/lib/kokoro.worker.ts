/// <reference lib="webworker" />
/**
 * Michael's voice made on this device, for translations whose publishers do not allow stored audio.
 * Kokoro (Apache-2.0) runs in this worker so the page never freezes: the browser build of kokoro-js comes from the
 * jsDelivr CDN and the voice model from Hugging Face, both only when first used, then kept in the browser's cache.
 * With WebGPU (most recent phones and computers) the full model (310 MB) runs several times faster than real time; without
 * it the compact model (88 MB) runs on the processor, which on slower devices can pause between verses.
 * Nothing about the text leaves the device.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
const LIB = 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js'
const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX'

let ready: Promise<any> | null = null

async function webgpu(): Promise<boolean> {
  try {
    const gpu = (self.navigator as any).gpu
    return !!(gpu && (await gpu.requestAdapter()))
  } catch {
    return false
  }
}
const loaded = new Map<string, { loaded: number; total: number }>()

function load() {
  ready ??= (async () => {
    const { KokoroTTS } = await import(/* @vite-ignore */ LIB)
    const gpu = await webgpu()
    const opts = (device: string, dtype: string) => ({
      dtype,
      device,
      progress_callback: (p: any) => {
        if (p.status === 'progress' && p.file && p.total) {
          loaded.set(p.file, { loaded: p.loaded, total: p.total })
          let a = 0
          let b = 0
          for (const v of loaded.values()) {
            a += v.loaded
            b += v.total
          }
          postMessage({ type: 'progress', loaded: a, total: b })
        }
      },
    })
    if (gpu) {
      try {
        const tts = await KokoroTTS.from_pretrained(MODEL, opts('webgpu', 'fp32'))
        postMessage({ type: 'mode', device: 'webgpu' })
        return tts
      } catch {
        loaded.clear() // fall back to the processor
      }
    }
    const tts = await KokoroTTS.from_pretrained(MODEL, opts('wasm', 'q8'))
    postMessage({ type: 'mode', device: 'wasm' })
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
