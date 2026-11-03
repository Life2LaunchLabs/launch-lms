import type { LookId, PortfolioLayout, SectionType, StackItem } from '@services/portfolio/records'

// The portfolio's section stack: rows of up to three sections on a grid of six. A section alone in its row is
// full width, three share a row in thirds, and two split it 1/3 + 2/3, 1/2 + 1/2 or 2/3 + 1/3. Every look
// has a suggested layout; once the learner changes it, their own stack goes with them to every look.

export type Row = StackItem[]
/** Where a dragged section would land: a new full row before row r, or into row r at position i. */
export type Slot = { newRow: true; r: number } | { newRow: false; r: number; i: number }

export const ALL_SECTIONS: SectionType[] = ['highlights', 'feature', 'about', 'experience', 'projects', 'credentials', 'results', 'headed', 'people']
/** Bio and experience are always on the page. */
export const REQUIRED: SectionType[] = ['about', 'experience']
/** What the "Add a section" chips call each one. */
export const SECTION_LABELS: Record<SectionType, string> = {
  highlights: 'Highlights', feature: 'Featured', about: 'About me', experience: 'Experience', projects: 'Projects',
  credentials: 'Credentials & badges', results: 'What I’m like', headed: 'Where I’m headed', people: 'My people',
}

/** Each look names the sections its own way; a name the learner gives one holds in every look. */
export const LOOK_NAMES: Record<LookId, Record<SectionType, string>> = {
  playful: { ...SECTION_LABELS },
  gallery: { highlights: 'Numbers', feature: 'Now showing', about: 'Info', experience: 'CV', projects: 'Work', credentials: 'Certified', results: 'Character', headed: 'Next', people: 'Said about me' },
  volt: { highlights: 'By the numbers', feature: 'Featured', about: 'About', experience: 'Journey', projects: 'Latest work', credentials: 'Badges', results: 'My type', headed: 'Next up', people: 'Shoutouts' },
}

/** Smallest and largest height each section can be dragged to, in px. In between it shows as much as fits. */
export const HEIGHTS: Record<SectionType, [number, number]> = {
  highlights: [96, 220], feature: [200, 560], about: [160, 560], experience: [200, 760], projects: [220, 900],
  credentials: [160, 600], results: [160, 600], headed: [160, 520], people: [160, 600],
}

const full = (type: SectionType): Row => [{ type, u: 6 }]
const pair = (a: SectionType, b: SectionType): Row => [{ type: a, u: 3 }, { type: b, u: 3 }]
const SUGGESTED: Record<LookId, Row[]> = {
  playful: [full('highlights'), full('feature'), full('about'), full('experience'), pair('projects', 'credentials'), pair('results', 'headed'), full('people')],
  gallery: [full('feature'), full('projects'), [{ type: 'about', u: 2 }, { type: 'experience', u: 4 }], full('highlights'), [{ type: 'credentials', u: 2 }, { type: 'results', u: 2 }, { type: 'headed', u: 2 }], full('people')],
  volt: [full('feature'), full('highlights'), full('projects'), pair('about', 'experience'), [{ type: 'credentials', u: 4 }, { type: 'results', u: 2 }], pair('people', 'headed')],
}

export const lookOf = (layout?: PortfolioLayout | null): LookId => (layout?.look && layout.look in SUGGESTED ? layout.look : 'playful')
export const copyRows = (rows: Row[]): Row[] => rows.map((row) => row.map((item) => ({ ...item })))
export const suggested = (look: LookId) => copyRows(SUGGESTED[look])

/** Put widths right: one is full, three are thirds, two share six (a half each unless they already split it). */
export function norm(rows: Row[]): Row[] {
  return rows.filter((row) => row.length).map((row) => {
    if (row.length === 1) row[0].u = 6
    else if (row.length >= 3) row.forEach((item) => { item.u = 2 })
    else if (!([2, 3, 4].includes(row[0].u) && row[0].u + row[1].u === 6)) { row[0].u = 3; row[1].u = 3 }
    return row
  })
}

