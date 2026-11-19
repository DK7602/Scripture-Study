import { useEffect, useMemo, useRef, useState } from 'react'
import { book } from '../lib/data'
import { useCaps } from '../lib/caps'
import {
  fatherRefs,
  fathersForBook,
  historyDoc,
  historyIndex,
  searchHistory,
  TYPE_LABEL,
  type FatherComment,
  type HistoryDoc,
  type HistoryHit,
  type HistoryIndex,
} from '../lib/history'
import { formatRef, locString, parseRef } from '../lib/refs'
import { Icon } from '../components/Icon'
import { RefLinks } from './RefLinks'
import { ui } from '../lib/ui'

type Open = { kind: 'doc'; id: string; section?: number; find?: string } | { kind: 'father'; id: string } | null

const FILTERS: { id: string; label: string }[] = [
  { id: 'father', label: 'Church Fathers' },
  { id: 'council', label: 'Councils' },
  { id: 'creed', label: 'Creeds' },
  { id: 'confession', label: 'Confessions' },
  { id: 'catechism', label: 'Catechisms' },
]

function Mark({ text, q }: { text: string; q: string }) {
  const caps = useCaps()
  const terms = (/^".*"$/.test(q) ? [q.slice(1, -1)] : q.split(/\s+/)).filter((w) => w.length > 1)
  const shown = caps(text)
  if (!terms.length) return <>{shown}</>
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'giu')
  return <>{shown.split(re).map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p))}</>
}

