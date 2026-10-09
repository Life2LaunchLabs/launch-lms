export type EditableFieldValue = string | number | boolean | null

export type EditableFieldState = {
  saved: EditableFieldValue
  current: EditableFieldValue
  proposal?: EditableFieldValue
  interaction: 'idle' | 'user' | 'agent'
  reservationId?: string
  presentation: 'settled' | 'preparing' | 'proposed' | 'customized'
}

export type ObjectEditState = Record<string, EditableFieldState>
export type FieldReviewOutcome = 'accepted' | 'customized' | 'rejected' | 'entered'

type RecoverableNewPlanRun = {
  status: string
  scope: { kind: string }
  objects: Array<{ object_key: string; status: string }>
  events: Array<{ sequence: number; kind: string }>
}

export function shouldOpenHubNewPlanEditor(run: RecoverableNewPlanRun | null | undefined) {
  if (!run || run.status !== 'active' || run.scope.kind !== 'new_plan') return false
  const object = run.objects.find((item) => item.object_key === 'new-plan')
  if (!object || object.status === 'editing') return true
  const lastProposal = Math.max(0, ...run.events.filter((event) => event.kind === 'plan.proposed').map((event) => event.sequence))
  const lastDecision = Math.max(0, ...run.events.filter((event) => event.kind === 'plan.cancelled' || event.kind === 'plan.saved' || event.kind === 'plan.created').map((event) => event.sequence))
  return lastProposal > lastDecision
}

export function createObjectEditState(values: Record<string, EditableFieldValue>): ObjectEditState {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, {
    saved: value, current: value, interaction: 'idle', presentation: 'settled',
  }]))
}

export function recoverObjectEditState(
  savedValues: Record<string, EditableFieldValue>,
  currentValues: Record<string, EditableFieldValue>,
  proposalValues: Record<string, EditableFieldValue> = {},
): ObjectEditState {
  return Object.fromEntries(Object.keys(savedValues).map((key) => {
    const saved = savedValues[key]
    const current = currentValues[key] ?? saved
    const hasProposal = Object.prototype.hasOwnProperty.call(proposalValues, key)
    const proposal = proposalValues[key]
    return [key, {
      saved,
      current,
      ...(hasProposal ? { proposal } : {}),
      interaction: 'idle',
      presentation: hasProposal ? (current === proposal ? 'proposed' : 'customized') : 'settled',
    }]
  }))
}

export function summarizeObjectReview(state: ObjectEditState): Record<string, FieldReviewOutcome> {
  return Object.fromEntries(Object.entries(state).map(([field, item]) => {
    if (item.proposal === undefined) return [field, 'entered']
    if (item.current === item.proposal) return [field, 'accepted']
    if (item.current === item.saved) return [field, 'rejected']
    return [field, 'customized']
  }))
}

export function beginUserFieldInteraction(state: ObjectEditState, field: string): ObjectEditState {
  const current = state[field]
  if (!current || current.interaction === 'agent') return state
  return { ...state, [field]: { ...current, interaction: 'user', reservationId: undefined } }
}

export function updateUserField(state: ObjectEditState, field: string, value: EditableFieldValue): ObjectEditState {
  const current = state[field]
  if (!current || current.interaction === 'agent') return state
  return { ...state, [field]: {
    ...current,
    current: value,
    interaction: 'user',
    presentation: current.proposal !== undefined && value !== current.proposal ? 'customized' : current.proposal !== undefined ? 'proposed' : 'settled',
  } }
}

export function endUserFieldInteraction(state: ObjectEditState, field: string): ObjectEditState {
  const current = state[field]
  if (!current || current.interaction !== 'user') return state
  return { ...state, [field]: { ...current, interaction: 'idle' } }
}

export function reserveAgentField(state: ObjectEditState, field: string, reservationId: string): { state: ObjectEditState; accepted: boolean; reason?: 'user-active' | 'user-dirty' | 'agent-active' | 'unknown-field' } {
  const current = state[field]
  if (!current) return { state, accepted: false, reason: 'unknown-field' }
  if (current.interaction === 'user') return { state, accepted: false, reason: 'user-active' }
  if (current.interaction === 'agent') return { state, accepted: false, reason: 'agent-active' }
  if (current.current !== current.saved && current.proposal === undefined) return { state, accepted: false, reason: 'user-dirty' }
  return {
    accepted: true,
    state: { ...state, [field]: { ...current, interaction: 'agent', reservationId, presentation: 'preparing' } },
  }
}

export function applyAgentFieldProposal(state: ObjectEditState, field: string, reservationId: string, value: EditableFieldValue): ObjectEditState {
  const current = state[field]
  if (!current || current.interaction !== 'agent' || current.reservationId !== reservationId) return state
  return { ...state, [field]: {
    ...current,
    current: value,
    proposal: value,
    interaction: 'idle',
    reservationId: undefined,
    presentation: 'proposed',
  } }
}

export function releaseAgentField(state: ObjectEditState, field: string, reservationId: string): ObjectEditState {
  const current = state[field]
  if (!current || current.interaction !== 'agent' || current.reservationId !== reservationId) return state
  return { ...state, [field]: { ...current, interaction: 'idle', reservationId: undefined, presentation: current.proposal === undefined ? 'settled' : 'proposed' } }
}

export function restoreAgentProposal(state: ObjectEditState, field: string): ObjectEditState {
  const current = state[field]
  if (!current || current.proposal === undefined || current.interaction === 'agent') return state
  return { ...state, [field]: { ...current, current: current.proposal, presentation: 'proposed' } }
}

export function cancelObjectEdits(state: ObjectEditState): ObjectEditState {
  return Object.fromEntries(Object.entries(state).map(([key, field]) => [key, {
    saved: field.saved, current: field.saved, interaction: 'idle', presentation: 'settled',
  }]))
}
