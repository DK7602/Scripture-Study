import { useEffect, useMemo, useRef, useState } from 'react'
import { DictationArea } from '../components/Dictate'
import { Icon } from '../components/Icon'
import { useCaps } from '../lib/caps'
import { loadPassage, passagePlain } from '../lib/passage'
import { formatRef, parseHumanRef, parseRef, refToString } from '../lib/refs'
import {
  COLORS,
  DEFAULT_SERMON_TEMPLATE,
  ENCOURAGING,
  POINT_COLORS,
  emptyDay,
  heading,
  inkColor,
  longDate,
  newSermonNote,
  prayerText,
  sermonText,
  shareText,
  shiftDay,
  shortDate,
  today,
} from '../lib/resources'
import { deleteItem, newId, openPopup, saveItem, updateSettings, useStore } from '../lib/store'
import type { PrayerDay, SermonLink, SermonNote, SermonSection } from '../lib/types'

type Section = 'prayer' | 'sermons' | 'notes'

function remembered(): Section {
  try {
    const v = localStorage.getItem('ss:resources')
    if (v === 'prayer' || v === 'sermons' || v === 'notes') return v
  } catch {
    /* storage unavailable */
  }
  return 'prayer'
}

/** Resources: the prayer list, the church's sermons and sermon notes. */
export function ResourcesView() {
  const [sec, setSec] = useState<Section>(remembered)
  const pick = (s: Section) => {
    setSec(s)
    try {
      localStorage.setItem('ss:resources', s)
    } catch {
      /* storage unavailable */
    }
  }
  return (
    <div className="resources">
      <div className="pills res-pills" role="tablist" aria-label="Resources">
        <button className="pill" role="tab" aria-pressed={sec === 'prayer'} aria-selected={sec === 'prayer'} onClick={() => pick('prayer')}>
          <Icon name="pray" size={17} /> Prayer list
        </button>
        <button className="pill" role="tab" aria-pressed={sec === 'sermons'} aria-selected={sec === 'sermons'} onClick={() => pick('sermons')}>
          <Icon name="headphones" size={17} /> Sermons
        </button>
        <button className="pill" role="tab" aria-pressed={sec === 'notes'} aria-selected={sec === 'notes'} onClick={() => pick('notes')}>
          <Icon name="note" size={17} /> Sermon notes
        </button>
      </div>
      {sec === 'prayer' && <PrayerList />}
      {sec === 'sermons' && <Sermons onNotes={() => pick('notes')} />}
      {sec === 'notes' && <SermonNotes />}
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// Prayer list
// ---------------------------------------------------------------------------------------------
function PrayerList() {
  const prayers = useStore((s) => s.prayers)
  const [date, setDate] = useState(today)
  const [draft, setDraft] = useState('')
  const [shared, setShared] = useState('')
  const day: PrayerDay = prayers.find((p) => p.date === date) ?? emptyDay(date)
  const isToday = date === today()
  const save = (patch: Partial<PrayerDay>) => void saveItem('prayers', { ...day, ...patch, updated: Date.now() })

  const add = () => {
    const text = draft.trim()
    if (!text) return
    save({ items: [...day.items, { id: newId(), text }] })
    setDraft('')
  }
  // the most recent earlier day with focuses still waiting for an answer
  const earlier = useMemo(
    () => prayers.filter((p) => p.date < date && p.items.some((i) => !i.answered)).sort((a, b) => (a.date < b.date ? 1 : -1))[0],
    [prayers, date],
  )
  const carry = () => {
    if (!earlier) return
    const have = new Set(day.items.map((i) => i.text))
    save({ items: [...day.items, ...earlier.items.filter((i) => !i.answered && !have.has(i.text)).map((i) => ({ id: newId(), text: i.text }))] })
  }
  const recent = useMemo(
    () => prayers.filter((p) => p.date !== date && (p.items.length || p.verses.length)).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 12),
    [prayers, date],
  )
  const share = async () => {
    const texts: Record<string, string> = {}
    for (const r of day.verses) {
      const p = await loadPassage(r, 8).catch(() => null)
      if (p) texts[r] = p.verses.map(passagePlain).join(' ')
    }
    const how = await shareText('Prayer list', prayerText(day, texts))
    setShared(how === 'copied' ? 'Copied — paste it into a message.' : how === 'failed' ? 'Could not share from this browser.' : '')
  }

  return (
    <div className="prayer">
      <div className="day-nav">
        <button className="icon-btn" onClick={() => setDate(shiftDay(date, -1))} aria-label="Previous day">
          <Icon name="left" />
        </button>
        <label className="day-title">
          <span>{isToday ? 'Today' : longDate(date, date.slice(0, 4) !== today().slice(0, 4))}</span>
          {isToday && <small>{longDate(date)}</small>}
          <input type="date" value={date} max={today()} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Choose a day" />
        </label>
        <button className="icon-btn" onClick={() => setDate(shiftDay(date, 1))} disabled={isToday} aria-label="Next day">
          <Icon name="right" />
        </button>
      </div>
      {!isToday && (
        <button className="btn small" onClick={() => setDate(today())} style={{ marginBottom: 10 }}>
          <Icon name="calendar" size={15} /> Back to today
        </button>
      )}

      <h3 className="res-h">Prayer focuses</h3>
      {day.items.length > 0 && <p className="faint small res-hint">Tick a prayer when it is answered. Tap any prayer to change it.</p>}
      {day.items.map((it) => (
        <PrayerRow
          key={it.id}
          text={it.text}
          answered={!!it.answered}
          onText={(text) => save({ items: day.items.map((x) => (x.id === it.id ? { ...x, text } : x)) })}
          onAnswered={(answered) => save({ items: day.items.map((x) => (x.id === it.id ? { ...x, answered } : x)) })}
          onRemove={() => save({ items: day.items.filter((x) => x.id !== it.id) })}
        />
      ))}
      {!day.items.length && <p className="faint">{isToday ? 'What would you like to pray about today?' : 'Nothing was written for this day.'}</p>}
      {earlier && !day.items.length && (
        <button className="btn small" onClick={carry} style={{ marginBottom: 10 }}>
          <Icon name="copy" size={15} /> Carry over {earlier.items.filter((i) => !i.answered).length} from {shortDate(earlier.date)}
        </button>
      )}
      <div className="add-row">
        <DictationArea
          className="input"
          rows={2}
          autoGrow
          value={draft}
          onChange={setDraft}
          placeholder="Add a prayer focus… (type, or tap the microphone and speak)"
          aria-label="New prayer focus"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              add()
            }
          }}
        />
        <button className="btn primary" onClick={add} disabled={!draft.trim()}>
          <Icon name="plus" size={16} /> Add
        </button>
      </div>

      <h3 className="res-h">Encouraging verses</h3>
      {day.verses.map((r) => (
        <VerseCard key={r} refStr={r} onRemove={() => save({ verses: day.verses.filter((x) => x !== r) })} />
      ))}
      <VerseAdder have={day.verses} onAdd={(r) => !day.verses.includes(r) && save({ verses: [...day.verses, r] })} />

      {(day.items.length > 0 || day.verses.length > 0) && (
        <div style={{ marginTop: 14 }}>
          <button className="btn small" onClick={share}>
            <Icon name="share" size={15} /> Share this list
          </button>
          {shared && <span className="faint small"> {shared}</span>}
        </div>
      )}

      {recent.length > 0 && (
        <>
          <h3 className="res-h">Earlier days</h3>
          <div className="day-list">
            {recent.map((p) => (
              <button key={p.id} className="day-chip" onClick={() => setDate(p.date)}>
                <b>{shortDate(p.date)}</b>
                <span className="faint">
                  {p.items.length} focus{p.items.length === 1 ? '' : 'es'}
                  {p.items.some((i) => i.answered) ? ` · ${p.items.filter((i) => i.answered).length} answered` : ''}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function PrayerRow({ text, answered, onText, onAnswered, onRemove }: { text: string; answered: boolean; onText: (t: string) => void; onAnswered: (a: boolean) => void; onRemove: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [text])
  return (
    <div className={`prayer-row${answered ? ' answered' : ''}`}>
      <label className="answered-box" title="Answered">
        <input type="checkbox" checked={answered} onChange={(e) => onAnswered(e.target.checked)} />
        <span>{answered ? 'Answered' : ''}</span>
      </label>
      <textarea ref={ref} rows={1} value={text} onChange={(e) => onText(e.target.value)} onBlur={() => !text.trim() && onRemove()} aria-label="Prayer focus" />
      <button className="icon-btn" onClick={() => (!text.trim() || window.confirm('Remove this prayer focus?')) && onRemove()} aria-label="Remove">
        <Icon name="trash" size={17} />
      </button>
    </div>
  )
}

function VerseCard({ refStr, onRemove, onAdd }: { refStr: string; onRemove?: () => void; onAdd?: () => void }) {
  const caps = useCaps()
  const version = useStore((s) => s.settings.version)
  const [text, setText] = useState<{ t: string; v: string } | null>(null)
  useEffect(() => {
    let live = true
    loadPassage(refStr, 12)
      .then((p) => live && setText({ t: p.verses.map(passagePlain).join(' '), v: p.version }))
      .catch(() => live && setText({ t: '', v: '' }))
    return () => {
      live = false
    }
  }, [refStr, version])
  return (
    <div className="verse-card">
      <div className="verse-head">
        <button
          className="ref-link"
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
            openPopup({ kind: 'ref', ref: refStr, x: r.left, y: r.bottom + 6 })
          }}
        >
          {formatRef(refStr)}
        </button>
        {text?.v && <span className="faint small">{text.v}</span>}
        <span style={{ flex: 1 }} />
        {onAdd && (
          <button className="btn small primary" onClick={onAdd}>
            <Icon name="plus" size={15} /> Add
          </button>
        )}
        {onRemove && (
          <button className="icon-btn" onClick={onRemove} aria-label={`Remove ${formatRef(refStr)}`}>
            <Icon name="close" size={16} />
          </button>
        )}
      </div>
      <div className="verse-text">{text ? caps(text.t) : '…'}</div>
    </div>
  )
}

function VerseAdder({ have, onAdd }: { have: string[]; onAdd: (ref: string) => void }) {
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')
  const pool = ENCOURAGING.filter((r) => !have.includes(r))
  const [k, setK] = useState(() => Math.floor(Math.random() * ENCOURAGING.length))
  const [suggest, setSuggest] = useState(false)
  const suggestion = pool.length ? pool[k % pool.length] : null
  const add = () => {
    const s = q.trim()
    if (!s) return
    const r = parseHumanRef(s) ?? parseRef(s.toUpperCase())
    if (!r) {
      setErr('That reference was not recognised. Try “Philippians 4:6-7” or “Ps 23”.')
      return
    }
    onAdd(refToString(r))
    setQ('')
    setErr('')
  }
  return (
    <div className="verse-adder">
      <div className="add-row">
        <input
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Add a verse, e.g. Isaiah 41:10"
          aria-label="Add a verse by reference"
          enterKeyHint="done"
        />
        <button className="btn" onClick={add} disabled={!q.trim()}>
          <Icon name="plus" size={16} /> Add
        </button>
      </div>
      {err && <div className="ab-err small">{err}</div>}
      {!suggest ? (
        <button className="btn small" onClick={() => setSuggest(true)} style={{ marginTop: 8 }}>
          <Icon name="quote" size={15} /> Suggest an encouraging verse
        </button>
      ) : (
        suggestion && (
          <div className="suggest">
            <VerseCard
              refStr={suggestion}
              onAdd={() => {
                onAdd(suggestion)
                setK((x) => x + 1)
              }}
            />
            <button className="btn small" onClick={() => setK((x) => x + 1)}>
              Show another
            </button>{' '}
            <button className="btn small" onClick={() => setSuggest(false)}>
              Close
            </button>
          </div>
        )
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// Sermons (links)
// ---------------------------------------------------------------------------------------------
function host(url: string) {
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return url
  }
}

function Sermons({ onNotes }: { onNotes: () => void }) {
  const links = useStore((s) => s.settings.sermonLinks) ?? []
  const [editing, setEditing] = useState<SermonLink | null>(null)
  const saveLink = (l: SermonLink) => {
    const exists = links.some((x) => x.id === l.id)
    updateSettings({ sermonLinks: exists ? links.map((x) => (x.id === l.id ? l : x)) : [...links, l] })
    setEditing(null)
  }
  return (
    <div>
      <h3 className="res-h">Helpful sermons</h3>
      {links.map((l) => (
        <div key={l.id} className="link-card">
          <a href={l.url} target="_blank" rel="noopener noreferrer" className="link-main">
            <span className="link-icon">
              <Icon name="headphones" size={22} />
            </span>
            <span className="link-text">
              <b>{l.name}</b>
              <span className="faint small">{host(l.url)}</span>
            </span>
            <Icon name="external" size={18} />
          </a>
          <div className="link-actions">
            <button className="btn small" onClick={() => setEditing(l)}>
              <Icon name="edit" size={14} /> Edit
            </button>
            <button className="btn small danger" onClick={() => window.confirm(`Remove “${l.name}”?`) && updateSettings({ sermonLinks: links.filter((x) => x.id !== l.id) })} aria-label={`Remove ${l.name}`}>
              <Icon name="trash" size={14} />
            </button>
          </div>
        </div>
      ))}
      {!links.length && <p className="faint">No sermon links yet.</p>}
      {editing ? (
        <LinkForm link={editing} onSave={saveLink} onCancel={() => setEditing(null)} />
      ) : (
        <button className="btn" onClick={() => setEditing({ id: newId(), name: '', url: '' })}>
          <Icon name="plus" size={16} /> Add a sermon link
        </button>
      )}
      <p className="faint small" style={{ marginTop: 14 }}>
        Sermons open on SermonAudio (or in its app, if it is installed). Listening along?{' '}
        <button className="ref-link" onClick={onNotes}>
          Take sermon notes
        </button>
      </p>
    </div>
  )
}

function LinkForm({ link, onSave, onCancel }: { link: SermonLink; onSave: (l: SermonLink) => void; onCancel: () => void }) {
  const [name, setName] = useState(link.name)
  const [url, setUrl] = useState(link.url)
  const fixed = /^https?:\/\//i.test(url.trim()) ? url.trim() : url.trim() ? `https://${url.trim()}` : ''
  let ok = false
  try {
    ok = !!new URL(fixed).host.includes('.')
  } catch {
    ok = false
  }
  return (
    <div className="card link-form">
      <div className="field">
        <label htmlFor="ln">Name</label>
        <input id="ln" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sunday sermons" />
      </div>
      <div className="field">
        <label htmlFor="lu">Link</label>
        <input id="lu" className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.sermonaudio.com/…" inputMode="url" autoCapitalize="off" autoCorrect="off" />
      </div>
      <div className="actions">
        <button className="btn small" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn small primary" disabled={!ok} onClick={() => onSave({ ...link, name: name.trim() || host(fixed), url: fixed })}>
          Save
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// Sermon notes
// ---------------------------------------------------------------------------------------------

/** The note open in the editor survives a visit to another tab (a new one is kept here until its first save). */
let openNote: SermonNote | null = null

function SermonNotes() {
  const sermons = useStore((s) => s.sermons)
  const [open, setOpen] = useState<SermonNote | null>(() => (openNote ? (sermons.find((n) => n.id === openNote!.id) ?? openNote) : null))
  const [q, setQ] = useState('')
  const show = (n: SermonNote | null) => {
    openNote = n
    setOpen(n)
  }
  const list = useMemo(() => {
    const t = q.trim().toLowerCase()
    return sermons
      .filter((n) => !t || sermonText(n).toLowerCase().includes(t))
      .sort((a, b) => (a.date === b.date ? b.created - a.created : a.date < b.date ? 1 : -1))
  }, [sermons, q])

  if (open) return <SermonEditor key={open.id} initial={open} onClose={() => show(null)} />
  return (
    <div>
      <div className="section-title" style={{ justifyContent: 'space-between' }}>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Icon name="note" /> Sermon notes
        </span>
        <button className="btn small primary" onClick={() => show(newSermonNote())}>
          <Icon name="plus" size={16} /> New notes
        </button>
      </div>
      {sermons.length > 3 && (
        <div className="searchbox" style={{ marginBottom: 12 }}>
          <Icon name="search" size={18} />
          <input placeholder="Search sermon notes…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search sermon notes" />
        </div>
      )}
      {list.map((n) => {
        const first = n.sections.find((s) => s.text.trim())
        return (
          <button key={n.id} className="card sermon-card" onClick={() => show(n)}>
            <div className="card-head">
              <span className="ref">{n.title || 'Sermon notes'}</span>
              <span className="stamp">{shortDate(n.date)}</span>
            </div>
            {n.speaker && <div className="faint small">{n.speaker}</div>}
            {first && (
              <div className="body preview">
                <b>{heading(first.title)}</b> {first.text.trim().slice(0, 160)}
              </div>
            )}
          </button>
        )
      })}
      {!sermons.length && (
        <div className="empty">
          No sermon notes yet.
          <br />
          <button className="btn primary small" style={{ marginTop: 10 }} onClick={() => show(newSermonNote())}>
            Start sermon notes
          </button>
        </div>
      )}
      {sermons.length > 0 && !list.length && <p className="empty">No notes match “{q}”.</p>}
    </div>
  )
}

const isPoint = (s: SermonSection) => /^\d+\)$/.test(s.title.trim())
const isApplication = (s: SermonSection) => /^application/i.test(s.title.trim())

function SermonEditor({ initial, onClose }: { initial: SermonNote; onClose: () => void }) {
  const [n, setN] = useState(initial)
  const [focusId, setFocusId] = useState<{ id: string; part: 'title' | 'text' } | null>(null)
  const [palette, setPalette] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const dark = useStore((s) => s.settings.mode === 'dark')
  const hasTemplate = useStore((s) => !!s.settings.sermonTemplate?.length)
  const pending = useRef<SermonNote | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (pending.current) void saveItem('sermons', pending.current)
    pending.current = null
  }
  useEffect(() => () => flush(), []) // eslint-disable-line react-hooks/exhaustive-deps

  const update = (f: (x: SermonNote) => SermonNote) =>
    setN((prev) => {
      const next = { ...f(prev), updated: Date.now() }
      pending.current = next
      openNote = next
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(flush, 600)
      return next
    })
  const setSection = (id: string, patch: Partial<SermonSection>) => update((x) => ({ ...x, sections: x.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) }))
  const insertAt = (i: number, s: SermonSection, part: 'title' | 'text') => {
    update((x) => ({ ...x, sections: [...x.sections.slice(0, i), s, ...x.sections.slice(i)] }))
    setFocusId({ id: s.id, part })
  }
  // points and their applications go after the last point, before e.g. the group questions
  const afterPoints = () => {
    let at = -1
    n.sections.forEach((s, i) => (isPoint(s) || isApplication(s)) && (at = i))
    return at < 0 ? n.sections.length : at + 1
  }
  const addPoint = () => {
    const num = n.sections.filter(isPoint).length + 1
    insertAt(afterPoints(), { id: newId(), title: `${num})`, text: '', color: POINT_COLORS[(num - 1) % POINT_COLORS.length] }, 'text')
  }
  const addApplication = () => {
    const at = afterPoints()
    const point = [...n.sections.slice(0, at)].reverse().find(isPoint)
    insertAt(at, { id: newId(), title: 'Application', text: '', color: point?.color ?? '' }, 'text')
  }
  const action = (i: number, a: string) => {
    const s = n.sections[i]
    if (a === 'up' && i > 0) update((x) => ({ ...x, sections: swap(x.sections, i, i - 1) }))
    else if (a === 'down' && i < n.sections.length - 1) update((x) => ({ ...x, sections: swap(x.sections, i, i + 1) }))
    else if (a === 'below') insertAt(i + 1, { id: newId(), title: '', text: '', color: '' }, 'title')
    else if (a === 'rule') setSection(s.id, { rule: !s.rule })
    else if (a === 'color') setPalette(s.id)
    else if (a === 'delete' && (!s.text.trim() || window.confirm(`Delete the section “${heading(s.title) || 'untitled'}” and its notes?`)))
      update((x) => ({ ...x, sections: x.sections.filter((y) => y.id !== s.id) }))
  }
  const share = async () => {
    const how = await shareText(n.title || 'Sermon notes', sermonText(n))
    setMsg(how === 'copied' ? 'Copied — paste it into a message or document.' : how === 'failed' ? 'Could not share from this browser.' : '')
  }
  const remove = () => {
    if (!window.confirm('Delete these sermon notes? This cannot be undone.')) return
    pending.current = null
    if (timer.current) clearTimeout(timer.current)
    void deleteItem('sermons', n.id)
    onClose()
  }

  return (
    <div className="sermon-editor">
      <div className="sn-top">
        <button className="btn small" onClick={() => (flush(), onClose())}>
          <Icon name="left" size={15} /> All sermon notes
        </button>
        <span style={{ flex: 1 }} />
        <button className="icon-btn" onClick={share} aria-label="Share or copy these notes" title="Share or copy">
          <Icon name="share" size={19} />
        </button>
        <button className="icon-btn" onClick={remove} aria-label="Delete these notes" title="Delete">
          <Icon name="trash" size={19} />
        </button>
      </div>
      {msg && <p className="faint small">{msg}</p>}
      <div className="sn-page">
        <input className="sn-name" value={n.title} onChange={(e) => update((x) => ({ ...x, title: e.target.value }))} placeholder="Title" aria-label="Sermon title" />
        <div className="sn-meta">
          <input type="date" className="input" value={n.date} onChange={(e) => e.target.value && update((x) => ({ ...x, date: e.target.value }))} aria-label="Date" />
          <input className="input" value={n.speaker ?? ''} onChange={(e) => update((x) => ({ ...x, speaker: e.target.value }))} placeholder="Speaker" aria-label="Speaker" />
        </div>
        {n.sections.map((s, i) => {
          const color = inkColor(s.color, dark)
          return (
            <div key={s.id} className="sn-sec">
              {s.rule && <hr className="sn-rule" />}
              <div className="sn-head">
                <button className="sn-dot" style={{ background: color ?? 'var(--ink)' }} onClick={() => setPalette(palette === s.id ? null : s.id)} aria-label={`Text colour for ${heading(s.title) || 'this section'}`} title="Text colour" />
                <TitleBox value={s.title} color={color} onChange={(title) => setSection(s.id, { title })} autoFocus={focusId?.id === s.id && focusId.part === 'title'} />
                <label className="sn-menu" title="Section options">
                  <Icon name="more" size={20} stroke={3} />
                  <select value="" onChange={(e) => action(i, e.target.value)} aria-label={`Options for ${heading(s.title) || 'this section'}`}>
                    <option value="" disabled>
                      Section options
                    </option>
                    <option value="color">Text colour…</option>
                    {i > 0 && <option value="up">Move up</option>}
                    {i < n.sections.length - 1 && <option value="down">Move down</option>}
                    <option value="below">Add a section below</option>
                    <option value="rule">{s.rule ? 'Remove the line above' : 'Add a line above'}</option>
                    <option value="delete">Delete this section</option>
                  </select>
                </label>
              </div>
              {palette === s.id && (
                <div className="sn-palette" role="radiogroup" aria-label="Text colour">
                  {COLORS.map((c) => (
                    <button
                      key={c.name}
                      role="radio"
                      aria-checked={s.color === c.value}
                      className="sn-swatch"
                      style={{ background: inkColor(c.value, dark) ?? 'var(--ink)' }}
                      onClick={() => {
                        setSection(s.id, { color: c.value })
                        setPalette(null)
                      }}
                      aria-label={c.name}
                      title={c.name}
                    />
                  ))}
                  <label className="sn-swatch custom" title="Any colour">
                    <input type="color" value={s.color || '#000000'} onChange={(e) => setSection(s.id, { color: e.target.value })} aria-label="Any colour" />
                  </label>
                </div>
              )}
              <DictationArea
                className="input sn-text"
                rows={2}
                autoGrow
                value={s.text}
                style={{ color }}
                onChange={(v) => setSection(s.id, { text: v })}
                placeholder={i === 0 ? 'Type, or tap the microphone and speak…' : 'Write or speak…'}
                aria-label={heading(s.title) || 'Section notes'}
                autoFocus={focusId?.id === s.id && focusId.part === 'text'}
              />
            </div>
          )
        })}
        <div className="sn-add">
          <span className="faint small">Add:</span>
          <button className="btn small" onClick={addPoint}>
            <Icon name="plus" size={14} /> Point
          </button>
          <button className="btn small" onClick={addApplication}>
            <Icon name="plus" size={14} /> Application
          </button>
          <button className="btn small" onClick={() => insertAt(n.sections.length, { id: newId(), title: 'Question', text: '', color: '' }, 'text')}>
            <Icon name="plus" size={14} /> Question
          </button>
          <button className="btn small" onClick={() => insertAt(n.sections.length, { id: newId(), title: '', text: '', color: '' }, 'title')}>
            <Icon name="plus" size={14} /> Section
          </button>
        </div>
      </div>
      <div className="sn-template">
        <button
          className="btn small"
          onClick={() => {
            updateSettings({ sermonTemplate: n.sections.map(({ title, color, rule }) => ({ title, color, ...(rule ? { rule } : {}) })) })
            setMsg('Saved: new sermon notes will start with these sections and colours.')
          }}
        >
          <Icon name="layout" size={15} /> Use these sections for new notes
        </button>
        {hasTemplate && (
          <button
            className="btn small"
            onClick={() => {
              updateSettings({ sermonTemplate: null })
              setMsg(`New notes will start with the original template (${DEFAULT_SERMON_TEMPLATE.length} sections).`)
            }}
          >
            Back to the original template
          </button>
        )}
      </div>
    </div>
  )
}

/** A section title that wraps onto more lines when long ("COMMUNITY GROUP QUESTIONS" on a phone). */
function TitleBox({ value, color, onChange, autoFocus }: { value: string; color?: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return (
    <textarea
      ref={ref}
      className="sn-title"
      rows={1}
      value={value}
      style={{ color }}
      onChange={(e) => onChange(e.target.value.replace(/\n/g, ' '))}
      onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
      placeholder="SECTION TITLE"
      aria-label="Section title"
      autoFocus={autoFocus}
    />
  )
}

function swap<T>(a: T[], i: number, j: number): T[] {
  const b = [...a]
  ;[b[i], b[j]] = [b[j], b[i]]
  return b
}
