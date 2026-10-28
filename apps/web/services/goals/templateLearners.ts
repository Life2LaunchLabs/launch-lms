import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import type { BadgeSummary } from '@services/badges/badges'
import { templateUrl } from './templates'

/** Who may start a plan in the organization running it: anyone (open), by request, or only learners the team adds. */
export type LearnerAccess = 'open' | 'request' | 'invite'

export const LEARNER_ACCESS_OPTIONS: Array<{ value: LearnerAccess; label: string; description: string }> = [
  { value: 'open', label: 'Open to everyone', description: 'Any learner can find it on Discover and start right away.' },
  { value: 'request', label: 'By request', description: 'Learners find it on Discover, ask to join, and your team accepts them.' },
  { value: 'invite', label: 'Invite only', description: 'Not on Discover: only learners your team assigns get it.' },
]

export const learnerAccessLabel = (access?: string) => LEARNER_ACCESS_OPTIONS.find((option) => option.value === access)?.label || 'Invite only'

/** A plan's learner setting in this organization, and the badge its live release earns. */
export interface TemplateLearners {
  template_uuid: string
  access: LearnerAccess
  can_edit: boolean
  owned: boolean
  badge: BadgeSummary | null
  /** Finishing it here earns the badge (the organization owns the plan or runs it with permission). */
  earns_badge: boolean
}

const learnersUrl = (orgId: number, templateUuid: string) => `${templateUrl(templateUuid, '/learners')}?org_id=${orgId}`

async function request<T>(url: string, token?: string, method = 'GET', body: any = null): Promise<T> {
  return errorHandling(await fetch(url, RequestBodyWithAuthHeader(method, body, null, token)))
}

export const templateLearnersKey = (orgId: number, templateUuid: string) => learnersUrl(orgId, templateUuid)

export const templateLearnersApi = {
  get: (orgId: number, templateUuid: string, token?: string) => request<TemplateLearners>(learnersUrl(orgId, templateUuid), token),
  set: (orgId: number, templateUuid: string, access: LearnerAccess, token?: string) => request<TemplateLearners>(learnersUrl(orgId, templateUuid), token, 'PUT', { access }),
}
