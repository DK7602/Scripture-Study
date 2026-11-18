import { useState } from 'react'
import { books } from '../lib/data'
import { go, useStore } from '../lib/store'
import { Icon } from './Icon'

export function BookSidebar({ onPicked }: { onPicked?: () => void }) {
  const loc = useStore((s) => s.loc)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const cur = books().find((b) => b.id === loc.book)
    return { OT: cur?.t === 'OT', NT: cur?.t !== 'OT' }
  })
  const [expanded, setExpanded] = useState<string | null>(null)
  const list = books()
  const filter = q.trim().toLowerCase()

  const pickChapter = (book: string, chapter: number) => {
    go({ book, chapter, verse: 1 })
    setExpanded(null)
    onPicked?.()
  }

  return (
    <div className="books">
      <div className="books-head">
        <span>Books of the Bible</span>
      </div>
      <div className="find">
        <Icon name="search" size={16} />
        <input placeholder="Find a book…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a book" />
      </div>
      {(['OT', 'NT'] as const).map((t) => {
        const items = list.filter((b) => b.t === t && (!filter || b.name.toLowerCase().includes(filter) || b.abbr.toLowerCase().startsWith(filter)))
        const isOpen = filter ? true : open[t]
        return (
          <div key={t}>
            <button className="testament" onClick={() => setOpen({ ...open, [t]: !open[t] })} aria-expanded={isOpen}>
              <Icon name={isOpen ? 'down' : 'right'} size={14} stroke={2.4} />
              {t === 'OT' ? 'Old Testament' : 'New Testament'}
            </button>
            {isOpen &&
              items.map((b) => (
                <div key={b.id}>
                  <button
                    className="book-btn"
                    aria-current={b.id === loc.book}
                    onClick={() => (b.v.length === 1 ? pickChapter(b.id, 1) : setExpanded(expanded === b.id ? null : b.id))}
                  >
                    {b.name}
                    {b.id === loc.book && <Icon name={expanded === b.id ? 'down' : 'right'} size={14} stroke={2.4} />}
                  </button>
                  {expanded === b.id && (
                    <div className="chap-grid">
                      {b.v.map((_, i) => (
                        <button key={i} aria-current={b.id === loc.book && loc.chapter === i + 1} onClick={() => pickChapter(b.id, i + 1)}>
                          {i + 1}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
          </div>
        )
      })}
    </div>
  )
}
