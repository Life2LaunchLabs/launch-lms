import type { Metadata } from 'next'
import { GuestHeader } from '@components/Objects/Menus/GuestHeader'
import OrganizationsLanding from '@components/Landings/OrganizationsLanding'
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

/** The organizations side of the landing, in this org's colors and logo, for signed-in and signed-out visitors alike. */
export default async function ForOrganizationsPage({ params }: PageProps) {
  const { orgslug } = await params
  return (
    <div className="min-h-screen bg-white">
      <div className="sticky top-0 print:hidden" style={{ zIndex: 'var(--z-nav)' }}>
        <GuestHeader orgslug={orgslug} />
      </div>
      <OrganizationsLanding links={{
        createOrg: getUriWithOrg(orgslug, routePaths.auth.orgSignup()),
        learnerHome: getUriWithOrg(orgslug, routePaths.org.root()),
        login: getUriWithOrg(orgslug, routePaths.auth.login()),
      }} />
    </div>
  )
}
