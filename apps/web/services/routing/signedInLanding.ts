/**
 * Where someone lands right after signing in (/redirect_from_auth).
 *
 * Signing in on an organization's own address (its subdomain) opens that organization's admin
 * when they're its staff or admin: that's the address they were invited to and work in. Otherwise
 * the remembered side (admin of the last org, or the learner side) decides, as before.
 */
export interface SignedInLandingInput {
  /** The organization of the address they signed in on; null on the main site. */
  hostOrgSlug: string | null
  /** Organizations where they're staff or admin. */
  staffOrgSlugs: string[]
  preference: { side?: string; orgslug?: string }
  ownerOrgSlug: string
}

export function signedInLanding(input: SignedInLandingInput): { orgslug: string; side: 'admin' | 'learner' } {
  const { hostOrgSlug, staffOrgSlugs, preference, ownerOrgSlug } = input
  if (hostOrgSlug && hostOrgSlug !== ownerOrgSlug && staffOrgSlugs.includes(hostOrgSlug)) {
    return { orgslug: hostOrgSlug, side: 'admin' }
  }
  if (preference.side === 'admin' && staffOrgSlugs.length) {
    const remembered = staffOrgSlugs.find((slug) => slug === preference.orgslug)
    return { orgslug: remembered || staffOrgSlugs[0], side: 'admin' }
  }
  return { orgslug: preference.orgslug || ownerOrgSlug, side: 'learner' }
}
