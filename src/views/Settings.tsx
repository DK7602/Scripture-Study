import { useEffect, useRef, useState } from 'react'
import { commentaryIndex, getJSON, prefetchAll, versions } from '../lib/data'
import { listApiBibles, type ApiBibleVersion } from '../lib/providers'
import { deleteItem, exportData, importData, newId, saveItem, updateSettings, useStore } from '../lib/store'
import type { CommentaryInfo, Settings, ThemeColor, ThemeMode } from '../lib/types'
import { Icon } from '../components/Icon'
import { CHIPS } from './Study'
import { SyncPanel } from './SyncPanel'

const COLORS: { id: ThemeColor; label: string; swatch: string }[] = [
  { id: 'green', label: 'Green', swatch: '#2f5d3a' },
  { id: 'blue', label: 'Blue', swatch: '#2c4f7c' },
  { id: 'burgundy', label: 'Burgundy', swatch: '#7c2a34' },
  { id: 'purple', label: 'Purple', swatch: '#5a3c7c' },
  { id: 'brown', label: 'Brown', swatch: '#6d4a2c' },
  { id: 'slate', label: 'Slate', swatch: '#47525e' },
]

const MODES: { id: ThemeMode; label: string; sub: string; bg: string; ink: string; red: string }[] = [
  { id: 'light', label: 'Light', sub: '(Classic)', bg: '#fbf6ea', ink: '#2b241d', red: '#a8201a' },
  { id: 'dark', label: 'Dark', sub: '(Study)', bg: '#1c1e1d', ink: '#e8e1d2', red: '#f07a6a' },
  { id: 'sepia', label: 'Sepia', sub: '(Parchment)', bg: '#efdfba', ink: '#3a2c1c', red: '#9a1d16' },
]

function Toggle({ on, onChange, label, desc }: { on: boolean; onChange: (v: boolean) => void; label: string; desc?: string }) {
  return (
    <div className="setting-row">
      <div>
        {label}
        {desc && <div className="desc">{desc}</div>}
      </div>
      <button className="toggle" onClick={() => onChange(!on)} aria-pressed={on} aria-label={label}>
        <span className="switch" data-on={on} />
      </button>
    </div>
  )
}

