import type { LookId } from '@services/portfolio/records'

export type { LookId }

/**
 * A learner's look: their theme for the whole app, and the one visitors see their portfolio in.
 * The colors are background, then accents A, B and C. Picking one sets light or dark mode to match.
 * The CSS for each is in styles/looks.css, keyed on [data-look].
 */
export const LOOKS: Array<{ id: LookId; name: string; blurb: string; dark: boolean; colors: [string, string, string, string] }> = [
  { id: 'pop', name: 'Pop', blurb: 'Bright and colorful', dark: false, colors: ['#f5f8f9', '#4C8DFF', '#EC4F9A', '#F5A524'] },
  { id: 'studio', name: 'Studio', blurb: 'Black and white, lots of space', dark: false, colors: ['#ffffff', '#111111', '#8a8a8a', '#d9d9d9'] },
  { id: 'midnight', name: 'Midnight', blurb: 'Dark, with a glow', dark: true, colors: ['#0b0f1e', '#5b2bd6', '#00d1c1', '#141a31'] },
  { id: 'sunset', name: 'Sunset', blurb: 'Warm and soft', dark: false, colors: ['#fff6ee', '#E8642C', '#C8327D', '#F5A524'] },
]

export const isLook = (value: unknown): value is LookId => LOOKS.some((look) => look.id === value)

/** Where this browser keeps the learner's look, so it applies before the page paints. */
export const LOOK_KEY = 'launch-look'

/** Runs in <head> before the page paints: the look this browser last used. */
export const LOOK_BOOT = `try{var l=localStorage.getItem('${LOOK_KEY}');if(/^(pop|studio|midnight|sunset)$/.test(l||''))document.documentElement.dataset.look=l}catch(e){}`

/** Apply a look to the whole app in this browser, and remember it for the next visit. */
export function applyLook(look: LookId) {
  document.documentElement.dataset.look = look
  try { window.localStorage.setItem(LOOK_KEY, look) } catch { /* private mode: it applies for this visit */ }
}

export function storedLook(): LookId | null {
  try { const value = window.localStorage.getItem(LOOK_KEY); return isLook(value) ? value : null } catch { return null }
}
