/** A font size that follows the "App text size" setting (the --ui scale), for inline styles. */
export const ui = (px: number) => `calc(${px}px * var(--ui))`
