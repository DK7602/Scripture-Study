import { useLayoutEffect, type RefObject } from 'react'

/**
 * Text boxes that grow with their text, without the page jumping while you type.
 *
 * Where the browser can size a text box to its text by itself (CSS field-sizing, Chrome and Android), the
 * class "autogrow" does it all. Elsewhere the box is measured in script: it has to shrink for a moment to
 * be measured, and that used to pull the page up and down at every new line; the scroll positions are now
 * put back before the screen is drawn.
 */
export const nativeFit = typeof CSS !== 'undefined' && !!CSS.supports?.('field-sizing', 'content')

export function fitText(el: HTMLTextAreaElement, extra = 0) {
  const saved: [Element, number][] = []
  for (let p = el.parentElement; p; p = p.parentElement) if (p.scrollTop) saved.push([p, p.scrollTop])
  const wy = window.scrollY
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight + extra}px`
  for (const [p, t] of saved) if (p.scrollTop !== t) p.scrollTop = t
  if (window.scrollY !== wy) window.scrollTo(window.scrollX, wy)
}

export function useAutoSize(ref: RefObject<HTMLTextAreaElement | null>, value: string, on = true, extra = 0) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!on || !el || nativeFit) return
    fitText(el, extra)
  }, [value, on]) // eslint-disable-line react-hooks/exhaustive-deps
}
