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
}

async function request(path: string, token?: string, next?: any) {
  const response = await fetch(`${getAPIUrl()}badge-awards/${path}`, RequestBodyWithAuthHeader('GET', null, next ?? null, token))
  return errorHandling(response)
}

/** Badge awards: the learner's own, one award as its public page shows it, and its Open Badges JSON. */
export const badgeAwardsApi = {
  mine: (token: string): Promise<BadgeAward[]> => request('', token),
  award: (awardUuid: string, token?: string, next?: any): Promise<BadgeAward> => request(encodeURIComponent(awardUuid), token, next),
  credentialUrl: (awardUuid: string) => `${getAPIUrl()}badge-awards/${encodeURIComponent(awardUuid)}/credential`,
}
