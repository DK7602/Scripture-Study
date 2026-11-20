import { useEffect, useRef, useState } from 'react'
import { helpData, type HelpData } from '../lib/helps'
import { getState, setState, useStore } from '../lib/store'
import { HelpDetail } from '../views/MapsHelps'
import { Icon } from './Icon'

/**
 * On a phone, a map or help chosen from a verse's "?" chip opens full screen over the Bible: the ✕ (or the phone's
 * back gesture) closes it and the reading is where it was. "All maps & helps" goes on to the Maps / Helps tab.
 */
export function HelpOverlay() {
  const id = useStore((s) => s.helpOverlay)
  const [data, setData] = useState<HelpData | null>(null)
  const body = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (id && !data) void helpData().then(setData)
  }, [id, data])
  useEffect(() => {
    body.current?.scrollTo({ top: 0 })
  }, [id])

  // the phone's back gesture closes it: one history entry while it is open
  useEffect(() => {
    if (!id) return
    history.pushState({ ...(history.state ?? {}), helpOverlay: true }, '')
    const onPop = () => setState({ helpOverlay: null })
    window.addEventListener('popstate', onPop)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !getState().popup && close()
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('keydown', esc)
      if (history.state?.helpOverlay) history.back() // closed another way (✕, a verse link): take the entry back off
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!id])

  if (!id) return null
  const all = () => setState({ helpOverlay: null, tab: 'maps', panel: true, helpItem: id })

  return (
    <div className="help-overlay" role="dialog" aria-modal="true" aria-label="Map or help">
      <div className="help-overlay-bar">
        <button className="btn small" onClick={all}>
          <Icon name="map" size={15} /> All maps & helps
        </button>
        <span className="spacer" />
        <button className="help-overlay-close" onClick={close} aria-label="Close and go back to the Bible" title="Close">
          <Icon name="close" size={22} />
        </button>
      </div>
      <div className="help-overlay-body" ref={body}>
        <HelpDetail id={id} data={data} onBack={close} bare />
      </div>
    </div>
  )
}

function close() {
  setState({ helpOverlay: null })
}
