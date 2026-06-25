import Courses from '../courses/courses'
import { getServerSession } from '@/lib/auth/server'
import { JsonLd } from '@components/SEO/JsonLd'
import { buildBreadcrumbJsonLd, getCanonicalUrl } from '@/lib/seo/utils'
import { getOrgCollections } from '@services/courses/collections'
import { getOrganizationContextInfo } from '@services/organizations/orgs'

const MyBadgesPage = async (params: any) => {
  const orgslug = (await params.params).orgslug
  const org = await getOrganizationContextInfo(orgslug, {
    revalidate: 1800,
    tags: ['organizations'],
  })
  const session = await getServerSession()
  const accessToken = session?.tokens?.access_token

  let collections: any[] = []

  try {
    collections = await getOrgCollections(
      org.id,
      accessToken ?? undefined,
      { revalidate: 0, tags: ['collections'] }
    )
  } catch (error: any) {
    console.error('Failed to load collections for my badges page', {
      orgslug,
      org_id: org.id,
      error,
    })
    collections = []
  }

  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: 'Home', url: getCanonicalUrl(orgslug, '/') },
    { name: 'My Badges', url: getCanonicalUrl(orgslug, '/mybadges') },
  ])

  return (
    <div>
      <JsonLd data={breadcrumbJsonLd} />
      <Courses
        org_id={org.id}
        orgslug={orgslug}
        collections={collections}
        view="mine"
        orgConfig={org.config}
      />
    </div>
  )
}

export default MyBadgesPage
