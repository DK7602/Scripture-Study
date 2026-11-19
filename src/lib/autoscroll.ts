/** Auto-scroll for reading: on/off, and paused when the reader touches the page. */
import { useSyncExternalStore } from 'react'

export interface ScrollState {
  on: boolean
  running: boolean
}
let state: ScrollState = { on: false, running: false }
const subs = new Set<() => void>()
function set(p: Partial<ScrollState>) {
  state = { ...state, ...p }
  subs.forEach((f) => f())
}
export function useAutoScroll(): ScrollState {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => state,
  )
}
export const startScroll = () => set({ on: true, running: true })
export const pauseScroll = () => state.running && set({ running: false })
export const resumeScroll = () => set({ on: true, running: true })
export const stopScroll = () => set({ on: false, running: false })

/** Scroll speeds in CSS pixels per second at the default text size, slowest to fastest. */
export const SCROLL_SPEEDS = [6, 9, 13, 18, 24, 31, 40, 52, 66, 84]
