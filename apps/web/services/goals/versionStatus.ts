// Where an assignment's template version stands; pure, so it runs under the unit tests.

/** The badge an assignment earns and which template versions its owner accepts (apps/api/src/services/goals/badge_authority.py). */
export interface AssignmentBadge {
  badge_uuid: string
  name: string
  thumbnail_image: string
  owner_org: { id: number; name: string; slug: string } | null
  rule?: EligibilityRule
  from_version?: number | null
}

export type EligibilityRule = 'any' | 'latest' | 'from'

/** Where an assignment's version stands; every assignment summary carries these. */
export interface AssignmentVersionStatus {
  version: number | null
  version_uuid?: string | null
  latest_version?: number | null
  latest_version_uuid?: string | null
  update_available?: boolean
  badge?: AssignmentBadge | null
  version_eligible?: boolean | null
}

/** Is there something an admin should decide about this assignment's version? */
export const needsVersionDecision = (assignment: AssignmentVersionStatus & { status?: string }) =>
  assignment.status !== 'ended' && (!!assignment.update_available || assignment.version_eligible === false)

/** How a badge owner's version rule reads to people. */
export function eligibilityLabel(rule?: EligibilityRule, fromVersion?: number | null) {
  if (rule === 'latest') return 'Only the newest version earns the badge'
  if (rule === 'from' && fromVersion) return `Version ${fromVersion} and later earn the badge`
  return 'Every version earns the badge'
}
