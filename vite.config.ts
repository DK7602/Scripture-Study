import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Relative base so the same build works at a domain root or a sub-path (e.g. GitHub Pages).
export default defineConfig({
  // cross-origin isolation lets the on-device voice use every processor core (see public/_headers)
  server: { headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'credentialless' } },
  preview: { headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'credentialless' } },
  base: './',
  plugins: [
    react(),
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
        globIgnores: ['data/**/!(books|versions).json'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // sign-in, sync and Cloudflare Access pages must always reach the network
        navigateFallbackDenylist: [/^\/api\//, /^\/cdn-cgi\//],
        runtimeCaching: [
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
