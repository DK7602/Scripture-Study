import { useEffect, useMemo, useRef, useState } from 'react'
import { book, tryJSON } from '../lib/data'
import { formatRef } from '../lib/refs'
import { Icon } from '../components/Icon'

/** [first verse, last verse, sermon no., title, short date] */
type Entry = [number, number, string, string, string]
interface Sermon {
  t: string // title
  d: string // when and where it was preached
  r: string[] // its text(s), compact references
  v: number // volume
  h: string // the sermon, as HTML
}

const BUNDLE = 10 // sermons per text file (scripts/build_sermons.py)

function sermonsOn(bookId: string) {
  return tryJSON<Record<string, Entry[]>>(`sermons/books/${bookId}.json`).then((x) => x ?? {})
}

function sermon(no: string) {
  const n = parseInt(no, 10)
  return tryJSON<Record<string, Sermon>>(`sermons/text/${Math.floor(n / BUNDLE)}.json`).then((b) => b?.[no] ?? null)
}

/**
 * Spurgeon's sermons on the chapter in view (the New Park Street and Metropolitan Tabernacle Pulpit, 3,500 sermons
 * by their texts), the ones on the current verse first in mind; tap one to read it whole.
 */
export function SpurgeonSermons({
  bookId,
  chapter,
  verse,
  onGo,
  onRefClick,
  show,
}: {
  bookId: string
  chapter: number
  verse: number
  onGo: (chapter: number, verse: number) => void
  onRefClick: (e: React.MouseEvent) => void
  show: (html: string) => { __html: string }
}) {
  const [byChapter, setByChapter] = useState<Record<string, Entry[]> | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [text, setText] = useState<Sermon | null | undefined>(undefined)
  const top = useRef<HTMLDivElement>(null)
  const b = book(bookId)

  useEffect(() => {
    let live = true
    setByChapter(null)
    sermonsOn(bookId).then((x) => live && setByChapter(x))
    return () => {
      live = false
    }
  }, [bookId])

  useEffect(() => {
    if (!open) return
    let live = true
    setText(undefined)
    sermon(open).then((s) => live && setText(s))
    top.current?.scrollIntoView({ block: 'start' })
    return () => {
      live = false
    }
  }, [open])

  const list = byChapter?.[String(chapter)] ?? []
  const others = useMemo(
    () =>
      Object.entries(byChapter ?? {})
        .filter(([c]) => +c !== chapter)
        .map(([c, l]) => [+c, l.length, l[0][0]] as const)
        .sort((x, y) => x[0] - y[0]),
    [byChapter, chapter],
  )
  const here = (e: Entry) => verse >= e[0] && verse <= e[1]
  const where = `${b?.name ?? ''} ${chapter}`

  if (open) {
    const pulpit = text && text.v <= 6 ? 'The New Park Street Pulpit' : 'The Metropolitan Tabernacle Pulpit'
    return (
      <div className="commentary sermon-read" ref={top} onClick={onRefClick}>
        <button className="btn small" onClick={() => setOpen(null)}>
          <Icon name="left" size={15} /> Spurgeon’s sermons on {where}
        </button>
        {text === undefined && <div className="spinner" />}
        {text === null && <p className="empty">This sermon could not be loaded. Check the connection and try again.</p>}
        {text && (
          <>
            <h3 className="sermon-title">{text.t}</h3>
            <div className="sermon-meta">
              <b>C. H. Spurgeon · No. {open}</b>
              {text.d && <div>{text.d}</div>}
              {text.r.length > 0 && (
                <div>
                  Text:{' '}
                  {text.r.map((r, i) => (
                    <span key={r}>
                      {i > 0 && '; '}
                      <a data-r={r}>{formatRef(r)}</a>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="sermon-body" dangerouslySetInnerHTML={show(text.h)} />
            <p className="faint small">
              {pulpit}, volume {text.v}. Public domain; the text from the Christian Classics Ethereal Library (ccel.org).
            </p>
            <button className="btn small" onClick={() => setOpen(null)}>
              <Icon name="left" size={15} /> Back to the sermons on {where}
            </button>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="commentary" ref={top}>
      <h3>Spurgeon’s Sermons</h3>
      {byChapter === null && <div className="spinner" />}
      {byChapter && list.length > 0 && (
        <p className="faint small sermon-intro">
          {list.length} sermon{list.length === 1 ? '' : 's'} C. H. Spurgeon preached on texts in {where}. Tap one to read it.
        </p>
      )}
      {list.map((e) => (
        <button key={`${e[2]}-${e[0]}`} className={`sermon-item${here(e) ? ' current' : ''}`} onClick={() => setOpen(e[2])}>
          <span className="range">{e[0] === e[1] ? `Verse ${e[0]}` : `Verses ${e[0]}–${e[1]}`}</span>
          <span className="sermon-item-title">{e[3]}</span>
          <span className="faint small">
            No. {e[2]}
            {e[4] ? ` · ${e[4]}` : ''}
          </span>
        </button>
      ))}
      {byChapter && !list.length && (
        <p className="empty">
          {others.length ? `Spurgeon has no sermon on a text in ${where}.` : `Spurgeon has no sermon on a text in ${b?.name ?? 'this book'}.`}
        </p>
      )}
      {others.length > 0 && (
        <>
          <p className="faint small" style={{ marginTop: 12 }}>
            {list.length ? `Other chapters of ${b?.name}` : `Chapters of ${b?.name} he preached on`}:
          </p>
          <div className="pills">
            {others.map(([c, n, v]) => (
              <button key={c} className="pill" onClick={() => onGo(c, v)}>
                Ch. {c} <span className="faint">({n})</span>
              </button>
            ))}
          </div>
        </>
      )}
      <p className="faint small" style={{ marginTop: 12 }}>
        The New Park Street and Metropolitan Tabernacle Pulpit (1855–1917): Spurgeon’s sermons by their texts. Public domain; from the Christian
        Classics Ethereal Library.
      </p>
    </div>
  )
}
