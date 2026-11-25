import { Fragment, memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { book, books, crossRefs, versionInfo, versions } from '../lib/data'
import { chapterText, type ChapterResult } from '../lib/providers'
import { applyDivineNames, COMPOUND_NAMES, FUNCTION_WORDS, tokenize, type Tok } from '../lib/markup'
import { capsText, capsTokens } from '../lib/caps'
import { go, openPopup, setState, setVerse, updateSettings, useStore, type Selection } from '../lib/store'
import { helpsForChapter, placesForChapter, type VerseHelp } from '../lib/helps'
import { hlBackground, MAX_COLOURS, verseLabels } from '../lib/highlights'
import { citationsAfter, otQuotes, quoteTokens, type OtQuote } from '../lib/otquotes'
import { membersOnlyVersions, onShared, sharedVersions } from '../lib/shared'
import { applyRed, chapterAlign, matchWord, type ChapterAlign } from '../lib/align'
import { useSyncExternalStore } from 'react'
import { onSync, syncInfo } from '../lib/sync'
import type { Highlight, Label, Place } from '../lib/types'
import { Icon, Ornament } from '../components/Icon'
import { AudioBar } from '../components/AudioBar'
import { openPlayer, pause as pauseAudio, play as playAudio, setChapterText, toggle as toggleAudio, useAudioField } from '../lib/audio'
import { pauseScroll, resumeScroll, SCROLL_SPEEDS, startScroll, stopScroll, useAutoScroll } from '../lib/autoscroll'

// ---------------------------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------------------------
function ReaderToolbar({ onBooks }: { onBooks: () => void }) {
  const loc = useStore((s) => s.loc)
  const settings = useStore((s) => s.settings)
  const panel = useStore((s) => s.panel)
  const labels = useStore((s) => s.labels)
  const hlLabel = useStore((s) => s.highlightLabel)
  const [hlOpen, setHlOpen] = useState(false)
  const audio = { open: useAudioField('open') }
  const scroll = useAutoScroll()
  const shared = useSyncExternalStore(onShared, sharedVersions) // the owner's shared translations lose their "(key)"
  const b = book(loc.book)
  const label = labels.find((l) => l.id === hlLabel) ?? labels[0]
  const showNames = true

  return (
    <div className="reader-toolbar">
      <button className="icon-btn hide-phone" title="Books of the Bible" onClick={onBooks}>
        <Icon name="book" />
      </button>
      <select className="select" aria-label="Book" value={loc.book} onChange={(e) => go({ book: e.target.value, chapter: 1 })}>
        {books().map((x) => (
          <option key={x.id} value={x.id}>
            {x.name}
          </option>
        ))}
      </select>
      <select className="select" aria-label="Chapter" value={loc.chapter} onChange={(e) => go({ chapter: +e.target.value })}>
        {b.v.map((_, i) => (
          <option key={i} value={i + 1}>
            {b.v.length > 1 ? `Chapter ${i + 1}` : 'Chapter 1'}
          </option>
        ))}
      </select>
      <select className="select" aria-label="Bible version" value={settings.version} onChange={(e) => updateSettings({ version: e.target.value })}>
        {versions().map((v) => (
          <option key={v.id} value={v.id} title={v.name}>
            {v.id}
            {v.licensed && !shared.includes(v.id) && !(v.licensed === 'apibible' && settings.apiBibleKey && settings.apiBibleIds[v.id]) && !(v.licensed === 'esv' && settings.esvKey) ? ' (key)' : ''}
          </option>
        ))}
      </select>
      <button
        className="tool-btn"
        aria-pressed={audio.open}
        onClick={() => {
          stopScroll()
          if (audio.open) toggleAudio()
          else {
            openPlayer()
            void playAudio(loc.verse > 1 ? loc.verse : 1)
          }
        }}
        title="Listen: read this chapter aloud"
      >
        <Icon name="headphones" size={18} /> Listen
      </button>
      <button
        className="tool-btn"
        aria-pressed={scroll.on}
        onClick={() => {
          if (scroll.on) stopScroll()
          else {
            pauseAudio()
            startScroll()
          }
        }}
        title="Auto-scroll: the page moves slowly as you read"
      >
        <Icon name="autoscroll" size={18} /> Scroll
      </button>
      <div className="seg hide-phone">
        <button title="Previous chapter" onClick={() => turnPage(-1)}>
          <Icon name="left" size={18} />
        </button>
        <button title="Next chapter" onClick={() => turnPage(1)}>
          <Icon name="right" size={18} />
        </button>
      </div>
      <div className="seg hide-phone">
        <button title="Smaller text" onClick={() => updateSettings({ textSize: Math.max(14, settings.textSize - 1) })}>
          A−
        </button>
        <button title="Larger text" onClick={() => updateSettings({ textSize: Math.min(34, settings.textSize + 1) })}>
          A+
        </button>
      </div>
      <div style={{ position: 'relative' }} className="hide-phone">
        <button className="hl-btn" title={`Highlighter: ${label?.name}`} onClick={() => setHlOpen(!hlOpen)} style={{ background: label?.color }}>
          <Icon name="marker" size={18} />
          <Icon name="down" size={14} />
        </button>
        {hlOpen && (
          <div className="selbar" style={{ position: 'absolute', top: 42, left: 0 }} onMouseLeave={() => setHlOpen(false)}>
            <div className="small subtle">Highlighter color (select text or tap verse numbers)</div>
            <div className="row">
              {labels.map((l) => (
                <button key={l.id} className="swatch" style={{ background: l.color }} onClick={() => { setState({ highlightLabel: l.id }); setHlOpen(false) }}>
                  {l.id === hlLabel && <Icon name="check" size={14} />} {l.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {showNames && (
        <button className="toggle" onClick={() => updateSettings({ namesOfGod: !settings.namesOfGod })} title="Show the Hebrew names of God">
          <span className="hide-phone">Divine Names</span>
          <span className="show-phone">Names</span>
          <span className="switch" data-on={settings.namesOfGod} />
        </button>
      )}
      <span className="spacer" />
      {!panel && (
        <button className="icon-btn hide-phone" title="Show study panel" onClick={() => setState({ panel: true })}>
          <Icon name="expand" />
        </button>
      )}
    </div>
  )
}

/** Turn to the next/previous chapter with the page-turn animation when the reader is on screen. */
let turnHandler: ((dir: 1 | -1) => void) | null = null
/** The reading position on the Bible page, while another tab is open (see the reader's scroll handling). */
let readingPlace: { key: string; tick: number; verse: string; offset: number; atTop: boolean } | null = null

export function turnPage(dir: 1 | -1) {
  if (turnHandler) turnHandler(dir)
  else step(dir)
}

export function step(dir: number) {
  const { loc } = useStoreSnapshot()
  const list = books()
  const bi = list.findIndex((b) => b.id === loc.book)
  let ch = loc.chapter + dir
  let bk = list[bi]
  if (ch < 1) {
    bk = list[(bi - 1 + list.length) % list.length]
    ch = bk.v.length
  } else if (ch > bk.v.length) {
    bk = list[(bi + 1) % list.length]
    ch = 1
  }
  go({ book: bk.id, chapter: ch, verse: 1 })
}

import { getState } from '../lib/store'
function useStoreSnapshot() {
  return getState()
}

// ---------------------------------------------------------------------------------------------
// Reader column
// ---------------------------------------------------------------------------------------------
export function ReaderColumn({ onBooks }: { onBooks: () => void }) {
  return (
    <div className="reader-col">
      <ReaderToolbar onBooks={onBooks} />
      <BibleReader />
      <AudioBar />
    </div>
  )
}

/** A margin band's place and size: one alone is 22px wide; two or three side by side are narrower. */
function laneStyle(r: { lane: number; lanes: number }): React.CSSProperties {
  if (r.lanes <= 1) return {}
  const w = r.lanes === 2 ? 13 : 12
  return { left: 2 + r.lane * (w + 2), width: w }
}

interface HlRun {
  id: string
  label: Label
  v1: number
  v2: number
  lane: number // side by side in the margin where a verse has two or three colours
  lanes: number
}

function titleParts(title: string, name: string): [string, string] {
  const t = title || name
  const words = t.split(' ')
  const last = name.split(' ').pop()!.toUpperCase()
  const idx = words.map((w) => w.toUpperCase().replace(/[^A-Z]/g, '')).lastIndexOf(last.replace(/[^A-Z]/g, ''))
  if (idx > 0) {
    const nameWords = name.split(' ').length
    const start = Math.max(0, idx - nameWords + 1)
    const pre = words.slice(0, start).join(' ').replace(/,$/, '')
    if (pre) return [pre, name]
  }
  return ['', name]
}

function BibleReader() {
  const loc = useStore((s) => s.loc)
  const settings = useStore((s) => s.settings)
  const highlights = useStore((s) => s.highlights)
  const labels = useStore((s) => s.labels)
  const notes = useStore((s) => s.notes)
  const journal = useStore((s) => s.journal)
  const selection = useStore((s) => s.selection)
  const focusTick = useStore((s) => s.focusTick)
  const [data, setData] = useState<ChapterResult | null>(null)
  const [dataFor, setDataFor] = useState('') // which chapter (version/book/chapter) data holds
  const shared = useSyncExternalStore(onShared, sharedVersions)
  const [xref, setXref] = useState<Record<string, string[]>>({})
  const [helps, setHelps] = useState<Map<number, VerseHelp[]>>(new Map())
  const [placeMap, setPlaceMap] = useState<Map<number, Place[]>>(new Map())
  const [quotes, setQuotes] = useState<Record<string, OtQuote>>({}) // Old Testament quotations (the New Testament)
  const scrollRef = useRef<HTMLDivElement>(null)
  const versesRef = useRef<HTMLDivElement>(null)
  const [runsPos, setRunsPos] = useState<{ run: HlRun; top: number; height: number }[]>([])
  const b = book(loc.book)
  const vinfo = versionInfo(settings.version)
  const [align, setAlign] = useState<ChapterAlign | null>(null)
  useEffect(() => {
    let live = true
    setAlign(null)
    if (!vinfo?.strongs) chapterAlign(loc.book, loc.chapter).then((a) => live && setAlign(a)).catch(() => {})
    return () => {
      live = false
    }
  }, [loc.book, loc.chapter, vinfo?.strongs])

  useEffect(() => {
    let live = true
    setData(null)
    const key = `${settings.version}/${loc.book}/${loc.chapter}`
    chapterText(settings.version, loc.book, loc.chapter).then((d) => {
      if (!live) return
      setData(d)
      setDataFor(key)
    })
    crossRefs(loc.book).then((x) => live && setXref(x))
    otQuotes(loc.book).then((x) => live && setQuotes(x))
    // newer data replacing what the phone kept (datasync.ts): this book's quotations and cross references again
    const refreshed = () => {
      crossRefs(loc.book).then((x) => live && setXref(x))
      otQuotes(loc.book).then((x) => live && setQuotes(x))
    }
    window.addEventListener('ss:data-refreshed', refreshed)
    helpsForChapter(loc.book, loc.chapter).then((h) => live && setHelps(h))
    if (settings.placeChips) placesForChapter(loc.book, loc.chapter).then((p) => live && setPlaceMap(p))
    else setPlaceMap(new Map())
    return () => {
      live = false
      window.removeEventListener('ss:data-refreshed', refreshed)
    }
  }, [loc.book, loc.chapter, settings.version, settings.placeChips, shared])

  // the audio Bible reads the chapter on screen: only once its text has arrived (on a page turn the previous
  // chapter's text is still here for a moment, and was once read again as the next chapter)
  useEffect(() => {
    if (data && !data.error && dataFor === `${settings.version}/${loc.book}/${loc.chapter}`) setChapterText(settings.version, loc.book, loc.chapter, data.verses)
  }, [data, dataFor, settings.version, loc.book, loc.chapter])

  // highlight the verse being read and keep it in view (unless the reader is scrolling by hand)
  const audio = { open: useAudioField('open'), playing: useAudioField('playing'), verse: useAudioField('verse') }
  const handScroll = useRef(0)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const mark = () => (handScroll.current = Date.now())
    el.addEventListener('wheel', mark, { passive: true })
    el.addEventListener('touchmove', mark, { passive: true })
    return () => {
      el.removeEventListener('wheel', mark)
      el.removeEventListener('touchmove', mark)
    }
  }, [])
  useEffect(() => {
    const root = versesRef.current
    root?.querySelectorAll('.vrow.speaking').forEach((n) => n.classList.remove('speaking'))
    if (!audio.open || !audio.verse || !root) return
    const row = root.querySelector(`[data-vrow="${audio.verse}"]`) as HTMLElement | null
    if (!row) return
    row.classList.add('speaking')
    const box = scrollRef.current
    if (!audio.playing || !box || Date.now() - handScroll.current < 3500) return
    const r = row.getBoundingClientRect()
    const b2 = box.getBoundingClientRect()
    if (r.top < b2.top + b2.height * 0.12 || r.bottom > b2.top + b2.height * 0.72)
      box.scrollTo({ top: box.scrollTop + r.top - b2.top - b2.height * 0.25, behavior: 'smooth' })
  }, [audio.verse, audio.open, audio.playing, data])

  // auto-scroll: a steady glide down the page, paused when the reader touches it
  const scroll = useAutoScroll()
  const ready = useRef(false)
  ready.current = !!data && !data.error
  useEffect(() => {
    const el = scrollRef.current
    if (!scroll.on || !scroll.running || !el) return
    el.style.scrollBehavior = 'auto'
    let pos = el.scrollTop
    let last = performance.now()
    let endSince = 0
    let id = 0
    const loop = (t: number) => {
      const dt = Math.min(0.1, (t - last) / 1000)
      last = t
      if (Math.abs(el.scrollTop - pos) > 3) pos = el.scrollTop // the page moved (new chapter, or a jump)
      const max = el.scrollHeight - el.clientHeight
      const speed = SCROLL_SPEEDS[Math.min(9, Math.max(0, (settings.scrollSpeed || 4) - 1))] * (settings.textSize / 20)
      if (pos < max - 1) {
        pos = Math.min(max, pos + speed * dt)
        el.scrollTop = pos
        endSince = 0
      } else if (ready.current && settings.audioContinue) {
        if (!endSince) endSince = t
        else if (t - endSince > 2500) {
          endSince = 0
          step(1)
        }
      }
      id = requestAnimationFrame(loop)
    }
    id = requestAnimationFrame(loop)
    const userTook = (e: Event) => {
      if ((e.target as Element | null)?.closest?.('.autoscroll-ctl')) return
      pauseScroll()
    }
    el.addEventListener('wheel', userTook, { passive: true })
    el.addEventListener('touchstart', userTook, { passive: true })
    el.addEventListener('mousedown', userTook)
    return () => {
      cancelAnimationFrame(id)
      el.style.scrollBehavior = ''
      el.removeEventListener('wheel', userTook)
      el.removeEventListener('touchstart', userTook)
      el.removeEventListener('mousedown', userTook)
    }
  }, [scroll.on, scroll.running, settings.scrollSpeed, settings.textSize, settings.audioContinue])

  // swipe sideways to turn the page: left for the next chapter, right for the previous one
  const entering = useRef<{ dir: number } | null>(null)
  const slideIn = () => {
    const page = scrollRef.current?.querySelector('.page') as HTMLElement | null
    entering.current = null
    if (!page) return
    requestAnimationFrame(() => {
      page.style.transition = 'transform 280ms cubic-bezier(0,0,.2,1)'
      page.style.transform = ''
    })
  }
  useEffect(() => {
    const el = scrollRef.current
    const page = el?.querySelector('.page') as HTMLElement | null
    if (!el || !page) return
    const reset = (ms = 220) => {
      page.style.transition = `transform ${ms}ms cubic-bezier(.2,.8,.2,1)`
      page.style.transform = ''
    }
    // like turning a page: this one slides away, the next waits just off the other side until its text is ready
    const turn = (dir: 1 | -1) => {
      if (entering.current) return
      const w = page.getBoundingClientRect().width + 48
      page.style.transition = 'transform 190ms cubic-bezier(.4,0,1,1)'
      page.style.transform = `translateX(${dir > 0 ? -w : w}px)`
      entering.current = { dir }
      setTimeout(() => {
        page.style.transition = 'none'
        page.style.transform = `translateX(${dir > 0 ? w : -w}px)`
        step(dir)
        setTimeout(() => entering.current && slideIn(), 2500) // never wait longer than this
      }, 190)
    }
    turnHandler = turn
    let sx = 0
    let sy = 0
    let st = 0
    let on = false
    let sideways: boolean | null = null
    const start = (e: TouchEvent) => {
      const t = e.touches[0]
      // one finger, and not from the very edge of the screen (the browser's own back gesture)
      on = e.touches.length === 1 && t.clientX > 16 && t.clientX < window.innerWidth - 16
      sx = t.clientX
      sy = t.clientY
      st = Date.now()
      sideways = null
    }
    const move = (e: TouchEvent) => {
      if (!on) return
      if (e.touches.length > 1) {
        on = false
        reset()
        return
      }
      const dx = e.touches[0].clientX - sx
      const dy = e.touches[0].clientY - sy
      // a thumb swipe curves: judge the direction over the first 20 px, and accept a fair slant
      if (sideways === null && Math.hypot(dx, dy) > 20) sideways = Math.abs(dx) > Math.abs(dy) * 1.1
      if (sideways && !entering.current) {
        page.style.transition = 'none'
        page.style.transform = `translateX(${dx}px)`
      }
    }
    const end = (e: TouchEvent) => {
      if (!on) return
      on = false
      const t = e.changedTouches[0]
      const dx = t.clientX - sx
      const dy = t.clientY - sy
      const sel = window.getSelection()
      const quick = Date.now() - st < 300 && Math.abs(dx) > 40 // a flick
      const turned = (Math.abs(dx) > 70 || quick) && Math.abs(dx) > Math.abs(dy) * 1.2 && (!sel || sel.isCollapsed)
      if (turned) turn(dx < 0 ? 1 : -1)
      else if (sideways) reset()
    }
    // trackpads: a two-finger sideways swipe
    let acc = 0
    let lockUntil = 0
    const wheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) * 1.5 || e.ctrlKey) return
      if (Date.now() < lockUntil) return
      acc += e.deltaX
      if (Math.abs(acc) > 160) {
        lockUntil = Date.now() + 900
        turn(acc > 0 ? 1 : -1)
        acc = 0
      }
    }
    // keyboard: the arrow keys, when not typing
    const key = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      if ((e.target as Element | null)?.closest?.('input, textarea, select, [contenteditable], .pop, .modal')) return
      if (getState().tab !== 'bible' && window.innerWidth < 900) return
      if (e.key === 'ArrowRight') turn(1)
      else if (e.key === 'ArrowLeft') turn(-1)
    }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: true })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', () => (on ? ((on = false), reset()) : undefined))
    el.addEventListener('wheel', wheel, { passive: true })
    window.addEventListener('keydown', key)
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
      el.removeEventListener('wheel', wheel)
      window.removeEventListener('keydown', key)
      if (turnHandler === turn) turnHandler = null
    }
  }, [])

  // the next page slides in once its text has arrived (scrolled to the top while still out of sight)
  useEffect(() => {
    if (data && entering.current) slideIn()
  }, [data])

  // where the reader is in the chapter (the verse at the top of the page), kept while another tab is open: a phone
  // shows one tab at a time, and the Bible page is made afresh on coming back to it
  useEffect(() => {
    const box = scrollRef.current
    if (!box) return
    let frame = 0
    const save = () => {
      frame = 0
      if (!dataFor.endsWith(`/${loc.book}/${loc.chapter}`)) return // still the last chapter's page (a page turn)
      const b = box.getBoundingClientRect()
      const rows = [...(versesRef.current?.querySelectorAll<HTMLElement>('[data-vrow]') ?? [])]
      let first = true
      let reading = 0
      for (const row of rows) {
        const r = row.getBoundingClientRect()
        if (first && r.bottom > b.top + 1) {
          readingPlace = { key: `${loc.book}.${loc.chapter}`, tick: focusTick, verse: row.dataset.vrow!, offset: r.top - b.top, atTop: box.scrollTop < 2 }
          first = false
        }
        // the verse being read: the first one more than a line into the page (not one whose last line peeks out)
        if (!reading && r.bottom > b.top + 60) reading = +row.dataset.vrow!
        if (!first && reading) break
      }
      // a verse tapped (or gone to) that is still on the page is the one being read
      const tapped = rows.find((row) => +row.dataset.vrow! === getState().loc.verse)?.getBoundingClientRect()
      if (tapped && tapped.bottom > b.top + 20 && tapped.top < b.bottom - 20) reading = getState().loc.verse
      const was = getState().reading
      if (reading && (was?.verse !== reading || was.book !== loc.book || was.chapter !== loc.chapter))
        setState({ reading: { book: loc.book, chapter: loc.chapter, verse: reading } })
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(save)
    }
    box.addEventListener('scroll', onScroll, { passive: true })
    onScroll() // a verse tapped, or the page just opened
    return () => {
      box.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [loc.book, loc.chapter, loc.verse, focusTick, dataFor])

  // scroll to the focused verse after navigation (or, coming back from another tab, to where the reading was)
  useEffect(() => {
    if (!data) return
    const box = scrollRef.current
    const back = readingPlace
    if (box && back && back.key === `${loc.book}.${loc.chapter}` && back.tick === focusTick) {
      const row = versesRef.current?.querySelector(`[data-vrow="${back.verse}"]`) as HTMLElement | null
      if (back.atTop || !row) box.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
      else box.scrollTo({ top: box.scrollTop + row.getBoundingClientRect().top - box.getBoundingClientRect().top - back.offset, behavior: 'instant' as ScrollBehavior })
      return
    }
    const el = versesRef.current?.querySelector(`[data-vrow="${loc.verse}"]`) as HTMLElement | null
    if (el && loc.verse > 1) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    else scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTick, data])

  const chapterHl = useMemo(
    () => highlights.filter((h) => h.book === loc.book && h.chapter === loc.chapter).sort((a, b) => a.created - b.created),
    [highlights, loc.book, loc.chapter],
  )
  const labelMap = useMemo(() => Object.fromEntries(labels.map((l) => [l.id, l])), [labels])

  // contiguous runs of each label for the vertical margin titles; where a verse has two or three colours their bands
  // stand side by side (lanes), narrower
  const runs = useMemo(() => {
    const byVerse = new Map<number, string[]>()
    const verses = new Set<number>()
    for (const h of chapterHl) for (let v = h.v1; v <= h.v2; v++) verses.add(v)
    for (const v of verses) byVerse.set(v, verseLabels(chapterHl, v))
    const order = [...new Set(chapterHl.map((h) => h.label))]
    const out: HlRun[] = []
    for (const lab of order) {
      if (!labelMap[lab]) continue
      for (const v of [...verses].sort((a, b) => a - b)) {
        if (!byVerse.get(v)!.includes(lab)) continue
        let last: HlRun | undefined
        for (let i = out.length - 1; i >= 0 && !last; i--) if (out[i].label.id === lab) last = out[i]
        if (last && last.v2 === v - 1) last.v2 = v
        else out.push({ id: `${lab}-${v}`, label: labelMap[lab], v1: v, v2: v, lane: 0, lanes: 1 })
      }
    }
    out.sort((a, b) => a.v1 - b.v1 || order.indexOf(a.label.id) - order.indexOf(b.label.id))
    const laneEnd: number[] = []
    let cluster: HlRun[] = []
    let clusterEnd = 0
    const close = () => {
      const n = Math.max(1, ...cluster.map((r) => r.lane + 1))
      for (const r of cluster) r.lanes = n
    }
    for (const r of out) {
      if (r.v1 > clusterEnd) {
        close()
        cluster = []
        laneEnd.length = 0
      }
      let lane = laneEnd.findIndex((e) => e < r.v1)
      if (lane < 0) lane = laneEnd.length
      laneEnd[lane] = r.v2
      r.lane = lane
      cluster.push(r)
      clusterEnd = Math.max(clusterEnd, r.v2)
    }
    close()
    return out
  }, [chapterHl, labelMap])
  const threeLanes = runs.some((r) => r.lanes >= 3)
  // each verse's colours in the order of their bands, left to right: the stripes, top to bottom, match them
  const laneOrder = useMemo(() => {
    const m = new Map<number, string[]>()
    for (const r of [...runs].sort((a, b) => a.lane - b.lane)) for (let v = r.v1; v <= r.v2; v++) m.set(v, [...(m.get(v) ?? []), r.label.id])
    return m
  }, [runs])

  useLayoutEffect(() => {
    const measure = () => {
      const root = versesRef.current
      if (!root) return
      const pos = runs
        .map((run) => {
          const a = root.querySelector(`[data-vrow="${run.v1}"]`) as HTMLElement | null
          const z = root.querySelector(`[data-vrow="${run.v2}"]`) as HTMLElement | null
          if (!a || !z) return null
          const top = a.offsetTop + 2
          const height = z.offsetTop + z.offsetHeight - a.offsetTop - 8
          return { run, top, height: Math.max(height, 22) }
        })
        .filter((x): x is { run: HlRun; top: number; height: number } => !!x)
      setRunsPos(pos)
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (versesRef.current) ro.observe(versesRef.current)
    return () => ro.disconnect()
  }, [runs, data, settings.textSize, settings.layout])

  const noteVerses = useMemo(() => {
    const m = new Map<number, number>()
    for (const n of notes) if (n.book === loc.book && n.chapter === loc.chapter) m.set(n.verse ?? 0, (m.get(n.verse ?? 0) ?? 0) + 1)
    return m
  }, [notes, loc.book, loc.chapter])
  const journalVerses = useMemo(() => {
    const m = new Map<number, number>()
    for (const j of journal) if (j.book === loc.book && j.chapter === loc.chapter) m.set(j.verse ?? 0, (m.get(j.verse ?? 0) ?? 0) + 1)
    return m
  }, [journal, loc.book, loc.chapter])

  const [pre, name] = titleParts(b.title, b.name)
  const selected = new Set(selection?.verses ?? [])
  const chapterHelps = helps.get(0) ?? []
  const chips = settings.marginChips

  const popAt = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    return { x: r.right + 8, y: r.top }
  }

  let content: React.ReactNode
  if (!data) content = <div className="spinner" />
  else if (data.error === 'needs-key' || data.error === 'needs-signin')
    content = <LicensedNotice version={settings.version} />
  else if (data.error) content = <div className="notice">Could not load {settings.version}: {data.error}</div>
  else
    content = (
      <div ref={versesRef} className={`verses layout-${settings.layout}${threeLanes ? ' lanes-3' : ''}`} onMouseUp={onTextSelect} onTouchEnd={() => setTimeout(onTextSelect, 30)}>
        {runsPos.map(({ run, top, height }) => (
          <div
            key={run.id}
            className={`hl-label${run.lanes > 1 ? ' narrow' : ''}`}
            style={{ top, height, background: run.label.color, ...laneStyle(run) }}
            title={run.label.name}
            onClick={() => setState({ tab: 'notes', panel: true })}
          >
            <span>{run.label.name}</span>
          </div>
        ))}
        {data.verses.map((text, i) => {
          const v = i + 1
          if (!text) return null
          const vh = (helps.get(v) ?? []).length + (placeMap.get(v)?.length ?? 0)
          return (
            <VerseRow
              key={`${settings.version}-${v}`}
              v={v}
              text={text}
              para={settings.layout === 'paragraph' && !!(data.paras ?? align?.paras)?.includes(v)}
              pilcrow={settings.layout === 'verse' && settings.version === 'KJV' && !!data.paras?.includes(v) && v > 1}
              focus={loc.verse === v && !selected.size}
              selected={selected.has(v)}
              highlights={chapterHl.filter((h) => h.v1 <= v && h.v2 >= v)}
              laneOrder={laneOrder.get(v)}
              labelMap={labelMap}
              version={settings.version}
              names={settings.namesOfGod && (!!vinfo?.strongs || !!align)}
              redFromKjv={!vinfo?.redLetter}
              caps={settings.capsNames}
              red={settings.redLetters}
              compound={settings.namesOfGod ? COMPOUND_NAMES[`${loc.book}.${loc.chapter}.${v}`] : undefined}
              footnotes={data.notes?.[String(v)]}
              noteCount={chips ? noteVerses.get(v) ?? 0 : 0}
              journalCount={chips ? journalVerses.get(v) ?? 0 : 0}
              helpCount={chips ? vh : 0}
              xrefs={chips ? xref[`${loc.chapter}:${v}`] : undefined}
              quote={quotes[`${loc.chapter}:${v}`]}
              book={loc.book}
              chapter={loc.chapter}
              align={align}
            />
          )
        })}
      </div>
    )

  return (
    <div className="page-wrap">
    {scroll.on && (
      <div className="autoscroll-ctl" role="group" aria-label="Auto-scroll">
        <button className="icon-btn" onClick={scroll.running ? pauseScroll : resumeScroll} aria-label={scroll.running ? 'Pause scrolling' : 'Resume scrolling'}>
          <Icon name={scroll.running ? 'pause' : 'play'} size={18} fill={!scroll.running} />
        </button>
        <button className="icon-btn" onClick={() => updateSettings({ scrollSpeed: Math.max(1, (settings.scrollSpeed || 4) - 1) })} aria-label="Slower">
          <Icon name="slower" size={18} />
        </button>
        <span className="as-speed">{scroll.running ? `Speed ${settings.scrollSpeed || 4}` : 'Paused'}</span>
        <button className="icon-btn" onClick={() => updateSettings({ scrollSpeed: Math.min(10, (settings.scrollSpeed || 4) + 1) })} aria-label="Faster">
          <Icon name="faster" size={18} />
        </button>
        <button className="icon-btn" onClick={stopScroll} aria-label="Stop auto-scroll">
          <Icon name="close" size={16} />
        </button>
      </div>
    )}
    <div className={`page-scroll${settings.strongsUnderline ? ' underline' : ''}`} ref={scrollRef}>
      <article className="page">
        <header>
          <div className="book-title">
            {pre && <div className="pre">{pre}</div>}
            <div className="name">{name}</div>
            <Ornament />
          </div>
          <h2 className="chapter-title">{b.id === 'PSA' ? 'PSALM' : 'CHAPTER'} {loc.chapter}</h2>
          {(chapterHelps.length > 0 || noteVerses.get(0) || journalVerses.get(0)) && chips ? (
            <div className="chapter-tools">
              {chapterHelps.length > 0 && (
                <button className="chip h" title="Maps & helps for this chapter" onClick={(e) => openPopup({ kind: 'helps', book: loc.book, chapter: loc.chapter, verse: 0, ...popAt(e) })}>
                  ?
                </button>
              )}
              {!!noteVerses.get(0) && (
                <button className="chip n" title="Chapter notes" onClick={(e) => openPopup({ kind: 'notes', book: loc.book, chapter: loc.chapter, ...popAt(e) })}>
                  N
                </button>
              )}
              {!!journalVerses.get(0) && (
                <button className="chip j" title="Chapter journal entries" onClick={(e) => openPopup({ kind: 'journal', book: loc.book, chapter: loc.chapter, ...popAt(e) })}>
                  J
                </button>
              )}
            </div>
          ) : null}
          {data?.title && <div className="psalm-title">{data.title}</div>}
        </header>
        {content}
        {data?.copyright && <p className="faint small" style={{ marginLeft: 64 }}>{data.copyright}</p>}
        <nav className="chapter-nav">
          <button className="btn" onClick={() => turnPage(-1)}>
            <Icon name="left" size={16} /> Previous
          </button>
          <button className="btn" onClick={() => turnPage(1)}>
            Next <Icon name="right" size={16} />
          </button>
        </nav>
      </article>
    </div>
    </div>
  )
}

function LicensedNotice({ version }: { version: string }) {
  const info = versionInfo(version)
  const members = membersOnlyVersions().includes(version)
  const account = useSyncExternalStore(onSync, syncInfo)
  const owner = account.status === 'signed-in' && account.role === 'owner'
  return (
    <div className="notice">
      <h4>{owner ? `Your ${version} key isn’t on this device` : members ? `Sign in to read the ${version}` : `The ${version} isn’t available here yet`}</h4>
      {owner ? (
        <>
          <p>
            A key typed into Settings stays on the device it was typed on: signing in brings your notes, highlights and settings, but not your
            keys. To read the {version} on every device you sign in on, share your key once with your own server: on the device where the{' '}
            {version} works (your phone), open Settings → <b>Sync across devices</b> → <b>Share the keys already on this phone</b>. Or paste
            the key under <b>Share CSB, NIV, NKJV, NASB or ESV</b> in Settings here.
          </p>
          <p className="small">
            Shared translations can be read by everyone who opens the app, unless you switch that off there: then only you and the people you
            invite, signed in.
          </p>
        </>
      ) : members ? (
        <p>
          The person who runs this app shares the {info?.name} with the people they invite. Open the invitation link they sent you, then sign in
          under Settings with your email (you’ll get a one-time code).
        </p>
      ) : (
        <p>
          The {version} is under copyright, so its text can’t come with the app. The person who runs this app can add it in Settings (with a free
          key from {info?.licensed === 'esv' ? <a href="https://api.esv.org/" target="_blank" rel="noreferrer">api.esv.org</a> : <a href="https://scripture.api.bible/" target="_blank" rel="noreferrer">scripture.api.bible</a>}),
          and then everyone can read it. You can also use your own free key in Settings.
        </p>
      )}
      <p className="small subtle">Licensed text is shown live and is never stored on your device.</p>
      <button className="btn primary" onClick={() => setState({ tab: 'settings', panel: true })}>
        Open Settings
      </button>{' '}
      <button className="btn" onClick={() => updateSettings({ version: 'KJV' })}>
        Read the KJV
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// Text selection -> highlight bar
// ---------------------------------------------------------------------------------------------
function tokenOf(node: Node | null): { v: number; i: number } | null {
  let el = node instanceof HTMLElement ? node : node?.parentElement
  while (el && !el.dataset?.t) {
    if (el.classList?.contains('vrow')) break
    el = el.parentElement
  }
  const row = el?.closest?.('[data-vrow]') as HTMLElement | null
  if (!el || !row) return null
  if (el.dataset.t === undefined) {
    // whole verse row (e.g. selection ended in the margin)
    return { v: +row.dataset.vrow!, i: -1 }
  }
  return { v: +row.dataset.vrow!, i: +el.dataset.t }
}

function onTextSelect() {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || !sel.rangeCount) return
  const range = sel.getRangeAt(0)
  let a = tokenOf(range.startContainer)
  let z = tokenOf(range.endContainer)
  if (!a || !z) return
  if (a.v > z.v || (a.v === z.v && a.i > z.i)) [a, z] = [z, a]
  const rect = range.getBoundingClientRect()
  const text = sel.toString().trim()
  if (!text) return
  const s: Selection = {
    verses: [],
    words: { v1: a.v, w1: Math.max(0, a.i), v2: z.v, w2: z.i < 0 ? 9999 : z.i, text },
    x: rect.left + rect.width / 2,
    y: rect.bottom + 10,
  }
  setState({ selection: s })
}

// ---------------------------------------------------------------------------------------------
// Verse row
// ---------------------------------------------------------------------------------------------
interface VerseProps {
  v: number
  text: string
  para: boolean
  pilcrow: boolean
  focus: boolean
  selected: boolean
  highlights: Highlight[]
  laneOrder?: string[] // the verse's labels in the order of their margin bands
  labelMap: Record<string, Label>
  version: string
  names: boolean
  caps: boolean
  red: boolean
  compound?: string
  footnotes?: string[]
  noteCount: number
  journalCount: number
  helpCount: number
  xrefs?: string[] // the verse's cross references: a book chip after its text opens them
  quote?: OtQuote // an Old Testament quotation in it: its words in italics
  book: string
  chapter: number
  align?: ChapterAlign | null
  redFromKjv?: boolean
}

const VerseRow = memo(function VerseRow(p: VerseProps) {
  const ref = `${p.book}.${p.chapter}.${p.v}`
  const toks = useMemo(() => {
    let t = tokenize(p.text)
    if (p.align) {
      // other translations: borrow Strong's numbers (and, where missing, the words of Christ) from the KJV
      const va = p.align.verses.get(p.v)
      t = t.map((x) => {
        if (x.s || x.sp) return x
        const n = matchWord(x.t, va, p.align!.words)
        return n ? { ...x, s: [n], al: true } : x
      })
      if (p.redFromKjv) t = applyRed(t, va)
    }
    if (p.names) t = applyDivineNames(t)
    // remember the printed form so the KJV's LORD / GOD (YHWH) keep their small capitals
    t = t.map((x) => ({ ...x, o: x.t }))
    return p.caps ? capsTokens(t, ref) : t
  }, [p.text, p.names, p.caps, ref, p.align, p.redFromKjv])

  // an Old Testament quotation: its words in italics
  const quoted = useMemo(() => (p.quote ? quoteTokens(toks, p.quote) : null), [toks, p.quote])
  // ... and after it, the passage it is from ("Isa 28:16"): tap to read it
  const cites = useMemo(() => citationsAfter(toks, quoted ?? new Set(), p.quote?.e?.length ?? 0), [toks, quoted, p.quote])
  const citation = (k: number) => {
    const c = p.quote!.e![k]
    return (
      <button
        key={`c${k}`}
        className="otq-ref"
        title={`Quoted from ${c.t}`}
        onClick={(e) => {
          e.stopPropagation()
          setVerse(p.v)
          if (c.r.length === 1) openPopup({ kind: 'ref', ref: c.r[0], ...chipPos(e) })
          else openPopup({ kind: 'xrefs', book: p.book, chapter: p.chapter, verse: p.v, refs: c.r, title: 'Quoted from', ...chipPos(e) })
        }}
      >
        {c.t}
      </button>
    )
  }

  // the highlight colours on each token (up to three, oldest first: the line is split into bands)
  const colorsOf = (tok: Tok): string[] => {
    const labs: string[] = []
    for (const h of p.highlights) {
      if (!p.labelMap[h.label] || labs.includes(h.label)) continue
      if (h.w1 !== undefined && h.version === p.version) {
        const after = p.v > h.v1 || tok.i >= h.w1
        const before = p.v < h.v2 || tok.i <= (h.w2 ?? 9999)
        if (!(after && before)) continue
      }
      labs.push(h.label)
    }
    const shown = labs.slice(Math.max(0, labs.length - MAX_COLOURS))
    const at = (l: string) => p.laneOrder?.indexOf(l) ?? -1
    if (p.laneOrder) shown.sort((a, b) => (at(a) < 0 ? 9 : at(a)) - (at(b) < 0 ? 9 : at(b)))
    return shown.map((l) => p.labelMap[l].color)
  }

  // group consecutive tokens with the same highlight so the background is continuous
  const groups: { color?: string; toks: Tok[] }[] = []
  for (const t of toks) {
    const cs = colorsOf(t)
    const c = cs.length ? hlBackground(cs) : undefined
    const last = groups[groups.length - 1]
    if (last && last.color === c) last.toks.push(t)
    else groups.push({ color: c, toks: [t] })
  }
  // trailing spaces should not carry a highlight into the next word group
  const pos = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    return { x: r.left, y: r.bottom + 6 }
  }

  const onWord = (e: React.MouseEvent, t: Tok) => {
    const sel = window.getSelection()
    if (sel && !sel.isCollapsed) return
    // while verses are selected, a tap anywhere on a verse adds or removes it (the row handles it)
    if (getState().selection?.verses?.length) return
    e.stopPropagation()
    setVerse(p.v)
    if (t.s?.length) {
      const num = t.s.find((n) => !['H853'].includes(n)) ?? t.s[0]
      openPopup({ kind: 'strongs', num, word: t.t, book: p.book, chapter: p.chapter, verse: p.v, version: t.al ? p.version : undefined, ...pos(e) })
    } else if (p.align) {
      openPopup({ kind: 'origwords', word: t.t, book: p.book, chapter: p.chapter, verse: p.v, ...pos(e) })
    }
  }

  const renderTok = (t: Tok) => {
    const cls = ['w']
    if (quoted?.has(t.i)) cls.push('otq')
    if (t.s) {
      cls.push('s')
      if (t.s.every((n) => FUNCTION_WORDS.has(n))) cls.push('fw')
    }
    if (t.red && p.red) cls.push('red')
    if (t.it) cls.push('it')
    if (t.name) cls.push('dn')
    if (t.sp) return <span key={t.i} data-t={t.i}> </span>
    let text: React.ReactNode = t.t
    const printed = t.o ?? t.t
    if (!t.name && /\b(LORD|GOD)\b/.test(printed)) {
      // small capitals only where the printed text has LORD / GOD (the divine name YHWH)
      const parts = printed.split(/\b(LORD|GOD)\b/)
      const shown = t.t.split(/\b(LORD|GOD)\b/)
      text = parts.map((part, k) => (k % 2 ? <span key={k} className="sc">{part.charAt(0) + part.slice(1).toLowerCase()}</span> : shown[k] ?? part))
    }
    const word = (
      <span key={t.i} data-t={t.i} className={cls.join(' ')} onClick={t.s || p.align ? (e) => onWord(e, t) : undefined} title={t.name ? t.nameInfo : undefined}>
        {text}
      </span>
    )
    const after = cites.get(t.i)
    if (!after) return word
    return (
      <Fragment key={t.i}>
        {word}
        {after.map(citation)}
      </Fragment>
    )
  }

  const toggleSelect = (e: React.MouseEvent) => {
    e.stopPropagation()
    const st = getState()
    const cur = new Set(st.selection?.verses ?? [])
    if (e.shiftKey && cur.size) {
      // shift-click: everything from the nearest selected verse to this one
      const near = [...cur].reduce((a, b) => (Math.abs(b - p.v) < Math.abs(a - p.v) ? b : a))
      for (let v = Math.min(near, p.v); v <= Math.max(near, p.v); v++) cur.add(v)
    } else if (cur.has(p.v)) cur.delete(p.v)
    else cur.add(p.v)
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setState({
      selection: cur.size ? { verses: [...cur].sort((a, b) => a - b), x: r.left + 140, y: r.bottom + 8 } : null,
      loc: { ...st.loc, verse: p.v },
    })
  }

  const chipPos = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    return { x: r.right + 8, y: r.top }
  }

  return (
    <div
      className={`vrow${p.focus ? ' focus' : ''}${p.selected ? ' selected' : ''}${p.para ? ' para' : ''}`}
      data-vrow={p.v}
      onClick={(e) => {
        const sel = window.getSelection()
        if (sel && !sel.isCollapsed) return
        if (getState().selection?.verses?.length && !(e.target as Element).closest('button')) return toggleSelect(e)
        setVerse(p.v)
      }}
    >
      {/* the lane at the left is the highlights' (their coloured bands and labels); the chips sit under the number */}
      <div className="margin" onClick={(e) => e.stopPropagation()} />
      <div className="vnum-col">
        <button className="vnum" onClick={toggleSelect} aria-label={`Select verse ${p.v}`} aria-pressed={p.selected}>
          {p.v}
        </button>
        {(p.helpCount > 0 || p.noteCount > 0 || p.journalCount > 0) && (
          <div className="vchips" onClick={(e) => e.stopPropagation()}>
            {p.helpCount > 0 && (
              <button className="chip h" title="Maps & helps" onClick={(e) => openPopup({ kind: 'helps', book: p.book, chapter: p.chapter, verse: p.v, ...chipPos(e) })}>
                ?
              </button>
            )}
            {p.noteCount > 0 && (
              <button className="chip n" title="Notes" onClick={(e) => openPopup({ kind: 'notes', book: p.book, chapter: p.chapter, verse: p.v, ...chipPos(e) })}>
                N
              </button>
            )}
            {p.journalCount > 0 && (
              <button className="chip j" title="Journal" onClick={(e) => openPopup({ kind: 'journal', book: p.book, chapter: p.chapter, verse: p.v, ...chipPos(e) })}>
                J
              </button>
            )}
          </div>
        )}
      </div>
      <p className="vtext">
        {p.compound && <span className="compound-name">{p.caps ? capsText(p.compound) : p.compound}</span>}
        {p.pilcrow && <span className="pilcrow">¶ </span>}
        {groups.map((g, k) =>
          g.color ? (
            <span key={k} className="hl" style={{ background: g.color }}>
              {trimSpaces(g.toks).map(renderTok)}
            </span>
          ) : (
            <Fragment key={k}>{g.toks.map(renderTok)}</Fragment>
          ),
        )}
        {p.footnotes?.map((f, k) => (
          <button
            key={k}
            className="fn"
            title={f}
            onClick={(e) => {
              e.stopPropagation()
              openPopup({ kind: 'info', title: `Translators’ note (v. ${p.v})`, text: f, ...chipPos(e) })
            }}
          >
            †
          </button>
        ))}
        {p.xrefs && p.xrefs.length > 0 && (
          <button
            className="xref-chip"
            title="Cross references"
            aria-label={`Cross references for verse ${p.v}`}
            onClick={(e) => {
              e.stopPropagation()
              setVerse(p.v)
              openPopup({ kind: 'xrefs', book: p.book, chapter: p.chapter, verse: p.v, refs: p.xrefs!, ...chipPos(e) })
            }}
          >
            <Icon name="book" size={14} />
          </button>
        )}
      </p>
    </div>
  )
})

function trimSpaces(toks: Tok[]): Tok[] {
  return toks
}
