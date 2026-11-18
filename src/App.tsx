import { useEffect, useState } from 'react'
import { loadBooks, loadVersions } from './lib/data'
import { initUserData, setState, setTab, useStore } from './lib/store'
import type { Tab } from './lib/types'
import { TopBar } from './components/TopBar'
import { BookSidebar } from './components/BookSidebar'
import { ReaderColumn } from './views/Reader'
import { StudyPanel } from './views/Study'
import { MapsHelps } from './views/MapsHelps'
import { NotesView } from './views/Notes'
import { JournalView } from './views/Journal'
import { SearchView } from './views/Search'
import { SettingsView } from './views/Settings'
import { Popups } from './components/Popups'
import { SelectionBar } from './components/SelectionBar'
import { Editors } from './components/Editors'
import { BottomBar } from './components/BottomBar'
import { Icon } from './components/Icon'
import { locString } from './lib/refs'

export function useWidth() {
  const [w, setW] = useState(() => window.innerWidth)
  useEffect(() => {
    const on = () => setW(window.innerWidth)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return w
}

const TITLES: Record<Tab, string> = {
  bible: 'Study',
  study: 'Study',
  maps: 'Maps / Helps',
  notes: 'Notes',
  journal: 'Journal',
  search: 'Search Bible',
  settings: 'Settings',
}

function ToolView({ tab }: { tab: Tab }) {
  switch (tab) {
    case 'maps':
      return <MapsHelps />
    case 'notes':
      return <NotesView />
    case 'journal':
      return <JournalView />
    case 'search':
      return <SearchView />
    case 'settings':
      return <SettingsView />
    default:
      return <StudyPanel />
  }
}

export function App() {
  const ready = useStore((s) => s.ready)
  const settings = useStore((s) => s.settings)
  const tab = useStore((s) => s.tab)
  const panel = useStore((s) => s.panel)
  const sidebar = useStore((s) => s.sidebar)
  const loc = useStore((s) => s.loc)
  const [drawer, setDrawer] = useState(false)
  const [error, setError] = useState('')
  const width = useWidth()
  const wide = width >= 900
  const showSidebar = width >= 1200 && sidebar

  useEffect(() => {
    Promise.all([loadBooks(), loadVersions(), initUserData()])
      .then(() => setState({ ready: true }))
      .catch((e) => setError(String(e)))
  }, [])

  useEffect(() => {
    const r = document.documentElement
    r.dataset.mode = settings.mode
    r.dataset.color = settings.color
    r.dataset.font = settings.font
    r.style.setProperty('--text-size', `${settings.textSize}px`)
    const meta = document.querySelector('meta[name="theme-color"]')
    meta?.setAttribute('content', getComputedStyle(r).getPropertyValue('--chrome').trim() || '#1f3d2b')
  }, [settings.mode, settings.color, settings.font, settings.textSize])

  if (error) return <div className="loading">Could not load Scripture Study data: {error}</div>
  if (!ready)
    return (
      <div className="loading" style={{ background: 'var(--page)' }}>
        <div>
          <div className="spinner" />
          Opening Scripture Study…
        </div>
      </div>
    )

  const toolTab: Tab = tab === 'bible' ? 'study' : tab
  const wideTool = tab === 'journal' || tab === 'notes' || tab === 'maps' || tab === 'search' || tab === 'settings'
  const openDrawer = () => setDrawer(true)

  return (
    <div className="app">
      <TopBar onMenu={openDrawer} wide={wide} />
      {wide ? (
        <main className={`workspace${showSidebar ? '' : ' no-sidebar'}${panel ? '' : ' no-panel'}${wideTool ? ' wide-panel' : ''}`}>
          <aside className="sidebar" aria-label="Books of the Bible">
            <BookSidebar />
          </aside>
          <ReaderColumn onBooks={width >= 1200 ? () => setState({ sidebar: !sidebar }) : openDrawer} />
          <section className="panel" aria-label={TITLES[toolTab]}>
            <div className="panel-head">
              <Icon name={toolTab === 'study' ? 'study' : toolTab === 'maps' ? 'map' : toolTab === 'notes' ? 'note' : toolTab === 'journal' ? 'journal' : toolTab === 'search' ? 'search' : 'gear'} />
              <strong>{TITLES[toolTab]}</strong>
              {toolTab !== 'search' && toolTab !== 'settings' && (
                <>
                  <span className="sep">|</span>
                  <span>{locString(loc.book, loc.chapter)}</span>
                </>
              )}
              <span className="spacer" />
              <button className="icon-btn" title="Hide panel" onClick={() => setState({ panel: false })}>
                <Icon name="collapse" />
              </button>
            </div>
            <div className="panel-body">
              <ToolView tab={toolTab} />
            </div>
          </section>
        </main>
      ) : (
        <main className="single">
          {tab === 'bible' ? (
            <ReaderColumn onBooks={openDrawer} />
          ) : (
            <div className="view">
              <div className="panel-body">
                <ToolView tab={tab} />
              </div>
            </div>
          )}
        </main>
      )}
      {!wide && <BottomBar onBooks={openDrawer} />}
      {drawer && (
        <>
          <div className="drawer-backdrop" onClick={() => setDrawer(false)} />
          <nav className="drawer" aria-label="Books of the Bible">
            <BookSidebar
              onPicked={() => {
                setDrawer(false)
                if (!wide) setTab('bible')
              }}
            />
          </nav>
        </>
      )}
      <SelectionBar />
      <Popups />
      <Editors />
    </div>
  )
}
