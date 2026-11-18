import { useEffect, useState, useSyncExternalStore } from 'react'
import { newInvite, onSync, pendingInvite, signIn, signOut, syncInfo, syncNow } from '../lib/sync'
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
