import { useMemo, useState } from 'react'
import { NoteCard } from '../components/Cards'
import { Icon } from '../components/Icon'
import { stamp } from '../lib/journal'
import { locString } from '../lib/refs'
import { deleteItem, go, setState, useStore } from '../lib/store'
import { bookIndex } from '../lib/data'

type Mode = 'verse' | 'chapter' | 'all' | 'highlights' | 'bookmarks'

export function NotesView() {
  const loc = useStore((s) => s.loc)
  const notes = useStore((s) => s.notes)
  const highlights = useStore((s) => s.highlights)
  const labels = useStore((s) => s.labels)
  const bookmarks = useStore((s) => s.bookmarks)
  const [mode, setMode] = useState<Mode>('verse')
  const [q, setQ] = useState('')
  const [labelFilter, setLabelFilter] = useState<string>('')

  const inChapter = notes.filter((n) => n.book === loc.book && n.chapter === loc.chapter)
  const verseNotes = inChapter.filter((n) => n.verse !== undefined).sort((a, b) => a.verse! - b.verse! || b.updated - a.updated)
  const chapterNotes = inChapter.filter((n) => n.verse === undefined).sort((a, b) => b.updated - a.updated)
  const all = useMemo(() => {
    const term = q.trim().toLowerCase()
    return notes
      .filter((n) => !term || n.text.toLowerCase().includes(term) || locString(n.book, n.chapter, n.verse).toLowerCase().includes(term))
      .sort((a, b) => b.updated - a.updated)
  }, [notes, q])
  const hls = useMemo(
    () =>
      highlights
        .filter((h) => !labelFilter || h.label === labelFilter)
        .sort((a, b) => bookIndex(a.book) - bookIndex(b.book) || a.chapter - b.chapter || a.v1 - b.v1),
    [highlights, labelFilter],
  )
  const labelMap = Object.fromEntries(labels.map((l) => [l.id, l]))

  const add = (chapterOnly: boolean) =>
    setState({ editor: { kind: 'note', note: { book: loc.book, chapter: loc.chapter, verse: chapterOnly ? undefined : loc.verse } } })

  return (
    <div>
      <div className="section-title" style={{ justifyContent: 'space-between' }}>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Icon name="note" /> My Notes
        </span>
        <button className="btn small primary" onClick={() => add(mode === 'chapter')}>
          <Icon name="plus" size={16} /> {mode === 'chapter' ? 'Chapter note' : `Note on v. ${loc.verse}`}
        </button>
      </div>
      <div className="pills" style={{ marginBottom: 12 }}>
        <button className="pill" aria-pressed={mode === 'verse'} onClick={() => setMode('verse')}>
          Verse ({verseNotes.length})
        </button>
        <button className="pill" aria-pressed={mode === 'chapter'} onClick={() => setMode('chapter')}>
          Chapter ({chapterNotes.length})
        </button>
        <button className="pill" aria-pressed={mode === 'all'} onClick={() => setMode('all')}>
          All ({notes.length})
        </button>
        <button className="pill" aria-pressed={mode === 'highlights'} onClick={() => setMode('highlights')}>
          Highlights ({highlights.length})
        </button>
        <button className="pill" aria-pressed={mode === 'bookmarks'} onClick={() => setMode('bookmarks')}>
          Bookmarks ({bookmarks.length})
        </button>
      </div>

      {mode === 'verse' && (
        <>
          <p className="faint small">Notes on verses in {locString(loc.book, loc.chapter)}. Tap a verse number in the Bible, then “Note”, or use the button above.</p>
          {verseNotes.map((n) => <NoteCard key={n.id} note={n} />)}
          {!verseNotes.length && <p className="empty">No verse notes in this chapter yet.</p>}
        </>
      )}
      {mode === 'chapter' && (
        <>
          {chapterNotes.map((n) => <NoteCard key={n.id} note={n} />)}
          {!chapterNotes.length && <p className="empty">No notes on {locString(loc.book, loc.chapter)} as a whole yet.</p>}
        </>
      )}
      {mode === 'all' && (
        <>
          <div className="searchbox" style={{ marginBottom: 12 }}>
            <Icon name="search" size={18} />
            <input placeholder="Search your notes…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search notes" />
          </div>
          {all.map((n) => <NoteCard key={n.id} note={n} />)}
          {!all.length && <p className="empty">{notes.length ? 'No matching notes.' : 'You haven’t written any notes yet.'}</p>}
        </>
      )}
      {mode === 'highlights' && (
        <>
          <div className="pills" style={{ marginBottom: 10 }}>
            <button className="pill" aria-pressed={!labelFilter} onClick={() => setLabelFilter('')}>All labels</button>
            {labels.map((l) => (
              <button key={l.id} className="pill" aria-pressed={labelFilter === l.id} onClick={() => setLabelFilter(l.id)} style={labelFilter === l.id ? undefined : { background: l.color, color: '#2d2616' }}>
                {l.name} <span className="muted">({highlights.filter((h) => h.label === l.id).length})</span>
              </button>
            ))}
          </div>
          {hls.map((h) => (
            <div key={h.id} className="card" style={{ borderLeft: `6px solid ${labelMap[h.label]?.color ?? '#ccc'}` }}>
              <div className="card-head">
                <button className="ref-link ref" onClick={() => go({ book: h.book, chapter: h.chapter, verse: h.v1 }, { tab: window.innerWidth < 900 ? 'bible' : undefined })}>
                  {locString(h.book, h.chapter, h.v1, h.v2 !== h.v1 ? h.v2 : undefined)}
                </button>
                <span className="stamp">{stamp(h.created)}</span>
              </div>
              <div className="row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="small">
                  {labelMap[h.label]?.name ?? 'Highlight'}
                  {h.w1 !== undefined && <span className="faint"> · selected words ({h.version})</span>}
                </span>
                <button className="btn small danger" onClick={() => deleteItem('highlights', h.id)} aria-label="Remove highlight">
                  <Icon name="trash" size={15} />
                </button>
              </div>
            </div>
          ))}
          {!hls.length && <p className="empty">No highlights yet. Select words or tap verse numbers in the Bible, then pick a label.</p>}
        </>
      )}
      {mode === 'bookmarks' && (
        <>
          {[...bookmarks]
            .sort((a, b) => b.created - a.created)
            .map((b) => (
              <div key={b.id} className="card">
                <div className="card-head">
                  <button className="ref-link ref" onClick={() => go({ book: b.book, chapter: b.chapter, verse: b.verse }, { tab: window.innerWidth < 900 ? 'bible' : undefined })}>
                    {locString(b.book, b.chapter, b.verse)}
                  </button>
                  <span className="stamp">{stamp(b.created)}</span>
                </div>
                <div className="actions">
                  <button className="btn small danger" onClick={() => deleteItem('bookmarks', b.id)}>
                    <Icon name="trash" size={15} /> Remove
                  </button>
                </div>
              </div>
            ))}
          {!bookmarks.length && <p className="empty">No bookmarks yet.</p>}
        </>
      )}
    </div>
  )
}
