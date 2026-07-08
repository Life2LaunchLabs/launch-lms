import { Metadata } from 'next'
import { Suspense } from 'react'
import PageLoading from '@components/Objects/Loaders/PageLoading'
import OrgNotFound from '@components/Objects/StyledElements/Error/OrgNotFound'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { getAuthBrandingOrgSlug } from '@services/org/orgResolution'
import CreateOrgWizard from '../CreateOrgWizard'

export async function generateMetadata(): Promise<Metadata> {
  const orgslug = await getAuthBrandingOrgSlug()

  if (!orgslug) {
    return { title: 'Create an organization — Launch LMS' }
  }

  const org = await getOrganizationContextInfo(orgslug, {
    revalidate: 60,
    tags: ['organizations'],
  })

  return {
    title: `Create an organization — ${org?.name || 'Launch LMS'}`,
    robots: { index: false, follow: false },
  }
}

export default async function OrgSignupPage() {
  const orgslug = await getAuthBrandingOrgSlug()

  if (!orgslug) {
    return <OrgNotFound />
  }

  const org = await getOrganizationContextInfo(orgslug, {
    revalidate: 60,
    tags: ['organizations'],
  })

  if (!org) {
    return <OrgNotFound />
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-8">
      <Suspense fallback={<PageLoading />}>
        <CreateOrgWizard ownerOrg={org} />
      </Suspense>
    </div>
  )
}
