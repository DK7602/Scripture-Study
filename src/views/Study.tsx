import { useEffect, useMemo, useRef, useState } from 'react'
import { book, books, commentaryChapter, commentaryIndex, crossRefs } from '../lib/data'
import { formatRef, locString } from '../lib/refs'
import { getState, go, openPopup, updateSettings, useStore } from '../lib/store'
import { audioChapter, useAudioField } from '../lib/audio'
import type { CommentaryChapter, CommentaryInfo } from '../lib/types'
import { Icon } from '../components/Icon'
import { useCapsHtml } from '../lib/caps'
import { FathersPanel } from './History'
import { SpurgeonSermons, sermonsOn } from './SpurgeonSermons'
import { fathersChapters } from '../lib/history'
import { ui } from '../lib/ui'

interface Chip {
  id: string
  label: string
}

/** Commentary chips, in the order the reader asked for. */
export const CHIPS: Chip[] = [
  { id: 'henry', label: 'Henry' },
  { id: 'barnes', label: 'Barnes' },
  { id: 'calvin', label: 'Calvin' },
  { id: 'poole', label: 'Poole' },
  { id: 'gill', label: 'Gill' },
  { id: 'jfb', label: 'JFB' },
  { id: 'burkitt', label: 'Burkitt (NT)' },
  { id: 'kd', label: 'Keil & Delitzsch (OT)' },
  { id: 'lightfoot', label: 'Lightfoot (Gospels)' },
  { id: 'geneva', label: 'Geneva 1599' },
  { id: 'spurgeon', label: 'Spurgeon (Psalms)' },
  { id: 'sermons', label: 'Spurgeon sermons' },
  { id: 'fathers', label: 'Church Fathers' },
]

function clean(html: string): string {
  return html.replace(/<(a|span)\b([^>]*)>/gi, (_m, tag: string, attrs: string) => {
    const r = attrs.match(/data-r="([^"]*)"/)
    const c = attrs.match(/class="([\w\s-]*)"/)
    return `<${tag}${r ? ` data-r="${r[1]}"` : ''}${c ? ` class="${c[1]}"` : ''}>`
  })
}

