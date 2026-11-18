import { useEffect, useMemo, useRef, useState } from 'react'
import { getJSON } from '../lib/data'

interface Basemap {
  w: number
  h: number
  bbox: [number, number, number, number]
  countries: { n: string; d: string; lx: number; ly: number }[]
  lakes: { n: string; d: string }[]
  rivers: { n: string; d: string }[]
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

/** Pan & zoom map of the Bible lands with a "Then" (ancient names) / "Now" (modern borders & names) switch. */
export function MapView({ markers, route, bounds, height }: { markers: Marker[]; route?: boolean; bounds?: [number, number, number, number]; height?: number }) {
  const [base, setBase] = useState<Basemap | null>(null)
  const [now, setNow] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)
  useEffect(() => {
    basemapP ??= getJSON<Basemap>('geo/basemap.json')
    basemapP.then(setBase)
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
    let w = Math.max(x1 - x0, 50) * 1.35
    let h = Math.max(y1 - y0, 40) * 1.35
    if (w / h < aspect) w = h * aspect
    else h = w / aspect
    return { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h / 2, w, h }
  }, [base, proj, markers, bounds, height])

  const [vb, setVb] = useState(initial)
  useEffect(() => setVb(initial), [initial])

  // drag / pinch / wheel
  const drag = useRef<{ x: number; y: number; vb: typeof vb; pts: Map<number, { x: number; y: number }>; dist?: number } | null>(null)
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

  if (!base || !proj) return <div className="spinner" />
  const fs = vb.w / 55
  const pts = markers.map((m) => ({ ...m, p: proj(m.lon, m.lat) }))
  const dark = document.documentElement.dataset.mode === 'dark'
  const land = dark ? '#3a3a30' : now ? '#efe6cf' : '#e9dcb8'
  const border = dark ? '#6c6a5a' : '#b8a57a'
  const water = dark ? '#28465a' : '#9cc3d6'
  const ink = dark ? '#eee' : '#2d2416'

  return (
    <div className="map-wrap">
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
        <rect x={-500} y={-500} width={base.w + 1000} height={base.h + 1000} fill={dark ? '#1c2a30' : '#cfe0e6'} />
        {base.countries.map((c) => (
          <path key={c.n} d={c.d} fill={land} stroke={now ? border : land} strokeWidth={now ? vb.w / 900 : vb.w / 1200} />
        ))}
        {base.lakes.map((l, i) => (
          <path key={i} d={l.d} fill={water} stroke="none" />
        ))}
        {base.rivers.map((r, i) => (
          <path key={i} d={r.d} fill="none" stroke={water} strokeWidth={Math.max(vb.w / 700, 0.4)} />
        ))}
        {now &&
          base.countries.map((c) => (
            <text key={c.n} x={c.lx} y={c.ly} fontSize={fs * 1.05} textAnchor="middle" fill={dark ? '#aaa' : '#8a7a58'} fontFamily="var(--sans)" letterSpacing="0.08em" style={{ textTransform: 'uppercase', pointerEvents: 'none' }}>
              {c.n}
            </text>
          ))}
        {route && pts.length > 1 && (
          <polyline
            points={pts.map((m) => m.p.join(',')).join(' ')}
            fill="none"
            stroke={dark ? '#e4b866' : '#9b2c1f'}
            strokeWidth={vb.w / 320}
            strokeDasharray={`${vb.w / 90} ${vb.w / 160}`}
            strokeLinejoin="round"
          />
        )}
        {pts.map((m, i) => {
          const r = (m.big ? vb.w / 90 : vb.w / 150) * (m.focus ? 1.5 : 1)
          const label = now ? m.modern || m.name : m.label ?? m.name
          return (
            <g key={`${m.name}-${i}`}>
              <circle cx={m.p[0]} cy={m.p[1]} r={r} fill={m.color ?? (m.focus ? '#c0392b' : dark ? '#e4b866' : '#7a2d1a')} stroke="#fff" strokeWidth={r / 3} opacity={m.big ? 0.85 : 1} />
              <text
                x={m.p[0] + r * 1.6}
                y={m.p[1] + fs * 0.35}
                fontSize={m.focus ? fs * 1.25 : fs}
                fill={ink}
                stroke={dark ? '#1c1e1d' : '#fbf6ea'}
                strokeWidth={fs / 5}
                paintOrder="stroke"
                fontFamily="var(--serif)"
                fontWeight={m.focus || m.big ? 700 : 500}
                style={{ pointerEvents: 'none' }}
              >
                {label}
              </text>
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
    </div>
  )
}
