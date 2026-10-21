import type { Metadata } from 'next'
import { GuestHeader } from '@components/Objects/Menus/GuestHeader'
import OrganizationsLanding, { DEFAULT_TIER_FACTS, type TierFacts } from '@components/Landings/OrganizationsLanding'
import { getAccessCatalog } from '@services/plans/access'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { getOrganizationContextInfo } from '@services/organizations/orgs'

type PageProps = { params: Promise<{ orgslug: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { orgslug } = await params
  const org = await getOrganizationContextInfo(orgslug, { revalidate: 60, tags: ['organizations'] })
  return {
    title: `For organizations${org?.name ? ` — ${org.name}` : ''}`,
    description: 'Hand out plans, review learners’ work in one place, and show which requirements they’ve met.',
  }
}

/** Free's and Full's limits and the trial length from the API's catalog, so the page can't drift from what orgs get. */
async function tierFacts(): Promise<TierFacts> {
  try {
    const catalog = await getAccessCatalog()
    const limits = (key: string, fallback: TierFacts['free']) => ({ ...fallback, ...catalog.tiers.find((tier) => tier.key === key)?.limits })
    return { free: limits('free', DEFAULT_TIER_FACTS.free), full: limits('full', DEFAULT_TIER_FACTS.full), trialDays: catalog.trial?.days ?? DEFAULT_TIER_FACTS.trialDays }
  } catch {
    return DEFAULT_TIER_FACTS
  }
}

/** The organizations side of the landing, in this org's colors and logo, for signed-in and signed-out visitors alike. */
export default async function ForOrganizationsPage({ params }: PageProps) {
  const { orgslug } = await params
  const tiers = await tierFacts()
  return (
    <div className="min-h-screen bg-white">
      <div className="sticky top-0 print:hidden" style={{ zIndex: 'var(--z-nav)' }}>
        <GuestHeader orgslug={orgslug} />
      </div>
      <OrganizationsLanding links={{
        createOrg: getUriWithOrg(orgslug, routePaths.auth.orgSignup()),
        learnerHome: getUriWithOrg(orgslug, routePaths.org.root()),
        login: getUriWithOrg(orgslug, routePaths.auth.login()),
      }} tiers={tiers} />
    </div>
  )
}
