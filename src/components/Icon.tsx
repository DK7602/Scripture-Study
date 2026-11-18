const PATHS: Record<string, string> = {
  book: 'M3 5.5C5.5 4 8.5 4 12 6c3.5-2 6.5-2 9-.5V19c-2.5-1.5-5.5-1.5-9 .5-3.5-2-6.5-2-9-.5V5.5zM12 6v13.5',
  study: 'M4 6.5 12 3l8 3.5-8 3.5-8-3.5zM4 11l8 3.5 8-3.5M4 15.5 12 19l8-3.5',
  map: 'M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5L9 4zM9 4v13.5M15 6.5V20',
  pin: 'M12 21s-6.5-6.2-6.5-11A6.5 6.5 0 0 1 18.5 10c0 4.8-6.5 11-6.5 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  note: 'M5 4h10l4 4v12H5V4zM15 4v4h4M8 12h8M8 16h6',
  journal: 'M6 3h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6V3zM6 3H5v18h1M9 7h7M9 11h7',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5 21 21',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13.5l1.6 1.2-2 3.4-1.9-.7a7 7 0 0 1-2 1.2L14.8 21h-4l-.3-2.4a7 7 0 0 1-2-1.2l-1.9.7-2-3.4 1.6-1.2a7 7 0 0 1 0-2.4L4.6 9.9l2-3.4 1.9.7a7 7 0 0 1 2-1.2L10.8 3.6h4l.3 2.4a7 7 0 0 1 2 1.2l1.9-.7 2 3.4-1.6 1.2a7 7 0 0 1 0 2.4z',
  menu: 'M4 7h16M4 12h16M4 17h16',
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  down: 'M6 9l6 6 6-6',
  close: 'M6 6l12 12M18 6 6 18',
  pencil: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4',
  marker: 'M15 4l5 5-8 8H7v-5l8-8zM7 17l-3 3h6M12 7l5 5',
  bookmark: 'M7 3h10v18l-5-4-5 4V3z',
  bookmarkFill: 'M7 3h10v18l-5-4-5 4V3z',
  plus: 'M12 5v14M5 12h14',
  trash: 'M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  edit: 'M4 20h4L19 9l-4-4L4 16v4z',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  panel: 'M4 5h16v14H4V5zM14 5v14',
  collapse: 'M6 6l6 6-6 6M12 6l6 6-6 6',
  expand: 'M18 6l-6 6 6 6M12 6l-6 6 6 6',
  sort: 'M7 4v16M4 17l3 3 3-3M17 20V4M14 7l3-3 3 3',
  check: 'M5 12.5 10 17l9-10',
  copy: 'M8 8h11v12H8V8zM5 16V4h11',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z',
  chart: 'M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-8',
  layout: 'M4 4h16v16H4V4zM4 10h16M10 10v10',
  crown: 'M4 18h16l1-10-5 4-4-7-4 7-5-4 1 10z',
  scroll: 'M7 4h11a2 2 0 0 1 0 4H7M7 4a2 2 0 0 0 0 4v10a2 2 0 0 0 2 2h10a2 2 0 0 0 0-4H9',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.1',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
  font: 'M4 19 9 5h1l5 14M6 14h7M15 19l3-8 3 8M16 16.5h4',
  cross: 'M12 3v18M7 8h10',
  quote: 'M7 7h4v4c0 3-1.5 5-4 6M14 7h4v4c0 3-1.5 5-4 6',
}

export function Icon({ name, size = 20, stroke = 1.8, fill }: { name: string; size?: number; stroke?: number; fill?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false"
      fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[name] ?? PATHS.help} />
    </svg>
  )
}

/** The app mark: an open Bible with a cross, in gold. */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="lg-gold" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#f6e3a1" />
          <stop offset="1" stopColor="#b8892c" />
        </linearGradient>
      </defs>
      <path d="M32 6v20M25 13h14" stroke="url(#lg-gold)" strokeWidth="5" strokeLinecap="round" />
      <path d="M6 30c9-4 18-3 26 3 8-6 17-7 26-3v22c-9-4-18-3-26 3-8-6-17-7-26-3V30z" fill="url(#lg-gold)" />
      <path d="M32 33v22M11 35c6-2 12-1.5 17 2M11 41c6-2 12-1.5 17 2M53 35c-6-2-12-1.5-17 2M53 41c-6-2-12-1.5-17 2" stroke="#7a5a1c" strokeWidth="1.6" fill="none" />
    </svg>
  )
}

export function Ornament({ width = 260 }: { width?: number }) {
  return (
    <svg className="ornament" width={width} height="14" viewBox="0 0 260 14" aria-hidden="true">
      <path d="M0 7h104M156 7h104" stroke="currentColor" strokeWidth="1.2" />
      <path d="M130 1l7 6-7 6-7-6 7-6z" fill="currentColor" />
      <path d="M104 7c6-6 12-6 16 0-4 6-10 6-16 0zM156 7c-6-6-12-6-16 0 4 6 10 6 16 0z" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}
