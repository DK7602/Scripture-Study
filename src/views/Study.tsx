import { useEffect, useMemo, useRef, useState } from 'react'
import { book, books, commentaryChapter, commentaryIndex, crossRefs } from '../lib/data'
import { formatRef, locString } from '../lib/refs'
import { go, openPopup, updateSettings, useStore } from '../lib/store'
import type { CommentaryChapter, CommentaryInfo } from '../lib/types'
import { Icon } from '../components/Icon'
import { useCapsHtml } from '../lib/caps'
import { FathersPanel } from './History'

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
  { id: 'reformation', label: 'Reformation' },
  { id: 'jfb', label: 'JFB' },
  { id: 'gundry', label: 'Gundry' },
  { id: 'geneva', label: 'Geneva 1599' },
  { id: 'fathers', label: 'Church Fathers' },
]

const UNBUNDLED: Record<string, { name: string; body: string; link?: (b: string, c: number) => string; linkLabel?: string; alt?: string }> = {
  poole: {
    name: "Matthew Poole's Commentary",
    body:
      'Matthew Poole’s Annotations upon the Holy Bible (1683–85) is in the public domain, but no clean digital edition was available to bundle with this version of Scripture Study. You can read Poole on this chapter online, and the app is ready to include it once a public-domain source is added to the data build.',
    link: (b, c) => {
      const name = book(b).name.toLowerCase()
      const slug = name === 'song of solomon' ? 'songs' : name.replace(/ /g, '_')
      return `https://biblehub.com/commentaries/poole/${slug}/${c}.htm`
    },
    linkLabel: 'Read Poole on this chapter (Bible Hub)',
  },
  reformation: {
    name: 'Reformation Study Bible',
    body:
      'The notes of the Reformation Study Bible (Ligonier Ministries, R. C. Sproul, general editor) are copyrighted and can’t be included. The Geneva Bible notes of 1599 — the original Reformation study Bible, used by the Puritans and Pilgrims — are included under the “Geneva 1599” chip.',
    alt: 'geneva',
  },
  gundry: {
    name: "Gundry's Commentary on the New Testament",
    body:
      'Robert H. Gundry’s Commentary on the New Testament (Hendrickson, 2010) is copyrighted and can’t be included. Barnes’ Notes and Calvin’s Commentaries are the closest verse-by-verse New Testament commentaries included here.',
    alt: 'barnes',
  },
}

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
  const [view, setView] = useState({ book: loc.book, chapter: loc.chapter, verse: loc.verse })
  const [data, setData] = useState<CommentaryChapter | null | undefined>(undefined)
  const [intro, setIntro] = useState<string | null>(null)
  const [xref, setXref] = useState<Record<string, string[]>>({})
  const bodyRef = useRef<HTMLDivElement>(null)
  const capsHtml = useCapsHtml()
  const show = (html: string) => ({ __html: capsHtml(clean(html)) })

  useEffect(() => {
    commentaryIndex().then(setIndex)
  }, [])
  useEffect(() => setCid(primary), [primary])
  useEffect(() => {
    if (follow) setView({ book: loc.book, chapter: loc.chapter, verse: loc.verse })
  }, [loc.book, loc.chapter, loc.verse, follow])

  const info = index.find((c) => c.id === cid)
  const covered = info?.books[view.book]
  useEffect(() => {
    let live = true
    setData(undefined)
    setIntro(null)
    if (!info) return
    if (!covered?.includes(view.chapter)) {
      setData(null)
    } else commentaryChapter(cid, view.book, view.chapter).then((d) => live && setData(d))
    if (covered?.includes(0) && view.chapter === 1) commentaryChapter(cid, view.book, 0).then((d) => live && setIntro(d?.i ?? null))
    return () => {
      live = false
    }
  }, [cid, info, covered, view.book, view.chapter])
  useEffect(() => {
    crossRefs(view.book).then(setXref)
  }, [view.book])

  const current = useMemo(() => data?.e?.findIndex(([a, z]) => view.verse >= a && view.verse <= z) ?? -1, [data, view.verse])
  useEffect(() => {
    const el = bodyRef.current?.querySelector('.comm-entry.current') as HTMLElement | null
    el?.scrollIntoView({ block: 'start', behavior: 'smooth' })
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

  const unbundled = UNBUNDLED[cid]
  const refs = xref[`${view.chapter}:${view.verse}`] ?? []

  return (
    <div>
      <div className="section-title">
        <Icon name="book" /> Commentaries
      </div>
      <div className="pills" role="tablist" aria-label="Commentaries">
        {CHIPS.map((c) => (
          <button key={c.id} className="pill" aria-pressed={cid === c.id} onClick={() => setCid(c.id)} title={index.find((x) => x.id === c.id)?.name ?? UNBUNDLED[c.id]?.name}>
            {c.label}
          </button>
        ))}
      </div>

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
        <select className="select" style={{ fontSize: 15, flex: '1 1 140px' }} value={view.book} aria-label="Commentary book" onChange={(e) => { setFollow(false); setView({ book: e.target.value, chapter: 1, verse: 1 }) }}>
          {books().map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <select className="select" style={{ fontSize: 15, flex: '0 1 110px' }} value={view.chapter} aria-label="Commentary chapter" onChange={(e) => { setFollow(false); setView({ ...view, chapter: +e.target.value, verse: 1 }) }}>
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

      {cid === 'fathers' ? (
        <FathersPanel bookId={view.book} chapter={view.chapter} verse={view.verse} onVerse={(v) => setView({ ...view, verse: v })} />
      ) : unbundled ? (
        <div className="notice">
          <h4>{unbundled.name}</h4>
          <p style={{ marginTop: 0 }}>{unbundled.body}</p>
          {unbundled.link && (
            <a className="btn small" href={unbundled.link(view.book, view.chapter)} target="_blank" rel="noreferrer">
              <Icon name="globe" size={15} /> {unbundled.linkLabel}
            </a>
          )}
          {unbundled.alt && (
            <button className="btn small primary" onClick={() => setCid(unbundled.alt!)}>
              Open {index.find((x) => x.id === unbundled.alt)?.name ?? unbundled.alt}
            </button>
          )}
        </div>
      ) : (
        <div className="commentary" ref={bodyRef} onClick={onClick}>
          <h3>{info?.name ?? ''}</h3>
          {info && primary !== cid && (
            <button className="btn small" style={{ marginBottom: 8 }} onClick={() => updateSettings({ primaryCommentary: cid })}>
              Make {CHIPS.find((c) => c.id === cid)?.label} my primary commentary
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
            <div key={a} className={`comm-entry${i === current ? ' current' : ''}`} onClick={() => setView({ ...view, verse: a })}>
              <div className="range">
                {a === z ? `Verse ${a}` : `Verses ${a}–${z}`}
              </div>
              <div dangerouslySetInnerHTML={show(html)} />
            </div>
          ))}
          {info && <p className="faint small">{info.author} ({info.year}). Public domain.</p>}
        </div>
      )}

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
    </div>
  )
}

function describeCoverage(info: CommentaryInfo): string {
  const ids = Object.keys(info.books)
  const nt = ids.filter((b) => book(b)?.t === 'NT').length
  const ot = ids.length - nt
  if (ot === 0) return 'the New Testament only'
  if (nt === 0) return 'the Old Testament only'
  return `${ids.length} of the 66 books`
}
