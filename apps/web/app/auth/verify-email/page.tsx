import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { getAuthBrandingOrgSlug } from '@services/org/orgResolution'
import VerifyEmailClient from './verify-email'
import { Metadata } from 'next'
import OrgNotFound from '@components/Objects/StyledElements/Error/OrgNotFound'
import { Suspense } from 'react'
import PageLoading from '@components/Objects/Loaders/PageLoading'

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}): Promise<Metadata> {
  const { token } = await searchParams
  const orgslug = await getAuthBrandingOrgSlug(token)

  if (!orgslug) {
    return { title: 'Verify Email — Launch LMS' }
  }

  const org = await getOrganizationContextInfo(orgslug, {
    revalidate: 60,
    tags: ['organizations'],
  })

  return {
    title: 'Verify Email' + ` — ${org?.name || 'Launch LMS'}`,
    robots: { index: false, follow: false },
  }
}

const VerifyEmailPage = async ({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) => {
  const { token } = await searchParams
  const orgslug = await getAuthBrandingOrgSlug(token)

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
    <Suspense fallback={<PageLoading />}>
      <VerifyEmailClient org={org} />
    </Suspense>
  )
}

export default VerifyEmailPage
