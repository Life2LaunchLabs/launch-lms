export type HubNextAction = {
  kind: 'objective' | 'discover'
  title: string
  reason: string
  route: string
  tier: number
  plan_uuid?: string | null
  objective_uuid?: string | null
}

export const HUB_NEXT_ACTIONS_PATH = 'hub/next-actions'

// Only actions that point at the learner's own plan work count as "something actionable".
export const actionableHubActions = (actions: HubNextAction[] | undefined): HubNextAction[] =>
  (Array.isArray(actions) ? actions : []).filter((action) => action.kind === 'objective')
