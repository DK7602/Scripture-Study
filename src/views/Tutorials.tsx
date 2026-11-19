import { useEffect, useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import { audioState, pause as pauseBible } from '../lib/audio'
import { siteUrl } from '../lib/data'
import { sermonPlayer, toggleSermon } from '../lib/sermons'

/**
 * "How to use Scripture Study": short narrated videos (made by tutorial/, served from /audio/tutorial/ through the
 * Worker, which answers the Range requests iPhones need for video).
 */
interface Chapter {
  id: string
  title: string
  seconds: number
  video: string
  poster: string
  captions: string
}

const base = () => siteUrl('audio/tutorial/')

function clock(s: number) {
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`
}

export function Tutorials() {
  const [list, setList] = useState<Chapter[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [auto, setAuto] = useState(false)
  useEffect(() => {
    fetch(base() + 'index.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setList(d?.chapters ?? []))
      .catch(() => setList([]))
  }, [])
  if (!list?.length) return null
  const total = list.reduce((t, c) => t + c.seconds, 0)
  return (
    <div className="tutorials card">
      <div className="tut-head">
        <Icon name="play" size={18} fill />
        <div>
          <b>How to use Scripture Study</b>
          <div className="faint small">
            {list.length} short videos · {Math.round(total / 60)} minutes in all
          </div>
        </div>
      </div>
      {list.map((c, i) => (
        <div key={c.id} className={`tut-row${open === c.id ? ' open' : ''}`}>
          {open === c.id ? (
            <Player
              c={c}
              autoPlay={auto}
              onEnded={() => {
                const next = list[i + 1]
                setAuto(true)
                setOpen(next ? next.id : null)
              }}
              onClose={() => setOpen(null)}
            />
          ) : (
            <button
              className="tut-pick"
              onClick={() => {
                setAuto(true)
                setOpen(c.id)
              }}
            >
              <img src={base() + c.poster} alt="" loading="lazy" />
              <span className="tut-title">
                <b>
                  {i + 1}. {c.title}
                </b>
                <span className="faint small">{clock(c.seconds)}</span>
              </span>
              <span className="tut-play" aria-hidden="true">
                <Icon name="play" size={16} fill />
              </span>
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

function Player({ c, autoPlay, onEnded, onClose }: { c: Chapter; autoPlay: boolean; onEnded: () => void; onClose: () => void }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [])
  // one voice at a time: the audio Bible or a sermon pauses while a video plays
  const onPlay = () => {
    if (audioState().playing) pauseBible()
    if (sermonPlayer().playing) toggleSermon()
  }
  return (
    <div className="tut-player">
      <div className="tut-player-head">
        <b>{c.title}</b>
        <button className="icon-btn" onClick={onClose} aria-label="Close the video">
          <Icon name="close" size={18} />
        </button>
      </div>
      <video ref={ref} src={base() + c.video} poster={base() + c.poster} controls playsInline preload="metadata" autoPlay={autoPlay} onPlay={onPlay} onEnded={onEnded}>
        <track kind="captions" srcLang="en" label="English" src={base() + c.captions} />
      </video>
    </div>
  )
}
