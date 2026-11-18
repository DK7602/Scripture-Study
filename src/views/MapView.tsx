import { useEffect, useMemo, useRef, useState } from 'react'
import { dataUrl, getJSON } from '../lib/data'
import { MAP_LABELS } from '../lib/mapLabels'
import { formatRef } from '../lib/refs'
import { openPopup } from '../lib/store'

interface Basemap {
  w: number
  h: number
  bbox: [number, number, number, number]
  countries: { n: string; d: string; lx: number; ly: number }[]
  lakes: { n: string; d: string }[]
  rivers: { n: string; d: string }[]
}

interface Relief {
  region: { bbox: [number, number, number, number]; size: [number, number] }
  holyland: { bbox: [number, number, number, number]; size: [number, number] }
}

export interface Marker {
  name: string
  lon: number
  lat: number
  modern?: string
  color?: string
  label?: string // text shown instead of the name in "Then" mode
  big?: boolean
  focus?: boolean
}

let basemapP: Promise<Basemap> | null = null
let reliefP: Promise<Relief | null> | null = null

const SEA = '#77acd3'
const SEA_DARK = '#1f3446'

interface Box {
  x: number
  y: number
  w: number
  h: number
}
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/**
 * Pan & zoom atlas of the Bible lands: shaded relief, seas and rivers, regions, mountains and cities,
 * with a "Then" (biblical names) / "Now" (modern borders and names) switch.
 */
