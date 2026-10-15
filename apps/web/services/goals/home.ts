import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import { goalsUrl } from './goals'
import type { LockReason, NodeState, StepResult, StepStatus, StepTypeKey } from './types'

const q = encodeURIComponent

async function request<T = any>(url: string, token?: string, method = 'GET', body: any = null): Promise<T> {
  const response = await fetch(url, RequestBodyWithAuthHeader(method, body, null, token))
  return errorHandling(response)
}

export type GoalRef = { goal_uuid: string; title: string }

/** A step as This week shows it: enough for its node, its row and where it opens. */
export interface HomeItem {
  step_uuid: string
  goal: GoalRef
  stage: { stage_uuid: string; title: string } | null
  type: StepTypeKey
  title: string
  description: string
  status: StepStatus
  state: NodeState
  fraction: number
  result: StepResult | null
  due_date: string | null
  completed_at: string | null
  locked: boolean
  locked_reason: LockReason | null
  route: string
  placement: 'week' | 'next_week' | 'month' | 'later'
}

export interface HomeGoal {
  goal_uuid: string
  title: string
  description: string
  priority: number | null
  step_order: string
  ownership: string
  source: string
  organization: { id: number; name: string; slug: string } | null
  step_count: number
  completed_step_count: number
  progress_percent: number
  route: string
  creation_date: string
}

export interface HomeWeek {
  start: string
  end: string
  target: number
  boosts: number
  /** The target next week is planned with; changing it never reshapes this week. */
  next_target: number
  /** Whether this week has been planned; until it has, a new target applies right away. */
  planned: boolean
  done_count: number
  total: number
  complete: boolean
  can_boost: boolean
  items: HomeItem[]
  /** Goals started after this week was planned, with how many steps pulling them in adds. */
  new_goals: Array<{ goal: GoalRef; steps: number }>
}

/** This week across the learner's goals, then next week, the months ahead and later. */
export interface GoalsHomePayload {
  today: string
  week: HomeWeek
  next_week: { start: string; end: string; items: HomeItem[] }
  months: Array<{ key: string; label: string; items: HomeItem[] }>
  later: Array<{ goal: GoalRef; items: HomeItem[] }>
  goals: HomeGoal[]
  /** Finished goals that haven't greeted their learner yet. */
  celebrations: string[]
}

export const homeUrl = (path = '') => goalsUrl(`/home${path}`)

export const goalsHomeApi = {
  get: (token?: string) => request<GoalsHomePayload>(homeUrl(), token),
  readyForMore: (token?: string) => request<GoalsHomePayload>(homeUrl('/more'), token, 'POST'),
  setPace: (target: number, token?: string) => request<GoalsHomePayload>(homeUrl('/pace'), token, 'PUT', { target }),
  pullInGoal: (goalUuid: string, token?: string) => request<GoalsHomePayload>(homeUrl(`/goals/${q(goalUuid)}/pull`), token, 'POST'),
}
