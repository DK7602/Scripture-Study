import { useEffect, useReducer, useState } from 'react'
import { canSpeak, closePlayer, deviceVoices, narratorsFor, onVoicesChanged, setNarrator, setRate, skip, toggle, useAudio, type NarratorVoice } from '../lib/audio'
import { updateSettings, useStore } from '../lib/store'
import { Icon } from './Icon'

const RATES = [0.75, 0.85, 1, 1.15, 1.3, 1.5]

/** The audio Bible player, under the page while it is open. */
export function AudioBar() {
  const a = useAudio()
  const settings = useStore((s) => s.settings)
  const loc = useStore((s) => s.loc)
  const [narrators, setNarrators] = useState<NarratorVoice[]>([])
  const [, refresh] = useReducer((x: number) => x + 1, 0)
  useEffect(() => onVoicesChanged(refresh), [])
  useEffect(() => {
    let live = true
    narratorsFor(settings.version, loc.book, loc.chapter).then((n) => live && setNarrators(n))
    return () => {
      live = false
    }
  }, [settings.version, loc.book, loc.chapter])
  if (!a.open) return null

  const dv = deviceVoices()
  const useDevice = settings.audioNarrator === 'device' || !narrators.length
  const narrator = narrators.find((n) => n.id === settings.audioNarrator) ?? narrators[0]
  const value = useDevice ? `d:${settings.audioVoice || dv[0]?.voiceURI || ''}` : `n:${narrator?.id}`
  const pick = (v: string) => {
    if (v.startsWith('n:')) setNarrator(v.slice(2))
    else {
      updateSettings({ audioVoice: v.slice(2) })
      setNarrator('device')
    }
  }
  const short = (v: SpeechSynthesisVoice) => v.name.replace(/^(Microsoft|Google)\s+/i, '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/ - English.*$/i, '').trim()

  return (
    <div className="audio-bar" role="region" aria-label="Audio Bible">
      <div className="ab-info">
        <Icon name="headphones" size={18} />
        <div className="ab-text">
          <b>{a.label}</b>
          <span className="faint">
            {a.loading ? ' — loading…' : a.verse ? ` — verse ${a.verse} of ${a.count}` : a.count ? ` — ${a.count} verses` : ''}
          </span>
          {a.error && <div className="ab-err">{a.error}</div>}
          {!a.error && !useDevice && narrator?.credit && <div className="ab-credit">{narrator.credit}</div>}
          {!a.error && useDevice && !canSpeak && <div className="ab-err">This browser has no voice to read aloud.</div>}
        </div>
        <button className="icon-btn" onClick={closePlayer} aria-label="Close the player">
          <Icon name="close" size={18} />
        </button>
      </div>
      <div className="ab-controls">
        <button className="icon-btn" onClick={() => skip(-1)} aria-label="Previous verse" title="Previous verse">
          <Icon name="prevVerse" size={20} />
        </button>
        <button className="ab-play" onClick={toggle} aria-label={a.playing ? 'Pause' : 'Play'} title={a.playing ? 'Pause' : 'Read aloud'}>
          <Icon name={a.playing ? 'pause' : 'play'} size={22} fill={!a.playing} stroke={a.playing ? 2.6 : 1.8} />
        </button>
        <button className="icon-btn" onClick={() => skip(1)} aria-label="Next verse" title="Next verse">
          <Icon name="nextVerse" size={20} />
        </button>
        <select className="select ab-rate" value={settings.audioRate || 1} onChange={(e) => setRate(+e.target.value)} aria-label="Reading speed">
          {RATES.map((r) => (
            <option key={r} value={r}>
              {r}×
            </option>
          ))}
        </select>
        <select className="select ab-voice" value={value} onChange={(e) => pick(e.target.value)} aria-label="Voice">
          {narrators.length > 0 && (
            <optgroup label="Recorded narration">
              {narrators.map((n) => (
                <option key={n.id} value={`n:${n.id}`}>
                  {n.name}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="This device's voices">
            {dv.length ? (
              dv.map((v) => (
                <option key={v.voiceURI} value={`d:${v.voiceURI}`}>
                  {short(v)}
                </option>
              ))
            ) : (
              <option value="d:">Default voice</option>
            )}
          </optgroup>
        </select>
        <button className="toggle ab-cont" onClick={() => updateSettings({ audioContinue: !settings.audioContinue })} title="Keep reading into the next chapter">
          <span>Next chapter</span>
          <span className="switch" data-on={settings.audioContinue} />
        </button>
      </div>
    </div>
  )
}
