import React from 'react'
import { getCourseMetadata } from '@services/courses/courses'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { Metadata } from 'next'
import { getCourseThumbnailMediaDirectory, getOrgOgImageMediaDirectory } from '@services/media/media'
import { getServerSession } from '@/lib/auth/server'
import { buildPageTitle, getCanonicalUrl, getOrgSeoConfig } from '@/lib/seo/utils'
import { notFound, redirect } from 'next/navigation'
import BadgeRouteDispatcher from './BadgeRouteDispatcher'

type MetadataProps = {
  params: Promise<{ orgslug: string; uuid: string }>
}

export async function generateMetadata(props: MetadataProps): Promise<Metadata> {
  const { orgslug, uuid } = await props.params
  const session = await getServerSession()
  const org = await getOrganizationContextInfo(orgslug, {
    revalidate: 1800,
    tags: ['organizations'],
  })

  try {
    const course = await getCourseMetadata(
      uuid,
      { revalidate: 0, tags: ['courses'] },
      session?.tokens?.access_token ?? undefined
    )
    const seoConfig = getOrgSeoConfig(org)
    const seo = course.seo || {}
    const defaultTitle = buildPageTitle(course.name, org.name, seoConfig)
    const orgOgImageUrl = seoConfig.default_og_image
      ? getOrgOgImageMediaDirectory(org?.org_uuid, seoConfig.default_og_image)
      : null
    const defaultImage = course.thumbnail_image
      ? getCourseThumbnailMediaDirectory(
          course.owner_org_uuid || org?.org_uuid,
          course.course_uuid,
          course.thumbnail_image
        )
      : orgOgImageUrl || '/empty_thumbnail.png'

    return {
      title: seo.title || defaultTitle,
      description: seo.description || course.description || seoConfig.default_meta_description || '',
      alternates: {
        canonical: seo.canonical_url || getCanonicalUrl(orgslug, `/badges/${uuid}`),
      },
      openGraph: {
        title: seo.og_title || seo.title || defaultTitle,
        description: seo.og_description || seo.description || course.description || '',
        images: [{ url: seo.og_image || defaultImage, alt: course.name }],
        type: 'article',
      },
    }
  } catch {
    return {
      title: `Badge - ${org?.name || 'Launch LMS'}`,
      description: 'View this badge on Launch LMS',
    }
  }
}

const BadgePage = async (props: MetadataProps) => {
  const { uuid, orgslug } = await props.params
  const session = await getServerSession()
  let course = null
  let fetchError: { status?: number } | null = null

  try {
    course = await getCourseMetadata(
      uuid,
      { revalidate: 0, tags: ['courses'] },
      session?.tokens?.access_token ?? undefined
    )
  } catch (error: any) {
    fetchError = { status: error?.status }
  }

  if (!session && fetchError?.status === 401) redirect('/welcome')
  if (!course && !fetchError) notFound()

  return (
    <BadgeRouteDispatcher
      courseuuid={uuid}
      orgslug={orgslug}
      course={course}
    />
  )
}

export default BadgePage
