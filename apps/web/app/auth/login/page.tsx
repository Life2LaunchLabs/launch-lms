import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { getAuthBrandingOrgSlug } from '@services/org/orgResolution'
import LoginClient from './login'
import { Metadata } from 'next'
import OrgNotFound from '@components/Objects/StyledElements/Error/OrgNotFound'

export async function generateMetadata(): Promise<Metadata> {
  const orgslug = await getAuthBrandingOrgSlug()

  if (!orgslug) {
    return { title: 'Login — Launch LMS' }
  }

  const org = await getOrganizationContextInfo(orgslug, {
    revalidate: 60,
    tags: ['organizations'],
  })

  return {
    title: 'Login' + ` — ${org?.name || 'Launch LMS'}`,
    robots: { index: false, follow: false },
  }
}

const Login = async () => {
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
    <div>
      <LoginClient org={org}></LoginClient>
    </div>
  )
}

export default Login
