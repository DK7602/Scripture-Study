import { useEffect, useMemo, useState } from 'react'
import { book, books, concordance, strongs } from '../lib/data'
import { helpData, helpsForChapter, placesForChapter, type BookBackground, type HelpData, type VerseHelp } from '../lib/helps'
import { loadPassage, passagePlain, type PassageVerse } from '../lib/passage'
import { decodeVid, formatRef, locString, parseRef } from '../lib/refs'
import { closeAllPopups, closePopup, go, newId, openPopup, setState, useStore } from '../lib/store'
import type { Place, StrongsEntry } from '../lib/types'
import { Icon } from './Icon'
import { useCaps } from '../lib/caps'
import { Popover } from './Popover'
import { PlacePhoto } from '../views/PlacePhoto'
import { chapterAlign } from '../lib/align'
import { JournalCard, NoteCard } from './Cards'
import { RefLinks } from '../views/RefLinks'

export function Popups() {
  const popup = useStore((s) => s.popup)
  const stack = useStore((s) => s.popupStack)
  if (!popup) return null
  const back = stack.length ? closePopup : undefined
  switch (popup.kind) {
    case 'strongs':
      return <StrongsPopup key={popup.num + popup.verse} {...popup} onBack={back} />
    case 'origwords':
      return <OrigWordsPopup {...popup} onBack={back} />
    case 'ref':
      return <RefPopup key={popup.ref} refStr={popup.ref} x={popup.x} y={popup.y} onBack={back} />
    case 'notes':
      return <NotesPopup {...popup} onBack={back} />
    case 'journal':
      return <JournalPopup {...popup} onBack={back} />
    case 'helps':
      return <HelpsPopup {...popup} onBack={back} />
    case 'info':
      return <InfoPopup {...popup} onBack={back} />
  }
}

function InfoPopup(p: { title: string; text: string; x: number; y: number; onBack?: () => void }) {
  const caps = useCaps()
  return (
    <Popover x={p.x} y={p.y} title={caps(p.title)} onClose={closeAllPopups} onBack={p.onBack}>
      <p style={{ margin: 0 }}>{caps(p.text)}</p>
    </Popover>
  )
}

// ---------------------------------------------------------------------------------------------
// Strong's concordance
// ---------------------------------------------------------------------------------------------
function partOfSpeech(e: StrongsEntry, num: string): string {
  const t = `${e.r} ${e.d}`.toLowerCase()
  if (/primitive root|primary verb|a verb|prolonged form of a primary verb/.test(t)) return 'Verb'
  if (/\bverb\b/.test(t) && !/noun/.test(t)) return 'Verb'
  if (/preposition/.test(t)) return 'Preposition'
  if (/conjunction/.test(t)) return 'Conjunction'
  if (/adverb/.test(t)) return 'Adverb'
  if (/pronoun/.test(t)) return 'Pronoun'
  if (/particle/.test(t)) return 'Particle'
  if (/interjection/.test(t)) return 'Interjection'
  if (/adjective|^\s*\w+ive\b/.test(t)) return 'Adjective'
  if (/(an israelite|a place in|the name of|a son of|a city|a king|an? (egyptian|edomite|levite|canaanite|benjamite)|of foreign origin|of hebrew origin \(h\d+\))/.test(t)) {
    if (/^[A-Z]/.test(e.k) || /name/.test(t)) return 'Proper noun'
  }
  if (/\bnoun\b|^\s*(a|an|the) /.test(e.d.toLowerCase())) return 'Noun'
  if (num.startsWith('G') && /^[a-z ]*from g\d+/.test(e.r.toLowerCase()) && /ness|tion|ment/.test(e.k)) return 'Noun'
  return ''
}

function writtenLine(bg: BookBackground | undefined): string {
  if (!bg) return ''
  const date = bg.date.replace(/^Uncertain/i, 'date uncertain')
  return `${date}${bg.author ? ` by ${bg.author.replace(/^Unknown/, 'an unknown author')}` : ''}${bg.audience ? `, to ${bg.audience.replace(/^to /i, '')}` : ''}.`
}