/** Search mode: what the Church Fathers, councils, creeds, confessions and catechisms say. */
export function HistorySearch({ q }: { q: string }) {
  const [index, setIndex] = useState<HistoryIndex | null | undefined>(undefined)
  const [types, setTypes] = useState<Set<string>>(() => new Set(FILTERS.map((f) => f.id)))
  const [withFathers, setWithFathers] = useState(true)
  const [hits, setHits] = useState<HistoryHit[] | null>(null)
  const [progress, setProgress] = useState(1)
  const [open, setOpen] = useState<Open>(null)
  const [shown, setShown] = useState(60)
  const run = useRef(0)
  const caps = useCaps()

  useEffect(() => {
    historyIndex().then(setIndex)
  }, [])

  const term = q.trim().toLowerCase()
  const nameMatches = useMemo(() => {
    if (!index || term.length < 2) return { docs: [], fathers: [] }
    return {
      docs: index.docs.filter((d) => types.has(d.type) && `${d.title} ${d.author} ${d.tradition} ${d.year}`.toLowerCase().includes(term)),
      fathers: types.has('father') ? index.fathers.filter((f) => f.name.toLowerCase().includes(term)) : [],
    }
  }, [index, term, types])

  useEffect(() => {
    setOpen(null)
    setShown(60)
    if (!q.trim() || !index) return setHits(null)
    const id = ++run.current
    setHits([])
    setProgress(0)
    searchHistory(q.trim(), {
      types,
      fathers: withFathers,
      isLive: () => run.current === id,
      onProgress: (p, h) => {
        if (run.current !== id) return
        setProgress(p)
        setHits([...h])
      },
    }).then((h) => run.current === id && (setHits([...h]), setProgress(1)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, index, [...types].join(), withFathers])

  if (open?.kind === 'doc') return <DocViewer id={open.id} section={open.section} find={open.find} onBack={() => setOpen(null)} />
  if (open?.kind === 'father' && index) return <FatherView father={index.fathers.find((f) => f.id === open.id)!} onBack={() => setOpen(null)} />

  if (index === undefined) return <div className="spinner" />
  if (index === null)
    return (
      <div className="notice" style={{ marginTop: 14 }}>
        <h4>Church history library not installed</h4>
        Run <code>python3 scripts/build_history.py</code> to add the Church Fathers, councils, creeds and catechisms.
      </div>
    )

  const toggle = (t: string) => {
    const n = new Set(types)
    if (n.has(t) && n.size > 1) n.delete(t)
    else n.add(t)
    setTypes(n)
  }
  const grouped = (hits ?? []).reduce<Record<string, HistoryHit[]>>((acc, h) => {
    ;(acc[h.type] ??= []).push(h)
    return acc
  }, {})

  return (
    <div style={{ marginTop: 12 }}>
      <div className="pills" style={{ marginBottom: 8 }}>
        {FILTERS.map((f) => (
          <button key={f.id} className="pill" aria-pressed={types.has(f.id)} onClick={() => toggle(f.id)}>
            {f.label}
          </button>
        ))}
      </div>
      {types.has('father') && (
        <button className="toggle" onClick={() => setWithFathers(!withFathers)} style={{ marginBottom: 8 }}>
          <span className="switch" data-on={withFathers} /> Search the Fathers’ commentary on Scripture
        </button>
      )}

      {!term && (
        <>
          <div className="notice" style={{ marginBottom: 12 }}>
            <h4>The witness of the church</h4>
            Search a topic (e.g. <i>Trinity</i>, <i>justification</i>, <i>baptism</i>) to see what the Church Fathers, the ecumenical councils, the creeds,
            confessions and catechisms say — or type a name (<i>Heidelberg</i>, <i>Nicene</i>, <i>Westminster</i>, <i>Augustine</i>) to open the document or writer.
          </div>
          {FILTERS.filter((f) => f.id !== 'father' && types.has(f.id)).map((f) => {
            const list = index.docs.filter((d) => d.type === f.id)
            if (!list.length) return null
            return (
              <div key={f.id}>
                <div className="section-title small">{f.label}</div>
                {list.map((d) => (
                  <button key={d.id} className="result" onClick={() => setOpen({ kind: 'doc', id: d.id })}>
                    <span className="r">{caps(d.title)}</span>
                    <span className="faint small">{[d.year, d.author, d.tradition].filter(Boolean).join(' · ')}</span>
                  </button>
                ))}
              </div>
            )
          })}
          {types.has('father') && index.fathers.length > 0 && (
            <>
              <div className="section-title small">Church Fathers & early writers</div>
              <div className="pills">
                {index.fathers.map((f) => (
                  <button key={f.id} className="pill" onClick={() => setOpen({ kind: 'father', id: f.id })} title={`${f.years} · ${f.count} comments`}>
                    {f.name} <span className="muted">{f.years}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {term && (nameMatches.docs.length > 0 || nameMatches.fathers.length > 0) && (
        <>
          <div className="section-title small">Documents & writers</div>
          {nameMatches.docs.map((d) => (
            <button key={d.id} className="help-card" onClick={() => setOpen({ kind: 'doc', id: d.id })}>
              <span className="thumb"><Icon name="scroll" /></span>
              <span>
                {caps(d.title)}
                <div className="small subtle">{[TYPE_LABEL[d.type], d.year, d.author, d.tradition].filter(Boolean).join(' · ')}</div>
              </span>
            </button>
          ))}
          {nameMatches.fathers.map((f) => (
            <button key={f.id} className="help-card" onClick={() => setOpen({ kind: 'father', id: f.id })}>
              <span className="thumb"><Icon name="quote" /></span>
              <span>
                {f.name}
                <div className="small subtle">{f.years} · {f.count.toLocaleString()} comments on Scripture</div>
              </span>
            </button>
          ))}
        </>
      )}

      {term && hits && (
        <>
          <div className="section-title" style={{ marginTop: 14 }}>
            What they say about “{q}” <span className="faint small">({hits.length.toLocaleString()})</span>
          </div>
          {progress < 1 && (
            <div className="small subtle" style={{ margin: '4px 0 10px' }}>
              Searching… {Math.round(progress * 100)}%
              <div style={{ height: 4, background: 'var(--rule)', borderRadius: 2, marginTop: 4 }}>
                <div style={{ width: `${progress * 100}%`, height: 4, background: 'var(--accent)', borderRadius: 2 }} />
              </div>
            </div>
          )}
          {['council', 'creed', 'confession', 'catechism', 'father'].map((t) => {
            const list = grouped[t]
            if (!list?.length) return null
            return (
              <div key={t}>
                <div className="section-title small" style={{ color: 'var(--accent)' }}>
                  {t === 'father' ? 'Church Fathers' : TYPE_LABEL[t] + 's'} <span className="faint">({list.length})</span>
                </div>
                {list.slice(0, shown).map((h, i) => (
                  <button
                    key={i}
                    className="result"
                    onClick={() => (h.kind === 'doc' ? setOpen({ kind: 'doc', id: h.id, section: h.section, find: q }) : setOpen({ kind: 'father', id: h.id }))}
                  >
                    <span className="r">{caps(h.title)}</span>
                    <span className="vtag">{h.kind === 'father' && h.ref ? formatRef(h.ref, true) : h.where}</span>
                    <div className="subtle">
                      <Mark text={h.text} q={q} />
                    </div>
                  </button>
                ))}
                {list.length > shown && (
                  <button className="btn small" style={{ margin: '6px 0 12px' }} onClick={() => setShown(shown + 100)}>
                    Show more
                  </button>
                )}
              </div>
            )
          })}
          {progress >= 1 && !hits.length && <p className="empty">Nothing found for “{q}”.</p>}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// Document reader
// ---------------------------------------------------------------------------------------------
export function DocViewer({ id, section, find, onBack }: { id: string; section?: number; find?: string; onBack: () => void }) {
  const [doc, setDoc] = useState<HistoryDoc | null>(null)
  const [q, setQ] = useState(find ?? '')
  const [toc, setToc] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const caps = useCaps()
  useEffect(() => {
    historyDoc(id).then(setDoc)
  }, [id])
  useEffect(() => {
    if (!doc) return
    const el = ref.current?.querySelector(`[data-sec="${section ?? 0}"]`) as HTMLElement | null
    if (section !== undefined && el) setTimeout(() => el.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60)
    else ref.current?.closest('.panel-body, .view')?.scrollTo({ top: 0 })
  }, [doc, section])
  const term = q.trim().toLowerCase()
  const visible = useMemo(
    () => (doc?.sections ?? []).map((s, i) => ({ s, i })).filter(({ s }) => !term || `${s.title ?? ''} ${s.q ?? ''} ${s.text}`.toLowerCase().includes(term)),
    [doc, term],
  )
  if (!doc) return <div className="spinner" />
  const jump = (i: number) => {
    setToc(false)
    setQ('')
    setTimeout(() => (ref.current?.querySelector(`[data-sec="${i}"]`) as HTMLElement | null)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 30)
  }
  return (
    <div ref={ref} style={{ marginTop: 10 }}>
      <button className="btn small" onClick={onBack}>
        <Icon name="left" size={15} /> Results
      </button>
      <h3 style={{ fontFamily: 'var(--serif)', fontSize: ui(25), margin: '12px 0 2px' }}>{caps(doc.title)}</h3>
      <div className="faint" style={{ marginBottom: 8 }}>
        {[TYPE_LABEL[doc.type], doc.year, doc.author, doc.tradition].filter(Boolean).join(' · ')}
      </div>
      {doc.source && <div className="faint small" style={{ marginBottom: 8 }}>Text: {doc.source}</div>}
      {doc.intro && <p style={{ fontFamily: 'var(--serif)', fontSize: ui(16.5) }}>{caps(doc.intro)}</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <div className="searchbox" style={{ flex: '1 1 200px' }}>
          <Icon name="search" size={18} />
          <input placeholder="Find in this document…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find in document" />
        </div>
        {doc.sections.length > 3 && (
          <button className="btn small" onClick={() => setToc(!toc)}>
            <Icon name="menu" size={15} /> Contents ({doc.sections.length})
          </button>
        )}
      </div>
      {toc && (
        <div className="card" style={{ maxHeight: 320, overflow: 'auto' }}>
          {doc.sections.map((s, i) => (
            <button key={i} className="result" style={{ padding: '6px 2px' }} onClick={() => jump(i)}>
              <span className="r">{s.n}</span>
              {caps(s.title || s.q || s.text.slice(0, 80))}
            </button>
          ))}
        </div>
      )}
      {term && <p className="faint small">{visible.length} section{visible.length === 1 ? '' : 's'} contain “{q}”.</p>}
      <div className="commentary">
        {visible.map(({ s, i }) => (
          <section key={i} data-sec={i} className={`comm-entry${i === section ? ' current' : ''}`}>
            {(s.n || s.title) && (
              <div className="range">
                {s.n}
                {s.n && s.title ? ' — ' : ''}
                {s.title && caps(s.title)}
              </div>
            )}
            {s.q && (
              <p style={{ fontWeight: 600 }}>
                <Mark text={s.q} q={q} />
              </p>
            )}
            {s.text.split(/\n\n+/).map((para, k) => (
              <p key={k}>
                <Mark text={para} q={q} />
              </p>
            ))}
            {s.refs && s.refs.length > 0 && (
              <p className="small" style={{ fontFamily: 'var(--sans)' }}>
                <span className="subtle">Scripture: </span>
                <RefLinks refs={s.refs.filter((r) => parseRef(r))} />
              </p>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// One writer's comments on Scripture
// ---------------------------------------------------------------------------------------------
function FatherView({ father, onBack }: { father: { id: string; name: string; years: string; era: string; count: number }; onBack: () => void }) {
  const [refs, setRefs] = useState<string[] | null>(null)
  const [openBook, setOpenBook] = useState<string | null>(null)
  const [comments, setComments] = useState<{ ref: string; c: FatherComment }[]>([])
  const caps = useCaps()
  useEffect(() => {
    fatherRefs(father.id).then(setRefs)
  }, [father.id])
  const byBook = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of refs ?? []) {
      const b = r.split('.')[0]
      m.set(b, (m.get(b) ?? 0) + 1)
    }
    return [...m]
  }, [refs])
  useEffect(() => {
    if (!openBook) return
    fathersForBook(openBook).then((d) => {
      const out: { ref: string; c: FatherComment }[] = []
      for (const [cv, list] of Object.entries(d)) {
        for (const c of list) if (c.f === father.id) out.push({ ref: `${openBook}.${cv.replace(':', '.')}${c.v2 ? '-' + c.v2 : ''}`, c })
      }
      out.sort((a, b) => {
        const ra = parseRef(a.ref)!
        const rb = parseRef(b.ref)!
        return ra.c1 - rb.c1 || (ra.v1 ?? 0) - (rb.v1 ?? 0)
      })
      setComments(out)
    })
  }, [openBook, father.id])
  return (
    <div style={{ marginTop: 10 }}>
      <button className="btn small" onClick={openBook ? () => setOpenBook(null) : onBack}>
        <Icon name="left" size={15} /> {openBook ? father.name : 'Results'}
      </button>
      <h3 style={{ fontFamily: 'var(--serif)', fontSize: ui(25), margin: '12px 0 2px' }}>{father.name}</h3>
      <div className="faint" style={{ marginBottom: 10 }}>
        {father.years} · {father.era} · {father.count.toLocaleString()} comments on Scripture
      </div>
      {!refs && <div className="spinner" />}
      {refs && !openBook && (
        <div className="pills">
          {byBook.map(([b, n]) => (
            <button key={b} className="pill" onClick={() => setOpenBook(b)}>
              {book(b)?.name} <span className="muted">({n})</span>
            </button>
          ))}
        </div>
      )}
      {openBook && (
        <div className="commentary">
          <h3>{father.name} on {book(openBook)?.name}</h3>
          {comments.map(({ ref, c }, i) => (
            <div key={i} className="comm-entry">
              <div className="range">
                <RefLinks refs={[ref]} />
                {c.s && <span className="faint" style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}> · {c.s}</span>}
              </div>
              {c.t.split(/\n\n+/).map((p, k) => (
                <p key={k}>{caps(p)}</p>
              ))}
            </div>
          ))}
          {!comments.length && <div className="spinner" />}
        </div>
      )}
    </div>
  )
}

/** Study-tab panel: what the Fathers say on the chapter being read. */
export function FathersPanel({ bookId, chapter, verse, onVerse }: { bookId: string; chapter: number; verse: number; onVerse: (v: number) => void }) {
  const [data, setData] = useState<Record<string, FatherComment[]> | null>(null)
  const [index, setIndex] = useState<HistoryIndex | null>(null)
  const [eraFilter, setEraFilter] = useState<'all' | 'patristic'>('all')
  const caps = useCaps()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    historyIndex().then(setIndex)
  }, [])
  useEffect(() => {
    setData(null)
    fathersForBook(bookId).then(setData)
  }, [bookId])
  const fathers = useMemo(() => Object.fromEntries((index?.fathers ?? []).map((f) => [f.id, f])), [index])
  const rows = useMemo(() => {
    const out: { v: number; v2?: number; c: FatherComment }[] = []
    for (const [cv, list] of Object.entries(data ?? {})) {
      const [c, v] = cv.split(':').map(Number)
      if (c !== chapter) continue
      for (const x of list) if (eraFilter === 'all' || fathers[x.f]?.era === 'patristic') out.push({ v, v2: x.v2, c: x })
    }
    return out.sort((a, b) => a.v - b.v)
  }, [data, chapter, eraFilter, fathers])
  useEffect(() => {
    const el = ref.current?.querySelector('.comm-entry.current') as HTMLElement | null
    el?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [verse, rows])
  if (!index) return <p className="empty">The church history library is not installed.</p>
  if (!data) return <div className="spinner" />
  return (
    <div className="commentary" ref={ref}>
      <h3>The Church Fathers on {locString(bookId, chapter)}</h3>
      <div className="pills" style={{ marginBottom: 8 }}>
        <button className="pill" aria-pressed={eraFilter === 'all'} onClick={() => setEraFilter('all')}>All writers</button>
        <button className="pill" aria-pressed={eraFilter === 'patristic'} onClick={() => setEraFilter('patristic')}>Early church only</button>
      </div>
      {!rows.length && <p className="empty">No comments from the Fathers on this chapter in the library.</p>}
      {rows.map(({ v, v2, c }, i) => {
        const f = fathers[c.f]
        const current = verse >= v && verse <= (v2 ?? v)
        return (
          <div key={i} className={`comm-entry${current ? ' current' : ''}`} onClick={() => onVerse(v)}>
            <div className="range">
              {v2 ? `Verses ${v}–${v2}` : `Verse ${v}`} · {f?.name ?? c.f}
              {f?.years && <span className="faint" style={{ fontWeight: 400 }}> ({f.years})</span>}
            </div>
            {c.t.split(/\n\n+/).map((p, k) => (
              <p key={k}>{caps(p)}</p>
            ))}
            {c.s && <p className="faint small" style={{ fontFamily: 'var(--sans)' }}>{c.s}</p>}
          </div>
        )
      })}
    </div>
  )
}