/** The stack the learner sees: theirs, or the look's suggestion, keeping only the sections that have something to show. */
// eslint-disable-next-line no-unused-vars
export function visibleRows(stored: Row[], present: (type: SectionType) => boolean): Row[] {
  return norm(copyRows(stored).map((row) => row.filter((item) => present(item.type))))
}

/** True when two stacks are the same arrangement. */
export const sameRows = (a: Row[], b: Row[]) => JSON.stringify(norm(copyRows(a))) === JSON.stringify(norm(copyRows(b)))

/**
 * Save a change made to the visible stack without losing sections that are hidden right now (an empty
 * featured section, say): each goes back to the row it was in, or to a row of its own at that place.
 */
// eslint-disable-next-line no-unused-vars
export function mergeHidden(next: Row[], stored: Row[], present: (type: SectionType) => boolean): Row[] {
  const out = copyRows(next)
  stored.forEach((row, r) => row.forEach((item) => {
    if (present(item.type) || out.some((one) => one.some((it) => it.type === item.type))) return
    out.splice(Math.min(r, out.length), 0, [{ type: item.type, u: 6 }])
  }))
  return norm(out)
}

/** Drop a section into a slot. */
export function place(rows: Row[], item: StackItem, slot: Slot): Row[] {
  const out = copyRows(rows)
  if (slot.newRow) out.splice(slot.r, 0, [{ ...item, u: 6 }])
  else out[slot.r].splice(slot.i, 0, { ...item, u: 0 })
  return norm(out)
}

/** Take a section out of the stack, saying where it was so a drop with no target puts it back. */
export function lift(rows: Row[], type: SectionType): { rows: Row[]; item: StackItem; home: Slot } | null {
  const r = rows.findIndex((row) => row.some((item) => item.type === type))
  if (r < 0) return null
  const i = rows[r].findIndex((item) => item.type === type)
  const out = copyRows(rows)
  const [item] = out[r].splice(i, 1)
  const alone = !out[r].length
  return { rows: norm(out), item, home: alone ? { newRow: true, r } : { newRow: false, r, i } }
}

/**
 * Drag the gap between two sections in row r. `f` is where the pointer is across the row, in sixths.
 * Two in a row snap to 2/4, 3/3 or 4/2; pulled all the way, the squeezed one gets a row of its own (above
 * when it was on the left, below when on the right). Three in a row are thirds: pulling the right gap out
 * drops the right one below and widens the middle; pulling it in sends the left one above and widens the
 * right; the left gap mirrors that. Always worked out from the stack as it was when the drag began, so
 * pulling back before letting go undoes it.
 */
export function resizeGap(base: Row[], r: number, g: number, f: number): Row[] {
  const out = copyRows(base)
  const [A, B, C] = out[r]
  let rows: Row[]
  if (out[r].length === 2) {
    if (f < 1.2 || f > 4.8) rows = [[A], [B]]
    else { const u = Math.max(2, Math.min(4, Math.round(f))); A.u = u; B.u = 6 - u; rows = [[A, B]] }
  } else if (g === 0) {
    if (f < 1) { B.u = 4; C.u = 2; rows = [[A], [B, C]] } else if (f > 3) { A.u = 4; B.u = 2; rows = [[A, B], [C]] } else rows = [[A, B, C]]
  } else if (f > 5) { A.u = 2; B.u = 4; rows = [[A, B], [C]] } else if (f < 3) { B.u = 2; C.u = 4; rows = [[A], [B, C]] } else rows = [[A, B, C]]
  out.splice(r, 1, ...rows)
  return norm(out)
}

/** A height for each section: the learner's for this look and device, the look's own, or none (fit the content). */
export function heightOf(layout: PortfolioLayout | null | undefined, look: LookId, phone: boolean, type: SectionType): number | null {
  const saved = layout?.heights?.[phone ? `${look}:phone` : look]?.[type]
  return saved ? saved : null
}

/** The tightest range that suits every section in a row (they share one height). */
export function rangeOf(types: SectionType[]): [number, number] {
  const lo = Math.max(...types.map((type) => HEIGHTS[type][0]))
  const hi = Math.max(lo, Math.min(...types.map((type) => HEIGHTS[type][1])))
  return [lo, hi]
}
