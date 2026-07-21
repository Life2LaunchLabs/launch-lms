import React from 'react'
import { Metadata } from 'next'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { getServerSession } from '@/lib/auth/server'
import { getOrgThumbnailMediaDirectory, getOrgOgImageMediaDirectory } from '@services/media/media'
import { getCanonicalUrl, getOrgSeoConfig, buildPageTitle, buildBreadcrumbJsonLd } from '@/lib/seo/utils'
import { JsonLd } from '@components/SEO/JsonLd'
import { getLearningBadgeAwards, getLearningBadgeCollections } from '@services/learning/learning'
import BadgeDiscoverPage from '@components/Badges/BadgeDiscoverPage'

type MetadataProps = {
  params: Promise<{ orgslug: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

function cleanBadgeUuid(value?: string | null) {
  return String(value || '').replace(/^badge_/, '')
}

function getAwardedBadgeUuid(award: any) {
  return (
    award?.badge?.badge_uuid ||
    award?.award?.badge_uuid ||
    award?.badge_class?.id ||
    ''
  )
}

function filterAvailableCollections(collections: any[], earnedBadgeUuids: Set<string>) {
  return (collections || [])
    .map((collection: any) => ({
      ...collection,
      badges: (collection.badges || []).filter((badge: any) => (
        !earnedBadgeUuids.has(cleanBadgeUuid(badge.badge_uuid))
      )),
    }))
    .filter((collection: any) => (collection.badges || []).length > 0)
}

export async function generateMetadata(props: MetadataProps): Promise<Metadata> {
  const params = await props.params
  const org = await getOrganizationContextInfo(params.orgslug, {
    revalidate: 0,
    tags: ['organizations'],
  })

  const seoConfig = getOrgSeoConfig(org)
  const ogImageUrl = seoConfig.default_og_image
    ? getOrgOgImageMediaDirectory(org?.org_uuid, seoConfig.default_og_image)
    : null
  const imageUrl = ogImageUrl || getOrgThumbnailMediaDirectory(org?.org_uuid, org?.thumbnail_image)
  const canonical = getCanonicalUrl(params.orgslug, '/badges')
  const title = buildPageTitle('Badges', org.name, seoConfig)
  const description = org.description || seoConfig.default_meta_description || ''

  return {
    title,
    description,
    keywords: `${org.name}, ${org.description}, badges, digital badges, learning, education, online learning, ${org.name} badges`,
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

const BadgesPage = async (params: any) => {
  const orgslug = (await params.params).orgslug
  const searchParams = await params.searchParams
  const choosingBadge = searchParams?.choose === '1'
  const org = await getOrganizationContextInfo(orgslug, {
    revalidate: 1800,
    tags: ['organizations'],
  })
  const session = await getServerSession()
  const access_token = session?.tokens?.access_token

  let collections: any[] = []
  let earnedBadgeUuids = new Set<string>()

  try {
    const response = await getLearningBadgeCollections(
      undefined,
      access_token ?? undefined,
      false,
      { revalidate: 0, tags: ['learning-badges'] }
    )
    const rawLearningCollections = response.success ? response.data : response
    collections = [
      ...rawLearningCollections,
      ...collections,
    ]
  } catch (error: any) {
    console.error('Failed to load badge collections', {
      orgslug,
      error,
    })
  }

  if (access_token) {
    try {
      const awards = await getLearningBadgeAwards(undefined, access_token)
      earnedBadgeUuids = new Set((awards || []).map(getAwardedBadgeUuid).map(cleanBadgeUuid).filter(Boolean))
    } catch (error: any) {
      console.error('Failed to load earned badges for catalog filtering', {
        orgslug,
        error,
      })
    }
  }

  collections = filterAvailableCollections(collections, earnedBadgeUuids)

  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: 'Home', url: getCanonicalUrl(orgslug, '/') },
    { name: 'Badges', url: getCanonicalUrl(orgslug, '/badges') },
  ])

  return (
    <div>
      <JsonLd data={breadcrumbJsonLd} />
      <BadgeDiscoverPage
        orgslug={orgslug}
        collections={collections}
        choosingBadge={choosingBadge}
      />
    </div>
  )
}

export default BadgesPage
