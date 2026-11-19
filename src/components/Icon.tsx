const PATHS: Record<string, string> = {
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7',
  stop: 'M7 7h10v10H7z',
  play: 'M8 5.5v13l11-6.5z',
  pause: 'M8.5 5v14M15.5 5v14',
  headphones: 'M4 16v-4a8 8 0 0 1 16 0v4M4 15.5A1.5 1.5 0 0 1 5.5 14H8v7H5.5A1.5 1.5 0 0 1 4 19.5v-4zM20 15.5a1.5 1.5 0 0 0-1.5-1.5H16v7h2.5a1.5 1.5 0 0 0 1.5-1.5v-4z',
  prevVerse: 'M17 6l-8 6 8 6V6zM7 6v12',
  nextVerse: 'M7 6l8 6-8 6V6zM17 6v12',
  autoscroll: 'M5 4h11M5 8h11M5 12h7M17 11v9M14 17l3 3 3-3',
  slower: 'M5 12h14',
  faster: 'M12 5v14M5 12h14',
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
  up: 'M6 15l6-6 6 6',
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
  share: 'M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7',
  more: 'M12 5h.01M12 12h.01M12 19h.01',
  pray: 'M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.2a4.2 4.2 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z',
  calendar: 'M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-12zM4 10h16M8 3v4M16 3v4',
  external: 'M14 4h6v6M20 4l-9 9M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10',
}

export function Icon({ name, size = 20, stroke = 1.8, fill }: { name: string; size?: number; stroke?: number; fill?: boolean }) {
  return (
    <svg width={size} height={size} style={{ width: `calc(${size}px * (0.5 + var(--ui, 1) / 2))`, height: `calc(${size}px * (0.5 + var(--ui, 1) / 2))` }} viewBox="0 0 24 24" aria-hidden="true" focusable="false"
      fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[name] ?? PATHS.help} />
    </svg>
  )
}

/** The app mark: a gold cross over an open Bible, with a soft glow. */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id="lg-gold" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#fff5cc" />
          <stop offset="0.35" stopColor="#f1d27a" />
          <stop offset="0.6" stopColor="#c08c31" />
          <stop offset="0.8" stopColor="#f0d488" />
          <stop offset="1" stopColor="#97681f" />
        </linearGradient>
        <linearGradient id="lg-gold-v" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#f9e6a2" />
          <stop offset="0.55" stopColor="#d4a442" />
          <stop offset="1" stopColor="#8a5d1c" />
        </linearGradient>
        <linearGradient id="lg-page" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fffbf0" />
          <stop offset="1" stopColor="#ead9b0" />
        </linearGradient>
        <radialGradient id="lg-glow">
          <stop offset="0" stopColor="#ffe9a8" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffe9a8" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="21" r="21" fill="url(#lg-glow)" />
      <path d="M29 2.5h6v11h9.5v6H35V38h-6V19.5h-9.5v-6H29z" fill="url(#lg-gold)" stroke="#5f400f" strokeWidth="0.9" strokeLinejoin="round" />
      <path d="M2.5 38.5c10-4 20-3.6 29.5 2 9.5-5.6 19.5-6 29.5-2v17.5c-10-3.6-20-3-29.5 2.2-9.5-5.2-19.5-5.8-29.5-2.2z" fill="url(#lg-gold-v)" stroke="#5a3c0e" strokeWidth="0.9" strokeLinejoin="round" />
      <path d="M6 36.5c9-3.6 18-3 26 2.2v17c-8-4.6-17-5.2-26-2z" fill="url(#lg-page)" stroke="#9c7633" strokeWidth="0.7" />
      <path d="M58 36.5c-9-3.6-18-3-26 2.2v17c8-4.6 17-5.2 26-2z" fill="url(#lg-page)" stroke="#9c7633" strokeWidth="0.7" />
      <path d="M10 41.5c5.5-1.6 11-1.3 17 1.2M10 45.5c5.5-1.6 11-1.3 17 1.2M10 49.5c5.5-1.6 11-1.3 17 1.2M54 41.5c-5.5-1.6-11-1.3-17 1.2M54 45.5c-5.5-1.6-11-1.3-17 1.2M54 49.5c-5.5-1.6-11-1.3-17 1.2" stroke="#b9a172" strokeWidth="1" fill="none" />
      <path d="M32 38.7v17" stroke="#7d5a1e" strokeWidth="1.1" />
    </svg>
  )
}

/** Printer's flourish under the book name. */
export function Ornament({ width = 340 }: { width?: number }) {
  return (
    <svg className="ornament" width={width} height="24" viewBox="0 0 340 24" aria-hidden="true">
      <g fill="currentColor">
        <path d="M134 11.1 4 12l130 0.9z" />
        <path d="M206 11.1 336 12l-130 0.9z" />
        <circle cx="3" cy="12" r="1.4" />
        <circle cx="337" cy="12" r="1.4" />
        <path d="M170 4.5 176.5 12 170 19.5 163.5 12z" />
        <circle cx="156" cy="12" r="1.7" />
        <circle cx="184" cy="12" r="1.7" />
      </g>
      <g fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
        <path d="M178 12c7-8 19-8.5 21.5-2.5 2 5-4.5 7.5-7.5 3.5-1.8-2.5 1.2-4.6 3.3-3" />
        <path d="M162 12c-7-8-19-8.5-21.5-2.5-2 5 4.5 7.5 7.5 3.5 1.8-2.5-1.2-4.6-3.3-3" />
        <path d="M178 12c9 6.5 22 7 30 0" />
        <path d="M162 12c-9 6.5-22 7-30 0" />
      </g>
    </svg>
  )
}