export function SettingsView() {
  const s = useStore((st) => st.settings)
  const labels = useStore((st) => st.labels)
  const highlights = useStore((st) => st.highlights)
  const [comms, setComms] = useState<CommentaryInfo[]>([])
  useEffect(() => {
    commentaryIndex().then(setComms)
  }, [])
  const set = (p: Partial<Settings>) => updateSettings(p)

  return (
    <div>
      <div className="section-title">
        <Icon name="gear" /> Settings
      </div>
      <SyncPanel />

      <div className="setting-row">
        <div>
          Bible Version
          <div className="desc">{versions().find((v) => v.id === s.version)?.name}</div>
        </div>
        <select className="select" value={s.version} onChange={(e) => set({ version: e.target.value })} aria-label="Bible version">
          {versions().map((v) => (
            <option key={v.id} value={v.id}>
              {v.id} — {v.name}
              {v.licensed ? ' (API key)' : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="setting-row">
        <div>
          Primary Commentary
          <div className="desc">Shown first in the Study tab</div>
        </div>
        <select className="select" value={s.primaryCommentary} onChange={(e) => set({ primaryCommentary: e.target.value })} aria-label="Primary commentary">
          {comms.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <Toggle on={s.namesOfGod} onChange={(v) => set({ namesOfGod: v })} label="Names of GOD" desc="Show Jehovah, Elohim, El Shaddai, Adonai… instead of LORD / God (KJV, from Strong’s numbers)" />
      <Toggle on={s.capsNames} onChange={(v) => set({ capsNames: v })} label="GOD, JESUS CHRIST & HOLY SPIRIT in capitals" desc="Throughout the Bible, commentaries, helps, search, notes and journal" />
      <Toggle on={s.redLetters} onChange={(v) => set({ redLetters: v })} label="Words of CHRIST in red" />
      <Toggle on={s.strongsUnderline} onChange={(v) => set({ strongsUnderline: v })} label="Underline Strong’s words" desc="A faint dotted line under words you can tap for the concordance" />
      <Toggle on={s.marginChips} onChange={(v) => set({ marginChips: v })} label="Margin chips" desc="? helps · N notes · J journal next to verses" />
      <Toggle on={s.placeChips} onChange={(v) => set({ placeChips: v })} label="Mark verses that name a place" desc="Adds the place to the ? chip with a then & now map" />
      <div className="setting-row">
        Verse layout
        <div className="seg">
          <button onClick={() => set({ layout: 'verse' })} style={s.layout === 'verse' ? { background: 'var(--accent)', color: '#fff' } : undefined}>Verse by verse</button>
          <button onClick={() => set({ layout: 'paragraph' })} style={s.layout === 'paragraph' ? { background: 'var(--accent)', color: '#fff' } : undefined}>Paragraphs</button>
        </div>
      </div>

      <div className="section-title" style={{ marginTop: 20 }}>
        Display Theme
      </div>
      <div className="themes">
        {MODES.map((m) => (
          <button key={m.id} className="theme-card" aria-pressed={s.mode === m.id} onClick={() => set({ mode: m.id })} style={{ background: m.bg, color: m.ink }}>
            <div className="aa">Aa</div>
            <div className="lines" style={{ color: m.red }}>
              I am the true vine
            </div>
            <div>{m.label}</div>
            <div className="small" style={{ opacity: 0.75 }}>{m.sub}</div>
          </button>
        ))}
      </div>
      <div className="label" style={{ fontFamily: 'var(--serif)', fontWeight: 600, fontSize: 17 }}>Color Theme</div>
      <div className="colors">
        {COLORS.map((c) => (
          <button key={c.id} className="color-btn" aria-pressed={s.color === c.id} onClick={() => set({ color: c.id })}>
            <i style={{ background: c.swatch }} />
            {c.label}
          </button>
        ))}
      </div>
      <div className="setting-row">
        <div>Text Size</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: 'var(--serif)' }}>Aa</span>
          <input type="range" min={14} max={34} value={s.textSize} onChange={(e) => set({ textSize: +e.target.value })} aria-label="Text size" />
          <span className="faint small">{s.textSize}px</span>
        </div>
      </div>
      <div className="setting-row">
        Font Style
        <select className="select" value={s.font} onChange={(e) => set({ font: e.target.value as 'serif' | 'sans' })} aria-label="Font style">
          <option value="serif">Serif (Printed)</option>
          <option value="sans">Sans-serif (Modern)</option>
        </select>
      </div>

      <LabelsEditor labels={labels} counts={(id) => highlights.filter((h) => h.label === id).length} />
      <LicensedKeys />
      <Offline />
      <Backup />
      <About />
    </div>
  )
}

function LabelsEditor({ labels, counts }: { labels: { id: string; name: string; color: string }[]; counts: (id: string) => number }) {
  return (
    <>
      <div className="section-title" style={{ marginTop: 22 }}>
        <Icon name="marker" /> Highlight Labels
      </div>
      <p className="faint small" style={{ marginTop: 0 }}>Name your highlight colors. The name appears as a vertical title in the margin beside highlighted verses.</p>
      {labels.map((l) => (
        <div className="label-row" key={l.id}>
          <input type="color" value={l.color} onChange={(e) => saveItem('labels', { ...l, color: e.target.value })} aria-label={`Color for ${l.name}`} />
          <input className="input" value={l.name} onChange={(e) => saveItem('labels', { ...l, name: e.target.value })} aria-label="Label name" />
          <span className="faint small" style={{ whiteSpace: 'nowrap' }}>{counts(l.id)}</span>
          <button
            className="icon-btn"
            aria-label={`Delete ${l.name}`}
            onClick={() => {
              if (labels.length <= 1) return
              if (counts(l.id) && !window.confirm(`Delete “${l.name}”? Its ${counts(l.id)} highlight(s) will lose their color.`)) return
              deleteItem('labels', l.id)
            }}
          >
            <Icon name="trash" size={18} />
          </button>
        </div>
      ))}
      <button className="btn small" style={{ marginTop: 8 }} onClick={() => saveItem('labels', { id: newId(), name: 'New label', color: '#cde7f0' })}>
        <Icon name="plus" size={15} /> Add label
      </button>
    </>
  )
}

function LicensedKeys() {
  const s = useStore((st) => st.settings)
  const [list, setList] = useState<ApiBibleVersion[] | null>(null)
  const [err, setErr] = useState('')
  const find = async () => {
    setErr('')
    try {
      setList(await listApiBibles(s.apiBibleKey))
    } catch (e) {
      setErr((e as Error).message)
    }
  }
  const licensed = versions().filter((v) => v.licensed === 'apibible')
  return (
    <>
      <div className="section-title" style={{ marginTop: 22 }}>
        <Icon name="book" /> NKJV, ESV, NASB, CSB & NIV
      </div>
      <p className="small subtle" style={{ marginTop: 0 }}>
        These translations are copyrighted, so they are read live from their publishers’ services with your own free key and never stored on
        the device. The KJV, BSB, WEB and ASV are built in and work offline.
      </p>
      <div className="field">
        <label htmlFor="esv">
          ESV API key <a className="hint" href="https://api.esv.org/account/create-application/" target="_blank" rel="noreferrer">get a key</a>
        </label>
        <input id="esv" className="input" type="password" autoComplete="off" value={s.esvKey} onChange={(e) => updateSettings({ esvKey: e.target.value.trim() })} placeholder="Token from api.esv.org" />
      </div>
      <div className="field">
        <label htmlFor="apib">
          API.Bible key <a className="hint" href="https://scripture.api.bible/signup" target="_blank" rel="noreferrer">get a key</a>
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input id="apib" className="input" type="password" autoComplete="off" value={s.apiBibleKey} onChange={(e) => updateSettings({ apiBibleKey: e.target.value.trim() })} placeholder="Key from scripture.api.bible" />
          <button className="btn" onClick={find} disabled={!s.apiBibleKey}>
            Find versions
          </button>
        </div>
        {err && <span className="small" style={{ color: '#a3271c' }}>{err}</span>}
      </div>
      {licensed.map((v) => (
        <div className="setting-row" key={v.id}>
          <div>
            {v.id}
            <div className="desc">{v.name}</div>
          </div>
          {list ? (
            <select
              className="select"
              style={{ maxWidth: 220 }}
              value={s.apiBibleIds[v.id] ?? ''}
              onChange={(e) => updateSettings({ apiBibleIds: { ...s.apiBibleIds, [v.id]: e.target.value } })}
              aria-label={`API.Bible version for ${v.id}`}
            >
              <option value="">Not available</option>
              {list.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.abbreviation} — {b.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="faint small">{s.apiBibleIds[v.id] ? 'Connected' : 'Add a key, then Find versions'}</span>
          )}
        </div>
      ))}
    </>
  )
}

function Offline() {
  const [manifest, setManifest] = useState<Record<string, { files: string[]; bytes: number }> | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [pct, setPct] = useState(0)
  const [done, setDone] = useState<string[]>([])
  useEffect(() => {
    getJSON<Record<string, { files: string[]; bytes: number }>>('manifest.json').then(setManifest).catch(() => setManifest(null))
  }, [])
  if (!manifest) return null
  const label = (g: string) => {
    if (g === 'core') return 'Study helps, maps, topics & cross references'
    if (g === 'strongs') return 'Strong’s concordance'
    if (g.startsWith('bible:')) return `${g.slice(6)} Bible`
    const id = g.slice(5)
    return CHIPS.find((c) => c.id === id)?.label + ' commentary'
  }
  const get = async (g: string) => {
    setBusy(g)
    setPct(0)
    await prefetchAll(manifest[g].files, (d, t) => setPct(d / t))
    setBusy(null)
    setDone([...done, g])
  }
  return (
    <>
      <div className="section-title" style={{ marginTop: 22 }}>
        <Icon name="download" /> Use offline
      </div>
      <p className="small subtle" style={{ marginTop: 0 }}>
        Anything you open is saved for offline reading automatically. To take everything with you (for example on a tablet), download it here.
      </p>
      {Object.entries(manifest).map(([g, info]) => (
        <div className="setting-row" key={g}>
          <div>
            {label(g)}
            <div className="desc">{(info.bytes / 1e6).toFixed(1)} MB</div>
          </div>
          {busy === g ? (
            <span className="small">{Math.round(pct * 100)}%</span>
          ) : done.includes(g) ? (
            <span className="small" style={{ color: 'var(--accent)' }}>
              <Icon name="check" size={16} /> Saved
            </span>
          ) : (
            <button className="btn small" disabled={!!busy} onClick={() => get(g)}>
              Download
            </button>
          )}
        </div>
      ))}
    </>
  )
}

function Backup() {
  const file = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState('')
  const exp = async () => {
    const json = await exportData()
    const blob = new Blob([json], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `scripture-study-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }
  const imp = async (f: File) => {
    try {
      const n = await importData(await f.text())
      setMsg(`Imported ${n} items.`)
    } catch (e) {
      setMsg((e as Error).message)
    }
  }
  return (
    <>
      <div className="section-title" style={{ marginTop: 22 }}>
        <Icon name="upload" /> Backup & move to another device
      </div>
      <p className="small subtle" style={{ marginTop: 0 }}>
        Your notes, journal, highlights and bookmarks are stored on this device (and in your account when you sign in to sync). You can also export a
        backup file and import it on another device.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn" onClick={exp}>
          <Icon name="download" size={16} /> Export backup
        </button>
        <button className="btn" onClick={() => file.current?.click()}>
          <Icon name="upload" size={16} /> Import backup
        </button>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && imp(e.target.files[0])} />
      </div>
      {msg && <p className="small">{msg}</p>}
    </>
  )
}

function About() {
  return (
    <>
      <div className="section-title" style={{ marginTop: 22 }}>
        About Scripture Study
      </div>
      <div className="small subtle" style={{ lineHeight: 1.6 }}>
        <p>
          <b>Bibles:</b> King James Version (1769) with Strong’s numbers and words of Christ, Berean Standard Bible, World English Bible and American
          Standard Version (1901) — public domain, from eBible.org.
        </p>
        <p>
          <b>Commentaries:</b> Matthew Henry’s Complete Commentary, Calvin’s Commentaries, Jamieson-Fausset-Brown and the 1599 Geneva Bible notes (CrossWire
          Bible Society); Barnes’ Notes on the Bible and Matthew Poole’s English Annotations (MySword modules) — all public domain.
        </p>
        <p>
          <b>Concordance & topics:</b> Strong’s Hebrew and Greek dictionaries (Open Scriptures, CC BY-SA), Nave’s Topical Bible, Torrey’s New Topical
          Textbook and Easton’s Bible Dictionary (public domain). Cross references and Bible places: OpenBible.info (CC BY). Map data: Natural Earth.
        </p>
        <p>Install it: in Chrome or Edge choose “Install app”; on iPhone or iPad tap Share → “Add to Home Screen”; on Android tap “Install app”.</p>
      </div>
    </>
  )
}
