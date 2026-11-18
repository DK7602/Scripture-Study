import { useEffect, useState, useSyncExternalStore } from 'react'
import { newInvite, onSync, pendingInvite, refreshLicensed, saveEsvKey, saveLicensedIds, saveLicensedKey, signIn, signOut, syncInfo, syncNow, type LicensedInfo } from '../lib/sync'
import { onShared, sharedVersions } from '../lib/shared'
import { Icon } from '../components/Icon'

/** Settings section: sign in with email to sync notes, journal and highlights across devices. */
export function SyncPanel() {
  const info = useSyncExternalStore(onSync, syncInfo)
  const [copied, setCopied] = useState(false)
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])
  const invited = !!pendingInvite()
  if (info.status === 'unavailable') return null

  const copy = async () => {
    if (!info.invite) return
    try {
      await navigator.clipboard.writeText(info.invite)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      window.prompt('Copy this invitation link:', info.invite)
    }
  }
  const ago = info.last ? Math.max(0, Math.round((Date.now() - info.last) / 60000)) : null

  return (
    <div className="notice" style={{ marginBottom: 16 }}>
      <h4 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="globe" size={18} /> Sync across devices
      </h4>
      {info.status === 'checking' && <p className="subtle" style={{ margin: 0 }}>Checking sign-in…</p>}
      {info.status === 'error' && <p className="subtle" style={{ margin: 0 }}>{info.message}</p>}
      {info.status === 'signed-out' && (
        <>
          <p style={{ marginTop: 0 }}>
            {invited
              ? 'You’ve been invited. Sign in with your email — you’ll get a one-time code — and your notes, journal and highlights will follow you to every device.'
              : 'Sign in with your email to keep your notes, journal, highlights and bookmarks the same on your PC, tablet and phone. (Members join with an invitation link.)'}
          </p>
          <button className="btn primary" onClick={signIn}>
            <Icon name="check" size={16} /> Sign in with email
          </button>
        </>
      )}
      {info.status === 'not-invited' && (
        <>
          <p style={{ marginTop: 0 }}>
            Signed in as <b>{info.email}</b>, but this email hasn’t joined yet. Open the invitation link you were sent, then sign in again.
          </p>
          <button className="btn" onClick={signOut}>Sign out</button>
        </>
      )}
      {info.status === 'signed-in' && (
        <>
          <p style={{ marginTop: 0 }}>
            Signed in as <b>{info.email}</b>
            {info.role === 'owner' && <span className="vtag">OWNER</span>}
            <br />
            <span className="faint small">
              {info.busy ? 'Syncing…' : ago === null ? 'Not synced yet' : ago === 0 ? 'Synced just now' : `Synced ${ago} min ago`}
            </span>
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn small" onClick={() => void syncNow()} disabled={info.busy}>
              <Icon name="sort" size={15} /> Sync now
            </button>
            <button className="btn small" onClick={signOut}>Sign out</button>
          </div>
          {info.role === 'owner' ? <SharedTranslations /> : <MemberTranslations />}
          {info.role === 'owner' && info.invite && (
            <div style={{ marginTop: 12 }}>
              <div className="small" style={{ fontWeight: 600 }}>Invite someone</div>
              <div className="small subtle" style={{ marginBottom: 6 }}>Only people who open this link can join. Share it privately.</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <input className="input" readOnly value={info.invite} style={{ flex: '1 1 220px', fontSize: 13, fontFamily: 'var(--sans)' }} onFocus={(e) => e.target.select()} />
                <button className="btn small" onClick={copy}>
                  <Icon name={copied ? 'check' : 'copy'} size={15} /> {copied ? 'Copied' : 'Copy'}
                </button>
                <button
                  className="btn small"
                  onClick={() => window.confirm('Make a new invitation link? The old link will stop working (people who already joined stay in).') && void newInvite()}
                >
                  New link
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {info.message && info.status !== 'error' && <p className="small" style={{ color: '#a3271c', marginBottom: 0 }}>{info.message}</p>}
    </div>
  )
}

function MemberTranslations() {
  const shared = useSyncExternalStore(onShared, sharedVersions)
  if (!shared.length) return null
  return (
    <p className="small" style={{ marginBottom: 0 }}>
      Your group can read: <b>{shared.join(', ')}</b> (choose it in the version menu above the Bible).
    </p>
  )
}

const LICENSED = ['CSB', 'NKJV', 'NASB', 'NIV']

/** Owner: paste the API.Bible key once; every signed-in member can then read those translations. */
function SharedTranslations() {
  const [data, setData] = useState<LicensedInfo | null>(null)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [ids, setIds] = useState<Record<string, string>>({})
  const [esvKey, setEsvKey] = useState('')
  useEffect(() => {
    refreshLicensed(true).then((d) => {
      setData(d)
      setIds(d?.ids ?? {})
    })
  }, [])
  const saveKey = async () => {
    setBusy(true)
    setMsg('')
    try {
      const d = await saveLicensedKey(key.trim())
      const fresh = await refreshLicensed(true)
      setData(fresh)
      setIds(d.ids ?? fresh?.ids ?? {})
      setKey('')
      setMsg('Key saved. Check the versions below.')
    } catch (e) {
      setMsg((e as Error).message)
    }
    setBusy(false)
  }
  const saveIds = async () => {
    setBusy(true)
    try {
      await saveLicensedIds(ids)
      setData(await refreshLicensed(true))
      setMsg('Saved — members can now pick these in the version menu.')
    } catch (e) {
      setMsg((e as Error).message)
    }
    setBusy(false)
  }
  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--rule)' }}>
      <div className="small" style={{ fontWeight: 600 }}>Share CSB, NIV, NKJV, NASB or ESV with your group</div>
      <div className="small subtle" style={{ marginBottom: 6 }}>
        Paste your API.Bible key once. It stays on your Cloudflare server (never on members’ devices), and everyone you invited can read these
        translations when signed in. Chapters are kept for 25 days so the group shares your free monthly allowance.
      </div>
      {data?.hasKey && <div className="small" style={{ marginBottom: 6 }}>✓ Key saved{data.usedThisMonth !== undefined && ` · ${data.usedThisMonth} of ${data.monthLimit} live loads used this month`}</div>}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        <input className="input" type="password" autoComplete="off" placeholder={data?.hasKey ? 'Replace API.Bible key' : 'API.Bible key'} value={key} onChange={(e) => setKey(e.target.value)} style={{ flex: '1 1 200px', fontSize: 15 }} />
        <button className="btn small primary" disabled={busy || !key.trim()} onClick={saveKey}>
          Save key
        </button>
      </div>
      {data?.hasKey && data.bibles && (
        <>
          {LICENSED.map((v) => (
            <div className="setting-row" key={v} style={{ padding: '6px 0' }}>
              <span>{v}</span>
              <select className="select" style={{ maxWidth: 230, fontSize: 14 }} value={ids[v] ?? ''} onChange={(e) => setIds({ ...ids, [v]: e.target.value })} aria-label={`API.Bible version for ${v}`}>
                <option value="">Not shared</option>
                {data.bibles!.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.abbreviation} — {b.name}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <button className="btn small" disabled={busy} onClick={saveIds} style={{ marginTop: 6 }}>
            Save versions
          </button>
        </>
      )}
      <div className="small" style={{ fontWeight: 600, marginTop: 12 }}>ESV {data?.hasEsvKey && <span style={{ fontWeight: 400 }}>— ✓ shared with your group</span>}</div>
      <div className="small subtle" style={{ marginBottom: 6 }}>Paste your free ESV key from api.esv.org (non-commercial use).</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <input className="input" type="password" autoComplete="off" placeholder={data?.hasEsvKey ? 'Replace ESV key' : 'ESV API key'} value={esvKey} onChange={(e) => setEsvKey(e.target.value)} style={{ flex: '1 1 200px', fontSize: 15 }} />
        <button
          className="btn small primary"
          disabled={busy || !esvKey.trim()}
          onClick={async () => {
            setBusy(true)
            setMsg('')
            try {
              await saveEsvKey(esvKey.trim())
              setData(await refreshLicensed(true))
              setEsvKey('')
              setMsg('ESV key saved — members can now choose ESV.')
            } catch (e) {
              setMsg((e as Error).message)
            }
            setBusy(false)
          }}
        >
          Save ESV key
        </button>
      </div>
      {data?.error && <p className="small" style={{ color: '#a3271c' }}>{data.error}</p>}
      {msg && <p className="small" style={{ marginBottom: 0 }}>{msg}</p>}
    </div>
  )
}