export function StudyPanel() {
  const loc = useStore((s) => s.loc)
  const primary = useStore((s) => s.settings.primaryCommentary)
  const [cid, setCid] = useState(primary)
  const [index, setIndex] = useState<CommentaryInfo[]>([])
  const [follow, setFollow] = useState(true)
  // opening the Study page: the verse being read on the Bible page (scrolled to, or tapped), not only one gone to
  const audioVerse = useAudioField('verse')
  const audioPlaying = useAudioField('playing')
  const audioHere = () => {
    const c = audioChapter()
    return audioPlaying && audioVerse > 0 && !!c && c.book === loc.book && c.chapter === loc.chapter
  }
  const readingVerse = () => {
    if (audioHere()) return audioVerse // the audio Bible reading: the verse it is reading
    const r = getState().reading
    return r && r.book === loc.book && r.chapter === loc.chapter ? r.verse : loc.verse
  }
  const [view, setView] = useState(() => ({ book: loc.book, chapter: loc.chapter, verse: readingVerse() }))
  const opened = useRef(false)
  const [data, setData] = useState<CommentaryChapter | null | undefined>(undefined)
  const [intro, setIntro] = useState<string | null>(null)
  const [xref, setXref] = useState<Record<string, string[]>>({})
  const bodyRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState(false) // the round commentary button's menu
  const [fatherChs, setFatherChs] = useState<Record<string, number[]> | null>(null) // null: not known yet
  const [sermonChs, setSermonChs] = useState<{ book: string; chs: number[] } | null>(null)
  const capsHtml = useCapsHtml()
  const show = (html: string) => ({ __html: capsHtml(clean(html)) })

  useEffect(() => {
    commentaryIndex().then(setIndex)
  }, [])
  useEffect(() => setCid(primary), [primary])
  useEffect(() => {
    const first = !opened.current
    opened.current = true
    if (follow) setView({ book: loc.book, chapter: loc.chapter, verse: first ? readingVerse() : loc.verse })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.book, loc.chapter, loc.verse, follow])
  // while the audio Bible reads this chapter, the commentary keeps to the verse it is reading
  useEffect(() => {
    if (!follow || !audioHere()) return
    setView((v) => (v.book === loc.book && v.chapter === loc.chapter && v.verse === audioVerse ? v : { book: loc.book, chapter: loc.chapter, verse: audioVerse }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioVerse, audioPlaying, follow, loc.book, loc.chapter])

  // what each commentary has on the chapter in view: true, false, or undefined while that is still loading
  const avail = (id: string): boolean | undefined =>
    id === 'fathers'
      ? fatherChs
        ? !!fatherChs[view.book]?.includes(view.chapter)
        : undefined
      : id === 'sermons'
        ? sermonChs?.book === view.book
          ? sermonChs.chs.includes(view.chapter)
          : undefined
        : index.length
          ? !!index.find((x) => x.id === id)?.books[view.book]?.includes(view.chapter)
          : undefined
  const offered = CHIPS.filter((c) => avail(c.id) === true)
  // the one chosen, where it has notes on this chapter; elsewhere the primary commentary (the choice comes back with
  // the chapters it covers: Burkitt in the New Testament, say)
  const shown = avail(cid) === false ? (offered.find((c) => c.id === primary)?.id ?? offered[0]?.id ?? cid) : cid
  const info = index.find((c) => c.id === shown)
  const covered = info?.books[view.book]
  useEffect(() => {
    let live = true
    setData(undefined)
    setIntro(null)
    if (!info) return
    if (!covered?.includes(view.chapter)) {
      setData(null)
    } else commentaryChapter(shown, view.book, view.chapter).then((d) => live && setData(d))
    if (covered?.includes(0) && view.chapter === 1) commentaryChapter(shown, view.book, 0).then((d) => live && setIntro(d?.i ?? null))
    return () => {
      live = false
    }
  }, [shown, info, covered, view.book, view.chapter])
  useEffect(() => {
    crossRefs(view.book).then(setXref)
  }, [view.book])
  useEffect(() => {
    fathersChapters().then(setFatherChs)
  }, [])
  useEffect(() => {
    let live = true
    const b = view.book
    sermonsOn(b).then((x) => live && setSermonChs({ book: b, chs: Object.keys(x).map(Number) }))
    return () => {
      live = false
    }
  }, [view.book])
  useEffect(() => {
    if (!menu) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false)
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [menu])

  const pick = (id: string) => {
    setMenu(false)
    if (id !== shown) jump.current = true
    setCid(id)
    // to the top of the commentary (then to the note on this verse once it is loaded)
    contentRef.current?.scrollIntoView({ block: 'start' })
  }

  // swipe left or right across the commentary: the next (or previous) one with notes on this chapter, at this verse
  const rootRef = useRef<HTMLDivElement>(null)
  const swipeRef = useRef<HTMLDivElement>(null)
  const [flash, setFlash] = useState<{ label: string; n: number; of: number; key: number } | null>(null)
  const swipeTo = useRef<(dir: 1 | -1) => void>(() => {})
  swipeTo.current = (dir) => {
    if (offered.length < 2) return
    const at = offered.findIndex((c) => c.id === shown)
    const i = (at + dir + offered.length) % offered.length
    const next = offered[i]
    pick(next.id)
    setFlash({ label: next.label, n: i + 1, of: offered.length, key: Date.now() })
    swipeRef.current?.animate(
      [
        { transform: `translateX(${dir * 48}px)`, opacity: 0.25 },
        { transform: 'none', opacity: 1 },
      ],
      { duration: 240, easing: 'ease-out' },
    )
  }
  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 1300)
    return () => clearTimeout(t)
  }, [flash])
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    let on = false
    let sideways = false
    let x0 = 0
    let y0 = 0
    const area = () => swipeRef.current
    const reset = () => {
      const a = area()
      if (a) {
        a.style.transition = 'transform 0.18s ease-out, opacity 0.18s ease-out'
        a.style.transform = ''
        a.style.opacity = ''
      }
    }
    const start = (e: TouchEvent) => {
      on = false
      if (e.touches.length !== 1) return
      // not from the controls, a map or a table that scrolls sideways
      if ((e.target as HTMLElement).closest('input, textarea, select, button.pill, .map-wrap, .comm-fab, .chart, table, .pop')) return
      on = true
      sideways = false
      x0 = e.touches[0].clientX
      y0 = e.touches[0].clientY
    }
    const move = (e: TouchEvent) => {
      if (!on) return
      const dx = e.touches[0].clientX - x0
      const dy = e.touches[0].clientY - y0
      if (!sideways && Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) {
        on = false // scrolling up or down
        return
      }
      if (!sideways && Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 1.3) sideways = true
      const a = area()
      if (sideways && a) {
        a.style.transition = 'none'
        a.style.transform = `translateX(${dx * 0.35}px)`
        a.style.opacity = String(Math.max(0.45, 1 - Math.abs(dx) / 600))
      }
    }
    const end = (e: TouchEvent) => {
      if (!on) return
      on = false
      const dx = e.changedTouches[0].clientX - x0
      const dy = e.changedTouches[0].clientY - y0
      reset()
      if (sideways && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) swipeTo.current(dx < 0 ? 1 : -1)
    }
    const cancel = () => {
      on = false
      reset()
    }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: true })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', cancel)
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', cancel)
    }
  }, [])
  const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

  // the note on this verse: the closest-fitting one where an overview of a passage is followed by notes on its verses
  const current = useMemo(() => {
    let best = -1
    data?.e?.forEach(([a, z], i) => {
      if (view.verse >= a && view.verse <= z && (best < 0 || z - a < data.e![best][1] - data.e![best][0])) best = i
    })
    return best
  }, [data, view.verse])
  // to the note on this verse: at once after changing commentary, smoothly when stepping verse by verse
  const jump = useRef(false)
  useEffect(() => {
    const el = bodyRef.current?.querySelector('.comm-entry.current') as HTMLElement | null
    if (!el) return
    el.scrollIntoView({ block: 'start', behavior: jump.current ? ('instant' as ScrollBehavior) : 'smooth' })
    jump.current = false
  }, [current, data])

  const onClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a[data-r]') as HTMLElement | null
    if (!a) return
    e.preventDefault()
    const r = a.getBoundingClientRect()
    openPopup({ kind: 'ref', ref: a.dataset.r!, x: r.left, y: r.bottom + 6 })
  }

  const stepVerse = (d: number) => {
    setFollow(false)
    const b = book(view.book)
    let { chapter, verse } = view
    verse += d
    if (verse < 1) {
      if (chapter > 1) {
        chapter -= 1
        verse = b.v[chapter - 1]
      } else verse = 1
    } else if (verse > b.v[chapter - 1]) {
      if (chapter < b.v.length) {
        chapter += 1
        verse = 1
      } else verse = b.v[chapter - 1]
    }
    setView({ ...view, chapter, verse })
  }

  const refs = xref[`${view.chapter}:${view.verse}`] ?? []

  return (
    <div ref={rootRef}>
      <div className="section-title">
        <Icon name="book" /> Commentaries
      </div>
      <div className="pills" role="tablist" aria-label="Commentaries">
        {CHIPS.filter((c) => avail(c.id) === true || c.id === shown).map((c) => (
          <button key={c.id} className="pill" aria-pressed={shown === c.id} onClick={() => setCid(c.id)} title={index.find((x) => x.id === c.id)?.name ?? (c.id === 'sermons' ? 'Spurgeon’s sermons, by their texts' : 'Church Fathers')}>
            {c.label}
          </button>
        ))}
      </div>
      {touch && offered.length > 1 && <p className="faint small swipe-hint">Swipe left or right across a commentary for the next one, at the same verse.</p>}

      <div className="refnav">
        <button className="icon-btn" onClick={() => stepVerse(-1)} aria-label="Previous verse">
          <Icon name="left" />
        </button>
        <span className="refbadge">{locString(view.book, view.chapter, view.verse)}</span>
        <button className="icon-btn" onClick={() => stepVerse(1)} aria-label="Next verse">
          <Icon name="right" />
        </button>
      </div>
      <div className="row" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <select className="select" style={{ fontSize: ui(15), flex: '1 1 140px' }} value={view.book} aria-label="Commentary book" onChange={(e) => { setFollow(false); setView({ book: e.target.value, chapter: 1, verse: 1 }) }}>
          {books().map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <select className="select" style={{ fontSize: ui(15), flex: '0 1 110px' }} value={view.chapter} aria-label="Commentary chapter" onChange={(e) => { setFollow(false); setView({ ...view, chapter: +e.target.value, verse: 1 }) }}>
          {book(view.book).v.map((_, i) => (
            <option key={i} value={i + 1}>Ch. {i + 1}</option>
          ))}
        </select>
        {follow ? (
          <span className="faint small">Following the Bible tab</span>
        ) : (
          <>
            <button className="btn small" onClick={() => setFollow(true)}>
              <Icon name="link" size={14} /> Follow Bible
            </button>
            <button className="btn small" onClick={() => go({ ...view }, { tab: window.innerWidth < 900 ? 'bible' : undefined })}>
              Open in Bible
            </button>
          </>
        )}
      </div>

      <div ref={contentRef} className="comm-anchor" />
      {flash && (
        <div key={flash.key} className="swipe-flash" role="status">
          {flash.label} <span>
            {flash.n} of {flash.of}
          </span>
        </div>
      )}
      <div ref={swipeRef} className="swipe-area">
      {shown === 'fathers' ? (
        <FathersPanel bookId={view.book} chapter={view.chapter} verse={view.verse} onVerse={(v) => setView({ ...view, verse: v })} />
      ) : shown === 'sermons' ? (
        <SpurgeonSermons
          bookId={view.book}
          chapter={view.chapter}
          verse={view.verse}
          onGo={(chapter, verse) => {
            setFollow(false)
            setView({ ...view, chapter, verse })
          }}
          onRefClick={onClick}
          show={show}
        />
      ) : (
        <div className="commentary" ref={bodyRef} onClick={onClick}>
          <h3>{info?.name ?? ''}</h3>
          {info && primary !== shown && (
            <button className="btn small" style={{ marginBottom: 8 }} onClick={() => updateSettings({ primaryCommentary: shown })}>
              Make {CHIPS.find((c) => c.id === shown)?.label} my primary commentary
            </button>
          )}
          {data === undefined && info && <div className="spinner" />}
          {data === null && info && (
            <p className="empty">
              {info.name} {Object.keys(info.books).length < 66 ? `covers ${describeCoverage(info)}` : 'has no notes on this chapter'}.{' '}
              {!covered && 'Try Matthew Henry or JFB, which cover every book.'}
            </p>
          )}
          {intro && (
            <div className="comm-entry">
              <div className="range">Introduction to {book(view.book).name}</div>
              <div dangerouslySetInnerHTML={show(intro)} />
            </div>
          )}
          {data?.i && (
            <div className="comm-entry">
              <div className="range">Chapter {view.chapter}</div>
              <div dangerouslySetInnerHTML={show(data.i)} />
            </div>
          )}
          {data?.e?.map(([a, z, html], i) => (
            <div key={`${a}-${i}`} className={`comm-entry${i === current ? ' current' : ''}`} onClick={() => setView({ ...view, verse: a })}>
              <div className="range">
                {a === z ? `Verse ${a}` : `Verses ${a}–${z}`}
              </div>
              <div dangerouslySetInnerHTML={show(html)} />
            </div>
          ))}
          {info && <p className="faint small">{info.author} ({info.year}). Public domain.</p>}
        </div>
      )}
      </div>

      <hr className="rule" />
      <div className="section-title">
        <Icon name="link" /> Cross References <span className="faint small">({locString(view.book, view.chapter, view.verse)})</span>
      </div>
      {refs.length ? (
        <div className="pills">
          {refs.map((r) => (
            <button
              key={r}
              className="pill"
              onClick={(e) => {
                const rr = (e.currentTarget as HTMLElement).getBoundingClientRect()
                openPopup({ kind: 'ref', ref: r, x: rr.left, y: rr.bottom + 6 })
              }}
            >
              <span style={{ textDecoration: 'underline', textUnderlineOffset: 2 }}>{formatRef(r, true)}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="faint">No cross references for this verse.</p>
      )}
      <p className="faint small" style={{ marginTop: 10 }}>Cross references: OpenBible.info (CC BY), ranked by reader votes.</p>

      {/* a round button, bottom right: switch commentaries without scrolling back up */}
      <div className={`comm-fab${menu ? ' open' : ''}`}>
        {menu && <div className="comm-fab-backdrop" onClick={() => setMenu(false)} />}
        {menu && (
          <div className="comm-fab-menu" role="menu" aria-label={`Commentaries on ${locString(view.book, view.chapter)}`}>
            <div className="comm-fab-head">On {locString(view.book, view.chapter)}</div>
            {offered.map((c) => (
              <button key={c.id} role="menuitemradio" aria-checked={shown === c.id} onClick={() => pick(c.id)}>
                {shown === c.id && <Icon name="check" size={15} stroke={2.6} />}
                {c.label}
              </button>
            ))}
            {!offered.length && <div className="comm-fab-head">No commentary on this chapter</div>}
          </div>
        )}
        <button className="comm-fab-btn" onClick={() => setMenu(!menu)} aria-expanded={menu} aria-label={menu ? 'Close the commentary menu' : 'Choose a commentary'} title="Commentaries">
          <Icon name={menu ? 'close' : 'book'} size={24} />
        </button>
      </div>
    </div>
  )
}

function describeCoverage(info: CommentaryInfo): string {
  const ids = Object.keys(info.books)
  if (ids.length <= 3) return `${ids.map((b) => book(b)?.name).join(', ')} only`
  const nt = ids.filter((b) => book(b)?.t === 'NT').length
  const ot = ids.length - nt
  if (ot === 0) return 'the New Testament only'
  if (nt === 0) return 'the Old Testament only'
  return `${ids.length} of the 66 books`
}
