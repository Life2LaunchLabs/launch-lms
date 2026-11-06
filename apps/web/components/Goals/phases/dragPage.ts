/** The page while something on the plans map is being dragged: what scrolls it, and what can't. */

const holdStill = (e: TouchEvent) => { if (e.cancelable) e.preventDefault() }
/**
 * While a piece is dragged the page only scrolls when the drag scrolls it: the browser doesn't re-anchor
 * the scroll as gaps light up, and a finger over any element doesn't pan the page.
 */
export function pagePinned(on: boolean) {
  document.documentElement.style.overflowAnchor = on ? 'none' : ''
  if (on) window.addEventListener('touchmove', holdStill, { passive: false })
  else window.removeEventListener('touchmove', holdStill)
}

/** How fast the page scrolls (px a frame) for a dragged piece at y: none unless it was carried toward that edge. */
export function scrollSpeed({ y, y0 }: { y: number; y0: number }) {
  const zone = Math.min(110, window.innerHeight * 0.16), top = zone - y, bottom = y - (window.innerHeight - zone)
  if (top > 0 && y < y0 - 12) return -Math.max(2, Math.round(top / zone * 12))
  if (bottom > 0 && y > y0 + 12) return Math.max(2, Math.round(bottom / zone * 12))
  return 0
}
