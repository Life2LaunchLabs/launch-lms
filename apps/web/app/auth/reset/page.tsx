import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { getAuthBrandingOrgSlug } from '@services/org/orgResolution'
import ResetPasswordClient from './reset'
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
    return { title: 'Reset Password — Launch LMS' }
  }

  const org = await getOrganizationContextInfo(orgslug, {
    revalidate: 60,
    tags: ['organizations'],
  })

  return {
    title: 'Reset Password' + ` — ${org?.name || 'Launch LMS'}`,
    robots: { index: false, follow: false },
  }
}

const ResetPasswordPage = async ({
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
      <ResetPasswordClient org={org} />
    </Suspense>
  )
}

export default ResetPasswordPage
