import { useMemo, useState } from 'react'
import { JournalCard } from '../components/Cards'
import { Icon } from '../components/Icon'
import { TEMPLATES } from '../lib/journal'
import { locString } from '../lib/refs'
import { setState, updateSettings, useStore } from '../lib/store'
import type { JournalTemplateId } from '../lib/types'
import { ui } from '../lib/ui'

export function JournalView() {
  const loc = useStore((s) => s.loc)
  const journal = useStore((s) => s.journal)
  const settings = useStore((s) => s.settings)
  const [scope, setScope] = useState<'chapter' | 'verse' | 'all'>('chapter')
  const [tfilter, setTfilter] = useState<JournalTemplateId | ''>('')
  const [q, setQ] = useState('')

  const list = useMemo(() => {
    const term = q.trim().toLowerCase()
    return journal
      .filter((j) => {
        if (scope === 'chapter' && !(j.book === loc.book && j.chapter === loc.chapter)) return false
        if (scope === 'verse' && !(j.book === loc.book && j.chapter === loc.chapter && j.verse !== undefined && j.verse <= loc.verse && (j.v2 ?? j.verse) >= loc.verse)) return false
        if (tfilter && j.template !== tfilter) return false
        if (term && !(Object.values(j.fields).join(' ') + ' ' + (j.title ?? '')).toLowerCase().includes(term)) return false
        return true
      })
      .sort((a, b) => (settings.journalSort === 'desc' ? b.created - a.created : a.created - b.created))
  }, [journal, scope, loc, tfilter, q, settings.journalSort])

  const add = () =>
    setState({ editor: { kind: 'journal', entry: { book: loc.book, chapter: loc.chapter, verse: scope === 'chapter' ? undefined : loc.verse, template: settings.journalTemplate } } })

  return (
    <div>
      <div className="section-title" style={{ justifyContent: 'space-between' }}>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Icon name="journal" /> My Journal
        </span>
        <button className="btn small primary" onClick={add}>
          <Icon name="plus" size={16} /> New entry
        </button>
      </div>
      <div className="field">
        <label htmlFor="jt">Default template</label>
        <select id="jt" className="select" value={settings.journalTemplate} onChange={(e) => updateSettings({ journalTemplate: e.target.value as JournalTemplateId })}>
          {TEMPLATES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.short}: {t.name}
            </option>
          ))}
        </select>
      </div>
      <div className="pills" style={{ marginBottom: 10 }}>
        <button className="pill" aria-pressed={scope === 'chapter'} onClick={() => setScope('chapter')}>
          {locString(loc.book, loc.chapter)}
        </button>
        <button className="pill" aria-pressed={scope === 'verse'} onClick={() => setScope('verse')}>
          Verse {loc.verse}
        </button>
        <button className="pill" aria-pressed={scope === 'all'} onClick={() => setScope('all')}>
          All entries ({journal.length})
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <div className="searchbox" style={{ flex: '1 1 180px' }}>
          <Icon name="search" size={18} />
          <input placeholder="Search entries…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search journal" />
        </div>
        <select className="select" style={{ fontSize: ui(15) }} value={tfilter} onChange={(e) => setTfilter(e.target.value as JournalTemplateId | '')} aria-label="Filter by template">
          <option value="">All templates</option>
          {TEMPLATES.map((t) => (
            <option key={t.id} value={t.id}>{t.short}</option>
          ))}
        </select>
        <button className="btn small" onClick={() => updateSettings({ journalSort: settings.journalSort === 'desc' ? 'asc' : 'desc' })} title="Sort by date">
          <Icon name="sort" size={15} /> {settings.journalSort === 'desc' ? 'Newest first' : 'Oldest first'}
        </button>
      </div>
      {list.map((j) => <JournalCard key={j.id} entry={j} />)}
      {!list.length && (
        <div className="empty">
          No journal entries {scope === 'all' ? 'yet' : `for ${scope === 'verse' ? locString(loc.book, loc.chapter, loc.verse) : locString(loc.book, loc.chapter)}`}.
          <br />
          <button className="btn primary small" style={{ marginTop: 10 }} onClick={add}>
            Start an entry
          </button>
        </div>
      )}
    </div>
  )
}
