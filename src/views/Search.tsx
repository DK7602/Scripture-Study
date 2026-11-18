import { useEffect, useMemo, useRef, useState } from 'react'
import { bibleBook, books, getJSON, strongs, topicEntry, topicIndex, versions } from '../lib/data'
import { plainText } from '../lib/markup'
import { formatRef, locString, parseHumanRef, refToString } from '../lib/refs'
import { go, openPopup, useStore } from '../lib/store'
import type { StrongsEntry } from '../lib/types'
import { Icon } from '../components/Icon'
import { loadPassage, passagePlain } from '../lib/passage'
import { useCaps, useCapsHtml } from '../lib/caps'

type Mode = 'topical' | 'word'

export function SearchView() {
  const [mode, setMode] = useState<Mode>('topical')
  const [q, setQ] = useState('')
  const [submitted, setSubmitted] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => inputRef.current?.focus(), [mode])
  const asRef = parseHumanRef(q)

  return (
    <div>
      <div className="pills" style={{ marginBottom: 12 }}>
        <button className="pill" aria-pressed={mode === 'topical'} onClick={() => setMode('topical')}>
          Topical
        </button>
        <button className="pill" aria-pressed={mode === 'word'} onClick={() => setMode('word')}>
          Word (Literal)
        </button>
      </div>
      <form
        className="searchbox"
        onSubmit={(e) => {
          e.preventDefault()
          setSubmitted(q.trim())
        }}
      >
        <Icon name="search" size={18} />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={mode === 'topical' ? 'A topic or word — e.g. abide, prayer, grace' : 'Words or "an exact phrase" in the Bible'}
          aria-label="Search"
          enterKeyHint="search"
        />
        {q && (
          <button type="button" className="icon-btn" onClick={() => { setQ(''); setSubmitted('') }} aria-label="Clear">
            <Icon name="close" size={18} />
          </button>
        )}
        <button className="btn small primary" type="submit">Search</button>
      </form>
      {asRef && q.match(/\d/) && (
        <button className="help-card" style={{ marginTop: 10 }} onClick={() => go({ book: asRef.book, chapter: asRef.c1, verse: asRef.v1 ?? 1 }, { tab: 'bible' })}>
          <span className="thumb"><Icon name="book" /></span>
          <span>Go to {formatRef(asRef)}</span>
        </button>
      )}
      {mode === 'topical' ? <Topical q={submitted} live={q} /> : <WordSearch q={submitted} />}
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// Topical: Nave's, Torrey's, Easton's and Strong's
// ---------------------------------------------------------------------------------------------
const SOURCES: Record<string, string> = { nave: "Nave's Topical Bible", torrey: "Torrey's New Topical Textbook", easton: "Easton's Bible Dictionary" }

function Topical({ q, live }: { q: string; live: string }) {
  const [index, setIndex] = useState<Record<string, string[]> | null>(null)
  const [open, setOpen] = useState<{ source: string; name: string } | null>(null)
  const [words, setWords] = useState<Record<string, string[]> | null>(null)
  const [lex, setLex] = useState<[string, StrongsEntry][]>([])
  const caps = useCaps()
  useEffect(() => {
    topicIndex().then(setIndex)
  }, [])
  const term = (live || q).trim().toLowerCase()
  useEffect(() => {
    setOpen(null)
    if (!q) return setLex([])
    getJSON<Record<string, string[]>>('strongs/words.json').then(setWords)
  }, [q])
  useEffect(() => {
    if (!words || !q) return
    const key = q.toLowerCase().replace(/[^a-z']/g, '')
    const nums = words[key] ?? words[key.replace(/(eth|ed|ing|s)$/, '')] ?? []
    Promise.all(nums.slice(0, 8).map((n) => strongs(n).then((e) => [n, e] as [string, StrongsEntry | null]))).then((r) =>
      setLex(r.filter((x): x is [string, StrongsEntry] => !!x[1])),
    )
  }, [words, q])

  const matches = useMemo(() => {
    if (!index || term.length < 2) return []
    const out: { source: string; name: string; score: number }[] = []
    for (const [source, names] of Object.entries(index)) {
      for (const name of names) {
        const n = name.toLowerCase()
        let score = -1
        if (n === term) score = 0
        else if (n.startsWith(term + ',') || n.startsWith(term + ' ')) score = 1
        else if (n.startsWith(term)) score = 2
        else if (n.includes(term)) score = 3
        if (score >= 0) out.push({ source, name, score })
      }
    }
    return out.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name)).slice(0, 60)
  }, [index, term])

  if (open) return <TopicDetail {...open} onBack={() => setOpen(null)} />

  if (!term)
    return (
      <div className="notice" style={{ marginTop: 14 }}>
        <h4>Search by topic</h4>
        Find a topic in Nave’s Topical Bible (5,300+ topics) and Torrey’s Topical Textbook, a definition in Easton’s Bible Dictionary,
        and the Hebrew and Greek words the KJV translates with your word.
        <div className="pills" style={{ marginTop: 10 }}>
          {['Abide', 'Faith', 'Prayer', 'Grace', 'Holy Spirit', 'Covenant', 'Love', 'Temple'].map((t) => (
            <button key={t} className="pill" onClick={() => setOpen({ source: 'nave', name: t })}>{t}</button>
          ))}
        </div>
      </div>
    )

  return (
    <div style={{ marginTop: 12 }}>
      {matches.length > 0 && (
        <>
          <div className="section-title">
            Topical Results: {live || q} <span className="faint small">({matches.length})</span>
          </div>
          {matches.map((m) => (
            <button key={m.source + m.name} className="result" onClick={() => setOpen(m)}>
              <span className="r">{caps(m.name)}</span>
              <span className="vtag">{m.source === 'nave' ? "Nave's" : m.source === 'torrey' ? "Torrey's" : "Easton's"}</span>
            </button>
          ))}
        </>
      )}
      {q && lex.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 16 }}>
            Original-language words translated “{q}”
          </div>
          {lex.map(([n, e]) => (
            <button
              key={n}
              className="result"
              onClick={(ev) => {
                const r = (ev.currentTarget as HTMLElement).getBoundingClientRect()
                const first = e.b[0]?.[0] ?? 'GEN'
                openPopup({ kind: 'strongs', num: n, word: e.u[0]?.[0] ?? q, book: first, chapter: 1, verse: 1, x: r.left + 40, y: r.top })
              }}
            >
              <span className="r">{n}</span>
              <span lang={n[0] === 'H' ? 'he' : 'el'} style={{ fontSize: '1.1em' }}>{e.l}</span> <i className="subtle">{e.x}</i> — {caps(e.d.slice(0, 120))}
              {e.d.length > 120 ? '…' : ''}
              <div className="faint small">KJV: {caps(e.u.slice(0, 6).map(([w, c]) => `${w} (${c})`).join(', '))}</div>
            </button>
          ))}
        </>
      )}
      {!matches.length && !lex.length && q && <p className="empty">No topics found for “{q}”. Try the Word (Literal) search.</p>}
      {!q && matches.length === 0 && <p className="faint">Press Search to look up “{live}”.</p>}
    </div>
  )
}

