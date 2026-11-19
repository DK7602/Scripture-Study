import { setState, useStore } from '../lib/store'
import type { Tab } from '../lib/types'
import { Icon, Logo } from './Icon'

const TABS: { id: Tab; label: string; icon?: string }[] = [
  { id: 'bible', label: 'Bible' },
  { id: 'study', label: 'Study' },
  { id: 'maps', label: 'Maps / Helps' },
  { id: 'notes', label: 'Notes' },
  { id: 'journal', label: 'Journal' },
  { id: 'search', label: 'Search Bible', icon: 'search' },
  { id: 'resources', label: 'Resources', icon: 'pray' },
]

export function TopBar({ onMenu, wide }: { onMenu: () => void; wide: boolean }) {
  const tab = useStore((s) => s.tab)
  const pick = (t: Tab) => setState({ tab: t, panel: true, popup: null, popupStack: [] })
  return (
    <header className="topbar">
      {!wide && (
        <button className="icon-btn" aria-label="Books of the Bible" onClick={onMenu}>
          <Icon name="menu" />
        </button>
      )}
      <button className="brand" onClick={() => pick('bible')} aria-label="Scripture Study — go to Bible">
        <Logo size={wide ? 30 : 26} />
        Scripture Study
      </button>
      {!wide && (
        <button className="icon-btn" aria-label="Settings" aria-pressed={tab === 'settings'} onClick={() => pick('settings')}>
          <Icon name="gear" />
        </button>
      )}
      <nav className="tabs" role="tablist" aria-label="Sections">
        {TABS.map((t) => (
          <button key={t.id} role="tab" className="tab" aria-selected={tab === t.id} onClick={() => pick(t.id)}>
            {t.icon && wide && <Icon name={t.icon} size={18} />}
            {t.label}
          </button>
        ))}
      </nav>
      {wide && (
        <div className="top-actions">
          <button className={`tab`} aria-selected={tab === 'settings'} onClick={() => pick('settings')}>
            <Icon name="gear" size={18} /> Settings
          </button>
        </div>
      )}
    </header>
  )
}
