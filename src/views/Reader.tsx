import { Fragment, memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { book, books, crossRefs, versionInfo, versions } from '../lib/data'
import { chapterText, type ChapterResult } from '../lib/providers'
import { applyDivineNames, COMPOUND_NAMES, FUNCTION_WORDS, tokenize, type Tok } from '../lib/markup'
import { capsText, capsTokens } from '../lib/caps'
import { formatRef } from '../lib/refs'
import { go, openPopup, setState, setVerse, updateSettings, useStore, type Selection } from '../lib/store'
import { helpsForChapter, placesForChapter, type VerseHelp } from '../lib/helps'
import type { Highlight, Label, Place } from '../lib/types'
import { Icon, Ornament } from '../components/Icon'

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
  const b = book(loc.book)
  const label = labels.find((l) => l.id === hlLabel) ?? labels[0]
  const showNames = versionInfo(settings.version)?.strongs

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
            {v.licensed ? ' (key)' : ''}
          </option>
        ))}
      </select>
      <div className="seg hide-phone">
        <button title="Previous chapter" onClick={() => step(-1)}>
          <Icon name="left" size={18} />
        </button>
        <button title="Next chapter" onClick={() => step(1)}>
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
    </div>
  )
}

interface HlRun {
  id: string
  label: Label
  v1: number
  v2: number
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
  const [xref, setXref] = useState<Record<string, string[]>>({})
  const [helps, setHelps] = useState<Map<number, VerseHelp[]>>(new Map())
  const [placeMap, setPlaceMap] = useState<Map<number, Place[]>>(new Map())
  const scrollRef = useRef<HTMLDivElement>(null)
  const versesRef = useRef<HTMLDivElement>(null)
  const [runsPos, setRunsPos] = useState<{ run: HlRun; top: number; height: number }[]>([])
  const b = book(loc.book)
  const vinfo = versionInfo(settings.version)

  useEffect(() => {
    let live = true
    setData(null)
    chapterText(settings.version, loc.book, loc.chapter).then((d) => live && setData(d))
    crossRefs(loc.book).then((x) => live && setXref(x))
    helpsForChapter(loc.book, loc.chapter).then((h) => live && setHelps(h))
    if (settings.placeChips) placesForChapter(loc.book, loc.chapter).then((p) => live && setPlaceMap(p))
    else setPlaceMap(new Map())
    return () => {
      live = false
    }
  }, [loc.book, loc.chapter, settings.version, settings.placeChips])

  // scroll to the focused verse after navigation
  useEffect(() => {
    if (!data) return
    const el = versesRef.current?.querySelector(`[data-vrow="${loc.verse}"]`) as HTMLElement | null
    if (el && loc.verse > 1) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    else scrollRef.current?.scrollTo({ top: 0 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTick, data])

  const chapterHl = useMemo(
    () => highlights.filter((h) => h.book === loc.book && h.chapter === loc.chapter).sort((a, b) => a.created - b.created),
    [highlights, loc.book, loc.chapter],
  )
  const labelMap = useMemo(() => Object.fromEntries(labels.map((l) => [l.id, l])), [labels])

  // contiguous runs of the same label for the vertical margin titles
  const runs = useMemo(() => {
    const byVerse = new Map<number, string>()
    for (const h of chapterHl) for (let v = h.v1; v <= h.v2; v++) byVerse.set(v, h.label)
    const out: HlRun[] = []
    const verses = [...byVerse.keys()].sort((a, b) => a - b)
    for (const v of verses) {
      const lab = byVerse.get(v)!
      const last = out[out.length - 1]
      if (last && last.label.id === lab && last.v2 === v - 1) last.v2 = v
      else if (labelMap[lab]) out.push({ id: `${lab}-${v}`, label: labelMap[lab], v1: v, v2: v })
    }
    return out
  }, [chapterHl, labelMap])

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
  const focusRefs = xref[`${loc.chapter}:${loc.verse}`] ?? []
  const chapterHelps = helps.get(0) ?? []
  const chips = settings.marginChips

  const popAt = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    return { x: r.right + 8, y: r.top }
  }

  let content: React.ReactNode
  if (!data) content = <div className="spinner" />
  else if (data.error === 'needs-key')
    content = <LicensedNotice version={settings.version} />
  else if (data.error) content = <div className="notice">Could not load {settings.version}: {data.error}</div>
  else
    content = (
      <div ref={versesRef} className={`verses layout-${settings.layout}`} onMouseUp={onTextSelect} onTouchEnd={() => setTimeout(onTextSelect, 30)}>
        {runsPos.map(({ run, top, height }) => (
          <div
            key={run.id}
            className="hl-label"
            style={{ top, height, background: run.label.color }}
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
              para={settings.layout === 'paragraph' && !!data.paras?.includes(v)}
              pilcrow={settings.layout === 'verse' && settings.version === 'KJV' && !!data.paras?.includes(v) && v > 1}
              focus={loc.verse === v && !selected.size}
              selected={selected.has(v)}
              highlights={chapterHl.filter((h) => h.v1 <= v && h.v2 >= v)}
              labelMap={labelMap}
              version={settings.version}
              names={settings.namesOfGod && !!vinfo?.strongs}
              caps={settings.capsNames}
              red={settings.redLetters}
              compound={settings.namesOfGod ? COMPOUND_NAMES[`${loc.book}.${loc.chapter}.${v}`] : undefined}
              footnotes={data.notes?.[String(v)]}
              noteCount={chips ? noteVerses.get(v) ?? 0 : 0}
              journalCount={chips ? journalVerses.get(v) ?? 0 : 0}
              helpCount={chips ? vh : 0}
              book={loc.book}
              chapter={loc.chapter}
            />
          )
        })}
      </div>
    )

