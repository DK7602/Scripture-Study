import { useState } from 'react'
import type { Place } from '../lib/types'

/** Photo of the site today from Wikimedia Commons (loaded live, with credit). */
export function PlacePhoto({ place, width = 480 }: { place: Place; width?: number }) {
  const [failed, setFailed] = useState(false)
  if (!place.ph || failed) return null
  const file = encodeURIComponent(decodeURIComponent(place.ph.f))
  return (
    <figure style={{ margin: '6px 0 4px' }}>
      <img
        src={`https://commons.wikimedia.org/wiki/Special:FilePath/${file}?width=${width}`}
        alt={place.ph.d || place.n}
        loading="lazy"
        onError={() => setFailed(true)}
        style={{ width: '100%', aspectRatio: '16 / 10', objectFit: 'cover', borderRadius: 8, display: 'block', background: 'var(--panel-2)' }}
      />
      <figcaption className="faint" style={{ fontSize: 11.5, marginTop: 3 }}>
        Now: {place.ph.d}{place.ph.c ? ' · ' : ''}
        <a href={`https://commons.wikimedia.org/wiki/File:${file}`} target="_blank" rel="noreferrer">
          {place.ph.c ? `Photo: ${place.ph.c}` : 'Wikimedia Commons'}
        </a>
      </figcaption>
    </figure>
  )
}
