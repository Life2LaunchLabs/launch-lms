import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import type { LearnerAccess } from '@services/learning/marketplace'
import { templateUrl } from './templates'
import type { EligibilityRule } from './versions'

/** An organization offering a badge's plan to learners, and how. */
export interface PlanOffer {
  org: { id: number; name: string; slug: string; logo_image?: string | null; org_uuid?: string }
  access: LearnerAccess
  is_creator: boolean
}

/** A badge a template earns: one of the badge's ways to earn it. */
export interface TemplateEarnedBadge {
  badge_uuid: string
  name: string
  thumbnail_image: string
  owner_org: { id: number; name: string; slug: string } | null
  badge_version: string | null
  status: string
  route_uuid: string
  recommended: boolean
  eligible_versions: { rule: EligibilityRule; from_version: number | null }
  trusted_only: boolean
  partners: Array<{ id: number; name: string; slug: string }>
  /** Finishing this plan here earns the badge (this organization may run this way to earn it). */
  earns_here: boolean
  offered_by: PlanOffer[]
}

/** A template's badge side and who may start it in this organization. */
export interface TemplateLearners {
  template_uuid: string
  access: LearnerAccess
  can_edit: boolean
  owned: boolean
  earns_badge: boolean
  badges: TemplateEarnedBadge[]
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
