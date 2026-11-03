import type { LookId, LookMode, PortfolioLayout } from '@services/portfolio/records'

export type { LookId, LookMode }

/**
 * A learner's look: their theme for the whole app, and the one visitors see their portfolio in.
 * The colors are background, then accents A, B and C, in light mode. Each look has a light and a dark side
 * (styles/looks.css, keyed on [data-look] and .dark); the learner picks light, dark or their device's.
 */
export const LOOKS: Array<{ id: LookId; name: string; blurb: string; colors: [string, string, string, string]; night: [string, string, string, string] }> = [
  { id: 'pop', name: 'Pop', blurb: 'Bright and colorful', colors: ['#f5f8f9', '#4C8DFF', '#EC4F9A', '#F5A524'], night: ['#0e151c', '#4C8DFF', '#EC4F9A', '#1c2733'] },
  { id: 'studio', name: 'Studio', blurb: 'Black and white, lots of space', colors: ['#ffffff', '#111111', '#8a8a8a', '#d9d9d9'], night: ['#0a0a0a', '#f2f2f2', '#8a8a8a', '#262626'] },
  { id: 'midnight', name: 'Midnight', blurb: 'Violet and teal, with a glow', colors: ['#f4f3ff', '#5b2bd6', '#00b3a6', '#e4e0ff'], night: ['#0b0f1e', '#5b2bd6', '#00d1c1', '#141a31'] },
  { id: 'sunset', name: 'Sunset', blurb: 'Warm and soft', colors: ['#fff6ee', '#E8642C', '#C8327D', '#F5A524'], night: ['#1a110d', '#E8642C', '#C8327D', '#2e1d16'] },
]

export const MODES: Array<{ id: LookMode; label: string }> = [{ id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }, { id: 'system', label: 'System' }]

/** Accents to pick from; any color works too. */
export const ACCENTS = ['#4c8dff', '#7c5cff', '#ec4f9a', '#e8642c', '#f5a524', '#16a34a', '#00b3a6', '#111111']

/** Banner gradients. "look" follows the look's colors, and the accent when there is one. */
export const BANNERS: Array<{ id: string; name: string; css: string }> = [
  { id: 'look', name: 'My look', css: 'linear-gradient(120deg,var(--look-a),var(--look-b) 60%,var(--look-c))' },
  { id: 'ocean', name: 'Ocean', css: 'linear-gradient(120deg,#0f4c81,#2f80ed 55%,#56ccf2)' },
  { id: 'aurora', name: 'Aurora', css: 'linear-gradient(120deg,#1d1446,#5b2bd6 45%,#00d1c1)' },
  { id: 'ember', name: 'Ember', css: 'linear-gradient(120deg,#7a1f1f,#e8642c 55%,#f5a524)' },
  { id: 'candy', name: 'Candy', css: 'linear-gradient(120deg,#ff7eb3,#ec4f9a 40%,#7c5cff)' },
  { id: 'forest', name: 'Forest', css: 'linear-gradient(120deg,#0b3d2e,#16a34a 55%,#a3e635)' },
  { id: 'mono', name: 'Mono', css: 'linear-gradient(120deg,#111111,#3a3a3a 55%,#8a8a8a)' },
]

export const isLook = (value: unknown): value is LookId => LOOKS.some((look) => look.id === value)

/** Light, dark or the device's. Before the learner picks, the look decides as it used to: Midnight dark, the rest light. */
export function modeOf(layout: Pick<PortfolioLayout, 'look' | 'mode'>): LookMode {
  if (layout.mode) return layout.mode
  if (!layout.look) return 'system'
  return layout.look === 'midnight' ? 'dark' : 'light'
}

/** The accent as the tokens' hue and saturation, set inline where [data-accent] is (styles/looks.css). */
export function accentVars(hex?: string | null): Record<string, string> {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return {}
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  const h = d === 0 ? 0 : max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  const hue = Math.round(((h * 60) + 360) % 360)
  // Dark text on a light accent (a yellow), white on the rest.
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return { '--accent-h': String(hue), '--accent-s': `${Math.round(s * 100)}%`, '--accent-l': `${Math.round(l * 100)}%`, '--accent-hex': hex, '--accent-on': luminance > 0.62 ? '#111111' : '#ffffff' }
}

/** Where this browser keeps the learner's look and accent, so they apply before the page paints. */
export const LOOK_KEY = 'launch-look'
export const ACCENT_KEY = 'launch-accent'

/** Runs in <head> before the page paints: the look and accent this browser last used. */
export const LOOK_BOOT = `try{var d=document.documentElement,l=localStorage.getItem('${LOOK_KEY}');if(/^(pop|studio|midnight|sunset)$/.test(l||''))d.dataset.look=l;var a=JSON.parse(localStorage.getItem('${ACCENT_KEY}')||'null');if(a&&a['--accent-h']){for(var k in a)d.style.setProperty(k,a[k]);d.dataset.accent=''}}catch(e){}`

/** Apply a look (and its accent) to the whole app in this browser, and remember them for the next visit. */
export function applyLook(look: LookId | null, accent?: string | null) {
  const root = document.documentElement
  if (look) root.dataset.look = look
  const vars = accentVars(accent)
  for (const key of ['--accent-h', '--accent-s', '--accent-l', '--accent-hex', '--accent-on']) root.style.removeProperty(key)
  for (const [key, value] of Object.entries(vars)) root.style.setProperty(key, value)
  if (Object.keys(vars).length) root.dataset.accent = ''; else delete root.dataset.accent
  try {
    if (look) window.localStorage.setItem(LOOK_KEY, look)
    if (Object.keys(vars).length) window.localStorage.setItem(ACCENT_KEY, JSON.stringify(vars)); else window.localStorage.removeItem(ACCENT_KEY)
  } catch { /* private mode: it applies for this visit */ }
}

export function storedLook(): LookId | null {
  try { const value = window.localStorage.getItem(LOOK_KEY); return isLook(value) ? value : null } catch { return null }
}

export function storedAccent(): string | null {
  try { return JSON.parse(window.localStorage.getItem(ACCENT_KEY) || 'null')?.['--accent-hex'] || null } catch { return null }
}
