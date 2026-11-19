import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from './Icon'

/** Floating card near (x, y) on large screens, bottom sheet on phones. `large`: a big centred window, or the whole screen on phones. */
export function Popover({
  x,
  y,
  title,
  onClose,
  onBack,
  children,
  footer,
  width,
  large,
}: {
  x: number
  y: number
  title: ReactNode
  onClose: () => void
  onBack?: () => void
  children: ReactNode
  footer?: ReactNode
  width?: number
  large?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })
  const phone = window.innerWidth < 900

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || phone || large) return
    const r = el.getBoundingClientRect()
    let left = x
    let top = y
    if (left + r.width > window.innerWidth - 12) left = Math.max(12, x - r.width - 30)
    if (left + r.width > window.innerWidth - 12) left = window.innerWidth - r.width - 12
    if (top + r.height > window.innerHeight - 12) top = Math.max(12, window.innerHeight - r.height - 12)
    setPos({ left, top })
  }, [x, y, phone, title, large])

  return (
    <>
      <div className="pop-backdrop" onClick={onClose} style={phone || large ? { background: 'rgba(0,0,0,.35)' } : undefined} />
      <div
        ref={ref}
        className={`pop${phone ? ' sheet' : ''}${large ? ' large' : ''}`}
        role="dialog"
        aria-modal="true"
        style={phone || large ? undefined : { left: pos.left, top: pos.top, width: width ? `min(calc(${width}px * var(--ui)), calc(100vw - 24px))` : undefined }}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <div className="pop-head">
          {onBack && (
            <button className="icon-btn" onClick={onBack} aria-label="Back">
              <Icon name="left" />
            </button>
          )}
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close" autoFocus>
            <Icon name="close" />
          </button>
        </div>
        <div className="pop-body">{children}</div>
        {footer && <div className="pop-foot">{footer}</div>}
      </div>
    </>
  )
}

export function Modal({ title, onClose, children, footer }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}
