import { useLayoutEffect, useRef, useState } from 'react'
import { versionInfo } from '../lib/data'
import { locString } from '../lib/refs'
import { deleteItem, getState, newId, saveItem, setState, useStore } from '../lib/store'
import type { Highlight } from '../lib/types'
import { chapterText } from '../lib/providers'
import { plainText } from '../lib/markup'
import { Icon } from './Icon'

/** Appears when verse numbers are tapped or text is selected: highlight, note, journal, copy, bookmark. */
export function SelectionBar() {
  const sel = useStore((s) => s.selection)
  const labels = useStore((s) => s.labels)
  const loc = useStore((s) => s.loc)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: 0, top: 0 })
  const [copied, setCopied] = useState(false)

  useLayoutEffect(() => {
    if (!sel || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    const phone = window.innerWidth < 900
    let left = sel.x - r.width / 2
    let top = sel.y
    left = Math.max(8, Math.min(left, window.innerWidth - r.width - 8))
    if (phone) top = window.innerHeight - r.height - 70
    else if (top + r.height > window.innerHeight - 8) top = Math.max(8, sel.y - r.height - 60)
    setPos({ left, top })
  }, [sel])

  if (!sel) return null

  // verse runs for verse-level actions
  const verses = sel.words ? range(sel.words.v1, sel.words.v2) : sel.verses
  const runs: [number, number][] = []
  for (const v of verses) {
    const last = runs[runs.length - 1]
    if (last && last[1] === v - 1) last[1] = v
    else runs.push([v, v])
  }
  const first = verses[0]
  const last = verses[verses.length - 1]
  const refLabel = locString(loc.book, loc.chapter, first, last !== first ? last : undefined)

  const done = () => {
    window.getSelection()?.removeAllRanges()
    setState({ selection: null })
  }

  const highlight = async (labelId: string) => {
    const now = Date.now()
    const version = getState().settings.version
    if (sel.words) {
      const h: Highlight = { id: newId(), label: labelId, book: loc.book, chapter: loc.chapter, v1: sel.words.v1, v2: sel.words.v2, w1: sel.words.w1, w2: sel.words.w2, version, created: now }
      await saveItem('highlights', h)
    } else {
      for (const [a, z] of runs) await saveItem('highlights', { id: newId(), label: labelId, book: loc.book, chapter: loc.chapter, v1: a, v2: z, created: now })
    }
    setState({ highlightLabel: labelId })
    done()
  }

  const clear = async () => {
    const hs = getState().highlights.filter((h) => h.book === loc.book && h.chapter === loc.chapter && h.v2 >= first && h.v1 <= last)
    for (const h of hs) await deleteItem('highlights', h.id)
    done()
  }

  const copy = async () => {
    const res = await chapterText(getState().settings.version, loc.book, loc.chapter)
    const text = sel.words
      ? sel.words.text
      : verses.map((v) => `${v} ${plainText(res.verses[v - 1] ?? '')}`).join(' ')
    const out = `${text}\n— ${refLabel} (${getState().settings.version})`
    try {
      await navigator.clipboard.writeText(out)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {
      window.prompt('Copy this text:', out)
    }
  }

  const note = () => {
    setState({ selection: null, editor: { kind: 'note', note: { book: loc.book, chapter: loc.chapter, verse: first, v2: last !== first ? last : undefined } } })
    window.getSelection()?.removeAllRanges()
  }
  const journal = () => {
    setState((s) => ({
      selection: null,
      editor: { kind: 'journal', entry: { book: loc.book, chapter: loc.chapter, verse: first, v2: last !== first ? last : undefined, template: s.settings.journalTemplate } },
    }))
    window.getSelection()?.removeAllRanges()
  }
  const bookmark = async () => {
    await saveItem('bookmarks', { id: newId(), book: loc.book, chapter: loc.chapter, verse: first, created: Date.now() })
    done()
  }

  const licensed = !!versionInfo(getState().settings.version)?.licensed

  return (
    <div ref={ref} className="selbar" style={{ left: pos.left, top: pos.top }} role="toolbar" aria-label="Selection actions" onMouseDown={(e) => e.preventDefault()}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong style={{ fontFamily: 'var(--serif)', fontSize: 16 }}>
          {refLabel}
          {sel.words && <span className="faint small"> · selected words</span>}
        </strong>
        <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={done} aria-label="Close">
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="row">
        {labels.map((l) => (
          <button key={l.id} className="swatch" style={{ background: l.color }} onClick={() => highlight(l.id)} title={`Highlight as “${l.name}”`} disabled={licensed && !!sel.words}>
            {l.name}
          </button>
        ))}
        <button className="swatch clear" onClick={clear} title="Remove highlights here">
          <Icon name="close" size={13} /> Clear
        </button>
      </div>
      <div className="row">
        <button className="btn small" onClick={note}>
          <Icon name="note" size={15} /> Note
        </button>
        <button className="btn small" onClick={journal}>
          <Icon name="journal" size={15} /> Journal
        </button>
        <button className="btn small" onClick={bookmark}>
          <Icon name="bookmark" size={15} /> Bookmark
        </button>
        <button className="btn small" onClick={copy}>
          <Icon name={copied ? 'check' : 'copy'} size={15} /> {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

function range(a: number, z: number) {
  const out: number[] = []
  for (let v = a; v <= z; v++) out.push(v)
  return out
}
