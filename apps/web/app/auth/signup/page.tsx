import { Metadata } from 'next'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { getAuthBrandingOrgSlug } from '@services/org/orgResolution'
import SignUpClient from './signup'
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { routePaths } from '@services/config/config'
import PageLoading from '@components/Objects/Loaders/PageLoading'
import OrgNotFound from '@components/Objects/StyledElements/Error/OrgNotFound'

export async function generateMetadata(): Promise<Metadata> {
  const orgslug = await getAuthBrandingOrgSlug()

  if (!orgslug) {
    return { title: 'Sign up — Launch LMS' }
  }

  const org = await getOrganizationContextInfo(orgslug, {
    revalidate: 60,
    tags: ['organizations'],
  })

  return {
    title: 'Sign up' + ` — ${org?.name || 'Launch LMS'}`,
    robots: { index: false, follow: false },
  }
}

const SignUp = async ({ searchParams }: { searchParams: Promise<{ mode?: string }> }) => {
  // Making an organization moved to /start.
  if ((await searchParams).mode === 'create-org') redirect(routePaths.auth.orgSignup())
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
    <>
      <Suspense fallback={<PageLoading />}>
        <SignUpClient org={org} />
      </Suspense>
    </>
  )
}

export default SignUp
