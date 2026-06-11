import React from 'react'
import { getCourseMetadata } from '@services/courses/courses'
import { getPublicCourseBadgeClass } from '@services/courses/certifications'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { Metadata } from 'next'
import { getCourseThumbnailMediaDirectory, getOrgOgImageMediaDirectory, normalizeMediaUrl } from '@services/media/media'
import { getServerSession } from '@/lib/auth/server'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { buildPageTitle, getCanonicalUrl, getOrgSeoConfig } from '@/lib/seo/utils'
import { notFound, redirect } from 'next/navigation'
import BadgeRouteDispatcher from './BadgeRouteDispatcher'

type MetadataProps = {
  params: Promise<{ orgslug: string; uuid: string }>
}

function normalizeCourseUuid(uuid: string) {
  return uuid.startsWith('course_') ? uuid : `course_${uuid}`
}

export async function generateMetadata(props: MetadataProps): Promise<Metadata> {
  const { orgslug, uuid } = await props.params
  const session = await getServerSession()
  const org = await getOrganizationContextInfo(orgslug, {
    revalidate: 1800,
    tags: ['organizations'],
  })

  if (!session) {
    const badgeClass = await getPublicCourseBadgeClass(normalizeCourseUuid(uuid))
    if (badgeClass.success) {
      const badge = badgeClass.data || {}
      const title = badge.name || `Badge - ${org?.name || 'Launch LMS'}`
      const description = badge.description || 'View this badge on Launch LMS'
      const image = normalizeMediaUrl(badge.image)

      return {
        title,
        description,
        alternates: {
          canonical: getCanonicalUrl(orgslug, `/badges/${uuid}`),
        },
        openGraph: {
          title,
          description,
          images: image ? [{ url: image, alt: title }] : undefined,
          type: 'website',
        },
      }
    }
  }

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

  if (!session) {
    redirect(getUriWithOrg(orgslug, routePaths.org.badgeInvite(uuid)))
  }

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
