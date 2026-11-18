import { useState } from 'react'
import { TEMPLATES, template } from '../lib/journal'
import { formatRef, locString, parseHumanRef, refToString, splitRefs } from '../lib/refs'
import { newId, openPopup, saveItem, setState, useStore } from '../lib/store'
import type { JournalEntry, JournalTemplateId, Note } from '../lib/types'
import { Icon } from './Icon'
import { Modal } from './Popover'

export function Editors() {
  const editor = useStore((s) => s.editor)
  if (!editor) return null
  if (editor.kind === 'note') return <NoteEditor key={editor.note.id ?? 'new'} note={editor.note} />
  return <JournalEditor key={editor.entry.id ?? 'new'} entry={editor.entry} />
}

const close = () => setState({ editor: null })

function useRefField(init: { book?: string; chapter?: number; verse?: number; v2?: number }) {
  const loc = useStore((s) => s.loc)
  const start = init.book ? locString(init.book, init.chapter ?? 1, init.verse, init.v2) : locString(loc.book, loc.chapter, loc.verse)
  const [text, setText] = useState(start)
  const ref = parseHumanRef(text)
  return { text, setText, ref }
}

function RefInput({ text, setText, ok }: { text: string; setText: (s: string) => void; ok: boolean }) {
  return (
    <div className="field">
      <label htmlFor="ref-in">
        Passage <span className="hint">e.g. John 15:4, John 15:1-8, or John 15 for the whole chapter</span>
      </label>
      <input id="ref-in" className="input" value={text} onChange={(e) => setText(e.target.value)} aria-invalid={!ok} />
      {!ok && <span className="small" style={{ color: '#a3271c' }}>Type a reference like “John 15:4”.</span>}
    </div>
  )
}

function NoteEditor({ note }: { note: Partial<Note> }) {
  const r = useRefField(note)
  const [text, setText] = useState(note.text ?? '')
  const save = async () => {
    if (!r.ref || !text.trim()) return
    const now = Date.now()
    const n: Note = {
      id: note.id ?? newId(),
      book: r.ref.book,
      chapter: r.ref.c1,
      verse: r.ref.v1,
      v2: r.ref.v2 && r.ref.c2 === r.ref.c1 && r.ref.v2 !== r.ref.v1 ? r.ref.v2 : undefined,
      text: text.trim(),
      created: note.created ?? now,
      updated: now,
    }
    await saveItem('notes', n)
    close()
  }
  return (
    <Modal
      title={note.created ? 'Edit note' : 'New note'}
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={close}>Cancel</button>
          <button className="btn primary" onClick={save} disabled={!r.ref || !text.trim()}>
            <Icon name="check" size={16} /> Save note
          </button>
        </>
      }
    >
      <RefInput text={r.text} setText={r.setText} ok={!!r.ref} />
      <div className="field">
        <label htmlFor="note-text">Note</label>
        <textarea id="note-text" className="input" style={{ minHeight: 180 }} value={text} onChange={(e) => setText(e.target.value)} autoFocus placeholder="Your explanation, insight or question about this passage…" />
      </div>
      {note.updated && <p className="faint small">Last edited {new Date(note.updated).toLocaleString()}</p>}
    </Modal>
  )
}

function JournalEditor({ entry }: { entry: Partial<JournalEntry> }) {
  const defTemplate = useStore((s) => s.settings.journalTemplate)
  const r = useRefField(entry)
  const [tid, setTid] = useState<JournalTemplateId>(entry.template ?? defTemplate)
  const [title, setTitle] = useState(entry.title ?? '')
  const [fields, setFields] = useState<Record<string, string>>(entry.fields ?? {})
  const t = template(tid)
  const hasText = Object.values(fields).some((v) => v?.trim())
  const save = async () => {
    if (!r.ref || !hasText) return
    const now = Date.now()
    const j: JournalEntry = {
      id: entry.id ?? newId(),
      template: tid,
      book: r.ref.book,
      chapter: r.ref.c1,
      verse: r.ref.v1,
      v2: r.ref.v2 && r.ref.c2 === r.ref.c1 && r.ref.v2 !== r.ref.v1 ? r.ref.v2 : undefined,
      title: title.trim() || undefined,
      fields,
      created: entry.created ?? now,
      updated: now,
    }
    await saveItem('journal', j)
    close()
  }
  return (
    <Modal
      title={entry.created ? 'Edit journal entry' : 'New journal entry'}
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={close}>Cancel</button>
          <button className="btn primary" onClick={save} disabled={!r.ref || !hasText}>
            <Icon name="check" size={16} /> Save entry
          </button>
        </>
      }
    >
      <div className="field">
        <span className="label">Template</span>
        <div className="pills">
          {TEMPLATES.map((x) => (
            <button key={x.id} className="pill" aria-pressed={x.id === tid} onClick={() => setTid(x.id)}>
              {x.short}
            </button>
          ))}
        </div>
      </div>
      <RefInput text={r.text} setText={r.setText} ok={!!r.ref} />
      <div className="field">
        <label htmlFor="j-title">
          Title <span className="hint">optional</span>
        </label>
        <input id="j-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      {t.fields.map((f, i) => (
        <div key={f.key} className={`field jsec c${i % 5}`}>
          <label htmlFor={`j-${f.key}`}>
            <Icon name={f.icon} size={17} /> {f.label}
          </label>
          <span className="hint">{f.hint}</span>
          <textarea id={`j-${f.key}`} className="input" value={fields[f.key] ?? ''} onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })} style={{ minHeight: tid === 'blank' ? 220 : 90 }} />
          {f.key === 'scriptures' && <RefChips text={fields[f.key] ?? ''} />}
        </div>
      ))}
      {entry.created && <p className="faint small">Created {new Date(entry.created).toLocaleString()}</p>}
    </Modal>
  )
}

function RefChips({ text }: { text: string }) {
  const refs = splitRefs(text).filter((p): p is { text: string; ref: string } => typeof p !== 'string')
  // also accept refs separated only by semicolons/newlines ("Rom 8:28; 1 Jn 2:6")
  const extra = text
    .split(/[;\n]/)
    .map((s) => parseHumanRef(s.trim()))
    .filter((x) => x)
    .map((x) => formatRef(x!))
  const all = [...new Set([...refs.map((x) => formatRef(x.ref)), ...extra])]
  if (!all.length) return null
  return (
    <div className="pills" style={{ marginTop: 4 }}>
      {all.map((label) => {
        const ref = parseHumanRef(label)
        return (
          <button
            key={label}
            type="button"
            className="pill"
            onClick={(e) => {
              if (!ref) return
              const rr = (e.currentTarget as HTMLElement).getBoundingClientRect()
              openPopup({ kind: 'ref', ref: refToString(ref), x: rr.left, y: rr.bottom + 6 })
            }}
          >
            <Icon name="link" size={14} /> {label}
          </button>
        )
      })}
    </div>
  )
}
