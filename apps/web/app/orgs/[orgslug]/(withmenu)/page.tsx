export const dynamic = 'force-dynamic'
import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { getServerSession } from '@/lib/auth/server'
import { getOrgThumbnailMediaDirectory, getOrgLogoMediaDirectory, getOrgOgImageMediaDirectory } from '@services/media/media'
import { getCanonicalUrl, getOrgSeoConfig, buildPageTitle } from '@/lib/seo/utils'
import { JsonLd } from '@components/SEO/JsonLd'
import LandingClassic from '@components/Landings/LandingClassic'
import DashboardActionHero from '@components/Landings/DashboardActionHero'

type MetadataProps = {
  params: Promise<{ orgslug: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export async function generateMetadata(props: MetadataProps): Promise<Metadata> {
  const params = await props.params;
  // Get Org context information
  const org = await getOrganizationContextInfo(params.orgslug, {
    revalidate: 0,
    tags: ['organizations'],
  })

  const seoConfig = getOrgSeoConfig(org)
  const ogImageUrl = seoConfig.default_og_image
    ? getOrgOgImageMediaDirectory(org?.org_uuid, seoConfig.default_og_image)
    : null
  const imageUrl = ogImageUrl || getOrgThumbnailMediaDirectory(org?.org_uuid, org?.thumbnail_image)
  const canonical = getCanonicalUrl(params.orgslug, '/')
  const title = buildPageTitle('Home', org.name, seoConfig)
  const description = org.description || seoConfig.default_meta_description || ''

  // SEO
  return {
    title,
    description,
    robots: {
      index: true,
      follow: true,
      nocache: true,
      googleBot: {
        index: true,
        follow: true,
        'max-image-preview': 'large',
      },
    },
    alternates: {
      canonical,
    },
    ...(seoConfig.google_site_verification
      ? {
          verification: {
            google: seoConfig.google_site_verification,
          },
        }
      : {}),
    openGraph: {
      title,
      description,
      type: 'website',
      images: [
        {
          url: imageUrl,
          width: 800,
          height: 600,
          alt: org.name,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
      ...(seoConfig.twitter_handle && { site: seoConfig.twitter_handle }),
    },
  }
}

const OrgHomePage = async (params: any) => {
  const orgslug = (await params.params).orgslug
  const session = await getServerSession()

  if (!session) {
    redirect('/welcome')
  }

  const dashboardDisplayName =
    session?.user?.first_name || session?.user?.username || 'there'
  const org = await getOrganizationContextInfo(orgslug, {
    revalidate: 0,
    tags: ['organizations'],
  })

  const logoUrl = org?.logo_image ? getOrgLogoMediaDirectory(org.org_uuid, org.logo_image) : undefined
  const orgJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: org.name,
    description: org.description,
    url: getCanonicalUrl(orgslug, '/'),
    ...(logoUrl && { logo: logoUrl }),
  }

  return (
    <div className="w-full">
      <JsonLd data={orgJsonLd} />
      <DashboardActionHero
        displayName={dashboardDisplayName}
        orgslug={orgslug}
      />
      <LandingClassic orgslug={orgslug} />
    </div>
  )
}

export default OrgHomePage
