import type { SectionType } from '@services/portfolio/records'

// How a section's height changes what it shows (FEED-60). Card sections (projects, experience) snap to tidy
// layouts: as the section gets taller its cards grow until they fill the width, then they wrap to a second
// row, and so on until every card shows. Other sections show more or less of their content and never get
// taller than all of it. The featured banner resizes smoothly. A section alone in its row is held to its own
// tidy height; one that shares a row with a taller section keeps its size and gets space below instead.

export type Sizing = 'cards' | 'content' | 'free'
export const SIZING: Record<SectionType, Sizing> = {
  projects: 'cards', experience: 'cards', feature: 'free',
  highlights: 'content', about: 'content', credentials: 'content', results: 'content', headed: 'content', people: 'content',
}

/** One tidy layout of a card section: its height, rows, columns and card width. */
export type Level = { h: number; r: number; c: number; w: number }

const MIN_CARD = 96
const MAX_CARD = 300

/** The tidy layouts a card section can take at its current width, shortest first. */
export function cardLevels(sec: HTMLElement): Level[] {
  const grid = sec.querySelector<HTMLElement>('[data-card-grid]')
  const items = grid ? Array.from(grid.querySelectorAll<HTMLElement>(':scope > [data-item]')) : []
  const box = sec.querySelector<HTMLElement>('[data-fit-box]')
  if (!grid || !items.length || !box) return []
  const style = getComputedStyle(grid)
  const gx = parseFloat(style.columnGap) || 0, gy = parseFloat(style.rowGap) || 0
  const cover = items[0].querySelector<HTMLElement>('[data-cover]')
  const coverRect = cover?.getBoundingClientRect()
  if (!coverRect?.width) return []
  const aspect = coverRect.height / coverRect.width
  // Below the cover: the title and the lines under it, as tall as the tallest card has them.
  const caption = Math.max(...items.map((item) => {
    const one = item.getBoundingClientRect(), face = item.querySelector<HTMLElement>('[data-cover]')?.getBoundingClientRect()
    return face ? one.bottom - face.bottom : 0
  }))
  const secRect = sec.getBoundingClientRect(), gridRect = grid.getBoundingClientRect()
  const head = gridRect.top - secRect.top
  const tile = sec.querySelector<HTMLElement>('[data-tile]')
  const tileStyle = tile ? getComputedStyle(tile) : null
  const tail = tileStyle ? parseFloat(tileStyle.paddingBottom) + parseFloat(tileStyle.borderBottomWidth) : 0
  const width = grid.clientWidth, n = items.length
  const levels: Level[] = []
  const add = (r: number, c: number, w: number) => levels.push({ r, c, w, h: Math.round(head + r * (w * aspect + caption) + (r - 1) * gy + tail) })
  for (let c = 1; c <= Math.floor((width + gx) / (MIN_CARD + gx)); c++) {
    const w = (width - (c - 1) * gx) / c
    if (w > MAX_CARD) continue
    // Rows while the last one still has a card in it.
    for (let r = 1; (r - 1) * c < n; r++) add(r, c, w)
  }
  // Fewer cards than fill a row: they keep the biggest size and sit at the start.
  if (n < Math.ceil((width + gx) / (MAX_CARD + gx))) add(1, n, Math.min(MAX_CARD, (width - (n - 1) * gx) / n))
  levels.sort((a, b) => a.h - b.h || b.r * b.c - a.r * a.c)
  // Of layouts the same height, keep the one that shows the most.
  return levels.filter((level, k) => k === 0 || level.h - levels[k - 1].h > 6)
}

/** The tallest tidy layout no taller than h, or the shortest one when none is. */
export function levelFor(levels: Level[], h: number): Level | undefined {
  let best: Level | undefined
  for (const level of levels) if (level.h <= h + 1) best = level
  return best || levels[0]
}

/** Lay the cards out as one tidy level: its columns, and only the cards its rows hold. */
export function applyLevel(sec: HTMLElement, level?: Level) {
  const grid = sec.querySelector<HTMLElement>('[data-card-grid]')
  if (!grid) return
  const items = Array.from(grid.querySelectorAll<HTMLElement>(':scope > [data-item]'))
  if (!level) { grid.style.removeProperty('grid-template-columns'); items.forEach((item) => item.removeAttribute('data-fit-hidden')); return }
  grid.style.gridTemplateColumns = `repeat(${level.c}, ${level.w}px)`
  items.forEach((item, k) => { if (k >= level.r * level.c) item.setAttribute('data-fit-hidden', ''); else item.removeAttribute('data-fit-hidden') })
}

