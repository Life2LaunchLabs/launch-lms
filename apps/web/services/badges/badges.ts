import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import type { GoalIcon } from '@services/goals/types'

/** The Open Badges achievement types a badge can be. */
export const BADGE_KINDS = [
  { key: 'Badge', label: 'Badge', eyebrow: 'Badge' },
  { key: 'Award', label: 'Award', eyebrow: 'Award' },
  { key: 'Competency', label: 'Competency', eyebrow: 'Competency' },
  { key: 'CertificateOfCompletion', label: 'Certificate of completion', eyebrow: 'Certificate of completion' },
  { key: 'Certification', label: 'Certification', eyebrow: 'Certification' },
] as const
export type BadgeKind = (typeof BADGE_KINDS)[number]['key']
export const badgeKindLabel = (kind?: string | null) => BADGE_KINDS.find((item) => item.key === kind)?.label || 'Badge'

export const CERTIFICATE_STYLES = [
  { key: 'modern', label: 'Modern' },
  { key: 'classic', label: 'Classic' },
  { key: 'minimal', label: 'Minimal' },
] as const
export type CertificateStyle = (typeof CERTIFICATE_STYLES)[number]['key']

/** The ``badge`` block of a plan template document: what the plan doesn't already say about its badge. */
export interface TemplateBadge {
  kind: BadgeKind
  skills: string[]
  style: CertificateStyle
  /** Only when the badge is named differently from the plan. */
  name: string
  /** Only when the badge has its own image; otherwise the plan's. */
  image_url: string
  human_code: string
  field_of_study: string
  specialization: string
  credits_available: number | null
  in_language: string
}

export const emptyTemplateBadge = (): TemplateBadge => ({
  kind: 'Badge', skills: [], style: 'modern', name: '', image_url: '',
  human_code: '', field_of_study: '', specialization: '', credits_available: null, in_language: '',
})

export interface BadgeOrg { id: number; org_uuid?: string; slug: string; name: string; logo_image?: string | null }

/** A badge as the plan earns it: the block with the plan's details filled in. */
export interface Achievement {
  template_uuid: string
  name: string
  description: string
  image_url: string
  icon?: GoalIcon | null
  color?: string | null
  kind: BadgeKind
  skills: string[]
  style: CertificateStyle
  criteria_narrative: string
  alignment: { node_uuid: string; name: string; code?: string; framework?: string; description?: string }[]
  creator: BadgeOrg | null
  version: string | null
  human_code?: string
  field_of_study?: string
  specialization?: string
  credits_available?: number | null
  in_language?: string
}

/** The short form plan cards carry. */
export interface BadgeSummary { template_uuid: string; name: string; kind: BadgeKind; image_url: string; skills: string[]; icon?: GoalIcon | null; color?: string | null }

export interface BadgeAward {
  award_uuid: string
  template_uuid: string | null
  semver: string | null
  source: 'plan_completion' | 'direct_award'
  earned_on: string
  issued_at: string
  achievement: Achievement
  statement: string
  evidence_url: string
  awarded_by: { id: number; name: string } | null
  learner: { id: number; user_uuid: string; username: string; name: string } | null
  issuing_org: BadgeOrg | null
  status: 'active' | 'revoked'
  revoked_at: string | null
  revoked_reason: string
  /** Issued as a signed credential (older awards are signed the first time they're asked for). */
  signed: boolean
}

/** The server's check of an award: its proof against the issuer's published key, and its revocation status. */
export interface AwardCheck { verified: boolean; proof: boolean; revoked: boolean }

async function request(path: string, token?: string, next?: any, method = 'GET', body: any = null) {
  const response = await fetch(`${getAPIUrl()}badge-awards/${path}`, RequestBodyWithAuthHeader(method, body, next ?? null, token))
  return errorHandling(response)
}

/** A plan whose badge an organization may award directly: its own, or one it is approved to run. */
export interface AwardablePlan extends BadgeSummary { style: CertificateStyle; description: string; title: string; thumbnail_image: string; steps: number; owned: boolean; owner: { name: string; slug: string } | null }

/** Someone a direct award reaches, or skips because they hold the badge already. */
export interface AwardPerson { user_id: number; name: string; username: string; avatar_image?: string | null; user_uuid?: string; reason?: 'already_has_badge' }

export interface DirectAwardRequest {
  template_uuid: string
  user_ids: number[]
  group_ids: number[]
  statement: string
  evidence_url: string
  earned_on: string | null
  /** A line for one learner, after the statement on their badge only. */
  notes: Record<number, string>
  confirmed: boolean
}

const orgQuery = (orgId: number, extra = '') => `?org_id=${orgId}${extra}`

export const badgeAwardKeys = {
  awardable: (orgId: number) => `${getAPIUrl()}badge-awards/awardable${orgQuery(orgId)}`,
  holders: (orgId: number, templateUuid: string) => `${getAPIUrl()}badge-awards/holders${orgQuery(orgId, `&template_uuid=${encodeURIComponent(templateUuid)}`)}`,
  learner: (orgId: number, userId: number) => `${getAPIUrl()}badge-awards/learner/${userId}${orgQuery(orgId)}`,
}

/** Badge awards: the learner's own, one award as its public page shows it, its Open Badges JSON, and awarding directly. */
export const badgeAwardsApi = {
  mine: (token: string): Promise<BadgeAward[]> => request('', token),
  award: (awardUuid: string, token?: string, next?: any): Promise<BadgeAward> => request(encodeURIComponent(awardUuid), token, next),
  verify: (awardUuid: string, next?: any): Promise<AwardCheck> => request(`${encodeURIComponent(awardUuid)}/verify`, undefined, next),
  revoke: (awardUuid: string, reason: string, token?: string): Promise<BadgeAward> => request(`${encodeURIComponent(awardUuid)}/revoke`, token, undefined, 'POST', { reason }),
  credentialUrl: (awardUuid: string) => `${getAPIUrl()}badge-awards/${encodeURIComponent(awardUuid)}/credential`,
  awardable: (orgId: number, token?: string): Promise<AwardablePlan[]> => request(`awardable${orgQuery(orgId)}`, token),
  holders: (orgId: number, templateUuid: string, token?: string): Promise<number[]> => request(`holders${orgQuery(orgId, `&template_uuid=${encodeURIComponent(templateUuid)}`)}`, token),
  learner: (orgId: number, userId: number, token?: string): Promise<{ awards: BadgeAward[]; can_award: boolean }> => request(`learner/${userId}${orgQuery(orgId)}`, token),
  preview: (orgId: number, body: DirectAwardRequest, token?: string): Promise<{ learners: AwardPerson[]; skipped: AwardPerson[] }> => request(`direct/preview${orgQuery(orgId)}`, token, undefined, 'POST', body),
  awardDirectly: (orgId: number, body: DirectAwardRequest, token?: string): Promise<{ awarded: BadgeAward[]; skipped: AwardPerson[] }> => request(`direct${orgQuery(orgId)}`, token, undefined, 'POST', body),
}
