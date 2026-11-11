import { Metadata } from 'next'
import { getServerSession } from '@/lib/auth/server'
import { JsonLd } from '@components/SEO/JsonLd'
import { buildBreadcrumbJsonLd, buildPageTitle, getCanonicalUrl, getOrgSeoConfig } from '@/lib/seo/utils'
import {
  getDiscoverOrganizationBySlug,
  getOrganizationContextInfo,
} from '@services/organizations/orgs'
import OrganizationDetailClient from './organization'
import PrivateOrganization from '@components/Organizations/PrivateOrganization'
import { PageTitleRegistration } from '@components/Contexts/PageTitleContext'

// An unlisted organization's page is members-only: the API answers 404 to everyone else.
async function findOrganization(slug: string, accessToken?: string) {
  try {
    return await getDiscoverOrganizationBySlug(slug, { revalidate: 0, tags: ['organizations'] }, accessToken)
  } catch (error: any) {
    if (error?.status === 404) return null
    throw error
  }
}

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
  const organization = await findOrganization(params.discoverOrgSlug, accessToken ?? undefined)
  const seoConfig = getOrgSeoConfig(currentOrg)
  if (!organization) return { title: buildPageTitle('Organization', currentOrg.name, seoConfig), robots: { index: false } }

  return {
    title: buildPageTitle(organization.name, currentOrg.name, seoConfig),
    description: organization.description || organization.about || `Explore ${organization.name}.`,
    // Only listed pages are meant to be found.
    robots: organization.explore ? undefined : { index: false },
    alternates: {
      canonical: getCanonicalUrl(params.orgslug, `/organization/${organization.slug}`),
    },
  }
}

export default async function OrganizationDetailPage(props: OrganizationDetailPageProps) {
  const params = await props.params
  const session = await getServerSession()
  const accessToken = session?.tokens?.access_token
  const organization = await findOrganization(params.discoverOrgSlug, accessToken ?? undefined)
  if (!organization) return <PrivateOrganization orgslug={params.orgslug} signedIn={Boolean(accessToken)} />

  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: 'Home', url: getCanonicalUrl(params.orgslug, '/') },
    { name: 'Discover', url: getCanonicalUrl(params.orgslug, '/discover') },
    { name: organization.name, url: getCanonicalUrl(params.orgslug, `/organization/${organization.slug}`) },
  ])

  return (
    <>
      <PageTitleRegistration section="Organizations" detail={organization.name} />
      <JsonLd data={breadcrumbJsonLd} />
      <OrganizationDetailClient
        organization={organization}
        currentOrgslug={params.orgslug}
      />
    </>
  )
}
