import type { CSSProperties } from 'react'

/**
 * A plan's color, as the set of shades the learner UI paints with. Each color has a
 * bright face (path nodes, buttons), a darker edge under it (the pressable underside),
 * a deeper header shade that keeps small white text readable, and an accent for text
 * on the page in each theme.
 */
export type PlanPalette = {
  key: string
  label: string
  face: string
  edge: string
  /** Text or icons on ``face``. */
  faceInk: string
  deep: string
  deepEdge: string
  /** Text on ``deep`` (the plan header card). */
  deepInk: string
  accentDark: string
  accentLight: string
}

const palette = (key: string, label: string, face: string, edge: string, faceInk: string, deep: string, deepEdge: string, deepInk: string, accentDark: string, accentLight: string): PlanPalette =>
  ({ key, label, face, edge, faceInk, deep, deepEdge, deepInk, accentDark, accentLight })

export const PLAN_PALETTES: PlanPalette[] = [
  palette('violet', 'Violet', '#8B5CF6', '#6539D8', '#FFFFFF', '#6B3FE0', '#4A24B0', '#FFFFFF', '#B69CFF', '#6539D8'),
  palette('teal', 'Teal', '#13B3A4', '#0B7D73', '#FFFFFF', '#0B8077', '#06554F', '#FFFFFF', '#4FD8CB', '#0B7D73'),
  palette('amber', 'Amber', '#F5A524', '#B86E12', '#2B1700', '#F2A33A', '#B86E12', '#2B1700', '#FFC56B', '#9A5A0C'),
  palette('blue', 'Blue', '#4C8DFF', '#2F66D6', '#FFFFFF', '#2F66D6', '#1F4590', '#FFFFFF', '#8DB8FF', '#2F66D6'),
  palette('pink', 'Pink', '#EC4F9A', '#B42C6F', '#FFFFFF', '#C8327D', '#8C2058', '#FFFFFF', '#FF8DC2', '#B42C6F'),
  palette('lime', 'Lime', '#7CC423', '#548A12', '#18230A', '#5E9A14', '#3F6A0B', '#FFFFFF', '#A8E35A', '#4E7F10'),
  palette('orange', 'Orange', '#E8642C', '#A9431A', '#FFFFFF', '#C9501E', '#8E3512', '#FFFFFF', '#FF9B6E', '#A9431A'),
  palette('sky', 'Sky', '#2CB5E0', '#1A82A6', '#08222C', '#1A86AE', '#105E7B', '#FFFFFF', '#7FD6F2', '#1A82A6'),
]

/** Plan colors are stored per browser as a face hex; these are the faces of the previous palette. */
const LEGACY: Record<string, string> = {
  '#7c3aed': 'violet', '#0f9f9a': 'teal', '#d97706': 'amber', '#2563eb': 'blue',
  '#db2777': 'pink', '#65a30d': 'lime', '#dc2626': 'orange', '#0891b2': 'sky',
}

export const PLAN_COLORS = PLAN_PALETTES.map((item) => item.face)

export function planPalette(color?: string | null): PlanPalette {
  const value = String(color || '').toLowerCase()
  const key = LEGACY[value]
  return PLAN_PALETTES.find((item) => item.face.toLowerCase() === value || item.key === key || item.key === value) || PLAN_PALETTES[0]
}

/**
 * CSS variables for a plan's color, set on the element that scopes it. Components and
 * classes read ``--plan-*``; ``--plan-accent`` resolves per theme in globals.css.
 */
export function planVars(color?: string | null): CSSProperties {
  const p = planPalette(color)
  return {
    '--plan-face': p.face, '--plan-edge': p.edge, '--plan-face-ink': p.faceInk,
    '--plan-deep': p.deep, '--plan-deep-edge': p.deepEdge, '--plan-deep-ink': p.deepInk,
    '--plan-accent-dark': p.accentDark, '--plan-accent-light': p.accentLight,
  } as CSSProperties
}
