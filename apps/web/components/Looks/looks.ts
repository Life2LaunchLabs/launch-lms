import type { LookId, LookMode, PortfolioLayout } from '@services/portfolio/records'

export type { LookId, LookMode }

/**
 * A learner's look: their theme for the whole app, and the one visitors see their portfolio in. A look is more
 * than colors: type, corners, depth, and how the portfolio's sections are drawn (styles/looks.css). Nothing
 * moves between looks. Each has a light and a dark side, and the learner's accent recolors it.
 * The colors are background, then accents A, B and C, in light mode, then the same in dark mode.
 */
export const LOOKS: Array<{ id: LookId; name: string; blurb: string; colors: [string, string, string, string]; night: [string, string, string, string]; font: string }> = [
  { id: 'playful', name: 'Playful', blurb: 'Chunky cards and buttons with a 3D edge, heavy rounding, a color for every section.', colors: ['#f5f8f9', '#4C8DFF', '#EC4F9A', '#F5A524'], night: ['#0e151c', '#4C8DFF', '#EC4F9A', '#1c2733'], font: 'inherit' },
  { id: 'gallery', name: 'Gallery', blurb: 'Art-house: your name set huge in a serif, the work big and uneven like a gallery wall. No cards, one loud accent.', colors: ['#ffffff', '#ff3d00', '#0b0b0b', '#ececec'], night: ['#0b0b0b', '#ff3d00', '#f2f0ea', '#1c1c1c'], font: '"Instrument Serif", Georgia, serif' },
  { id: 'volt', name: 'Volt', blurb: 'Modern and minimal: nothing boxed, quiet headings, soft photo corners and one electric accent.', colors: ['#f1f2f4', '#b8e62e', '#0c0d0f', '#ffffff'], night: ['#070708', '#b8e62e', '#f4f4f5', '#121214'], font: 'Manrope, system-ui, sans-serif' },
]

export const MODES: Array<{ id: LookMode; label: string }> = [{ id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }, { id: 'system', label: 'System' }]

/** Accents to pick from; any color works too. */
export const ACCENTS = ['#4c8dff', '#7c5cff', '#ec4f9a', '#e8642c', '#f5a524', '#b8e62e', '#16a34a', '#00b3a6', '#111111']

/** Banner backgrounds, all drawn in the accent (the look's own color until the learner picks one). */
const C = 'var(--org-primary-color)'
const shade = (pct: number, to = '#000') => `color-mix(in srgb, ${C} ${pct}%, ${to})`
const turn = (deg: number, light = 'l') => `oklch(from ${C} ${light} c calc(h + ${deg}))`
export const BANNERS: Array<{ id: string; name: string; css: string }> = [
  { id: 'look', name: 'My look', css: 'linear-gradient(120deg,var(--look-a),var(--look-b) 60%,var(--look-c))' },
  { id: 'solid', name: 'Solid', css: C },
  { id: 'fade', name: 'Fade', css: `linear-gradient(120deg, ${shade(65)}, ${C} 55%, ${shade(55, '#fff')})` },
  { id: 'glow', name: 'Glow', css: `radial-gradient(120% 160% at 85% 0%, ${shade(45, '#fff')}, ${C} 42%, ${shade(45)})` },
  { id: 'duo', name: 'Duo', css: `linear-gradient(120deg, ${C}, ${turn(70)})` },
  { id: 'mesh', name: 'Mesh', css: `radial-gradient(at 15% 20%, ${turn(60)} 0, transparent 55%), radial-gradient(at 85% 10%, ${turn(-50, 'calc(l + .12)')} 0, transparent 50%), radial-gradient(at 65% 95%, ${turn(140)} 0, transparent 55%), ${C}` },
  { id: 'stripes', name: 'Stripes', css: `repeating-linear-gradient(-45deg, ${C} 0 18px, ${shade(82)} 18px 36px)` },
  { id: 'dots', name: 'Dots', css: `radial-gradient(${shade(45, '#fff')} 2.2px, transparent 2.8px) 0 0 / 18px 18px, ${C}` },
  { id: 'grid', name: 'Grid', css: `linear-gradient(${shade(70, '#fff')} 1px, transparent 1px) 0 0 / 26px 26px, linear-gradient(90deg, ${shade(70, '#fff')} 1px, transparent 1px) 0 0 / 26px 26px, ${C}` },
  { id: 'rays', name: 'Rays', css: `repeating-conic-gradient(from 0deg at 82% 130%, ${C} 0 7deg, ${shade(84, '#fff')} 7deg 14deg)` },
  { id: 'dusk', name: 'Dusk', css: `linear-gradient(180deg, ${shade(35)}, ${C} 62%, ${turn(45, 'calc(l + .2)')})` },
  { id: 'ink', name: 'Ink', css: `radial-gradient(90% 140% at 100% 0%, ${shade(70, '#0c0c0e')}, transparent 60%), #0c0c0e` },
]

export const isLook = (value: unknown): value is LookId => LOOKS.some((look) => look.id === value)

/** Light, dark or the device's. Until the learner picks, it follows the device. */
export function modeOf(layout: Pick<PortfolioLayout, 'look' | 'mode'>): LookMode {
  return layout.mode || 'system'
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
export const LOOK_BOOT = `try{var d=document.documentElement,l=localStorage.getItem('${LOOK_KEY}');if(/^(pop|studio|midnight|sunset)$/.test(l||''))l='playful';if(/^(playful|gallery|volt)$/.test(l||''))d.dataset.look=l;var a=JSON.parse(localStorage.getItem('${ACCENT_KEY}')||'null');if(a&&a['--accent-h']){for(var k in a)d.style.setProperty(k,a[k]);d.dataset.accent=''}}catch(e){}`

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
