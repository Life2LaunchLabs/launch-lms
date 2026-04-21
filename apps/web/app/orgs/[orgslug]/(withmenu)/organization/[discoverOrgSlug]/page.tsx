import { Metadata } from 'next'
import { getServerSession } from '@/lib/auth/server'
import { JsonLd } from '@components/SEO/JsonLd'
import { buildBreadcrumbJsonLd, buildPageTitle, getCanonicalUrl, getOrgSeoConfig } from '@/lib/seo/utils'
import {
  getDiscoverOrganizationBySlug,
  getOrganizationContextInfo,
} from '@services/organizations/orgs'
import OrganizationDetailClient from './organization'

type OrganizationDetailPageProps = {
  params: Promise<{ orgslug: string; discoverOrgSlug: string }>
}

export async function generateMetadata(props: OrganizationDetailPageProps): Promise<Metadata> {
  const params = await props.params
  const session = await getServerSession()
  const accessToken = session?.tokens?.access_token
  const currentOrg = await getOrganizationContextInfo(params.orgslug, {
    revalidate: 0,
    tags: ['organizations'],
  })
  const organization = await getDiscoverOrganizationBySlug(
    params.discoverOrgSlug,
    { revalidate: 0, tags: ['organizations'] },
    accessToken ?? undefined
  )
  const seoConfig = getOrgSeoConfig(currentOrg)

  return {
    title: buildPageTitle(organization.name, currentOrg.name, seoConfig),
    description: organization.description || organization.about || `Explore ${organization.name}.`,
    alternates: {
      canonical: getCanonicalUrl(params.orgslug, `/organization/${organization.slug}`),
    },
  }
}

export default async function OrganizationDetailPage(props: OrganizationDetailPageProps) {
  const params = await props.params
  const session = await getServerSession()
  const accessToken = session?.tokens?.access_token
  const organization = await getDiscoverOrganizationBySlug(
    params.discoverOrgSlug,
    { revalidate: 0, tags: ['organizations'] },
    accessToken ?? undefined
  )

  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: 'Home', url: getCanonicalUrl(params.orgslug, '/') },
    { name: 'Organizations', url: getCanonicalUrl(params.orgslug, '/organizations') },
    { name: organization.name, url: getCanonicalUrl(params.orgslug, `/organization/${organization.slug}`) },
  ])

  return (
    <>
      <JsonLd data={breadcrumbJsonLd} />
      <OrganizationDetailClient
        organization={organization}
        currentOrgslug={params.orgslug}
      />
    </>
  )
}
