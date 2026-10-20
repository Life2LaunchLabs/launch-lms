import { getAPIUrl } from '@services/config/config'
import type { Tier } from '@services/plans/plans'

export type LimitUsage = {
  usage: number
  limit: number | 'unlimited'
  remaining: number | 'unlimited'
  limit_reached: boolean
}

export type OrgUsage = {
  org_id: number
  tier: Tier
  limits: { learners: LimitUsage; staff_seats: LimitUsage }
}

export type AccessCatalog = {
  tiers: { key: Tier; label: string; limits: Record<string, number>; features: string[] }[]
  limit_labels: Record<string, string>
  features: { key: string; label: string; tier: Tier | null; partner: string | null; on_request: boolean }[]
  partner_programs: { key: string; label: string; description: string }[]
}

/** Active learners and staff seats against the org's limits. */
export async function getOrgUsage(orgId: number, accessToken: string): Promise<OrgUsage> {
  const res = await fetch(`${getAPIUrl()}orgs/${orgId}/usage`, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) throw new Error('Failed to load usage')
  return res.json()
}

/** The public catalog: each tier's limits and features, and the partner programs. */
export async function getAccessCatalog(): Promise<AccessCatalog> {
  const res = await fetch(`${getAPIUrl()}plans`)
  if (!res.ok) throw new Error('Failed to load tiers')
  return res.json()
}
