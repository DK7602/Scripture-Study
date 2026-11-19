import { useEffect, useReducer, useState } from 'react'
import { MALE_US, canLocal, canSpeak, closePlayer, setMini, deviceVoices, realMaleVoice, voiceGender, localDownloadMB, narratorsFor, onVoicesChanged, setNarrator, setRate, skip, toggle, useAudio, useDeviceVoice, useLocalMichael, type NarratorVoice } from '../lib/audio'
import { openPopup, setTab, updateSettings, useStore } from '../lib/store'
import { Icon } from './Icon'

const RATES = [0.75, 0.85, 1, 1.15, 1.3, 1.5]

const ANDROID_VOICE =
  'Android phones choose the reading voice in their own settings. 1) Open Settings and search for “Text-to-speech output”. ' +
  '2) Set the preferred engine to “Speech Services by Google”. 3) Tap the gear beside it, then Install voice data, then English (United States). ' +
  '4) Tap the voices to hear them and choose a man’s voice (for example Voice IV). Then come back and press play.'

/** The audio Bible player, under the page while it is open. */
export function AudioBar() {
  const a = useAudio()
  const settings = useStore((s) => s.settings)
  const loc = useStore((s) => s.loc)
  const [narrators, setNarrators] = useState<NarratorVoice[]>([])
  const [, refresh] = useReducer((x: number) => x + 1, 0)
  const [mb, setMb] = useState(90)
  useEffect(() => onVoicesChanged(refresh), [])
  useEffect(() => {
    void localDownloadMB().then(setMb)
  }, [])
  useEffect(() => {
    let live = true
    narratorsFor(settings.version, loc.book, loc.chapter).then((n) => live && setNarrators(n))
    return () => {
      live = false
    }
  }, [settings.version, loc.book, loc.chapter])
  if (!a.open || a.mini) return null

  const dv = deviceVoices()
  const narrator = narrators[0]
  const localOk = canLocal && settings.audioLocal
  const deviceValue = `d:${settings.audioVoice || MALE_US}`
  const male = realMaleVoice()
  const value = narrator ? (settings.audioNarrator === 'device' ? deviceValue : `n:${narrator.id}`) : localOk ? 'l:' : deviceValue
  const useDevice = value.startsWith('d:')
  const pick = (v: string) => {
    if (v.startsWith('n:')) setNarrator('')
    else if (v === 'l:') useLocalMichael()
    else if (narrator) {
      // a recorded chapter: the listener prefers a device voice even where there are recordings
      updateSettings({ audioVoice: v.slice(2) })
      setNarrator('device')
    } else useDeviceVoice(v.slice(2))
  }
  const short = (v: SpeechSynthesisVoice) => {
    const name = v.name.replace(/^(Microsoft|Google)\s+/i, '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/ - English.*$/i, '').trim()
    const g = voiceGender(v)
    // Android lists only "English United States": the phone's own voice, set in its settings
    if (/^English United States$/i.test(name)) return 'American female (phone voice)'
    return `${name}${g ? ` (American ${g})` : ' (American)'}`
  }

  return (
    <div className="audio-bar" role="region" aria-label="Audio Bible">
      <div className="ab-info">
        <Icon name="headphones" size={18} />
        <div className="ab-text">
          <b>{a.label}</b>
          <span className="faint">
            {a.loading ? ' — loading…' : a.verse ? ` — verse ${a.verse} of ${a.count}` : a.count ? ` — ${a.count} verses` : ''}
          </span>
          {a.info && <div className="ab-credit">{a.info}</div>}
          {a.error && <div className="ab-err">{a.error}</div>}
          {!a.error && !a.info && value.startsWith('n:') && narrator?.credit && <div className="ab-credit">{narrator.credit}</div>}
          {!a.error && !a.info && value === 'l:' && <div className="ab-credit">Michael's voice made on this device{a.localDevice === 'webgpu' ? ' (graphics chip)' : a.localDevice === 'wasm' ? ' (processor)' : ''} · Kokoro, Apache-2.0 · nothing is stored</div>}
          {useDevice && a.engine === 'device' && /Android/i.test(navigator.userAgent) && (
            <button
              className="ref-link ab-offer"
              onClick={(e) => {
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                openPopup({ kind: 'info', title: "A man's voice on Android", text: ANDROID_VOICE, x: r.left, y: r.top - 240 })
              }}
            >
              For a more natural man's voice
            </button>
          )}
          {a.slow && a.engine === 'local' && (
            <button className="ref-link ab-offer" onClick={() => useDeviceVoice()}>
              This device makes Michael's voice slower than he reads, so there are pauses. Use the phone's own voice instead
            </button>
          )}
          {a.offerLocal && !a.info && (
            <button className="ref-link ab-offer" onClick={useLocalMichael}>
              Use Michael's voice for {settings.version} (one-time download, about {mb} MB)
            </button>
          )}
          {!a.error && useDevice && !canSpeak && <div className="ab-err">This browser has no voice to read aloud.</div>}
        </div>
        <button className="icon-btn" onClick={() => setMini(true)} aria-label="Minimize the player (it keeps playing)" title="Minimize (keeps playing)">
          <Icon name="down" size={18} />
        </button>
        <button className="icon-btn" onClick={closePlayer} aria-label="Stop and close the player" title="Stop">
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
          {!narrators.length && canLocal && (
            <optgroup label="Made on this device">
              <option value="l:">Michael (made on this device)</option>
            </optgroup>
          )}
          <optgroup label="This device's voices">
            <option value={`d:${MALE_US}`}>{male ? `American male (${short(male).replace(/ \(American male\)$/, '')})` : 'American male (phone voice, deeper)'}</option>
            {dv
              .filter((v) => v !== male)
              .map((v) => (
                <option key={v.voiceURI} value={`d:${v.voiceURI}`}>
                  {short(v)}
                </option>
              ))}
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

/** The minimized player: a small floating bar that keeps playing, on every tab. */
export function MiniPlayer({ wide }: { wide: boolean }) {
  const a = useAudio()
  const tab = useStore((st) => st.tab)
  const away = !wide && tab !== 'bible' // on a phone the full player lives on the Bible page
  if (!a.open || (!a.mini && !away)) return null
  const expand = () => {
    setMini(false)
    if (away) setTab('bible')
  }
  const [title] = a.label.split(' · ')
  return (
    <div className="mini-player" role="region" aria-label="Audio Bible">
      <button className="ab-play mini" onClick={toggle} aria-label={a.playing ? 'Pause' : 'Play'}>
        <Icon name={a.playing ? 'pause' : 'play'} size={18} fill={!a.playing} stroke={a.playing ? 2.6 : 1.8} />
      </button>
      <button className="mini-label" onClick={expand} title="Show the player">
        <Icon name="headphones" size={15} />{' '}
        <span className="mini-title">
          {title}
          {a.verse ? `:${a.verse}` : ''}
          {a.loading ? ' …' : ''}
        </span>
      </button>
      <button className="icon-btn" onClick={expand} aria-label="Show the player">
        <Icon name="up" size={18} />
      </button>
      <button className="icon-btn" onClick={closePlayer} aria-label="Stop and close the player">
        <Icon name="close" size={16} />
      </button>
    </div>
  )
}
