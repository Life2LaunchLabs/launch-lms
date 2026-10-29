// The new portfolio is opt-in while it's built: `?new=1` turns it on and `?new=0` off, and the choice is kept
// in a cookie so the rest of the visit stays on it. Only this browser sees the choice.

export const PREVIEW_COOKIE = 'portfolio_v2'

export function previewHref(path: string, on: boolean) {
  return `${path}?new=${on ? 1 : 0}`
}

/** Whether to show the new portfolio, from the page's `new` query value and the saved cookie. */
export function wantsPortfolioV2(query: string | string[] | undefined, cookie: string | undefined) {
  const value = Array.isArray(query) ? query[0] : query
  if (value === '1' || value === '0') return value === '1'
  return cookie === '1'
}