export function MapView({ markers, route, bounds, height }: { markers: Marker[]; route?: boolean; bounds?: [number, number, number, number]; height?: number }) {
  const [base, setBase] = useState<Basemap | null>(null)
  const [relief, setRelief] = useState<Relief | null>(null)
  const [now, setNow] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)
  const [pxPerUnit, setPxPerUnit] = useState(1)
  useEffect(() => {
    basemapP ??= getJSON<Basemap>('geo/basemap.json')
    reliefP ??= getJSON<Relief>('geo/relief.json').catch(() => null)
    basemapP.then(setBase)
    reliefP.then(setRelief)
  }, [])

  const proj = useMemo(() => {
    if (!base) return null
    const [lon0, lat0, lon1, lat1] = base.bbox
    return (lon: number, lat: number): [number, number] => [((lon - lon0) / (lon1 - lon0)) * base.w, ((lat1 - lat) / (lat1 - lat0)) * base.h]
  }, [base])

  const initial = useMemo(() => {
    if (!base || !proj) return { x: 0, y: 0, w: 1600, h: 848 }
    let b = bounds
    if (!b && markers.length) {
      const lons = markers.map((m) => m.lon)
      const lats = markers.map((m) => m.lat)
      b = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)]
    }
    if (!b) return { x: 0, y: 0, w: base.w, h: base.h }
    const [x0, y1] = proj(b[0], b[1])
    const [x1, y0] = proj(b[2], b[3])
    const aspect = height ? 1.5 : 1.45
    let w = Math.max((x1 - x0) * 1.35, 130)
    let h = Math.max((y1 - y0) * 1.35, 90)
    if (w / h < aspect) w = h * aspect
    else h = w / aspect
    return { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h / 2, w, h }
  }, [base, proj, markers, bounds, height])

  const [vb, setVb] = useState(initial)
  useEffect(() => setVb(initial), [initial])

  // keep track of how many screen pixels one map unit is (for the scale bar and label sizes)
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const measure = () => setPxPerUnit(el.getBoundingClientRect().width / vb.w)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [vb.w, base])

  // drag / pinch / wheel
  const drag = useRef<{ x: number; y: number; vb: typeof vb; pts: Map<number, { x: number; y: number }>; dist?: number; moved?: boolean } | null>(null)
  const toSvg = (dx: number, dy: number) => {
    const r = svgRef.current!.getBoundingClientRect()
    return { dx: (dx / r.width) * vb.w, dy: (dy / r.height) * vb.h }
  }
  const zoom = (f: number, cx = 0.5, cy = 0.5) => {
    setVb((v) => {
      const w = Math.min(Math.max(v.w * f, 20), 1800)
      const h = (w * v.h) / v.w
      return { x: v.x + (v.w - w) * cx, y: v.y + (v.h - h) * cy, w, h }
    })
  }
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as Element).closest('[data-label]')) return
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    const pts = drag.current?.pts ?? new Map()
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
    drag.current = { x: e.clientX, y: e.clientY, vb, pts }
    if (pts.size === 2) {
      const [a, b] = [...pts.values()]
      drag.current.dist = Math.hypot(a.x - b.x, a.y - b.y)
    }
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || !d.pts.has(e.pointerId)) return
    d.pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (d.pts.size === 2 && d.dist) {
      const [a, b] = [...d.pts.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      zoom(d.dist / dist)
      d.dist = dist
      return
    }
    const { dx, dy } = toSvg(e.clientX - d.x, e.clientY - d.y)
    setVb({ ...d.vb, x: d.vb.x - dx, y: d.vb.y - dy })
  }
  const onUp = (e: React.PointerEvent) => {
    drag.current?.pts.delete(e.pointerId)
    if (!drag.current?.pts.size) drag.current = null
    else drag.current = { ...drag.current, x: [...drag.current.pts.values()][0].x, y: [...drag.current.pts.values()][0].y, vb, dist: undefined }
  }
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zoom(e.deltaY > 0 ? 1.15 : 0.87, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height)
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  })

  // ---- labels with collision avoidance (markers first, then cities, mountains, regions, water) ----
  const layout = useMemo(() => {
    if (!proj) return { labels: [], markerLabels: [] }
    const unit = 1 / Math.max(pxPerUnit, 0.01) // map units per screen pixel
    const fsMarker = 13 * unit
    const placed: Box[] = []
    const visible = (x: number, y: number) => x > vb.x - 5 && x < vb.x + vb.w + 5 && y > vb.y - 5 && y < vb.y + vb.h + 5
    const charW = 0.56
    // keep labels inside the view and clear of the on-map controls (sizes in screen px)
    const W = vb.w / unit
    const H = vb.h / unit
    const ui: Box[] = [
      [0, 0, 124, 50], // Then / Now
      [W - 52, 0, 52, 132], // zoom tools
      [W - 48, H - 86, 48, 86], // north arrow
      [W - 300, H - 18, 300, 18], // credit line
      [0, H - 40, 112, 40], // scale bar
    ].map(([x, y, w, h]) => ({ x: vb.x + x * unit, y: vb.y + y * unit, w: w * unit, h: h * unit }))
    placed.push(...ui)
    const pad = 3 * unit
    const inside = (b: Box) => b.x >= vb.x + pad && b.y >= vb.y + pad && b.x + b.w <= vb.x + vb.w - pad && b.y + b.h <= vb.y + vb.h - pad
    const free = (b: Box) => inside(b) && !placed.some((p) => overlaps(p, b))

    const dots = markers.map((m) => {
      const [x, y] = proj(m.lon, m.lat)
      const r = (m.big ? 7 : 4.5) * unit * (m.focus ? 1.4 : 1)
      return { x, y, r }
    })
    // every dot is an obstacle before any label is placed, so names never sit under a neighbour's dot
    for (const d of dots) placed.push({ x: d.x - d.r, y: d.y - d.r, w: 2 * d.r, h: 2 * d.r })
    // label priority: the focused place, big markers, well-known cities, then the rest in route order
    const famous = new Set(MAP_LABELS.filter((l) => l.kind === 'city').map((l) => l.then.toLowerCase()))
    const rank = (m: Marker) => (m.focus ? 0 : m.big ? 1 : famous.has(String(m.name).replace(/^\d+\.\s*/, '').toLowerCase()) ? 2 : 3)
    const order0 = markers.map((_, i) => i).sort((a, b) => rank(markers[a]) - rank(markers[b]) || a - b)
    const spots = new Map<number, Box | undefined>()
    const leaders = new Map<number, Box>()
    for (const i of order0) {
      const m = markers[i]
      const { x, y, r } = dots[i]
      const text = m.label === '' ? '' : now ? m.modern || m.name : m.label ?? m.name
      const fs = m.focus ? fsMarker * 1.2 : fsMarker
      const w = text.length * fs * charW
      const h = fs * 1.1
      const g = r * 1.5
      const tries: Box[] = [
        { x: x + g, y: y - h * 0.62, w, h },
        { x: x - g - w, y: y - h * 0.62, w, h },
        { x: x - w / 2, y: y - r - h * 1.1, w, h },
        { x: x - w / 2, y: y + r + fs * 0.1, w, h },
        { x: x + g * 0.8, y: y - r - h * 0.9, w, h },
        { x: x + g * 0.8, y: y + r * 0.6, w, h },
        { x: x - g * 0.8 - w, y: y - r - h * 0.9, w, h },
        { x: x - g * 0.8 - w, y: y + r * 0.6, w, h },
      ]
      // crowded spot: try a little further out and draw a thin leader line back to the dot
      for (const d of [20, 34].map((n) => n * unit))
        for (const [ax, ay] of [[1, -1], [-1, -1], [1, 1], [-1, 1], [1, 0], [-1, 0], [0, -1], [0, 1]]) {
          const cx = x + ax * (r + d)
          const cy = y + ay * (r + d * 0.7)
          tries.push({ x: ax > 0 ? cx : ax < 0 ? cx - w : cx - w / 2, y: ay > 0 ? cy : ay < 0 ? cy - h : cy - h / 2, w, h })
        }
      const k = text ? tries.findIndex(free) : -1
      const spot = k >= 0 ? tries[k] : undefined
      if (spot) placed.push(spot)
      spots.set(i, spot)
      if (spot && k >= 8) leaders.set(i, spot)
    }
    const markerLabels = markers.map((m, i) => {
      const { x, y, r } = dots[i]
      const text = m.label === '' ? '' : now ? m.modern || m.name : m.label ?? m.name
      const fs = m.focus ? fsMarker * 1.2 : fsMarker
      const lb = leaders.get(i)
      // leader runs from the dot's edge to the nearest point on the label box
      const lead = lb && (() => {
        const tx = Math.min(Math.max(x, lb.x), lb.x + lb.w)
        const ty = Math.min(Math.max(y, lb.y + lb.h * 0.2), lb.y + lb.h * 0.8)
        const len = Math.hypot(tx - x, ty - y) || 1
        return { x1: x + ((tx - x) / len) * r, y1: y + ((ty - y) / len) * r, x2: tx, y2: ty }
      })()
      return { i, x, y, r, fs, text, spot: spots.get(i), lead }
    })

    const vw = vb.w
    const markerNames = new Set(markers.flatMap((m) => [m.name, m.label].filter(Boolean)).map((s) => String(s).replace(/^\d+\.\s*/, '').toLowerCase()))
    const order: Record<string, number> = { city: 0, mount: 1, region: 2, water: 3 }
    const labels = MAP_LABELS.filter((l) => (l.minW === undefined || vw >= l.minW) && (l.maxW === undefined || vw <= l.maxW))
      .filter((l) => !(l.kind === 'city' && markerNames.has(l.then.toLowerCase())))
      .sort((a, b) => order[a.kind] - order[b.kind])
      .map((l) => {
        const [x, y] = proj(l.lon, l.lat)
        if (!visible(x, y)) return null
        const text = now ? l.now ?? l.then : l.then
        if (now && l.kind === 'region') return null // modern country names are shown instead
        const fs = (l.kind === 'region' ? 11.5 : l.kind === 'water' ? 12 : 11) * unit
        const w = text.length * fs * (l.kind === 'region' ? 0.92 : l.kind === 'water' && text === text.toUpperCase() ? 1.0 : charW)
        const box: Box = l.rotate ? { x: x - fs, y: y - fs, w: 2 * fs, h: 2 * fs } : l.kind === 'city' || l.kind === 'mount' ? { x: x + 5 * unit, y: y - fs * 0.7, w, h: fs * 1.1 } : { x: x - w / 2, y: y - fs * 0.8, w, h: fs * 1.1 }
        let dx = 0
        if (l.kind === 'water' && !l.rotate) {
          // a sea is wide: slide its name inward rather than clip it at the edge
          const lo = vb.x + pad - box.x
          const hi = vb.x + vb.w - pad - (box.x + box.w)
          if (lo > 0) dx = lo
          else if (hi < 0) dx = hi
          if (lo > 0 && hi < 0) return null
          box.x += dx
        }
        if (!free(box)) return null
        placed.push(box)
        return { l, x: x + dx, y, fs, text }
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
    return { labels, markerLabels }
  }, [proj, markers, now, vb, pxPerUnit])

  if (!base || !proj) return <div className="spinner" />
  const unit = 1 / Math.max(pxPerUnit, 0.01)
  const dark = document.documentElement.dataset.mode === 'dark'
  const ink = dark ? '#f4efe4' : '#2b2216'
  const halo = dark ? '#1b1d1b' : '#fbf6ea'
  const pts = markers.map((m) => proj(m.lon, m.lat))
  const img = (r: Relief['region'], key: string, file: string, feather = false) => {
    const [x0, y0] = proj(r.bbox[0], r.bbox[3])
    const [x1, y1] = proj(r.bbox[2], r.bbox[1])
    return (
      <image
        key={key}
        href={dataUrl(`geo/${file}`)}
        x={x0}
        y={y0}
        width={x1 - x0}
        height={y1 - y0}
        preserveAspectRatio="none"
        mask={feather ? 'url(#hl-feather)' : undefined}
        style={{ filter: dark ? 'brightness(.74) saturate(.85)' : undefined }}
      />
    )
  }

  // scale bar: pick a round distance about 90px long
  const centerLat = base.bbox[3] - ((vb.y + vb.h / 2) / base.h) * (base.bbox[3] - base.bbox[1])
  const kmPerUnit = ((base.bbox[2] - base.bbox[0]) / base.w) * 111.32 * Math.cos((centerLat * Math.PI) / 180)
  const kmFor90 = 90 * unit * kmPerUnit
  const nice = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find((n) => n >= kmFor90 * 0.6) ?? 1000
  const barPx = nice / kmPerUnit / unit
  const hl = relief?.holyland
  const [hx0, hy0] = hl ? proj(hl.bbox[0], hl.bbox[3]) : [0, 0]
  const [hx1, hy1] = hl ? proj(hl.bbox[2], hl.bbox[1]) : [0, 0]

  return (
    <div className="map-wrap atlas">
      <svg
        ref={svgRef}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        style={{ aspectRatio: `${vb.w} / ${vb.h}`, maxHeight: height }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        role="img"
        aria-label="Map"
      >
        <defs>
          <filter id="hl-blur" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation={(hx1 - hx0) * 0.025} />
          </filter>
          <mask id="hl-feather" maskUnits="userSpaceOnUse" x={hx0} y={hy0} width={hx1 - hx0} height={hy1 - hy0}>
            <rect x={hx0 + (hx1 - hx0) * 0.05} y={hy0 + (hy1 - hy0) * 0.04} width={(hx1 - hx0) * 0.9} height={(hy1 - hy0) * 0.92} fill="#fff" filter="url(#hl-blur)" />
          </mask>
          <marker id="route-arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill={dark ? '#e4b866' : '#9b2c1f'} />
          </marker>
        </defs>
        <rect x={-2000} y={-2000} width={base.w + 4000} height={base.h + 4000} fill={dark ? SEA_DARK : SEA} />
        {relief ? (
          <>
            {img(relief.region, 'r', 'relief-region.webp')}
            {vb.w < 520 && img(relief.holyland, 'h', 'relief-holyland.webp', true)}
          </>
        ) : (
          base.countries.map((c) => <path key={c.n} d={c.d} fill={dark ? '#3a3a30' : '#e9dcb8'} />)
        )}
        {now &&
          base.countries.map((c) => (
            <g key={c.n}>
              <path d={c.d} fill="none" stroke={dark ? '#000' : '#fff'} strokeOpacity={0.7} strokeWidth={3.2 * unit} />
              <path d={c.d} fill="none" stroke={dark ? '#c9b98f' : '#7d5b8f'} strokeWidth={1.2 * unit} strokeDasharray={`${5 * unit} ${2.5 * unit}`} />
            </g>
          ))}
        {now &&
          base.countries.map((c) => {
            const fs = 11 * unit
            return (
              <text key={c.n + 't'} x={c.lx} y={c.ly} fontSize={fs} textAnchor="middle" fill={dark ? '#d8cfe0' : '#5e3f70'} stroke={halo} strokeWidth={fs / 4} paintOrder="stroke" fontFamily="var(--sans)" fontWeight={600} letterSpacing="0.08em" style={{ textTransform: 'uppercase', pointerEvents: 'none' }}>
                {c.n}
              </text>
            )
          })}

        {/* background labels */}
        {layout.labels.map(({ l, x, y, fs, text }, k) => {
          const common = { stroke: halo, strokeWidth: fs / 4, paintOrder: 'stroke' as const, style: { pointerEvents: l.ref ? ('auto' as const) : ('none' as const), cursor: l.ref ? 'pointer' : undefined } }
          const open = (e: React.MouseEvent) => {
            if (!l.ref) return
            e.stopPropagation()
            const r = (e.currentTarget as Element).getBoundingClientRect()
            openPopup({ kind: 'ref', ref: l.ref, x: r.left, y: r.bottom + 6 })
          }
          if (l.kind === 'water')
            return (
              <text key={k} data-label x={x} y={y} fontSize={fs} textAnchor="middle" fill={dark ? '#a8d0ee' : '#1f5d8c'} fontFamily="var(--serif)" fontStyle="italic" letterSpacing={text === text.toUpperCase() ? '0.25em' : '0.04em'} transform={l.rotate ? `rotate(${l.rotate} ${x} ${y})` : undefined} onClick={open} {...common}>
                <title>{l.ref ? `${text} — ${formatRef(l.ref)}` : text}</title>
                {text}
              </text>
            )
          if (l.kind === 'region')
            return (
              <text key={k} data-label x={x} y={y} fontSize={fs} textAnchor="middle" fill={dark ? '#e7c98f' : '#7a4a1e'} fillOpacity={0.85} fontFamily="var(--display)" letterSpacing="0.22em" onClick={open} {...common}>
                {text}
              </text>
            )
          if (l.kind === 'mount')
            return (
              <g key={k} data-label onClick={open} style={common.style}>
                <title>{l.ref ? `${text} — ${formatRef(l.ref)}` : text}</title>
                <path d={`M${x - 4 * unit} ${y + 3 * unit} L${x} ${y - 4 * unit} L${x + 4 * unit} ${y + 3 * unit} Z`} fill={dark ? '#e7d3a8' : '#5b3b1c'} stroke={halo} strokeWidth={unit} />
                <text x={x + 6 * unit} y={y + fs * 0.35} fontSize={fs} fill={dark ? '#f1e3c4' : '#4a2f15'} fontFamily="var(--serif)" fontStyle="italic" stroke={halo} strokeWidth={fs / 4} paintOrder="stroke">
                  {text}
                </text>
              </g>
            )
          return (
            <g key={k} data-label onClick={open} style={common.style}>
              <title>{l.ref ? `${text} — ${formatRef(l.ref)}` : text}</title>
              <rect x={x - 2.6 * unit} y={y - 2.6 * unit} width={5.2 * unit} height={5.2 * unit} fill={dark ? '#eee' : '#2b2216'} stroke={halo} strokeWidth={unit} />
              <text x={x + 5 * unit} y={y + fs * 0.35} fontSize={fs} fill={ink} fontFamily="var(--serif)" stroke={halo} strokeWidth={fs / 4} paintOrder="stroke">
                {text}
              </text>
            </g>
          )
        })}

        {/* journey */}
        {route && pts.length > 1 && (
          <>
            <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={halo} strokeOpacity={0.85} strokeWidth={5 * unit} strokeLinejoin="round" />
            {pts.slice(1).map((p, i) => (
              <line
                key={i}
                x1={pts[i][0]}
                y1={pts[i][1]}
                x2={p[0]}
                y2={p[1]}
                stroke={dark ? '#e4b866' : '#9b2c1f'}
                strokeWidth={2.4 * unit}
                strokeDasharray={`${7 * unit} ${4 * unit}`}
                markerEnd="url(#route-arrow)"
              />
            ))}
          </>
        )}

        {/* leader lines for labels moved off a crowded dot */}
        {layout.markerLabels.map(({ i, lead }) => lead && <line key={`lead-${i}`} {...lead} stroke={ink} strokeOpacity={0.7} strokeWidth={1.1 * unit} />)}

        {/* markers */}
        {layout.markerLabels.map(({ i, x, y, r, fs, text, spot }) => {
          const m = markers[i]
          return (
            <g key={`${m.name}-${i}`}>
              <circle cx={x} cy={y} r={r} fill={m.color ?? (m.focus ? '#c0392b' : dark ? '#e4b866' : '#8a1f12')} stroke="#fff" strokeWidth={r / 2.6} opacity={m.big ? 0.9 : 1} />
              {spot && (
                <text x={spot.x} y={spot.y + fs * 0.85} fontSize={fs} fill={ink} stroke={halo} strokeWidth={fs / 4} paintOrder="stroke" fontFamily="var(--serif)" fontWeight={m.focus || m.big ? 700 : 600} style={{ pointerEvents: 'none' }}>
                  {text}
                </text>
              )}
              {!spot && text && <title>{text}</title>}
            </g>
          )
        })}
      </svg>

      <div className="map-mode">
        <div className="seg">
          <button onClick={() => setNow(false)} style={!now ? { background: 'var(--accent)', color: '#fff' } : undefined}>
            Then
          </button>
          <button onClick={() => setNow(true)} style={now ? { background: 'var(--accent)', color: '#fff' } : undefined}>
            Now
          </button>
        </div>
      </div>
      <div className="map-tools">
        <button onClick={() => zoom(0.75)} aria-label="Zoom in">+</button>
        <button onClick={() => zoom(1.33)} aria-label="Zoom out">−</button>
        <button onClick={() => setVb(initial)} aria-label="Reset map" style={{ fontSize: 13 }}>⟲</button>
      </div>
      <div className="map-legend" aria-hidden="true">
        <svg width="26" height="30" viewBox="0 0 26 30">
          <path d="M13 2 L19 16 L13 13 L7 16 Z" fill={ink} />
          <path d="M13 13 L19 16 L13 28 L7 16 Z" fill="none" stroke={ink} strokeWidth="1.2" />
        </svg>
        <span style={{ fontWeight: 700, fontSize: 11, marginTop: -4 }}>N</span>
      </div>
      <div className="map-scale" aria-label={`Scale: ${nice} km`}>
        <div style={{ width: Math.round(barPx) }} />
        <span>
          {nice} km · {Math.round(nice * 0.621)} mi
        </span>
      </div>
      <div className="map-credit">Relief: Natural Earth, Mapzen/AWS Terrain Tiles · Places: OpenBible.info</div>
    </div>
  )
}
