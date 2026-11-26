import { useState } from 'react'
import { turnPage } from '../views/Reader'
import { deleteItem, getState, newId, saveItem, setState, setTab, updateSettings, useStore } from '../lib/store'
import { Icon } from './Icon'
import { Popover } from './Popover'
import { ui } from '../lib/ui'

/** Phone toolbar: previous/next chapter, books, highlighter, bookmark, text size. */
export function BottomBar({ onBooks }: { onBooks: () => void }) {
  const tab = useStore((s) => s.tab)
  const loc = useStore((s) => s.loc)
  const bookmarks = useStore((s) => s.bookmarks)
  const settings = useStore((s) => s.settings)
  const labels = useStore((s) => s.labels)
  const [aa, setAa] = useState(false)
  const marked = bookmarks.find((b) => b.book === loc.book && b.chapter === loc.chapter && b.verse === loc.verse)

  const toggleBookmark = () => {
    if (marked) deleteItem('bookmarks', marked.id)
    else saveItem('bookmarks', { id: newId(), book: loc.book, chapter: loc.chapter, verse: loc.verse, created: Date.now() })
  }
  const highlightVerse = () => {
    // highlight the focused verse with the current highlighter color (select text for word-level)
    const s = getState()
    setState({ selection: { verses: [s.loc.verse], x: window.innerWidth / 2, y: window.innerHeight - 200 } })
  }

  return (
    <nav className="bottombar" aria-label="Reader tools">
      <button className="icon-btn" aria-label="Previous chapter" onClick={() => { setTab('bible'); turnPage(-1) }}>
        <Icon name="left" size={22} />
      </button>
      <button className="icon-btn" aria-label="Books" onClick={onBooks}>
        <Icon name="book" size={22} />
      </button>
      <button className="icon-btn" aria-label="Highlight, note or journal on this verse" onClick={() => { setTab('bible'); highlightVerse() }} style={{ color: labels[0]?.color && tab === 'bible' ? undefined : undefined }}>
        <Icon name="pencil" size={22} />
      </button>
      <button className="icon-btn" aria-label={marked ? 'Remove bookmark' : 'Bookmark this verse'} aria-pressed={!!marked} onClick={toggleBookmark}>
        <Icon name="bookmark" size={22} fill={!!marked} />
      </button>
      <button className="icon-btn" aria-label="Text settings" onClick={() => setAa(true)} style={{ fontFamily: 'var(--serif)', fontSize: ui(20) }}>
        Aa
      </button>
      <button className="icon-btn" aria-label="Next chapter" onClick={() => { setTab('bible'); turnPage(1) }}>
        <Icon name="right" size={22} />
      </button>
      {aa && (
        <Popover x={0} y={0} title="Text & display" onClose={() => setAa(false)}>
          <div className="setting-row">
            Text size
            <div className="seg">
              <button onClick={() => updateSettings({ textSize: Math.max(14, settings.textSize - 1) })}>A−</button>
              <button disabled>{settings.textSize}</button>
              <button onClick={() => updateSettings({ textSize: Math.min(34, settings.textSize + 1) })}>A+</button>
            </div>
          </div>
          <div className="setting-row">
            Theme
            <div className="seg">
              {(['light', 'sepia', 'dark'] as const).map((m) => (
                <button key={m} onClick={() => updateSettings({ mode: m })} style={settings.mode === m ? { background: 'var(--accent)', color: '#fff' } : undefined}>
                  {m === 'light' ? 'Light' : m === 'sepia' ? 'Sepia' : 'Dark'}
                </button>
              ))}
            </div>
          </div>
          <div className="setting-row">
            Font
            <div className="seg">
              <button onClick={() => updateSettings({ font: 'serif' })} style={settings.font === 'serif' ? { background: 'var(--accent)', color: '#fff' } : undefined}>Serif</button>
              <button onClick={() => updateSettings({ font: 'sans' })} style={settings.font === 'sans' ? { background: 'var(--accent)', color: '#fff' } : undefined}>Sans</button>
              <button onClick={() => updateSettings({ font: 'typewriter' })} style={settings.font === 'typewriter' ? { background: 'var(--accent)', color: '#fff' } : undefined}>Typewriter</button>
            </div>
          </div>
          <div className="setting-row">
            Verse layout
            <div className="seg">
              <button onClick={() => updateSettings({ layout: 'verse' })} style={settings.layout === 'verse' ? { background: 'var(--accent)', color: '#fff' } : undefined}>Verses</button>
              <button onClick={() => updateSettings({ layout: 'paragraph' })} style={settings.layout === 'paragraph' ? { background: 'var(--accent)', color: '#fff' } : undefined}>Paragraphs</button>
            </div>
          </div>
          <button className="btn" style={{ marginTop: 12 }} onClick={() => { setAa(false); setTab('settings') }}>
            <Icon name="gear" size={16} /> All settings
          </button>
        </Popover>
      )}
    </nav>
  )
}
