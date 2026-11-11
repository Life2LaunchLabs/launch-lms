import type { HubCoachState } from './HubContext'

/**
 * Below this width the page pane counts as a tablet (Tailwind's `lg`): with Coach open beside
 * it, the sidebar drops to the rail there. Wider panes keep the sidebar as the learner left it.
 */
export const PANE_TABLET_MAX = 1023

/** Whether the sidebar should be forced to the rail, given Coach's state and the page pane's measured width. */
export function navCompactBesideCoach(state: HubCoachState | undefined, paneWidth: number | null): boolean {
  if (state !== 'open') return false
  // Before the pane is measured, keep the sidebar as it is rather than flashing the rail.
  if (paneWidth === null) return false
  return paneWidth <= PANE_TABLET_MAX
}

/** On a phone Coach covers the page, so going somewhere else from the tab bar puts it back to show where you went. */
export function tuckOnNavigation({ phone, state, from, to }: { phone: boolean; state: HubCoachState; from: string | null; to: string | null }): boolean {
  return phone && state === 'open' && from !== null && from !== to
}
