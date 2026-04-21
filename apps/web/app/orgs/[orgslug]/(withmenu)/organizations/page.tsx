import { Metadata } from 'next'
import { getServerSession } from '@/lib/auth/server'
import { JsonLd } from '@components/SEO/JsonLd'
import { getCanonicalUrl, buildBreadcrumbJsonLd, buildPageTitle, getOrgSeoConfig } from '@/lib/seo/utils'
import { getOrganizationContextInfo, getDiscoverOrganizations } from '@services/organizations/orgs'
import OrganizationsPageClient from './organizations'

type OrganizationsPageProps = {
  params: Promise<{ orgslug: string }>
  searchParams: Promise<{ q?: string }>
}

export async function generateMetadata(props: OrganizationsPageProps): Promise<Metadata> {
  const params = await props.params
  const org = await getOrganizationContextInfo(params.orgslug, {
    revalidate: 0,
    tags: ['organizations'],
  })
  const seoConfig = getOrgSeoConfig(org)

  return {
    title: buildPageTitle('Organizations', org.name, seoConfig),
    description: `Browse organizations connected to ${org.name}.`,
    alternates: {
      canonical: getCanonicalUrl(params.orgslug, '/organizations'),
    },
  }
}

export default async function OrganizationsPage(props: OrganizationsPageProps) {
  const params = await props.params
  const searchParams = await props.searchParams
  const session = await getServerSession()
  const accessToken = session?.tokens?.access_token
  const query = searchParams.q || ''

  const organizations = await getDiscoverOrganizations(
    {
      page: 1,
      limit: 48,
      query,
    },
    { revalidate: 0, tags: ['organizations'] },
    accessToken ?? undefined
  )

  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: 'Home', url: getCanonicalUrl(params.orgslug, '/') },
    { name: 'Organizations', url: getCanonicalUrl(params.orgslug, '/organizations') },
  ])

  return (
    <>
      <JsonLd data={breadcrumbJsonLd} />
      <OrganizationsPageClient
        organizations={organizations || []}
        orgslug={params.orgslug}
        query={query}
      />
    </>
  )
}
