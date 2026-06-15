import { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getActivityWithAuthHeader } from '@services/courses/activities'
import { getCourseMetadata } from '@services/courses/courses'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { getCourseThumbnailMediaDirectory, getOrgOgImageMediaDirectory } from '@services/media/media'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { getServerSession } from '@/lib/auth/server'
import { buildBreadcrumbJsonLd, getCanonicalUrl, getOrgSeoConfig } from '@/lib/seo/utils'
import { JsonLd } from '@components/SEO/JsonLd'
import ActivityClient from '../../../../course/[courseuuid]/activity/[activityid]/activity'

type ChapterPageProps = {
  params: Promise<{ orgslug: string; uuid: string; chapterid: string }>
}

async function fetchCourseMetadata(courseuuid: string, accessToken: string | null | undefined) {
  return await getCourseMetadata(
    courseuuid,
    { revalidate: 60, tags: ['courses'] },
    accessToken || null
  )
}

function cleanPrefixedId(value: string | number | null | undefined, prefix: string) {
  return String(value || '').replace(prefix, '')
}

function findChapter(course: any, chapterId: string) {
  const cleanChapterId = cleanPrefixedId(chapterId, 'chapter_')
  return (course?.chapters || []).find((chapter: any) => (
    cleanPrefixedId(chapter.chapter_uuid, 'chapter_') === cleanChapterId ||
    String(chapter.id || '') === chapterId ||
    String(chapter.id || '') === cleanChapterId
  ))
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
    const course = await fetchCourseMetadata(params.uuid, accessToken)
    const chapter = findChapter(course, params.chapterid)
    const seoConfig = getOrgSeoConfig(org)
    const rawTitle = `${chapter?.name || 'Chapter'} — ${course.name} Badge`
    const pageTitle = seoConfig.default_meta_title_suffix ? `${rawTitle}${seoConfig.default_meta_title_suffix}` : rawTitle
    const orgOgImageUrl = seoConfig.default_og_image
      ? getOrgOgImageMediaDirectory(org?.org_uuid, seoConfig.default_og_image)
      : null
    const imageUrl = course?.thumbnail_image
      ? getCourseThumbnailMediaDirectory(org?.org_uuid, course.course_uuid, course.thumbnail_image)
      : orgOgImageUrl || '/empty_thumbnail.png'

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

  let course
  try {
    course = await fetchCourseMetadata(params.uuid, accessToken)
  } catch (error: any) {
    if (!session && (error?.status === 401 || error?.status === 403)) {
      redirect('/welcome')
    }
    notFound()
  }

  const chapter = findChapter(course, params.chapterid)
  const firstActivity = chapter?.activities?.[0]
  const firstActivityId = firstActivity?.activity_uuid?.replace('activity_', '')

  if (!course || !chapter || !firstActivityId) {
    notFound()
  }

  let activity
  try {
    activity = await getActivityWithAuthHeader(
      firstActivityId,
      { revalidate: 0, tags: ['activities'] },
      accessToken || null
    )
  } catch (error: any) {
    if (!session && (error?.status === 401 || error?.status === 403)) {
      redirect('/welcome')
    }
    notFound()
  }

  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: 'Home', url: getCanonicalUrl(params.orgslug, '/') },
    { name: 'Badges', url: getCanonicalUrl(params.orgslug, '/badges') },
    { name: course.name, url: getCanonicalUrl(params.orgslug, `/badges/${params.uuid}`) },
    {
      name: chapter.name || 'Chapter',
      url: getCanonicalUrl(params.orgslug, `/badges/${params.uuid}/chapter/${params.chapterid}`),
    },
  ])

  return (
    <>
      <JsonLd data={breadcrumbJsonLd} />
      <ActivityClient
        activityid={firstActivityId}
        courseuuid={params.uuid}
        orgslug={params.orgslug}
        activity={activity}
        course={course}
        unauthenticated={!session}
        chapterid={params.chapterid}
      />
    </>
  )
}

export default BadgeChapterPage
