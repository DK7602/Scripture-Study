import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import type { Plugin } from 'vite'

/**
 * Fingerprints of the data files, so phones can tell which of the files they keep are out of date (they are kept
 * "cache first", src/lib/datasync.ts): data/hashes.json gives each group's ("core", "comm:gill", … as in
 * manifest.json), data/hashes/<group>.json each of its files' (the first 12 hex digits of its SHA-256).
 */
function dataHashes(): Plugin {
  const root = fileURLToPath(new URL('./public/data', import.meta.url))
  const groupOf = (rel: string) => {
    const [top, sub, more] = rel.split('/')
    if (top === 'bibles') return `bible:${sub}`
    if (top === 'comm' && more) return `comm:${sub}`
    if (top === 'strongs' || top === 'conc') return 'strongs'
    if (top === 'sermons') return 'sermons'
    return 'core'
  }
  const walk = (dir: string, out: string[]) => {
    for (const f of readdirSync(dir)) {
      const full = join(dir, f)
      if (statSync(full).isDirectory()) walk(full, out)
      else out.push(relative(root, full).split(sep).join('/'))
    }
    return out
  }
  return {
    name: 'data-hashes',
    apply: 'build',
    generateBundle() {
      const groups: Record<string, Record<string, string>> = {}
      for (const rel of walk(root, []).sort()) {
        if (rel === 'manifest.json') continue
        const h = createHash('sha256').update(readFileSync(join(root, rel))).digest('hex').slice(0, 12)
        ;(groups[groupOf(rel)] ??= {})[rel] = h
      }
      const top: Record<string, string> = {}
      for (const [g, files] of Object.entries(groups)) {
        const source = JSON.stringify(files)
        top[g] = createHash('sha256').update(source).digest('hex').slice(0, 12)
        this.emitFile({ type: 'asset', fileName: `data/hashes/${g.replace(':', '_')}.json`, source })
      }
      this.emitFile({ type: 'asset', fileName: 'data/hashes.json', source: JSON.stringify(top) })
    },
  }
}

// Relative base so the same build works at a domain root or a sub-path (e.g. GitHub Pages).
export default defineConfig({
  // cross-origin isolation lets the on-device voice use every processor core (see public/_headers)
  server: { headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'credentialless' } },
  preview: { headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'credentialless' } },
  base: './',
  // ONNX Runtime's WebAssembly-only build, with its .wasm/.mjs as separate files (the on-device voice, piper.worker.ts)
  resolve: { alias: { 'onnxruntime-web-wasm': fileURLToPath(new URL('./node_modules/onnxruntime-web/dist/ort.wasm.min.mjs', import.meta.url)) } },
  worker: { format: 'es' },
  plugins: [
    react(),
    dataHashes(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'Scripture Study',
        short_name: 'Scripture Study',
        description: 'Bible, commentaries, Strong’s concordance, maps & helps, notes and journal.',
        theme_color: '#1f3d2b',
        background_color: '#f4ecd8',
        display: 'standalone',
        orientation: 'any',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell is precached; Bible data is cached as it is read (or all at once from Settings).
        globPatterns: ['**/*.{js,css,html,svg,woff2}', 'icons/icon-192.png', 'icons/favicon-64.png', 'textures/*.webp', 'data/books.json', 'data/versions.json'],
        globIgnores: ['data/**/!(books|versions).json', '**/piper.worker-*.js', '**/supertonic.worker-*.js'], // the on-device voice: only when chosen
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // sign-in, sync and Cloudflare Access pages must always reach the network
        navigateFallbackDenylist: [/^\/api\//, /^\/cdn-cgi\//, /^\/feed\//, /^\/audio\//],
        runtimeCaching: [
          // the data files' fingerprints always from the network; the list for downloading, offline from the last
          {
            urlPattern: ({ url }) => url.pathname.includes('/data/hashes'),
            handler: 'NetworkOnly',
          },
          {
            urlPattern: ({ url }) => url.pathname.endsWith('/data/manifest.json'),
            handler: 'NetworkFirst',
            options: { cacheName: 'scripture-meta' },
          },
          {
            urlPattern: ({ url }) => url.pathname.includes('/data/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'scripture-data',
              expiration: { maxEntries: 20000 },
            },
          },
        ],
      },
    }),
  ],
  build: { target: 'es2020', chunkSizeWarningLimit: 900 },
})
