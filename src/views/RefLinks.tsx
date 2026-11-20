import { Fragment } from 'react'
import { formatRef } from '../lib/refs'
import { openPopup } from '../lib/store'

/** Inline list of tappable Scripture references (opens the passage pop-up). */
export function RefLinks({ refs, short = true, sep = '; ', stack = false }: { refs: string[]; short?: boolean; sep?: string; stack?: boolean }) {
  return (
    <>
      {refs.map((r, i) => (
        <Fragment key={r + i}>
          <button
            className="ref-link"
            onClick={(e) => {
              e.stopPropagation()
              const rr = (e.currentTarget as HTMLElement).getBoundingClientRect()
              openPopup({ kind: 'ref', ref: r, x: rr.left, y: rr.bottom + 6 }, stack) // stack: the passage's ‹ back returns to the pop-up it came from
            }}
          >
            {formatRef(r, short)}
          </button>
          {i < refs.length - 1 && sep}
        </Fragment>
      ))}
    </>
  )
}