  return (
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
        {data && !data.error && focusRefs.length > 0 && (
          <div className="xref-line">
            <Icon name="book" size={18} />
            <span>Cross References (v. {loc.verse}):</span>
            {focusRefs.slice(0, 8).map((r, i) => (
              <Fragment key={r}>
                <button className="ref-link" onClick={(e) => openPopup({ kind: 'ref', ref: r, ...popAt(e) })}>
                  {formatRef(r, true)}
                </button>
                {i < Math.min(focusRefs.length, 8) - 1 && ';'}
              </Fragment>
            ))}
          </div>
        )}
        {data?.copyright && <p className="faint small" style={{ marginLeft: 64 }}>{data.copyright}</p>}
        <nav className="chapter-nav">
          <button className="btn" onClick={() => step(-1)}>
            <Icon name="left" size={16} /> Previous
          </button>
          <button className="btn" onClick={() => step(1)}>
            Next <Icon name="right" size={16} />
          </button>
        </nav>
      </article>
    </div>
  )
}

function LicensedNotice({ version }: { version: string }) {
  const info = versionInfo(version)
  return (
    <div className="notice">
      <h4>{info?.name} needs your API key</h4>
      <p>
        The {version} is under copyright, so its text can’t be bundled with the app. You can read it here with a free personal key:
        {info?.licensed === 'esv' ? (
          <> get one at <a href="https://api.esv.org/" target="_blank" rel="noreferrer">api.esv.org</a> (non-commercial use).</>
        ) : (
          <> get one at <a href="https://scripture.api.bible/" target="_blank" rel="noreferrer">scripture.api.bible</a> and choose the version your licence includes.</>
        )}
      </p>
      <p className="small subtle">Licensed text is shown live and is never stored on your device. Strong’s numbers and red letters are available in the KJV.</p>
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
  book: string
  chapter: number
}

const VerseRow = memo(function VerseRow(p: VerseProps) {
  const ref = `${p.book}.${p.chapter}.${p.v}`
  const toks = useMemo(() => {
    let t = tokenize(p.text)
    if (p.names) t = applyDivineNames(t)
    // remember the printed form so the KJV's LORD / GOD (YHWH) keep their small capitals
    t = t.map((x) => ({ ...x, o: x.t }))
    return p.caps ? capsTokens(t, ref) : t
  }, [p.text, p.names, p.caps, ref])

  // highlight color for each token
  const colorOf = (tok: Tok): string | undefined => {
    let c: string | undefined
    for (const h of p.highlights) {
      const lab = p.labelMap[h.label]
      if (!lab) continue
      if (h.w1 === undefined || h.version !== p.version) {
        c = lab.color
        continue
      }
      const after = p.v > h.v1 || tok.i >= h.w1
      const before = p.v < h.v2 || tok.i <= (h.w2 ?? 9999)
      if (after && before) c = lab.color
    }
    return c
  }

  // group consecutive tokens with the same highlight so the background is continuous
  const groups: { color?: string; toks: Tok[] }[] = []
  for (const t of toks) {
    const c = colorOf(t)
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
    e.stopPropagation()
    setVerse(p.v)
    if (t.s?.length) {
      const num = t.s.find((n) => !['H853'].includes(n)) ?? t.s[0]
      openPopup({ kind: 'strongs', num, word: t.t, book: p.book, chapter: p.chapter, verse: p.v, ...pos(e) })
    }
  }

  const renderTok = (t: Tok) => {
    const cls = ['w']
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
    return (
      <span key={t.i} data-t={t.i} className={cls.join(' ')} onClick={t.s ? (e) => onWord(e, t) : undefined} title={t.name ? t.nameInfo : undefined}>
        {text}
      </span>
    )
  }

  const toggleSelect = (e: React.MouseEvent) => {
    e.stopPropagation()
    const st = getState()
    const cur = new Set(st.selection?.verses ?? [])
    if (cur.has(p.v)) cur.delete(p.v)
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
      onClick={() => {
        const sel = window.getSelection()
        if (sel && !sel.isCollapsed) return
        setVerse(p.v)
      }}
    >
      <div className="margin" onClick={(e) => e.stopPropagation()}>
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
      <button className="vnum" onClick={toggleSelect} aria-label={`Select verse ${p.v}`} aria-pressed={p.selected}>
        {p.v}
      </button>
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
      </p>
    </div>
  )
})

function trimSpaces(toks: Tok[]): Tok[] {
  return toks
}
