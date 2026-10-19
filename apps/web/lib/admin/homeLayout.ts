import type { HomeLayout, HomeWidgetId } from '../../services/goals/adminHome.ts'

export type ArrangedWidget = { id: HomeWidgetId; hidden: boolean }

/** The viewer's widgets in their own order (ones they never placed go last), each marked hidden or not. */
export function arrangeWidgets(available: HomeWidgetId[], layout?: Partial<HomeLayout> | null): ArrangedWidget[] {
  const order = (layout?.order || []).filter((id) => available.includes(id))
  const placed = [...new Set(order), ...available.filter((id) => !order.includes(id))]
  const hidden = new Set(layout?.hidden || [])
  return placed.map((id) => ({ id, hidden: hidden.has(id) }))
}

/** Moves a widget one place up (-1) or down (+1) among the given ones; at either end nothing moves. */
export function moveWidget(arranged: ArrangedWidget[], id: HomeWidgetId, step: -1 | 1): ArrangedWidget[] {
  const from = arranged.findIndex((item) => item.id === id)
  const to = from + step
  if (from < 0 || to < 0 || to >= arranged.length) return arranged
  const next = [...arranged]
  ;[next[from], next[to]] = [next[to], next[from]]
  return next
}

export function toggleWidget(arranged: ArrangedWidget[], id: HomeWidgetId): ArrangedWidget[] {
  return arranged.map((item) => (item.id === id ? { ...item, hidden: !item.hidden } : item))
}

/**
 * The layout to save: the arranged widgets first, then any the saved layout placed that this
 * viewer doesn't get right now (so they keep their place if they come back).
 */
export function layoutOf(arranged: ArrangedWidget[], previous?: Partial<HomeLayout> | null): HomeLayout {
  const shown = new Set(arranged.map((item) => item.id))
  const elsewhere = (previous?.order || []).filter((id) => !shown.has(id))
  const hiddenElsewhere = (previous?.hidden || []).filter((id) => !shown.has(id))
  return { order: [...arranged.map((item) => item.id), ...elsewhere], hidden: [...arranged.filter((item) => item.hidden).map((item) => item.id), ...hiddenElsewhere] }
}
