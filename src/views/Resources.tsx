import { useEffect, useMemo, useRef, useState } from 'react'
import { DictationArea } from '../components/Dictate'
import { useAutoSize } from '../lib/autosize'
import { Icon } from '../components/Icon'
import { useCaps } from '../lib/caps'
import { loadPassage, passagePlain } from '../lib/passage'
import { formatRef, parseHumanRef, parseRef, refToString } from '../lib/refs'
import {
  COLORS,
  DAY_NAMES,
  DEFAULT_SERMON_TEMPLATE,
  WEEKLY_ID,
  daysLabel,
  weekday,
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
import { deleteItem, getState, newId, openPopup, saveItem, setTab, updateSettings, useStore } from '../lib/store'
import {
  cachedFeed,
  clock,
  closeSermon,
  loadFeed,
  minutes,
  playSermon,
  saBroadcaster,
  seekSermonBy,
  seekSermonTo,
  sermonPosition,
  sermonsOnScreen,
  setSermonRate,
  toggleSermon,
  useSermonPlayer,
  useSermonsOnScreen,
  type Feed,
} from '../lib/sermons'
import type { PrayerDay, PrayerItem, SermonLink, SermonNote, SermonRef, SermonSection } from '../lib/types'

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

function remember(s: Section) {
  try {
    localStorage.setItem('ss:resources', s)
  } catch {
    /* storage unavailable */
  }
}

let showSection: ((s: Section) => void) | null = null
/** Opens a part of Resources from anywhere (the floating sermon player). */
export function showResource(s: Section) {
  remember(s)
  showSection?.(s)
  setTab('resources')
}

/** Sermon notes for a sermon: the ones already written for it, or new ones with its title, date and speaker. */
function notesFor(s: SermonRef): SermonNote {
  const have = getState().sermons.find((n) => n.sermon?.id === s.id)
  if (have) return have
  return { ...newSermonNote(), title: s.title, date: s.date.slice(0, 10) || today(), speaker: s.speaker, sermon: s }
}

/** Resources: the prayer list, the church's sermons and sermon notes. */
export function ResourcesView() {
  const [sec, setSec] = useState<Section>(remembered)
  const pick = (s: Section) => {
    setSec(s)
    remember(s)
  }
  useEffect(() => {
    showSection = setSec
    return () => {
      showSection = null
    }
  }, [])
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
      {sec === 'sermons' && (
        <Sermons
          onNotes={(s) => {
            openNote = notesFor(s)
            pick('notes')
          }}
        />
      )}
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
  const [repeat, setRepeat] = useState(false)
  const [weeklyOpen, setWeeklyOpen] = useState(false)
  const [note, setNote] = useState('') // "Saved as a weekly prayer…"
  useEffect(() => {
    if (!note) return
    const t = setTimeout(() => setNote(''), 8000)
    return () => clearTimeout(t)
  }, [note])
  const day: PrayerDay = prayers.find((p) => p.id === `day-${date}`) ?? emptyDay(date)
  const days = useMemo(() => prayers.filter((p) => p.id.startsWith('day-')), [prayers])
  const weekly: PrayerDay = prayers.find((p) => p.id === WEEKLY_ID) ?? { ...emptyDay(''), id: WEEKLY_ID }
  const wd = weekday(date)
  const todays = weekly.items.filter((i) => i.days?.includes(wd))
  const isToday = date === today()
  const save = (patch: Partial<PrayerDay>) => void saveItem('prayers', { ...day, ...patch, updated: Date.now() })
  const saveWeekly = (items: PrayerItem[]) => void saveItem('prayers', { ...weekly, items, updated: Date.now() })
  const prayed = new Set(day.prayed ?? [])
  // a weekly prayer God has answered: it leaves the weekly list and joins today's, ticked as answered
  const answerWeekly = (it: PrayerItem) => {
    const t = today()
    const rec = prayers.find((p) => p.id === `day-${t}`) ?? emptyDay(t)
    void saveItem('prayers', { ...rec, items: [...rec.items, { id: newId(), text: it.text, answered: true, answeredOn: t }], updated: Date.now() })
    saveWeekly(weekly.items.filter((x) => x.id !== it.id))
  }

  const add = () => {
    const text = draft.trim()
    if (!text) return
    if (repeat) {
      saveWeekly([...weekly.items, { id: newId(), text, days: [wd] }])
      setNote(`✓ Saved as a weekly prayer: it comes back every ${DAY_NAMES[wd]}. Tap its ↻ label to choose other days.`)
    } else save({ items: [...day.items, { id: newId(), text }] })
    setDraft('')
    setRepeat(false)
  }
  // a prayer from today's list made weekly (the ↻ button on it)
  const makeWeekly = (it: PrayerItem) => {
    saveWeekly([...weekly.items, { id: newId(), text: it.text, days: [wd] }])
    save({ items: day.items.filter((x) => x.id !== it.id) })
    setNote(`✓ “${it.text.split('\n')[0].slice(0, 40)}” now comes back every ${DAY_NAMES[wd]}. Tap its ↻ label to choose other days.`)
  }
  const editDays = () => {
    setWeeklyOpen(true)
    setTimeout(() => document.querySelector('.weekly-card')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50)
  }
  // the most recent earlier day with focuses still waiting for an answer
  const earlier = useMemo(
    () => days.filter((p) => p.date < date && p.items.some((i) => !i.answered)).sort((a, b) => (a.date < b.date ? 1 : -1))[0],
    [days, date],
  )
  const carry = () => {
    if (!earlier) return
    const have = new Set(day.items.map((i) => i.text))
    save({ items: [...day.items, ...earlier.items.filter((i) => !i.answered && !have.has(i.text)).map((i) => ({ id: newId(), text: i.text }))] })
  }
  const recent = useMemo(
    () => days.filter((p) => p.date !== date && (p.items.length || p.verses.length)).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 12),
    [days, date],
  )
  const share = async () => {
    const texts: Record<string, string> = {}
    for (const r of day.verses) {
      const p = await loadPassage(r, 8).catch(() => null)
      if (p) texts[r] = p.verses.map(passagePlain).join(' ')
    }
    const how = await shareText('Prayer list', prayerText(day, texts, todays))
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
      {(day.items.length > 0 || todays.length > 0) && (
        <p className="faint small res-hint">Tick weekly prayers (↻) as you pray them, and other prayers when they are answered. Tap a prayer to change it.</p>
      )}
      {todays.map((it) => (
        <PrayerRow
          key={it.id}
          text={it.text}
          answered={prayed.has(it.id)}
          doneLabel="Prayed"
          tag={`↻ ${daysLabel(it.days)}`}
          onTag={editDays}
          confirmRemove={`Stop praying “${it.text.slice(0, 60)}” every week?`}
          onText={(text) => saveWeekly(weekly.items.map((x) => (x.id === it.id ? { ...x, text } : x)))}
          onAnswered={(on) => save({ prayed: on ? [...prayed, it.id] : [...prayed].filter((x) => x !== it.id) })}
          onRemove={() => saveWeekly(weekly.items.filter((x) => x.id !== it.id))}
        />
      ))}
      {day.items.map((it) => (
        <PrayerRow
          key={it.id}
          text={it.text}
          answered={!!it.answered}
          onText={(text) => save({ items: day.items.map((x) => (x.id === it.id ? { ...x, text } : x)) })}
          onAnswered={(answered) => save({ items: day.items.map((x) => (x.id === it.id ? { ...x, answered, answeredOn: answered ? today() : undefined } : x)) })}
          onRemove={() => save({ items: day.items.filter((x) => x.id !== it.id) })}
          onRepeat={it.answered ? undefined : () => makeWeekly(it)}
          repeatLabel={`Pray this every ${DAY_NAMES[wd]}`}
        />
      ))}
      {!day.items.length && !todays.length && <p className="faint">{isToday ? 'What would you like to pray about today?' : 'Nothing was written for this day.'}</p>}
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
          placeholder="Add a prayer focus… type or speak. Enter starts a new line; tap Add when done."
          aria-label="New prayer focus"
        />
        <button className="btn primary" onClick={add} disabled={!draft.trim()}>
          <Icon name="plus" size={16} /> Add
        </button>
      </div>
      <label className="repeat-toggle">
        <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
        <span>
          Make the prayer I’m adding a weekly prayer (every {DAY_NAMES[wd]})
        </span>
      </label>
      {note && (
        <p className="res-note" role="status">
          {note}
        </p>
      )}
      <WeeklyPrayers items={weekly.items} onSave={saveWeekly} prefer={wd} onAnswered={answerWeekly} open={weeklyOpen} setOpen={setWeeklyOpen} />

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

      <AnsweredPrayers days={days} onOpenDay={setDate} />

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

function PrayerRow({
  text,
  answered,
  onText,
  onAnswered,
  onRemove,
  doneLabel = 'Answered',
  tag,
  onTag,
  onRepeat,
  repeatLabel,
  confirmRemove = 'Remove this prayer focus?',
}: {
  text: string
  answered: boolean
  onText: (t: string) => void
  onAnswered: (a: boolean) => void
  onRemove: () => void
  doneLabel?: string
  tag?: string
  onTag?: () => void
  onRepeat?: () => void
  repeatLabel?: string
  confirmRemove?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useAutoSize(ref, text)
  return (
    <div className={`prayer-row${answered ? ' answered' : ''}${tag ? ' weekly' : ''}`}>
      <label className="answered-box" title={doneLabel}>
        <input type="checkbox" checked={answered} onChange={(e) => onAnswered(e.target.checked)} aria-label={doneLabel} />
        <span className={answered ? '' : 'faint'}>{doneLabel}</span>
      </label>
      <div className="prayer-body">
        {tag &&
          (onTag ? (
            <button className="weekly-tag" onClick={onTag} title="Choose the days">
              {tag} <span className="faint">· change days</span>
            </button>
          ) : (
            <span className="weekly-tag">{tag}</span>
          ))}
        <textarea ref={ref} rows={1} className="autogrow" value={text} onChange={(e) => onText(e.target.value)} onBlur={() => !text.trim() && onRemove()} aria-label="Prayer focus" />
      </div>
      <div className="prayer-actions">
        {onRepeat && (
          <button className="icon-btn repeat-btn" onClick={onRepeat} aria-label={repeatLabel} title={repeatLabel}>
            ↻
          </button>
        )}
        <button className="icon-btn" onClick={() => (!text.trim() || window.confirm(confirmRemove)) && onRemove()} aria-label="Remove">
          <Icon name="trash" size={17} />
        </button>
      </div>
    </div>
  )
}

/** Every prayer ticked as answered, newest first: a record of God's faithfulness. */
function AnsweredPrayers({ days, onOpenDay }: { days: PrayerDay[]; onOpenDay: (date: string) => void }) {
  const [all, setAll] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const list = useMemo(() => {
    const seen = new Map<string, { it: PrayerItem; day: PrayerDay; on: string }>()
    for (const d of days)
      for (const it of d.items)
        if (it.answered) {
          const on = it.answeredOn || d.date
          const key = it.text.trim().toLowerCase()
          const had = seen.get(key)
          // the same prayer carried over several days and ticked more than once: keep the latest
          if (!had || had.on < on || (had.on === on && !had.it.note && it.note)) seen.set(key, { it, day: d, on })
        }
    return [...seen.values()].sort((a, b) => (a.on < b.on ? 1 : a.on > b.on ? -1 : 0))
  }, [days])
  const saveNote = (day: PrayerDay, id: string, note: string) =>
    void saveItem('prayers', { ...day, items: day.items.map((x) => (x.id === id ? { ...x, note } : x)), updated: Date.now() })
  const shown = all ? list : list.slice(0, 5)
  return (
    <div className="answered-list">
      <h3 className="res-h">
        Answered prayers {list.length > 0 && <span className="faint">({list.length})</span>}
      </h3>
      {!list.length && <p className="faint small">When you tick a prayer as answered, it is kept here: a record of GOD’s faithfulness.</p>}
      {shown.map(({ it, day, on }) => (
        <div key={it.id} className="answered-card">
          <div className="answered-top">
            <span className="answered-mark" aria-hidden="true">
              <Icon name="check" size={16} stroke={2.6} />
            </span>
            <div className="answered-text">{it.text}</div>
          </div>
          <div className="faint small answered-meta">
            Answered {shortDate(on)}
            {day.date !== on ? ` · on your list ${shortDate(day.date)}` : ''} ·{' '}
            <button className="ref-link" onClick={() => onOpenDay(day.date)}>
              open that day
            </button>
          </div>
          {editing === it.id ? (
            <div className="answered-note-edit">
              <DictationArea className="input" rows={2} autoGrow value={it.note ?? ''} onChange={(v) => saveNote(day, it.id, v)} placeholder="How did GOD answer? (type or speak)" aria-label="How it was answered" autoFocus />
              <button className="btn small" onClick={() => setEditing(null)}>
                Done
              </button>
            </div>
          ) : it.note?.trim() ? (
            <button className="answered-note" onClick={() => setEditing(it.id)} title="Change this note">
              {it.note}
            </button>
          ) : (
            <button className="ref-link small" onClick={() => setEditing(it.id)}>
              + How was it answered?
            </button>
          )}
        </div>
      ))}
      {list.length > 5 && (
        <button className="btn small" onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `Show all ${list.length} answered prayers`}
        </button>
      )}
    </div>
  )
}

/** The prayers that come back every week, on the days chosen for each. */
function WeeklyPrayers({
  items,
  onSave,
  prefer,
  onAnswered,
  open,
  setOpen,
}: {
  items: PrayerItem[]
  onSave: (items: PrayerItem[]) => void
  prefer: number
  onAnswered: (it: PrayerItem) => void
  open: boolean
  setOpen: (o: boolean) => void
}) {
  const [text, setText] = useState('')
  const [days, setDays] = useState<number[]>([prefer])
  const add = () => {
    const t = text.trim()
    if (!t || !days.length) return
    onSave([...items, { id: newId(), text: t, days }])
    setText('')
  }
  const sorted = [...items].sort((a, b) => Math.min(...(a.days ?? [7])) - Math.min(...(b.days ?? [7])))
  return (
    <div className="weekly">
      <button className="btn small" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Icon name="calendar" size={15} /> {open ? 'Hide weekly prayers' : `See or change weekly prayers${items.length ? ` (${items.length})` : ''}`} <Icon name={open ? 'up' : 'down'} size={14} />
      </button>
      {open && (
        <div className="card weekly-card">
          <p className="faint small" style={{ marginTop: 0 }}>
            These come back every week on the days you choose, and show up in that day’s list.
          </p>
          {sorted.map((it) => (
            <div key={it.id} className="weekly-row">
              <div className="weekly-top">
                <GrowArea
                  value={it.text}
                  onChange={(t) => onSave(items.map((x) => (x.id === it.id ? { ...x, text: t } : x)))}
                  onBlur={() => !it.text.trim() && onSave(items.filter((x) => x.id !== it.id))}
                  label="Weekly prayer"
                />
                <button className="icon-btn" onClick={() => window.confirm(`Stop praying “${it.text.slice(0, 60)}” every week?`) && onSave(items.filter((x) => x.id !== it.id))} aria-label="Remove">
                  <Icon name="trash" size={17} />
                </button>
              </div>
              <DayChips value={it.days ?? []} onChange={(d) => onSave(items.map((x) => (x.id === it.id ? { ...x, days: d } : x)))} />
              <button className="btn small answer-btn" onClick={() => window.confirm(`Mark “${it.text.slice(0, 60)}” as answered? It moves to your answered prayers and stops repeating.`) && onAnswered(it)}>
                <Icon name="check" size={15} /> Answered
              </button>
            </div>
          ))}
          {!items.length && <p className="faint">No weekly prayers yet.</p>}
          <div className="weekly-add">
            <DictationArea className="input" rows={1} autoGrow value={text} onChange={setText} placeholder="A prayer for every week… (type or speak)" aria-label="New weekly prayer" />
            <DayChips value={days} onChange={setDays} />
            <button className="btn primary small" onClick={add} disabled={!text.trim() || !days.length}>
              <Icon name="plus" size={15} /> Add weekly prayer
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** A text box that grows with its text. */
function GrowArea({ value, onChange, onBlur, label }: { value: string; onChange: (v: string) => void; onBlur?: () => void; label: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useAutoSize(ref, value, true, 2)
  return <textarea ref={ref} rows={1} className="input autogrow" value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} aria-label={label} style={{ overflow: 'hidden' }} />
}

/** S M T W T F S toggles, plus every day. At least one day stays chosen. */
function DayChips({ value, onChange }: { value: number[]; onChange: (d: number[]) => void }) {
  const set = new Set(value)
  const toggle = (d: number) => {
    if (set.has(d)) {
      if (set.size > 1) set.delete(d)
    } else set.add(d)
    onChange([...set].sort())
  }
  return (
    <div className="day-chips" role="group" aria-label="Days of the week">
      {DAY_NAMES.map((n, d) => (
        <button key={n} className="day-btn" aria-pressed={set.has(d)} onClick={() => toggle(d)} aria-label={n} title={n}>
          {n.slice(0, n === 'Thursday' || n === 'Tuesday' || n === 'Saturday' || n === 'Sunday' ? 2 : 1)}
        </button>
      ))}
      <button className="day-btn all" aria-pressed={set.size === 7} onClick={() => onChange(set.size === 7 ? [value[0] ?? 0] : [0, 1, 2, 3, 4, 5, 6])}>
        Every day
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
// Sermons: the church's sermons from SermonAudio, played here; other links open in the browser
// ---------------------------------------------------------------------------------------------
function host(url: string) {
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return url
  }
}

function Sermons({ onNotes }: { onNotes: (s: SermonRef) => void }) {
  const links = useStore((s) => s.settings.sermonLinks) ?? []
  const sources = links.filter((l) => saBroadcaster(l.url))
  const others = links.filter((l) => !saBroadcaster(l.url))
  const [srcId, setSrcId] = useState(sources[0]?.id)
  const src = sources.find((x) => x.id === srcId) ?? sources[0]
  const [manage, setManage] = useState(false)
  const [editing, setEditing] = useState<SermonLink | null>(null)
  useEffect(() => {
    sermonsOnScreen(true)
    return () => sermonsOnScreen(false)
  }, [])
  const saveLink = (l: SermonLink) => {
    const exists = links.some((x) => x.id === l.id)
    updateSettings({ sermonLinks: exists ? links.map((x) => (x.id === l.id ? l : x)) : [...links, l] })
    setEditing(null)
  }
  return (
    <div>
      {sources.length > 1 && (
        <div className="pills" style={{ marginBottom: 12 }}>
          {sources.map((l) => (
            <button key={l.id} className="pill" aria-pressed={l.id === src?.id} onClick={() => setSrcId(l.id)}>
              {l.name}
            </button>
          ))}
        </div>
      )}
      {src && <SermonFeedView key={src.id} link={src} onNotes={onNotes} />}
      {others.length > 0 && <h3 className="res-h">More sermons</h3>}
      {others.map((l) => (
        <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer" className="link-card link-main">
          <span className="link-icon">
            <Icon name="headphones" size={22} />
          </span>
          <span className="link-text">
            <b>{l.name}</b>
            <span className="faint small">{host(l.url)}</span>
          </span>
          <Icon name="external" size={18} />
        </a>
      ))}
      <div style={{ marginTop: 18 }}>
        {!manage ? (
          <button className="btn small" onClick={() => setManage(true)}>
            <Icon name="link" size={15} /> Sermon sources and links…
          </button>
        ) : (
          <div className="card">
            <h3 className="res-h" style={{ marginTop: 0 }}>
              Sermon sources and links
            </h3>
            <p className="faint small">A SermonAudio church page plays its sermons right here; any other link opens in the browser.</p>
            {links.map((l) => (
              <div key={l.id} className="link-row">
                <span className="link-text">
                  <b>{l.name}</b>
                  <span className="faint small">{saBroadcaster(l.url) ? 'SermonAudio · plays here' : host(l.url)}</span>
                </span>
                <button className="btn small" onClick={() => setEditing(l)}>
                  <Icon name="edit" size={14} /> Edit
                </button>
                <button className="btn small danger" onClick={() => window.confirm(`Remove “${l.name}”?`) && updateSettings({ sermonLinks: links.filter((x) => x.id !== l.id) })} aria-label={`Remove ${l.name}`}>
                  <Icon name="trash" size={14} />
                </button>
              </div>
            ))}
            {editing ? (
              <LinkForm link={editing} onSave={saveLink} onCancel={() => setEditing(null)} />
            ) : (
              <div className="actions" style={{ justifyContent: 'space-between' }}>
                <button className="btn small" onClick={() => setEditing({ id: newId(), name: '', url: '' })}>
                  <Icon name="plus" size={15} /> Add a church or link
                </button>
                <button className="btn small" onClick={() => setManage(false)}>
                  Done
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function SermonFeedView({ link, onNotes }: { link: SermonLink; onNotes: (s: SermonRef) => void }) {
  const b = saBroadcaster(link.url)!
  const [feed, setFeed] = useState<Feed | null>(() => cachedFeed(b))
  const [err, setErr] = useState('')
  const [view, setView] = useState<'latest' | 'series'>('latest')
  const [series, setSeries] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [shown, setShown] = useState(15)
  useEffect(() => {
    let live = true
    loadFeed(b)
      .then((f) => live && (setFeed(f), setErr('')))
      .catch(() => live && setErr('The sermons could not be loaded right now. Check the connection, or open them on SermonAudio.'))
    return () => {
      live = false
    }
  }, [b])
  const extra = { image: feed?.image, church: feed?.title || link.name }
  const groups = useMemo(() => {
    const m = new Map<string, SermonRef[]>()
    for (const x of feed?.sermons ?? []) {
      const k = x.series || 'Other sermons'
      m.set(k, [...(m.get(k) ?? []), x])
    }
    return [...m.entries()].sort((a, b) => (a[1][0].date < b[1][0].date ? 1 : -1))
  }, [feed])
  const list = useMemo(() => {
    const all = feed?.sermons ?? []
    const t = q.trim().toLowerCase()
    if (t) return all.filter((x) => `${x.title} ${x.speaker} ${x.series}`.toLowerCase().includes(t))
    if (view === 'series' && series) return [...all.filter((x) => (x.series || 'Other sermons') === series)].reverse() // in order
    return all
  }, [feed, q, view, series])

  return (
    <div className="sermon-feed">
      <div className="church-head">
        {feed?.image ? <img src={feed.image} alt="" className="church-img" /> : <span className="link-icon"><Icon name="headphones" size={22} /></span>}
        <div className="link-text">
          <b>{feed?.title || link.name}</b>
          <span className="faint small">Sermons from SermonAudio{feed ? ` · newest ${feed.sermons.length}` : ''}</span>
        </div>
        <a className="icon-btn" href={link.url} target="_blank" rel="noopener noreferrer" aria-label="Open on SermonAudio" title="Open on SermonAudio">
          <Icon name="external" size={18} />
        </a>
      </div>
      <SermonPlayerCard onNotes={onNotes} />
      {err && !feed && (
        <p className="ab-err">
          {err}{' '}
          <a href={link.url} target="_blank" rel="noopener noreferrer" className="ref-link">
            Open on SermonAudio
          </a>
        </p>
      )}
      {!feed && !err && <div className="spinner" />}
      {feed && (
        <>
          <div className="feed-tools">
            <div className="seg">
              <button aria-pressed={view === 'latest'} onClick={() => (setView('latest'), setSeries(null))}>
                Latest
              </button>
              <button aria-pressed={view === 'series'} onClick={() => setView('series')}>
                Series
              </button>
            </div>
            <div className="searchbox">
              <Icon name="search" size={17} />
              <input placeholder="Search sermons…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search sermons" />
            </div>
          </div>
          {view === 'series' && !series && !q.trim() ? (
            <div className="series-list">
              {groups.map(([name, xs]) => (
                <button key={name} className="series-card" onClick={() => setSeries(name)}>
                  <b>{name}</b>
                  <span className="faint small">
                    {xs.length} sermon{xs.length === 1 ? '' : 's'} · {[...new Set(xs.map((x) => x.speaker))].slice(0, 2).join(', ')}
                  </span>
                  <span className="faint small">
                    {shortDate(xs[xs.length - 1].date.slice(0, 10))}
                    {xs.length > 1 ? ` – ${shortDate(xs[0].date.slice(0, 10))}` : ''}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <>
              {view === 'series' && series && !q.trim() && (
                <div className="series-head">
                  <button className="btn small" onClick={() => setSeries(null)}>
                    <Icon name="left" size={15} /> All series
                  </button>
                  <b>{series}</b>
                </div>
              )}
              {list.slice(0, q.trim() || series ? list.length : shown).map((x) => (
                <SermonRow key={x.id} s={x} extra={extra} showSeries={!series} onNotes={onNotes} />
              ))}
              {!q.trim() && !series && list.length > shown && (
                <button className="btn" style={{ width: '100%' }} onClick={() => setShown((n) => n + 20)}>
                  Show more sermons
                </button>
              )}
              {q.trim() && !list.length && <p className="empty">No sermons match “{q}”.</p>}
            </>
          )}
          <p className="faint small" style={{ marginTop: 12 }}>
            Older sermons:{' '}
            <a href={link.url} target="_blank" rel="noopener noreferrer" className="ref-link">
              {feed.title || link.name} on SermonAudio
            </a>
          </p>
        </>
      )}
    </div>
  )
}

function SermonRow({ s, extra, showSeries, onNotes }: { s: SermonRef; extra: { image?: string; church?: string }; showSeries: boolean; onNotes: (s: SermonRef) => void }) {
  const p = useSermonPlayer()
  const pos = useMemo(() => sermonPosition(s.id), [s.id, p.positions]) // eslint-disable-line react-hooks/exhaustive-deps
  const cur = p.current?.id === s.id
  const play = () => playSermon(s, extra)
  return (
    <div className={`sermon-row${cur ? ' current' : ''}`}>
      <button className="sr-play" onClick={play} aria-label={cur && p.playing ? 'Pause' : `Play ${s.title}`}>
        <Icon name={cur && p.playing ? 'pause' : 'play'} size={18} fill={!(cur && p.playing)} stroke={cur && p.playing ? 2.6 : 1.8} />
      </button>
      <button className="sr-main" onClick={play}>
        <b>{s.title}</b>
        <span className="faint small">
          {s.speaker} · {shortDate(s.date.slice(0, 10))} · {minutes(s.duration)}
        </span>
        {showSeries && s.series && <span className="sr-series">{s.series}</span>}
        {pos?.done ? <span className="sr-badge">✓ Listened</span> : pos?.t ? <span className="sr-badge">Stopped at {clock(pos.t)}</span> : null}
      </button>
      <button className="icon-btn" onClick={() => onNotes(s)} aria-label={`Take notes on ${s.title}`} title="Take notes">
        <Icon name="note" size={19} />
      </button>
    </div>
  )
}

const RATES = [0.8, 1, 1.1, 1.25, 1.5, 1.75, 2]

function SermonPlayerCard({ onNotes }: { onNotes: (s: SermonRef) => void }) {
  const p = useSermonPlayer()
  const s = p.current
  if (!s) return null
  const dur = p.duration || s.duration
  return (
    <div className="sermon-player" role="region" aria-label="Sermon player">
      <div className="sp-head">
        {s.image && <img src={s.image} alt="" />}
        <div className="link-text">
          <b>{s.title}</b>
          <span className="faint small">
            {s.speaker} · {shortDate(s.date.slice(0, 10))}
            {s.series ? ` · ${s.series}` : ''}
          </span>
        </div>
        <button className="icon-btn" onClick={closeSermon} aria-label="Stop and close the sermon" title="Stop">
          <Icon name="close" size={18} />
        </button>
      </div>
      <input type="range" className="sp-seek" min={0} max={Math.max(1, Math.floor(dur))} step={1} value={Math.min(Math.floor(p.time), Math.floor(dur))} onChange={(e) => seekSermonTo(+e.target.value)} aria-label="Position in the sermon" />
      <div className="sp-times">
        <span>{clock(p.time)}</span>
        <span>{p.loading ? 'loading…' : `−${clock(dur - p.time)}`}</span>
      </div>
      <div className="sp-controls">
        <button className="sp-skip" onClick={() => seekSermonBy(-15)} aria-label="Back 15 seconds" title="Back 15 seconds">
          <Icon name="left" size={16} /> 15
        </button>
        <button className="ab-play" onClick={toggleSermon} aria-label={p.playing ? 'Pause' : 'Play'}>
          <Icon name={p.playing ? 'pause' : 'play'} size={22} fill={!p.playing} stroke={p.playing ? 2.6 : 1.8} />
        </button>
        <button className="sp-skip" onClick={() => seekSermonBy(30)} aria-label="Forward 30 seconds" title="Forward 30 seconds">
          30 <Icon name="right" size={16} />
        </button>
        <select className="select sp-rate" value={p.rate} onChange={(e) => setSermonRate(+e.target.value)} aria-label="Speed">
          {RATES.map((r) => (
            <option key={r} value={r}>
              {r}×
            </option>
          ))}
        </select>
      </div>
      <div className="sp-actions">
        <button className="btn small" onClick={() => onNotes(s)}>
          <Icon name="note" size={15} /> Take notes
        </button>
        <a className="btn small" href={s.url} target="_blank" rel="noopener noreferrer">
          <Icon name="external" size={15} /> SermonAudio
        </a>
      </div>
      {p.error && <div className="ab-err small">{p.error}</div>}
    </div>
  )
}

/** The sermon still playing while you are elsewhere in the app: a small floating bar. */
export function SermonMini() {
  const p = useSermonPlayer()
  const onScreen = useSermonsOnScreen()
  if (!p.current || onScreen) return null
  const expand = () => showResource('sermons')
  return (
    <div className="mini-player wide" role="region" aria-label="Sermon">
      <button className="ab-play mini" onClick={toggleSermon} aria-label={p.playing ? 'Pause' : 'Play'}>
        <Icon name={p.playing ? 'pause' : 'play'} size={18} fill={!p.playing} stroke={p.playing ? 2.6 : 1.8} />
      </button>
      <button className="mini-label" onClick={expand} title="Show the sermon">
        <Icon name="headphones" size={15} /> <span className="mini-title">{p.current.title}</span>
      </button>
      <span className="mini-time faint small">{clock(p.time)}</span>
      <button className="icon-btn" onClick={expand} aria-label="Show the sermon">
        <Icon name="up" size={18} />
      </button>
      <button className="icon-btn" onClick={closeSermon} aria-label="Stop and close the sermon">
        <Icon name="close" size={16} />
      </button>
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
    <div className="link-form">
      <div className="field">
        <label htmlFor="ln">Name</label>
        <input id="ln" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sunday sermons" />
      </div>
      <div className="field">
        <label htmlFor="lu">Link</label>
        <input id="lu" className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.sermonaudio.com/broadcasters/…" inputMode="url" autoCapitalize="off" autoCorrect="off" />
        <span className="hint">A church’s SermonAudio page (sermonaudio.com/broadcasters/…) plays its sermons inside the app.</span>
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
        <TitleBox className="sn-name" value={n.title} onChange={(title) => update((x) => ({ ...x, title }))} placeholder="Title" label="Sermon title" />
        {n.sermon && <SermonListen s={n.sermon} />}
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
                <TitleBox className="sn-title" value={s.title} color={color} onChange={(title) => setSection(s.id, { title })} autoFocus={focusId?.id === s.id && focusId.part === 'title'} />
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

/** In sermon notes made from a sermon: play it while writing. */
function SermonListen({ s }: { s: SermonRef }) {
  const p = useSermonPlayer()
  const cur = p.current?.id === s.id
  const feed = cachedFeed(saBroadcaster(s.url) ?? '')
  return (
    <div className="sn-listen">
      <button className="btn small" onClick={() => playSermon(s, { image: feed?.image, church: feed?.title })}>
        <Icon name={cur && p.playing ? 'pause' : 'play'} size={15} fill={!(cur && p.playing)} /> {cur && p.playing ? 'Pause the sermon' : cur ? 'Resume the sermon' : 'Listen to the sermon'}
      </button>
      {cur && <span className="faint small">{clock(p.time)}</span>}
    </div>
  )
}

/** A section title that wraps onto more lines when long ("COMMUNITY GROUP QUESTIONS" on a phone). */
function TitleBox({
  className,
  value,
  color,
  onChange,
  autoFocus,
  placeholder = 'SECTION TITLE',
  label = 'Section title',
}: {
  className: string
  value: string
  color?: string
  onChange: (v: string) => void
  autoFocus?: boolean
  placeholder?: string
  label?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useAutoSize(ref, value)
  return (
    <textarea
      ref={ref}
      className={`${className} autogrow`}
      rows={1}
      value={value}
      style={{ color }}
      onChange={(e) => onChange(e.target.value.replace(/\n/g, ' '))}
      onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
      placeholder={placeholder}
      aria-label={label}
      autoFocus={autoFocus}
    />
  )
}

function swap<T>(a: T[], i: number, j: number): T[] {
  const b = [...a]
  ;[b[i], b[j]] = [b[j], b[i]]
  return b
}
