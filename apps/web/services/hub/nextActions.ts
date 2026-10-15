export type HubNextAction = {
  kind: 'step' | 'discover'
  title: string
  reason: string
  route: string
  tier: number
  goal_uuid?: string | null
  step_uuid?: string | null
}

export const HUB_NEXT_ACTIONS_PATH = 'hub/next-actions'

// Only actions that point at a step in the learner's own goals count as "something actionable".
export const actionableHubActions = (actions: HubNextAction[] | undefined): HubNextAction[] =>
  (Array.isArray(actions) ? actions : []).filter((action) => action.kind === 'step' && Boolean(action.goal_uuid))

/** Where a next action opens: a goal step on the goal's page, anything else at its own route. */
export const hubActionHref = (action: HubNextAction) =>
  action.kind === 'step' && action.goal_uuid
    ? `/plans/${encodeURIComponent(action.goal_uuid)}${action.step_uuid ? `?step=${encodeURIComponent(action.step_uuid)}` : ''}`
    : action.route