function StrongsPopup(p: { num: string; word: string; book: string; chapter: number; verse: number; x: number; y: number; version?: string; onBack?: () => void }) {
  const [e, setE] = useState<StrongsEntry | null | undefined>(undefined)
  const [bg, setBg] = useState<BookBackground>()
  const [mode, setMode] = useState<'def' | 'word' | 'book'>('def')
  const [conc, setConc] = useState<Record<string, number[]> | null>(null)
  const [pick, setPick] = useState<string | null>(null)
  const caps = useCaps()

  useEffect(() => {
    strongs(p.num).then(setE)
    helpData().then((d) => setBg(d.backgrounds[p.book]))
  }, [p.num, p.book])
  useEffect(() => {
    if (mode !== 'def' && !conc) concordance(p.num).then(setConc)
  }, [mode, conc, p.num])

  const word = p.word.replace(/[^\p{L}\s'’-]/gu, '').trim()
  const title = (
    <>
      {word.charAt(0).toUpperCase() + word.slice(1)} <span className="faint">•</span> {p.num}
    </>
  )
  const usageTotal = e?.u.reduce((a, [, n]) => a + n, 0) ?? 0

  let refs: number[] = []
  if (conc && pick) {
    if (mode === 'word') refs = conc[pick] ?? []
    else refs = Object.values(conc).flat().filter((n) => decodeVid(n).book === pick).sort((a, b) => a - b)
    refs = [...new Set(refs)]
  }

  return (
    <Popover
      x={p.x}
      y={p.y}
      large
      title={title}
      onClose={closeAllPopups}
      onBack={pick ? () => setPick(null) : mode !== 'def' ? () => setMode('def') : p.onBack}
      footer={
        e ? (
          <>
            <button className="ref-link" onClick={() => { setMode('word'); setPick(null) }}>
              <Icon name="book" size={17} /> Usage by Word
            </button>
            <span className="faint">|</span>
            <button className="ref-link" onClick={() => { setMode('book'); setPick(null) }}>
              <Icon name="study" size={17} /> Usage by Book
            </button>
          </>
        ) : undefined
      }
    >
      {e === undefined && <div className="spinner" />}
      {e === null && <p>No Strong’s entry found for {p.num}.</p>}
      {e && mode === 'def' && (
        <>
          <dl className="kv">
            <dt>Original Word:</dt>
            <dd className="lemma" lang={p.num.startsWith('H') ? 'he' : 'el'}>{e.l}</dd>
            <dt>Transliteration:</dt>
            <dd>{e.x}</dd>
            {e.p && (
              <>
                <dt>Pronunciation:</dt>
                <dd>{e.p}</dd>
              </>
            )}
            {partOfSpeech(e, p.num) && (
              <>
                <dt>Part of Speech:</dt>
                <dd>{partOfSpeech(e, p.num)}</dd>
              </>
            )}
          </dl>
          <hr className="rule" style={{ margin: '8px 0' }} />
          {e.d.trim() && (
            <p style={{ margin: '0 0 8px' }}>
              <b>Strong’s Definition:</b> <i>{caps(e.d)}</i>
            </p>
          )}
          {e.r && (
            <p className="subtle" style={{ margin: '0 0 8px', fontSize: '0.92em' }}>
              <b>Derivation:</b> {caps(e.r)}
            </p>
          )}
          {e.k && (
            <p style={{ margin: '0 0 8px', fontSize: '0.95em' }}>
              <b>KJV renders it:</b> {caps(e.k)}
            </p>
          )}
          <p style={{ margin: '0 0 8px' }}>
            <b>Context:</b>{' '}
            {p.version ? (
              <>
                In {locString(p.book, p.chapter, p.verse)} the {p.version} reads “{caps(word)}”, matched to <i>{e.l}</i> from the Strong’s numbers of the
                same verse in the KJV.
              </>
            ) : (
              <>
                In {locString(p.book, p.chapter, p.verse)} the KJV translates <i>{e.l}</i> as “{caps(word)}”.
              </>
            )}
            {e.u.length > 0 && (
              <>
                {' '}It occurs {usageTotal.toLocaleString()} time{usageTotal === 1 ? '' : 's'} in the KJV, most often as{' '}
                {e.u.slice(0, 3).map(([w, n], i) => (
                  <span key={w}>
                    “{caps(w)}” ({n}){i < Math.min(2, e.u.length - 1) ? ', ' : ''}
                  </span>
                ))}
                .
              </>
            )}
          </p>
          {bg && (
            <p style={{ margin: 0 }}>
              <b>Written:</b> {caps(writtenLine(bg))}
            </p>
          )}
        </>
      )}
      {e && mode !== 'def' && !pick && (
        <div className="usage-list">
          <div className="section-title">{mode === 'word' ? 'Usage by Word (KJV)' : 'Usage by Book'}</div>
          {mode === 'word'
            ? e.u.map(([w, n], i) => (
                <span key={w}>
                  <button className="ref-link" onClick={() => setPick(w)}>{caps(w)}</button> ({n}){i < e.u.length - 1 ? ', ' : ''}
                </span>
              ))
            : e.b.map(([bk, n], i) => (
                <span key={bk}>
                  <button className="ref-link" onClick={() => setPick(bk)}>{book(bk)?.name}</button> ({n}){i < e.b.length - 1 ? ', ' : ''}
                </span>
              ))}
          {!e.u.length && <p className="empty">No KJV occurrences tagged.</p>}
        </div>
      )}
      {e && pick && (
        <VidList title={mode === 'word' ? `“${pick}” — ${e.l}` : `${book(pick)?.name} — ${e.l}`} vids={refs} loading={!conc} />
      )}
    </Popover>
  )
}

function VidList({ title, vids, loading }: { title: string; vids: number[]; loading: boolean }) {
  const [shown, setShown] = useState(40)
  const [texts, setTexts] = useState<Record<number, string>>({})
  const caps = useCaps()
  useEffect(() => {
    let live = true
    const todo = vids.slice(0, shown).filter((n) => texts[n] === undefined)
    ;(async () => {
      const add: Record<number, string> = {}
      for (const n of todo) {
        const d = decodeVid(n)
        const res = await loadPassage(`${d.book}.${d.chapter}.${d.verse}`, 1)
        add[n] = res.verses[0] ? passagePlain(res.verses[0]) : ''
      }
      if (live && todo.length) setTexts((t) => ({ ...t, ...add }))
    })()
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vids, shown])
  if (loading) return <div className="spinner" />
  return (
    <div>
      <div className="section-title">
        {title} <span className="faint small">({vids.length})</span>
      </div>
      {vids.slice(0, shown).map((n) => {
        const d = decodeVid(n)
        return (
          <button key={n} className="result" onClick={() => go({ book: d.book, chapter: d.chapter, verse: d.verse }, { tab: 'bible' })}>
            <span className="r">{locString(d.book, d.chapter, d.verse)}</span>
            <span className="subtle">{texts[n] !== undefined ? caps(texts[n], `${d.book}.${d.chapter}.${d.verse}`) : '…'}</span>
          </button>
        )
      })}
      {vids.length > shown && (
        <button className="btn small" style={{ marginTop: 10 }} onClick={() => setShown(shown + 60)}>
          Show more
        </button>
      )}
    </div>
  )
}

/** Other translations: a word with no match — choose from the original-language words of the verse. */
function OrigWordsPopup(p: { word: string; book: string; chapter: number; verse: number; x: number; y: number; onBack?: () => void }) {
  const [rows, setRows] = useState<{ t: string; num: string; e: StrongsEntry | null }[] | null>(null)
  const caps = useCaps()
  useEffect(() => {
    chapterAlign(p.book, p.chapter).then(async (a) => {
      const toks = a.verses.get(p.verse)?.toks ?? []
      const out: { t: string; num: string; e: StrongsEntry | null }[] = []
      for (const tk of toks) {
        const num = tk.s.find((n) => n !== 'H853') ?? tk.s[0]
        if (out.some((o) => o.num === num)) continue
        out.push({ t: tk.t, num, e: await strongs(num) })
      }
      setRows(out)
    })
  }, [p.book, p.chapter, p.verse])
  return (
    <Popover x={p.x} y={p.y} large title={`Original words — ${locString(p.book, p.chapter, p.verse)}`} onClose={closeAllPopups} onBack={p.onBack}>
      <p className="small subtle" style={{ marginTop: 0 }}>
        “{caps(p.word.replace(/[^\p{L}'’-]/gu, ''))}” has no direct match. These are the Hebrew/Greek words in this verse (with the KJV’s wording) — tap one:
      </p>
      {!rows && <div className="spinner" />}
      {rows?.map((r) => (
        <button
          key={r.num}
          className="result"
          onClick={(ev) => {
            const rr = (ev.currentTarget as HTMLElement).getBoundingClientRect()
            openPopup({ kind: 'strongs', num: r.num, word: r.t, book: p.book, chapter: p.chapter, verse: p.verse, x: rr.left, y: rr.top }, true)
          }}
        >
          <span className="r">{caps(r.t)}</span>
          <span lang={r.num[0] === 'H' ? 'he' : 'el'}>{r.e?.l}</span> <span className="vtag">{r.num}</span>
          {r.e && <div className="faint small">{caps(r.e.d.slice(0, 110))}</div>}
        </button>
      ))}
      {rows && !rows.length && <p className="empty">No Strong’s data for this verse.</p>}
    </Popover>
  )
}

// ---------------------------------------------------------------------------------------------
// Cross reference preview
// ---------------------------------------------------------------------------------------------
export function RefPopup({ refStr, x, y, onBack }: { refStr: string; x: number; y: number; onBack?: () => void }) {
  const [res, setRes] = useState<{ verses: PassageVerse[]; version: string } | null>(null)
  const caps = useCaps()
  useEffect(() => {
    loadPassage(refStr, 30).then(setRes)
  }, [refStr])
  const r = parseRef(refStr)
  return (
    <Popover
      x={x}
      y={y}
      title={formatRef(refStr)}
      onClose={closeAllPopups}
      onBack={onBack}
      footer={
        r && (
          <>
            <button className="btn primary small" onClick={() => go({ book: r.book, chapter: r.c1, verse: r.v1 ?? 1 }, { tab: 'bible' })}>
              Go to passage
            </button>
            {res && <span className="faint small">{res.version}</span>}
          </>
        )
      }
    >
      {!res ? (
        <div className="spinner" />
      ) : res.verses.length ? (
        res.verses.map((v, i) => (
          <p key={i} style={{ margin: '0 0 6px' }}>
            <sup className="faint">{(r?.c2 ?? r?.c1) !== r?.c1 || !r?.v1 ? `${v.c}:${v.v}` : v.v}</sup> {caps(passagePlain(v), `${r?.book}.${v.c}.${v.v}`)}
          </p>
        ))
      ) : (
        <p className="empty">Passage not found.</p>
      )}
    </Popover>
  )
}

// ---------------------------------------------------------------------------------------------
// Notes / Journal chips
// ---------------------------------------------------------------------------------------------
function NotesPopup(p: { book: string; chapter: number; verse?: number; x: number; y: number; onBack?: () => void }) {
  const notes = useStore((s) => s.notes)
  const list = useMemo(
    () =>
      notes
        .filter((n) => n.book === p.book && n.chapter === p.chapter && (p.verse === undefined ? n.verse === undefined : n.verse === p.verse || (n.verse! <= p.verse && (n.v2 ?? n.verse!) >= p.verse)))
        .sort((a, b) => b.updated - a.updated),
    [notes, p.book, p.chapter, p.verse],
  )
  const chapterNotes = p.verse !== undefined ? notes.filter((n) => n.book === p.book && n.chapter === p.chapter && n.verse === undefined) : []
  return (
    <Popover
      x={p.x}
      y={p.y}
      width={460}
      title={`Notes — ${locString(p.book, p.chapter, p.verse)}`}
      onClose={closeAllPopups}
      onBack={p.onBack}
      footer={
        <button className="btn primary small" onClick={() => { closeAllPopups(); setState({ editor: { kind: 'note', note: { book: p.book, chapter: p.chapter, verse: p.verse } } }) }}>
          <Icon name="plus" size={16} /> Add note
        </button>
      }
    >
      {list.map((n) => <NoteCard key={n.id} note={n} compact />)}
      {chapterNotes.length > 0 && (
        <>
          <div className="section-title small">Chapter notes</div>
          {chapterNotes.map((n) => <NoteCard key={n.id} note={n} compact />)}
        </>
      )}
      {!list.length && !chapterNotes.length && <p className="empty">No notes yet.</p>}
    </Popover>
  )
}

function JournalPopup(p: { book: string; chapter: number; verse?: number; x: number; y: number; onBack?: () => void }) {
  const journal = useStore((s) => s.journal)
  const sort = useStore((s) => s.settings.journalSort)
  const list = journal
    .filter((j) => j.book === p.book && j.chapter === p.chapter && (p.verse === undefined ? j.verse === undefined : j.verse === p.verse || (j.verse! <= p.verse && (j.v2 ?? j.verse!) >= p.verse)))
    .sort((a, b) => (sort === 'desc' ? b.created - a.created : a.created - b.created))
  return (
    <Popover
      x={p.x}
      y={p.y}
      width={480}
      title={`Journal — ${locString(p.book, p.chapter, p.verse)}`}
      onClose={closeAllPopups}
      onBack={p.onBack}
      footer={
        <button className="btn primary small" onClick={() => { closeAllPopups(); setState((s) => ({ editor: { kind: 'journal', entry: { book: p.book, chapter: p.chapter, verse: p.verse, template: s.settings.journalTemplate } } })) }}>
          <Icon name="plus" size={16} /> New entry
        </button>
      }
    >
      {list.map((j) => <JournalCard key={j.id} entry={j} compact />)}
      {!list.length && <p className="empty">No journal entries yet.</p>}
    </Popover>
  )
}

// ---------------------------------------------------------------------------------------------
// "?" chip — maps & helps for a verse
// ---------------------------------------------------------------------------------------------
function HelpsPopup(p: { book: string; chapter: number; verse: number; x: number; y: number; onBack?: () => void }) {
  const [items, setItems] = useState<VerseHelp[] | null>(null)
  const [pl, setPl] = useState<Place[]>([])
  const [hd, setHd] = useState<HelpData | null>(null)
  const caps = useCaps()
  useEffect(() => {
    void helpData().then(setHd)
  }, [])
  useEffect(() => {
    helpsForChapter(p.book, p.chapter).then((m) => setItems(p.verse ? [...(m.get(p.verse) ?? [])] : m.get(0) ?? []))
    if (p.verse) placesForChapter(p.book, p.chapter).then((m) => setPl(m.get(p.verse) ?? []))
  }, [p.book, p.chapter, p.verse])
  const open = (id: string, place?: string) => {
    closeAllPopups()
    const item = place ? `place:${place}` : id
    // on a phone: full screen over the Bible, closed with its ✕ (the page stays where it was); on a wider screen the
    // Maps / Helps panel beside the Bible
    if (window.innerWidth < 900) setState({ helpOverlay: item })
    else setState({ tab: 'maps', panel: true, helpItem: item })
  }
  return (
    <Popover x={p.x} y={p.y} width={430} title={`Maps & Helps — ${locString(p.book, p.chapter, p.verse || undefined)}`} onClose={closeAllPopups} onBack={p.onBack}>
      {!items && <div className="spinner" />}
      {items?.map((h, i) =>
        // a prophecy, a name of GOD or a Revelation reference: shown here with its passages
        hd && /^(prophecy|revot|name):\d+$/.test(h.id) ? (
          <HelpInline key={i} id={h.id} label={h.title} data={hd} onMore={() => open(h.id)} />
        ) : (
        <button key={i} className="help-card" onClick={() => open(h.id)}>
          <span className="thumb">
            <Icon name={h.id.startsWith('map') ? 'map' : h.id.startsWith('layout') ? 'layout' : h.id.startsWith('prophecy') ? 'scroll' : h.id.startsWith('name') ? 'crown' : 'chart'} />
          </span>
          <span>
            {caps(h.title)}
            {h.detail && <div className="small subtle">{caps(h.detail)}</div>}
          </span>
        </button>
        ),
      )}
      {pl.length > 0 && (
        <>
          <div className="section-title small" style={{ marginTop: 8 }}>
            <Icon name="pin" size={18} /> Places in this verse
          </div>
          {pl.map((x) => (
            <div key={x.n}>
            {pl.length <= 2 && <PlacePhoto place={x} width={420} />}
            <button className="help-card" onClick={() => open('map:chapter', x.n)}>
              <span className="thumb">
                <Icon name="pin" />
              </span>
              <span>
                {x.n.replace(/ \d+$/, '')}
                <div className="small subtle">Now: {x.m || 'location uncertain'}</div>
              </span>
            </button>
            </div>
          ))}
        </>
      )}
      {items && !items.length && !pl.length && <p className="empty">No helps for this verse.</p>}
    </Popover>
  )
}

/** A prophecy of CHRIST, a name of GOD or one of Revelation's Old Testament references, in full in the verse's pop-up:
 * its passages tap open (with ‹ back to here), and "All …" opens the whole chart. */
function HelpInline({ id, label, data, onMore }: { id: string; label: string; data: HelpData; onMore: () => void }) {
  const caps = useCaps()
  const [kind, n] = id.split(':')
  const i = +n
  let title = ''
  let note = ''
  let rows: [string, string[]][] = []
  let more = ''
  if (kind === 'prophecy' && data.prophecies[i]) {
    const p = data.prophecies[i]
    title = p.title
    rows = [['Old Testament', p.ot], ['Fulfilled', p.nt]]
    more = 'All prophecies of CHRIST'
  } else if (kind === 'revot' && data.revOt[i]) {
    const r = data.revOt[i]
    title = r.note
    rows = [['Revelation', [r.rev]], ['Old Testament', r.ot]]
    more = 'All of Revelation’s Old Testament references'
  } else if (kind === 'name' && data.names[i]) {
    const x = data.names[i]
    title = `${x.name}${x.hebrew ? ` (${x.hebrew})` : ''}`
    note = `${x.meaning}${x.note ? ` — ${x.note}` : ''}`
    rows = [['Scripture', [x.ref]]]
    more = 'All the names of GOD'
    label = 'Name of GOD'
  } else return null
  return (
    <div className="help-inline">
      <div className="help-inline-label">
        <Icon name={kind === 'name' ? 'crown' : 'scroll'} size={15} /> {caps(label)}
      </div>
      <div className="help-inline-title">{caps(title)}</div>
      {note && <div className="help-inline-note">{caps(note)}</div>}
      {rows.map(([k, refs]) => (
        <div key={k} className="help-inline-row">
          <span className="k">{k}</span>
          <span>
            <RefLinks refs={refs} stack />
          </span>
        </div>
      ))}
      <button className="ref-link help-inline-more" onClick={onMore}>
        {caps(more)} ›
      </button>
    </div>
  )
}

export function useBooks() {
  return books()
}

export function newNoteFor(bookId: string, chapter: number, verse?: number) {
  setState({ editor: { kind: 'note', note: { id: newId(), book: bookId, chapter, verse } } })
}

export { openPopup }
