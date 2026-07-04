import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { getOrgOgImageMediaDirectory, normalizeMediaUrl } from '@services/media/media'
import { getServerSession } from '@/lib/auth/server'
import { getCanonicalUrl, getOrgSeoConfig } from '@/lib/seo/utils'
import { getLearningPath } from '@services/learning/learning'
import { LearningActivityPlayer } from '@components/Learning/LearningBadgeViews'
import { learningPathToLegacyCourse } from '@services/learning/legacyAdapters'

type ChapterPageProps = {
  params: Promise<{ orgslug: string; uuid: string; chapterid: string }>
}

export async function generateMetadata(props: ChapterPageProps): Promise<Metadata> {
  const params = await props.params
  const session = await getServerSession()
  const accessToken = session?.tokens?.access_token || null
  const org = await getOrganizationContextInfo(params.orgslug, {
    revalidate: 1800,
    tags: ['organizations'],
  })

  try {
    const badgePath = await getLearningPath(params.uuid, accessToken || undefined, true, { revalidate: 0, tags: ['learning-badges'] })
    const course = learningPathToLegacyCourse(badgePath, org)
    const cleanActivityId = params.chapterid.replace('learning_activity_', '')
    const chapter = (course?.chapters || []).find((item: any) => (
      item.chapter_uuid === params.chapterid ||
      item.chapter_uuid.replace('learning_activity_', '') === cleanActivityId
    ))
    const seoConfig = getOrgSeoConfig(org)
    const rawTitle = `${chapter?.name || 'Chapter'} — ${course.name} Badge`
    const pageTitle = seoConfig.default_meta_title_suffix ? `${rawTitle}${seoConfig.default_meta_title_suffix}` : rawTitle
    const orgOgImageUrl = seoConfig.default_og_image
      ? getOrgOgImageMediaDirectory(org?.org_uuid, seoConfig.default_og_image)
      : null
    const imageUrl = normalizeMediaUrl(course?.thumbnail_image_url || course?.thumbnail_image) || orgOgImageUrl || '/empty_thumbnail.png'

    return {
      title: pageTitle,
      description: course.description || seoConfig.default_meta_description || '',
      alternates: {
        canonical: getCanonicalUrl(params.orgslug, `/badges/${params.uuid}/chapter/${params.chapterid}`),
      },
      openGraph: {
        title: pageTitle,
        description: course.description || seoConfig.default_meta_description || '',
        images: [{ url: imageUrl, width: 800, height: 600, alt: course.name }],
      },
      twitter: {
        card: 'summary_large_image',
        title: pageTitle,
        description: course.description || seoConfig.default_meta_description || '',
        images: [imageUrl],
      },
    }
  } catch {
    return {
      title: `Chapter — ${org?.name || 'Launch LMS'}`,
      description: 'View this badge chapter on Launch LMS',
    }
  }
}

const BadgeChapterPage = async (props: ChapterPageProps) => {
  const params = await props.params
  const session = await getServerSession()
  const accessToken = session?.tokens?.access_token || null

  try {
    const badgePath = await getLearningPath(
      params.uuid,
      accessToken || undefined,
      true,
      { revalidate: 0, tags: ['learning-badges'] }
    )
    const cleanActivityId = params.chapterid.replace('learning_activity_', '')
    const activity = (badgePath.activities || []).find((item: any) => (
      item.activity_uuid === params.chapterid ||
      item.activity_uuid.replace('learning_activity_', '') === cleanActivityId
    ))
    if (activity) {
      return <LearningActivityPlayer orgslug={params.orgslug} badgePath={badgePath} activity={activity} />
    }
  } catch {}
  notFound()
}

export default BadgeChapterPage
