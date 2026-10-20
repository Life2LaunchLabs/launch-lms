import type { PlansTabId } from '../../services/routing/paths.ts'
import { arrangeWidgets, moveWidget } from './homeLayout.ts'

export type { PlansTabId }

/** The Plans tabs in the order most orgs start with (the API's PLANS_TABS). */
export const PLANS_TAB_IDS: readonly PlansTabId[] = ['assignments', 'templates', 'badges', 'requirements', 'marketplace']

export function isPlansTab(id: unknown): id is PlansTabId {
  return typeof id === 'string' && (PLANS_TAB_IDS as readonly string[]).includes(id)
}

/**
 * The viewer's tab order: their saved order (unknown or repeated ids dropped), then any tab they
 * never placed, in the org's default order. Same rules as the Home widgets.
 */
export function arrangePlansTabs(saved?: readonly string[] | null, fallback: readonly PlansTabId[] = PLANS_TAB_IDS): PlansTabId[] {
  const defaults = [...fallback.filter(isPlansTab), ...PLANS_TAB_IDS.filter((id) => !fallback.includes(id))]
  return arrangeWidgets(defaults, { order: (saved || []).filter(isPlansTab) }).map((item) => item.id)
}

/** Moves a tab one place earlier (-1) or later (+1); at either end nothing moves. */
export function movePlansTab(order: readonly PlansTabId[], id: PlansTabId, step: -1 | 1): PlansTabId[] {
  return moveWidget(order.map((tab) => ({ id: tab, hidden: false })), id, step).map((item) => item.id)
}