/** How tall the section is with all its content showing. */
export function naturalHeight(sec: HTMLElement): number {
  const was = sec.style.height
  const hidden = Array.from(sec.querySelectorAll<HTMLElement>('[data-fit-hidden]'))
  hidden.forEach((item) => item.removeAttribute('data-fit-hidden'))
  sec.style.height = 'auto'
  const h = sec.getBoundingClientRect().height
  sec.style.height = was
  hidden.forEach((item) => item.setAttribute('data-fit-hidden', ''))
  return Math.round(h)
}

/** The tallest a section can usefully be: every card at its tidiest, all of its content, or anything for the banner. */
export function capOf(sec: HTMLElement, sizing: Sizing, hi: number): number {
  if (sizing === 'free') return hi
  if (sizing === 'cards') { const levels = cardLevels(sec); return levels.length ? Math.min(hi, levels[levels.length - 1].h) : Math.min(hi, naturalHeight(sec)) }
  return Math.min(hi, naturalHeight(sec))
}

/** Snap a dragged height to the nearest tidy layout. */
export function snap(levels: Level[], h: number): number {
  if (!levels.length) return h
  return levels.reduce((best, level) => Math.abs(level.h - h) < Math.abs(best - h) ? level.h : best, levels[0].h)
}

// The least a section can be (FEED-63): below it something would overlap, inside the section or into the
// next one. A card section's shortest tidy layout; a text section's heading and first item; the banner's
// tallest slide, its words plus the picture's own floor when the picture sits above them, and never less than
// the slide's own min-height (a look can set one, like Volt's photo slides, whose words sit at its bottom).

/** A featured slide's picture never gets shorter than this when it sits above the words (FeatureSection). */
export const MEDIA_FLOOR = 140

export type Slide = { text: number; mediaAbove: boolean; least?: number }
export type FloorParts = { head: number; first: number; tail: number; smallest?: number; chrome: number; slides: Slide[] }

/** The least height from what was measured. */
export function floorFrom(sizing: Sizing, parts: FloorParts): number {
  if (sizing === 'cards' && parts.smallest) return Math.ceil(parts.smallest)
  if (sizing === 'free') return parts.slides.length ? Math.ceil(parts.chrome + Math.max(...parts.slides.map((slide) => Math.max(slide.least || 0, (slide.mediaAbove ? MEDIA_FLOOR : 0) + slide.text)))) : 0
  return Math.ceil(parts.head + parts.first + parts.tail)
}

/** How tall an element's own content is: its padding and the span of its children, whatever height it has. */
function contentHeight(el: HTMLElement): number {
  const style = getComputedStyle(el)
  const kids = Array.from(el.children).map((kid) => kid.getBoundingClientRect()).filter((rect) => rect.height > 0)
  const span = kids.length ? Math.max(...kids.map((rect) => rect.bottom)) - Math.min(...kids.map((rect) => rect.top)) : 0
  return span + (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0)
}

/** The least height a section can be before its content overlaps. */
export function floorOf(sec: HTMLElement, sizing: Sizing): number {
  const secRect = sec.getBoundingClientRect()
  const tile = sec.querySelector<HTMLElement>('[data-tile]')
  const tileStyle = tile ? getComputedStyle(tile) : null
  const tail = tileStyle ? (parseFloat(tileStyle.paddingBottom) || 0) + (parseFloat(tileStyle.borderBottomWidth) || 0) : 0
  const box = sec.querySelector<HTMLElement>('[data-fit-box]')
  const head = box ? box.getBoundingClientRect().top - secRect.top : 0
  const item = box?.querySelector<HTMLElement>('[data-item]')
  const first = item ? item.getBoundingClientRect().height : 0
  const frame = sec.querySelector<HTMLElement>('[data-feature-frame]')
  let chrome = 0
  const slides: Slide[] = []
  if (sizing === 'free' && frame) {
    const frameRect = frame.getBoundingClientRect(), nav = sec.querySelector<HTMLElement>('[data-feature-nav]')
    chrome = frameRect.top - secRect.top + frame.offsetHeight - frame.clientHeight + (nav ? nav.getBoundingClientRect().bottom - frameRect.bottom : 0)
    frame.querySelectorAll<HTMLElement>('[data-feature-slide]').forEach((slide) => {
      const text = slide.querySelector<HTMLElement>('[data-feature-text]'), media = slide.querySelector<HTMLElement>('[data-feature-media]')
      // A slide taller than the frame is cut at the bottom, where Volt puts the meta line and "See it" (FEED-63).
      const least = parseFloat(getComputedStyle(slide).minHeight) || 0
      if (!text || !media) { slides.push({ text: contentHeight(slide), mediaAbove: false, least }); return }
      slides.push({ text: contentHeight(text), mediaAbove: media.getBoundingClientRect().bottom <= text.getBoundingClientRect().top + 1, least })
    })
  }
  return floorFrom(sizing, { head, first, tail, smallest: sizing === 'cards' ? cardLevels(sec)[0]?.h : undefined, chrome, slides })
}
