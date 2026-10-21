export type HubNextAction = {
  kind: 'step' | 'coach_note' | 'discover'
  title: string
  reason: string
  route: string
  tier: number
  goal_uuid?: string | null
  step_uuid?: string | null
  note_uuid?: string | null
}

export const HUB_NEXT_ACTIONS_PATH = 'hub/next-actions'

// Only actions on the learner's own goals (a step, or Coach's note) count as "something actionable".
export const actionableHubActions = (actions: HubNextAction[] | undefined): HubNextAction[] =>
  (Array.isArray(actions) ? actions : []).filter((action) => (action.kind === 'step' || action.kind === 'coach_note') && Boolean(action.goal_uuid))

/** Where a next action opens: a goal step or note on the goal's page, anything else at its own route. */
export const hubActionHref = (action: HubNextAction) =>
  action.kind !== 'discover' && action.goal_uuid
    ? `/plans/${encodeURIComponent(action.goal_uuid)}${action.step_uuid ? `?step=${encodeURIComponent(action.step_uuid)}` : ''}`
    : action.route
