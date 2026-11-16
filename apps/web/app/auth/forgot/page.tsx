import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { getAuthBrandingOrgSlug } from '@services/org/orgResolution'
import ForgotPasswordClient from './forgot'
import { Metadata } from 'next'
import OrgNotFound from '@components/Objects/StyledElements/Error/OrgNotFound'

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ set?: string }> }): Promise<Metadata> {
  const orgslug = await getAuthBrandingOrgSlug()
  const heading = (await searchParams).set === '1' ? 'Set a password' : 'Forgot Password'

  if (!orgslug) {
    return { title: `${heading} — Life2Launch` }
  }

  const org = await getOrganizationContextInfo(orgslug, {
    revalidate: 60,
    tags: ['organizations'],
  })

  return {
    title: `${heading} — ${org?.name || 'Life2Launch'}`,
    robots: { index: false, follow: false },
  }
}

// "Set a password" links (?set=1) open this page for someone who never had one (DEV-42, FEED-292).
const ForgotPasswordPage = async ({ searchParams }: { searchParams: Promise<{ set?: string }> }) => {
  const { set } = await searchParams
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

  return <ForgotPasswordClient org={org} setPassword={set === '1'} />
}

export default ForgotPasswordPage
