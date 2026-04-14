import React from 'react'
import Courses from './courses'
import { Metadata } from 'next'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { getServerSession } from '@/lib/auth/server'
import { getOrgThumbnailMediaDirectory, getOrgOgImageMediaDirectory } from '@services/media/media'
import { getCanonicalUrl, getOrgSeoConfig, buildPageTitle, buildBreadcrumbJsonLd } from '@/lib/seo/utils'
import { JsonLd } from '@components/SEO/JsonLd'
import { getOrgCollections } from '@services/courses/collections'

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
  const canonical = getCanonicalUrl(params.orgslug, '/courses')
  const title = buildPageTitle('Courses', org.name, seoConfig)
  const description = org.description || seoConfig.default_meta_description || ''

  // SEO
  return {
    title,
    description,
    keywords: `${org.name}, ${org.description}, courses, learning, education, online learning, edu, online courses, ${org.name} courses`,
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

const CoursesPage = async (params: any) => {
  const orgslug = (await params.params).orgslug
  const org = await getOrganizationContextInfo(orgslug, {
    revalidate: 1800,
    tags: ['organizations'],
  })
  const session = await getServerSession()
  const access_token = session?.tokens?.access_token

  let collections: any[] = []

  try {
    collections = await getOrgCollections(
      org.id,
      access_token ?? undefined,
      { revalidate: 0, tags: ['collections'] }
    )
  } catch (error: any) {
    console.error('Failed to load collections for courses page', {
      orgslug,
      org_id: org.id,
      error,
    })
    collections = []
  }

  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: 'Home', url: getCanonicalUrl(orgslug, '/') },
    { name: 'Courses', url: getCanonicalUrl(orgslug, '/courses') },
  ])

  return (
    <div>
      <JsonLd data={breadcrumbJsonLd} />
      <Courses org_id={org.id} orgslug={orgslug} collections={collections} />
    </div>
  )
}

export default CoursesPage
