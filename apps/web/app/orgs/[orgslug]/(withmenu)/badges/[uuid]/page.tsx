import React from 'react'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { Metadata } from 'next'
import { getOrgOgImageMediaDirectory, normalizeMediaUrl } from '@services/media/media'
import { getServerSession } from '@/lib/auth/server'
import { buildPageTitle, getCanonicalUrl, getOrgSeoConfig } from '@/lib/seo/utils'
import { notFound, redirect } from 'next/navigation'
import LearningBadgeOverview from '@components/Learning/LearningBadgeOverview'
import { getLearningPath } from '@services/learning/learning'
import { getUriWithOrg, routePaths } from '@services/config/config'

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
    const badgePath = await getLearningPath(
      uuid,
      session?.tokens?.access_token ?? undefined,
      true,
      { revalidate: 0, tags: ['courses'] },
    )
    const course = badgePath.badge
    const seoConfig = getOrgSeoConfig(org)
    const seo = course.seo || {}
    const defaultTitle = buildPageTitle(course.name, org.name, seoConfig)
    const orgOgImageUrl = seoConfig.default_og_image
      ? getOrgOgImageMediaDirectory(org?.org_uuid, seoConfig.default_og_image)
      : null
    const defaultImage = normalizeMediaUrl(course.thumbnail_image_url || course.thumbnail_image) || orgOgImageUrl || '/empty_thumbnail.png'

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

  try {
    const badgePath = await getLearningPath(
      uuid,
      session?.tokens?.access_token ?? undefined,
      true,
      { revalidate: 0, tags: ['learning-badges'] }
    )
    const run = badgePath.run
    if (run?.award || run?.status === 'completed' || run?.completed_at) {
      redirect(getUriWithOrg(orgslug, routePaths.org.badgeStatus(uuid)))
    }
    if (run) {
      redirect(getUriWithOrg(orgslug, routePaths.org.badgePath(uuid)))
    }
    return (
      <LearningBadgeOverview
        orgslug={orgslug}
        badgePath={badgePath}
      />
    )
  } catch (error: any) {
    if (String(error?.digest || '').startsWith('NEXT_REDIRECT')) throw error
  }
  notFound()
}

export default BadgePage
