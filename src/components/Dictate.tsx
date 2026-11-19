import { useEffect, useRef, useState, type TextareaHTMLAttributes } from 'react'
import { Icon } from './Icon'

/* eslint-disable @typescript-eslint/no-explicit-any */
const Recognition: any = typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : undefined
export const canDictate = !!Recognition

/** Only one microphone at a time across the app. */
let current: { stop: () => void } | null = null

/** Spoken punctuation ("comma", "period", "new line") becomes the mark itself. */
function punctuate(t: string): string {
  return t
    .replace(/\s*\b(new paragraph)\b\s*/gi, '\n\n')
    .replace(/\s*\b(new line|next line)\b\s*/gi, '\n')
    .replace(/\s*\b(full stop|period)\b/gi, '.')
    .replace(/\s*\bcomma\b/gi, ',')
    .replace(/\s*\bquestion mark\b/gi, '?')
    .replace(/\s*\bexclamation (mark|point)\b/gi, '!')
    .replace(/\s*\bcolon\b/gi, ':')
    .replace(/\s*\bsemicolon\b/gi, ';')
}

/**
 * A text area with a microphone button: what you say is typed in at the cursor. Uses the browser's own
 * speech recognition (Chrome, Edge, Safari, Android); the button is hidden where there is none (Firefox).
 */
export function DictationArea({
  value,
  onChange,
  autoGrow,
  ...rest
}: { value: string; onChange: (v: string) => void; autoGrow?: boolean } & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'>) {
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState('')
  const ta = useRef<HTMLTextAreaElement>(null)
  const rec = useRef<any>(null)
  const want = useRef(false)
  const val = useRef(value)
  val.current = value

  const insert = (raw: string) => {
    let text = punctuate(raw.trim())
    if (!text) return
    const el = ta.current
    const v = val.current
    const at = el && document.activeElement === el ? el.selectionStart : v.length
    const before = v.slice(0, at)
    const after = v.slice(at)
    const startOfSentence = !before.trim() || /[.!?]\s*$/.test(before) || /\n\s*$/.test(before)
    if (startOfSentence) text = text.charAt(0).toUpperCase() + text.slice(1)
    const pre = before && !/\s$/.test(before) && !/^[.,!?:;\n]/.test(text) ? ' ' : ''
    const next = before + pre + text + (after && !/^\s/.test(after) ? ' ' : '') + after
    val.current = next
    onChange(next)
    requestAnimationFrame(() => {
      if (!el) return
      const pos = (before + pre + text).length
      el.setSelectionRange(pos, pos)
    })
  }

  const stop = () => {
    want.current = false
    try {
      rec.current?.stop()
    } catch {
      /* already stopped */
    }
    setListening(false)
    setInterim('')
    if (current?.stop === stop) current = null
  }

  const start = () => {
    if (!Recognition) return
    current?.stop()
    setError('')
    const r = new Recognition()
    r.lang = navigator.language || 'en-US'
    r.continuous = true
    r.interimResults = true
    r.onresult = (e: any) => {
      let fin = ''
      let mid = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        if (res.isFinal) fin += res[0].transcript
        else mid += res[0].transcript
      }
      if (fin) insert(fin)
      setInterim(mid)
    }
    r.onerror = (e: any) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setError('The microphone is blocked. Allow it for this site in your browser settings, then try again.')
        want.current = false
      } else if (e.error === 'network') {
        setError('Dictation needs an internet connection in this browser.')
        want.current = false
      } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
        setError(`Dictation stopped (${e.error}).`)
      }
    }
    // browsers end a session after a pause; carry on until the user taps the button again
    r.onend = () => {
      if (want.current) {
        try {
          r.start()
          return
        } catch {
          /* fall through */
        }
      }
      setListening(false)
      setInterim('')
    }
    rec.current = r
    want.current = true
    current = { stop }
    try {
      r.start()
      setListening(true)
    } catch {
      setError('Could not start the microphone.')
    }
  }

  useEffect(() => () => stop(), []) // eslint-disable-line react-hooks/exhaustive-deps

  // grow with the text instead of scrolling inside the box
  useEffect(() => {
    const el = ta.current
    if (!autoGrow || !el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  }, [value, autoGrow])

  return (
    <div className={`dictate${listening ? ' on' : ''}`}>
      <textarea ref={ta} value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
      {canDictate && (
        <button
          type="button"
          className="mic-btn"
          onClick={listening ? stop : start}
          aria-pressed={listening}
          aria-label={listening ? 'Stop dictation' : 'Dictate (speak to type)'}
          title={listening ? 'Stop dictation' : 'Speak to type'}
        >
          <Icon name={listening ? 'stop' : 'mic'} size={18} />
        </button>
      )}
      {(listening || error) && (
        <div className="dictate-status" role="status">
          {error ? (
            <span className="err">{error}</span>
          ) : (
            <>
              <span className="dot" /> Listening… {interim && <i>{interim}</i>}
              <span className="faint"> Say “comma”, “period” or “new line” for punctuation.</span>
            </>
          )}
        </div>
      )}
    </div>
  )
}
