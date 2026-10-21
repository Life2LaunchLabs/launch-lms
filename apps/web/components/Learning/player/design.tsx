'use client'

import React from 'react'
import { motion, useReducedMotion } from 'motion/react'

/**
 * The activity design language every activity shares: page backgrounds and scenes, block
 * entrances, and celebrations. An activity sets defaults in ``settings.design``; any page can
 * override them in its own ``design``. Nothing here is a mode: every activity gets all of it.
 */

export type SceneKind = 'none' | 'starfield' | 'aurora' | 'drift' | 'confetti'
export type Intensity = 'low' | 'medium' | 'high'
export type PageBackground = { color?: string; gradient_to?: string; scene?: SceneKind; intensity?: Intensity }
export type Entrance = 'rise' | 'fade' | 'none'

export const SCENES: { value: SceneKind; label: string }[] = [
  { value: 'none', label: 'None' }, { value: 'starfield', label: 'Starfield' }, { value: 'aurora', label: 'Aurora' },
  { value: 'drift', label: 'Drift' }, { value: 'confetti', label: 'Confetti' },
]
const COUNT: Record<Intensity, number> = { low: 0.5, medium: 1, high: 1.8 }

/** A page's background: the activity's default, then the page's own (and its older accent colour). */
export function resolveBackground(page: any, settings?: any): PageBackground {
  const base: PageBackground = settings?.design?.background || {}
  const own: PageBackground = page?.design?.background || {}
  const legacy = page?.design?.background_accent_color ? { color: String(page.design.background_accent_color) } : {}
  return { ...base, ...legacy, ...own }
}

function rgb(color?: string): [number, number, number] | null {
  const value = String(color || '').trim()
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1]
  if (hex) {
    const full = hex.length === 3 ? hex.split('').map((digit) => digit + digit).join('') : hex
    return [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16)) as [number, number, number]
  }
  const parts = value.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i)
  return parts ? [Number(parts[1]), Number(parts[2]), Number(parts[3])] : null
}

/** Whether text on this colour should be light. Unknown colours keep the theme's text. */
export function isDarkColor(color?: string): boolean | null {
  const channels = rgb(color)
  if (!channels) return null
  const [r, g, b] = channels.map((channel) => {
    const value = channel / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.4
}

/** The surface's style and text tone for a background; ``tone`` is a class that flips text colour. */
export function backgroundLook(background: PageBackground): { style?: React.CSSProperties; tone: string } {
  if (!background.color) return { tone: '' }
  const style: React.CSSProperties = background.gradient_to
    ? { backgroundColor: background.color, backgroundImage: `linear-gradient(160deg, ${background.color}, ${background.gradient_to})` }
    : { backgroundColor: background.color }
  const dark = isDarkColor(background.color)
  return { style, tone: dark === true ? 'dark learning-tone-dark' : dark === false ? 'learning-tone-light' : '' }
}

// Pseudo-random but stable positions, so a scene looks the same on every render.
function spots(count: number, seed: number) {
  return Array.from({ length: count }, (_, index) => {
    const value = Math.sin((index + 1) * 12.9898 + seed * 78.233) * 43758.5453
    const next = Math.sin((index + 1) * 39.3468 + seed * 11.135) * 24634.6345
    return { x: (value - Math.floor(value)) * 100, y: (next - Math.floor(next)) * 100, n: index }
  })
}

/**
 * A page's animated scene, drawn behind its content. Scenes are plain components keyed by
 * name, so richer ones can be added without touching the player. Reduced motion holds them still.
 */
export function Scene({ scene, intensity = 'medium' }: { scene?: SceneKind; intensity?: Intensity }) {
  const still = Boolean(useReducedMotion())
  if (!scene || scene === 'none') return null
  const scale = COUNT[intensity] || 1
  const layer = 'pointer-events-none absolute inset-0 overflow-hidden'
  const motionClass = still ? 'learning-scene-still' : ''
  if (scene === 'starfield') {
    return <div aria-hidden="true" data-scene="starfield" className={`${layer} ${motionClass}`}>
      {spots(Math.round(70 * scale), 1).map(({ x, y, n }) => <span key={n} className="learning-star" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${(n % 17) * 0.35}s`, width: n % 9 === 0 ? 3 : 2, height: n % 9 === 0 ? 3 : 2 }} />)}
    </div>
  }
  if (scene === 'aurora') {
    return <div aria-hidden="true" data-scene="aurora" className={`${layer} ${motionClass}`} style={{ opacity: Math.min(1, 0.45 * scale) }}>
      <span className="learning-aurora" style={{ left: '-10%', top: '-20%', background: 'radial-gradient(closest-side, rgba(56,189,248,.55), transparent)' }} />
      <span className="learning-aurora" style={{ right: '-15%', top: '10%', animationDelay: '-6s', background: 'radial-gradient(closest-side, rgba(167,139,250,.5), transparent)' }} />
      <span className="learning-aurora" style={{ left: '20%', bottom: '-30%', animationDelay: '-11s', background: 'radial-gradient(closest-side, rgba(52,211,153,.45), transparent)' }} />
    </div>
  }
  if (scene === 'drift') {
    return <div aria-hidden="true" data-scene="drift" className={`${layer} ${motionClass}`}>
      {spots(Math.round(14 * scale), 2).map(({ x, y, n }) => <span key={n} className="learning-drift" style={{ left: `${x}%`, top: `${y}%`, width: 24 + (n % 5) * 18, height: 24 + (n % 5) * 18, animationDelay: `${-(n % 7) * 2.3}s` }} />)}
    </div>
  }
  return <Confetti count={Math.round(36 * scale)} still={still} loop />
}

const CONFETTI = ['#f97316', '#facc15', '#22c55e', '#38bdf8', '#a78bfa', '#f472b6']

/** Falling confetti: a looping scene, or a one-time burst when a page celebrates. */
export function Confetti({ count = 48, still = false, loop = false }: { count?: number; still?: boolean; loop?: boolean }) {
  if (still && !loop) return null
  return <div aria-hidden="true" data-scene={loop ? 'confetti' : 'celebration'} className={`pointer-events-none absolute inset-0 z-20 overflow-hidden ${still ? 'learning-scene-still' : ''}`}>
    {spots(count, loop ? 3 : 4).map(({ x, y, n }) => <span key={n} className={loop ? 'learning-confetti learning-confetti-loop' : 'learning-confetti'}
      style={{ left: `${x}%`, top: loop ? `${still ? y : y - 100}%` : '-4%', background: CONFETTI[n % CONFETTI.length], animationDelay: `${(loop ? -(n % 11) : (n % 8) * 0.06)}s`, transform: `rotate(${n * 37}deg)` }} />)}
  </div>
}

/** A one-time celebration when a page with ``design.celebrate`` opens. */
export function Celebration({ active }: { active: boolean }) {
  const still = Boolean(useReducedMotion())
  if (!active || still) return null
  return <Confetti />
}

/**
 * A block's entrance. Blocks rise in, staggered in page order, unless the block chooses
 * fade or none. Reduced motion shows them at once.
 */
export function EntranceMotion({ entrance = 'rise', index, children }: { entrance?: Entrance; index: number; children: React.ReactNode }) {
  const still = useReducedMotion()
  if (still || entrance === 'none') return <>{children}</>
  const from = entrance === 'fade' ? { opacity: 0 } : { opacity: 0, y: 14 }
  return <motion.div initial={from} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32, delay: 0.08 + Math.min(index, 8) * 0.07, ease: [0.22, 1, 0.36, 1] }}>
    {children}
  </motion.div>
}
