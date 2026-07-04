import React from 'react'
import Courses from '../courses/courses'
import { Metadata } from 'next'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { getServerSession } from '@/lib/auth/server'
import { getOrgThumbnailMediaDirectory, getOrgOgImageMediaDirectory } from '@services/media/media'
import { getCanonicalUrl, getOrgSeoConfig, buildPageTitle, buildBreadcrumbJsonLd } from '@/lib/seo/utils'
import { JsonLd } from '@components/SEO/JsonLd'
import { getLearningBadgeCollections } from '@services/learning/learning'
import { learningCollectionsToLegacyCollections } from '@services/learning/legacyAdapters'

type MetadataProps = {
  params: Promise<{ orgslug: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
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
  const view = searchParams?.view === 'mine' ? 'mine' : 'discover'
  const inviteBadge = typeof searchParams?.inviteBadge === 'string' ? searchParams.inviteBadge : undefined
  const org = await getOrganizationContextInfo(orgslug, {
    revalidate: 1800,
    tags: ['organizations'],
  })
  const session = await getServerSession()
  const access_token = session?.tokens?.access_token

  let collections: any[] = []
  let invitedBadgeCourse: any = null

  try {
    const response = await getLearningBadgeCollections(
      org.id,
      access_token ?? undefined,
      false,
      { revalidate: 0, tags: ['learning-badges'] }
    )
    const rawLearningCollections = response.success ? response.data : response
    collections = [
      ...learningCollectionsToLegacyCollections(rawLearningCollections, org),
      ...collections,
    ]
  } catch (error: any) {
    console.error('Failed to load badge collections', {
      orgslug,
      org_id: org.id,
      error,
    })
  }

  if (inviteBadge) {
    invitedBadgeCourse = collections
      .flatMap((collection: any) => collection.courses || [])
      .find((badge: any) => String(badge.course_uuid || '').replace(/^badge_/, '') === inviteBadge.replace(/^badge_/, '')) || null
  }

  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: 'Home', url: getCanonicalUrl(orgslug, '/') },
    { name: 'Badges', url: getCanonicalUrl(orgslug, '/badges') },
  ])

  return (
    <div>
      <JsonLd data={breadcrumbJsonLd} />
      <Courses
        org_id={org.id}
        orgslug={orgslug}
        collections={collections}
        view={view}
        inviteBadge={inviteBadge}
        invitedBadgeCourse={invitedBadgeCourse}
        orgConfig={org.config}
      />
    </div>
  )
}

export default BadgesPage
