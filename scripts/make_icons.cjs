// Composes the app icons: the cross & open Bible artwork (assets/icon-art.png) on a green leather field,
// with a gold frame forming the icon's edge.  Usage: npm run icons
// (uses the Playwright Chromium; writes icon-512/192, apple-touch-icon, maskable, favicon and a 1024 master)
const { chromium } = require('playwright')
const fs = require('fs')
const [, , artPath, out] = process.argv
const art = 'data:image/png;base64,' + fs.readFileSync(artPath).toString('base64')

function svg({ size = 1024, rx = 200, frame = true, opaque = false, artScale = 0.95, artY = 0.5 }) {
  const aw = size * artScale
  const ah = aw * (107 / 154)
  const ax = (size - aw) / 2
  const ay = size * artY - ah / 2
  const fw = size * 0.03 // frame width
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <clipPath id="clip"><rect width="${size}" height="${size}" rx="${opaque ? 0 : rx}"/></clipPath>
    <radialGradient id="field" cx="0.5" cy="${artY - 0.08}" r="0.72">
      <stop offset="0" stop-color="#66702f"/>
      <stop offset="0.3" stop-color="#2c3f18"/>
      <stop offset="0.62" stop-color="#15250f"/>
      <stop offset="1" stop-color="#081006"/>
    </radialGradient>
    <radialGradient id="glow" cx="0.5" cy="${artY - 0.12}" r="0.38">
      <stop offset="0" stop-color="#fff2b0" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#fff2b0" stop-opacity="0"/>
    </radialGradient>
    <filter id="leather" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="${8 / size} ${14 / size}" numOctaves="5" seed="7" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -3 1.75" result="a"/>
      <feComposite in="SourceGraphic" in2="a" operator="in"/>
    </filter>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="${60 / size} ${25 / size}" numOctaves="3" seed="3" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 2.2 -1.0" result="a"/>
      <feComposite in="SourceGraphic" in2="a" operator="in"/>
    </filter>
    <filter id="feather" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${size * 0.045}"/></filter>
    <mask id="artMask" maskUnits="userSpaceOnUse">
      <rect x="${ax + aw * 0.08}" y="${ay + ah * 0.08}" width="${aw * 0.84}" height="${ah * 0.86}" rx="${aw * 0.18}" fill="#fff" filter="url(#feather)"/>
    </mask>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff1b8"/>
      <stop offset="0.25" stop-color="#e2b955"/>
      <stop offset="0.5" stop-color="#f7dc87"/>
      <stop offset="0.75" stop-color="#b8862c"/>
      <stop offset="1" stop-color="#f0cf72"/>
    </linearGradient>
  </defs>
  <g clip-path="url(#clip)">
    <rect width="${size}" height="${size}" fill="url(#field)"/>
    <rect width="${size}" height="${size}" fill="#050b03" opacity="0.7" filter="url(#leather)"/>
    <rect width="${size}" height="${size}" fill="#9fae6a" opacity="0.14" filter="url(#grain)"/>
    <rect width="${size}" height="${size}" fill="url(#glow)"/>
    <image href="${art}" x="${ax}" y="${ay}" width="${aw}" height="${ah}" preserveAspectRatio="none" mask="url(#artMask)"/>
    ${frame ? `
    <rect x="${fw / 2}" y="${fw / 2}" width="${size - fw}" height="${size - fw}" rx="${rx - fw / 2}" fill="none" stroke="url(#gold)" stroke-width="${fw}"/>
    <rect x="${fw + size * 0.004}" y="${fw + size * 0.004}" width="${size - 2 * fw - size * 0.008}" height="${size - 2 * fw - size * 0.008}" rx="${rx - fw}" fill="none" stroke="#3b2a08" stroke-width="${size * 0.006}" opacity="0.85"/>
    <rect x="${fw * 0.18}" y="${fw * 0.18}" width="${size - fw * 0.36}" height="${size - fw * 0.36}" rx="${rx - fw * 0.18}" fill="none" stroke="#fff8d8" stroke-width="${size * 0.0035}" opacity="0.7"/>` : ''}
  </g>
</svg>`
}

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  const jobs = [
    // name, size, options
    ['icon-1024.png', 1024, {}],
    ['icon-512.png', 512, {}],
    ['icon-192.png', 192, {}],
    ['favicon-64.png', 64, {}],
    // iOS masks its own rounded corners: opaque square, frame following the iOS curve
    ['apple-touch-icon.png', 180, { opaque: true, rx: 180 * 0.2237 }],
    // Android maskable: full-bleed, artwork inside the safe zone, frame omitted (it would be cropped)
    ['icon-maskable-512.png', 512, { opaque: true, frame: false, artScale: 0.74, artY: 0.5 }],
  ]
  for (const [name, size, opts] of jobs) {
    const rx = opts.rx ?? size * 0.195
    await page.setViewportSize({ width: size, height: size })
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg({ size, rx, ...opts })}</body></html>`)
    await page.waitForTimeout(150)
    await page.screenshot({ path: `${out}/${name}`, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } })
  }
  await browser.close()
  console.log('done')
})()
