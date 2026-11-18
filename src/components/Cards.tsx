import { Fragment } from 'react'
import { stamp, template } from '../lib/journal'
import { useCaps } from '../lib/caps'
import { locString, splitRefs } from '../lib/refs'
import { closeAllPopups, deleteItem, go, openPopup, setState } from '../lib/store'
import type { JournalEntry, Note } from '../lib/types'
import { Icon } from './Icon'

/** Text with Scripture references turned into tap-to-preview links. */
export function RichText({ text }: { text: string }) {
  const caps = useCaps()
  return (
    <>
      {splitRefs(text).map((part, i) =>
        typeof part === 'string' ? (
          <Fragment key={i}>{caps(part)}</Fragment>
        ) : (
          <button
            key={i}
            className="ref-link"
            onClick={(e) => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
              openPopup({ kind: 'ref', ref: part.ref, x: r.left, y: r.bottom + 6 }, true)
            }}
          >
            {part.text}
          </button>
        ),
      )}
    </>
  )
}

function confirmDelete(what: string) {
  return window.confirm(`Delete this ${what}? This cannot be undone.`)
}

export function NoteCard({ note, compact, showRef = true }: { note: Note; compact?: boolean; showRef?: boolean }) {
  return (
    <div className="card">
      <div className="card-head">
        {showRef ? (
          <button className="ref-link ref" onClick={() => go({ book: note.book, chapter: note.chapter, verse: note.verse ?? 1 }, compact ? {} : { tab: window.innerWidth < 900 ? 'bible' : undefined })}>
            {locString(note.book, note.chapter, note.verse, note.v2)}
          </button>
        ) : (
          <span />
        )}
        <span className="stamp" title={`Created ${stamp(note.created)}`}>
          {stamp(note.updated)}
        </span>
      </div>
      <div className="body">
        <RichText text={note.text} />
      </div>
      <div className="actions">
        <button
          className="btn small"
          onClick={() => {
            closeAllPopups()
            setState({ editor: { kind: 'note', note } })
          }}
        >
          <Icon name="edit" size={15} /> Edit
        </button>
        <button className="btn small danger" onClick={() => confirmDelete('note') && deleteItem('notes', note.id)}>
          <Icon name="trash" size={15} />
        </button>
      </div>
    </div>
  )
}

export function JournalCard({ entry, compact }: { entry: JournalEntry; compact?: boolean }) {
  const t = template(entry.template)
  return (
    <div className="card">
      <div className="card-head">
        <button className="ref-link ref" onClick={() => go({ book: entry.book, chapter: entry.chapter, verse: entry.verse ?? 1 }, compact ? {} : { tab: window.innerWidth < 900 ? 'bible' : undefined })}>
          {locString(entry.book, entry.chapter, entry.verse, entry.v2)}
        </button>
        <span className="stamp" title={entry.updated !== entry.created ? `Edited ${stamp(entry.updated)}` : undefined}>
          {stamp(entry.created)}
        </span>
      </div>
      {entry.title && <div style={{ fontFamily: 'var(--serif)', fontWeight: 600, fontSize: 17 }}>{entry.title}</div>}
      <div className="faint small">{t.short} template</div>
      {t.fields.map((f, i) =>
        entry.fields[f.key]?.trim() ? (
          <div key={f.key} className={`jsec c${i % 5}`}>
            {t.fields.length > 1 && (
              <h5>
                <Icon name={f.icon} size={15} /> {f.label}
              </h5>
            )}
            <div className="body">
              <RichText text={entry.fields[f.key]} />
            </div>
          </div>
        ) : null,
      )}
      <div className="actions">
        <button
          className="btn small"
          onClick={() => {
            closeAllPopups()
            setState({ editor: { kind: 'journal', entry } })
          }}
        >
          <Icon name="edit" size={15} /> Edit
        </button>
        <button className="btn small danger" onClick={() => confirmDelete('journal entry') && deleteItem('journal', entry.id)}>
          <Icon name="trash" size={15} />
        </button>
      </div>
    </div>
  )
}