function TopicDetail({ source, name, onBack }: { source: string; name: string; onBack: () => void }) {
  const [html, setHtml] = useState<string | null | undefined>(undefined)
  const [verses, setVerses] = useState<{ ref: string; text: string }[] | null>(null)
  const caps = useCaps()
  const capsHtml = useCapsHtml()
  useEffect(() => {
    setVerses(null)
    topicEntry(source, name).then(setHtml)
  }, [source, name])
  const refs = useMemo(() => [...new Set([...(html ?? '').matchAll(/data-r="([^"]+)"/g)].map((m) => m[1]))], [html])
  const onClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a[data-r]') as HTMLElement | null
    if (!a) return
    const r = a.getBoundingClientRect()
    openPopup({ kind: 'ref', ref: a.dataset.r!, x: r.left, y: r.bottom + 6 })
  }
  const readAll = async () => {
    setVerses([])
    const out: { ref: string; text: string }[] = []
    for (const r of refs.slice(0, 80)) {
      const p = await loadPassage(r, 6)
      out.push({ ref: r, text: p.verses.map(passagePlain).join(' ') })
      setVerses([...out])
    }
  }
  return (
    <div style={{ marginTop: 12 }}>
      <button className="btn small" onClick={onBack}>
        <Icon name="left" size={15} /> Results
      </button>
      <h3 style={{ fontFamily: 'var(--serif)', fontSize: 24, margin: '12px 0 2px' }}>{caps(name)}</h3>
      <div className="faint small" style={{ marginBottom: 10 }}>{SOURCES[source]}</div>
      {html === undefined && <div className="spinner" />}
      {html === null && <p className="empty">Topic not found.</p>}
      {html && <div className="topic-body" onClick={onClick} dangerouslySetInnerHTML={{ __html: capsHtml(html).replace(/<(a|span)\b([^>]*)>/gi, (_m, t: string, a: string) => `<${t}${(a.match(/ data-r="[^"]*"/) ?? [''])[0]}>`) }} />}
      {refs.length > 0 && (
        <>
          <hr className="rule" />
          {verses === null ? (
            <button className="btn" onClick={readAll}>
              <Icon name="book" size={16} /> Read all {Math.min(refs.length, 80)} passages
            </button>
          ) : (
            verses.map((v) => (
              <button key={v.ref} className="result" onClick={() => {
                const r = parseHumanRef(formatRef(v.ref))
                if (r) go({ book: r.book, chapter: r.c1, verse: r.v1 ?? 1 }, { tab: window.innerWidth < 900 ? 'bible' : undefined })
              }}>
                <span className="r">{formatRef(v.ref)}</span>
                <span className="subtle">{caps(v.text)}</span>
              </button>
            ))
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// Literal word search across every bundled translation
// ---------------------------------------------------------------------------------------------
interface Hit {
  vid: number
  book: string
  chapter: number
  verse: number
  versions: string[]
  text: string
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function WordSearch({ q }: { q: string }) {
  const settings = useStore((s) => s.settings)
  const loc = useStore((s) => s.loc)
  const pd = versions().filter((v) => !v.licensed)
  const [sel, setSel] = useState<string[]>(() => pd.map((v) => v.id))
  const [scope, setScope] = useState<'all' | 'OT' | 'NT' | 'book'>('all')
  const [whole, setWhole] = useState(true)
  const [hits, setHits] = useState<Hit[] | null>(null)
  const [progress, setProgress] = useState(0)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [shown, setShown] = useState(100)
  const [vfilter, setVfilter] = useState('')
  const run = useRef(0)
  const caps = useCaps()

  useEffect(() => {
    if (!q) return setHits(null)
    const id = ++run.current
    setHits([])
    setShown(100)
    setVfilter('')
    setProgress(0)
    ;(async () => {
      const phrase = /^".*"$/.test(q)
      const words = phrase ? [q.slice(1, -1)] : q.split(/\s+/).filter(Boolean)
      const res = words.map((w) => new RegExp(whole ? `(?<![\\p{L}])${escapeRe(w)}(?![\\p{L}])` : escapeRe(w), 'iu'))
      const list = books().filter((b) => scope === 'all' || (scope === 'book' ? b.id === loc.book : b.t === scope))
      const map = new Map<number, Hit>()
      const cnt: Record<string, number> = {}
      let done = 0
      for (const v of sel) {
        for (const b of list) {
          if (run.current !== id) return
          const data = await bibleBook(v, b.id)
          const bi = books().indexOf(b) + 1
          data.c.forEach((ch, ci) =>
            ch.forEach((raw, vi) => {
              if (!raw) return
              const text = plainText(raw)
              if (!res.every((r) => r.test(text))) return
              const vid = bi * 1e6 + (ci + 1) * 1e3 + vi + 1
              cnt[v] = (cnt[v] ?? 0) + 1
              const h = map.get(vid)
              if (h) h.versions.push(v)
              else map.set(vid, { vid, book: b.id, chapter: ci + 1, verse: vi + 1, versions: [v], text })
            }),
          )
          done++
          setProgress(done / (list.length * sel.length))
        }
      }
      if (run.current !== id) return
      setCounts(cnt)
      setHits([...map.values()].sort((a, b) => a.vid - b.vid))
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, sel.join(), scope, whole])

  const terms = useMemo(() => (/^".*"$/.test(q) ? [q.slice(1, -1)] : q.split(/\s+/).filter(Boolean)), [q])
  const markRe = useMemo(() => (terms.length ? new RegExp(`(${terms.map(escapeRe).join('|')})`, 'giu') : null), [terms])
  const visible = (hits ?? []).filter((h) => !vfilter || h.versions.includes(vfilter))

  return (
    <div style={{ marginTop: 12 }}>
      <div className="pills" style={{ marginBottom: 8 }}>
        {pd.map((v) => (
          <button
            key={v.id}
            className="pill"
            aria-pressed={sel.includes(v.id)}
            title={v.name}
            onClick={() => setSel(sel.includes(v.id) ? (sel.length > 1 ? sel.filter((x) => x !== v.id) : sel) : [...sel, v.id])}
          >
            {v.id}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <select className="select" style={{ fontSize: 15 }} value={scope} onChange={(e) => setScope(e.target.value as typeof scope)} aria-label="Search scope">
          <option value="all">Whole Bible</option>
          <option value="OT">Old Testament</option>
          <option value="NT">New Testament</option>
          <option value="book">{books().find((b) => b.id === loc.book)?.name} only</option>
        </select>
        <button className="toggle" onClick={() => setWhole(!whole)}>
          <span className="switch" data-on={whole} /> Whole words
        </button>
      </div>
      {settings.version && versions().find((v) => v.id === settings.version)?.licensed && (
        <p className="faint small">Licensed versions are read live and can’t be searched; the search covers the bundled translations.</p>
      )}
      {!q && (
        <div className="notice">
          <h4>Literal word search</h4>
          Finds every verse containing your words in the selected translations and shows which translation each comes from.
          Put a phrase in quotes for an exact match, e.g. <i>"abide in me"</i>.
        </div>
      )}
      {q && hits && progress < 1 && (
        <div className="small subtle" style={{ margin: '8px 0' }}>
          Searching… {Math.round(progress * 100)}%
          <div style={{ height: 4, background: 'var(--rule)', borderRadius: 2, marginTop: 4 }}>
            <div style={{ width: `${progress * 100}%`, height: 4, background: 'var(--accent)', borderRadius: 2 }} />
          </div>
        </div>
      )}
      {q && hits && progress >= 1 && (
        <>
          <div className="section-title">
            {visible.length.toLocaleString()} verse{visible.length === 1 ? '' : 's'}
          </div>
          <div className="pills" style={{ marginBottom: 8 }}>
            <button className="pill" aria-pressed={!vfilter} onClick={() => setVfilter('')}>All</button>
            {sel.map((v) => (
              <button key={v} className="pill" aria-pressed={vfilter === v} onClick={() => setVfilter(v)}>
                {v} <span className="muted">({counts[v] ?? 0})</span>
              </button>
            ))}
          </div>
          {visible.slice(0, shown).map((h) => (
            <button key={h.vid} className="result" onClick={() => go({ book: h.book, chapter: h.chapter, verse: h.verse }, { tab: window.innerWidth < 900 ? 'bible' : undefined })}>
              <span className="r">{locString(h.book, h.chapter, h.verse)}</span>
              {h.versions.map((v) => (
                <span key={v} className="vtag">{v}</span>
              ))}
              <div>{markRe ? caps(h.text, `${h.book}.${h.chapter}.${h.verse}`).split(markRe).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part)) : caps(h.text)}</div>
            </button>
          ))}
          {visible.length > shown && (
            <button className="btn" style={{ marginTop: 10 }} onClick={() => setShown(shown + 200)}>
              Show more
            </button>
          )}
        </>
      )}
    </div>
  )
}

export { refToString }
