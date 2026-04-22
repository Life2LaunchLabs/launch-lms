export const ROUTING_COOKIES = {
  orgSlug: 'launchlms_orgslug',
  legacyOrgSlug: 'launchlms_current_orgslug',
  customDomain: 'launchlms_custom_domain',
  frontendDomain: 'launchlms_frontend_domain',
  topDomain: 'launchlms_top_domain',
  defaultOrg: 'launchlms_default_org',
  multiOrg: 'launchlms_multi_org',
} as const

export function getCanonicalOrgSlug(
  orgSlug?: string | null,
  legacyOrgSlug?: string | null
): string | null {
  return orgSlug || legacyOrgSlug || null
}

export function getScopedCookieDomain(topDomain: string): string {
  return topDomain === 'localhost' ? '' : `.${topDomain}`
}
