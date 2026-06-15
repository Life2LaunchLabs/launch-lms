import { getActivityWithAuthHeader } from '@services/courses/activities'
import { getCourseMetadata } from '@services/courses/courses'
import ActivityClient from './activity'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { getCourseThumbnailMediaDirectory, getOrgOgImageMediaDirectory } from '@services/media/media'
import { Metadata } from 'next'
import { getServerSession } from '@/lib/auth/server'
import { getCanonicalUrl, getOrgSeoConfig, buildBreadcrumbJsonLd } from '@/lib/seo/utils'
import { JsonLd } from '@components/SEO/JsonLd'
import { notFound, redirect } from 'next/navigation'
import { getUriWithOrg, routePaths } from '@services/config/config'

type MetadataProps = {
  params: Promise<{ orgslug: string; courseuuid: string; activityid: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

// Add this function at the top level to avoid duplicate fetches
async function fetchCourseMetadata(courseuuid: string, access_token: string | null | undefined) {
  return await getCourseMetadata(
    courseuuid,
    { revalidate: 60, tags: ['courses'] },
    access_token || null
  )
}

function findChapterForActivityId(course: any, activityId: string) {
  const cleanActivityId = activityId.replace('activity_', '')
  return (course?.chapters || []).find((chapter: any) =>
    (chapter.activities || []).some((activity: any) =>
      activity.activity_uuid?.replace('activity_', '') === cleanActivityId ||
      String(activity.id || '') === activityId
    )
  )
}

export async function generateMetadata(props: MetadataProps): Promise<Metadata> {
  const params = await props.params;
  const session = await getServerSession()
  const access_token = session?.tokens?.access_token || null
  const isCourseEnd = params.activityid === 'end';

  // Get Org context information
  const org = await getOrganizationContextInfo(params.orgslug, {
    revalidate: 1800,
    tags: ['organizations'],
  })
  let course_meta: any
  let activity: any = null

  try {
    course_meta = await fetchCourseMetadata(params.courseuuid, access_token)
    if (!isCourseEnd) {
      activity = await getActivityWithAuthHeader(
        params.activityid,
        { revalidate: 0, tags: ['activities'] },
        access_token || null
      )
    }
  } catch {
    return {
      title: `Activity — ${org?.name || 'Launch LMS'}`,
      description: 'View this course activity on Launch LMS',
    }
  }

  // Check if this is the course end page
  const seoConfig = getOrgSeoConfig(org)
  const rawTitle = isCourseEnd ? `Congratulations — ${course_meta.name} Course` : `${activity?.name || 'Activity'} — ${course_meta.name} Course`
  const pageTitle = seoConfig.default_meta_title_suffix ? `${rawTitle}${seoConfig.default_meta_title_suffix}` : rawTitle

  const orgOgImageUrl = seoConfig.default_og_image
    ? getOrgOgImageMediaDirectory(org?.org_uuid, seoConfig.default_og_image)
    : null
  const imageUrl = course_meta?.thumbnail_image
    ? getCourseThumbnailMediaDirectory(
        org?.org_uuid,
        course_meta?.course_uuid,
        course_meta?.thumbnail_image
      )
    : orgOgImageUrl || '/empty_thumbnail.png'
  const canonical = getCanonicalUrl(params.orgslug, `/course/${params.courseuuid}/activity/${params.activityid}`)

  // SEO
  return {
    title: pageTitle,
    description: course_meta.description || seoConfig.default_meta_description || '',
    keywords: course_meta.learnings,
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
      title: pageTitle,
      description: course_meta.description || seoConfig.default_meta_description || '',
      publishedTime: course_meta.creation_date,
      tags: course_meta.learnings,
      images: [
        {
          url: imageUrl,
          width: 800,
          height: 600,
          alt: course_meta.name,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: pageTitle,
      description: course_meta.description || seoConfig.default_meta_description || '',
      images: [imageUrl],
      ...(seoConfig.twitter_handle && { site: seoConfig.twitter_handle }),
    },
  }
}

const ActivityPage = async (params: any) => {
  const session = await getServerSession()
  const access_token = session?.tokens?.access_token || null
  const activityid = (await params.params).activityid
  const courseuuid = (await params.params).courseuuid
  const orgslug = (await params.params).orgslug
  const searchParams = await params.searchParams
  const guestCompletedHint = searchParams?.guest_completed === '1'
  const isCourseEnd = activityid === 'end'

  if (isCourseEnd) {
    redirect(getUriWithOrg(orgslug, routePaths.org.course(courseuuid)))
  }

  let course_meta
  let activity = null

  try {
    course_meta = await fetchCourseMetadata(courseuuid, access_token)
  } catch (error: any) {
    // Unauthenticated user hitting a private course/activity → send to welcome
    if (!session && (error?.status === 401 || error?.status === 403)) {
      redirect('/welcome')
    }
    notFound()
  }

  if (!course_meta) {
    notFound()
  }

  const activityChapter = findChapterForActivityId(course_meta, activityid)
  if (activityChapter) {
    const chapterId = (activityChapter.chapter_uuid || activityChapter.id || '').toString().replace('chapter_', '')
    redirect(getUriWithOrg(orgslug, routePaths.org.badgeChapter(courseuuid, chapterId)))
  }

  try {
    if (!isCourseEnd) {
      activity = await getActivityWithAuthHeader(
        activityid,
        { revalidate: 0, tags: ['activities'] },
        access_token || null
      )
    }
  } catch (error: any) {
    if (!session && (error?.status === 401 || error?.status === 403)) {
      redirect('/welcome')
    }
    notFound()
  }

  if (!isCourseEnd && !activity) {
    notFound()
  }

  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: 'Home', url: getCanonicalUrl(orgslug, '/') },
    { name: 'Badges', url: getCanonicalUrl(orgslug, '/badges') },
    { name: course_meta.name, url: getCanonicalUrl(orgslug, `/course/${courseuuid}`) },
    {
      name: isCourseEnd ? 'Course Complete' : activity.name,
      url: getCanonicalUrl(orgslug, `/course/${courseuuid}/activity/${activityid}`),
    },
  ])

  return (
    <>
      <JsonLd data={breadcrumbJsonLd} />
      <ActivityClient
        activityid={activityid}
        courseuuid={courseuuid}
        orgslug={orgslug}
        activity={activity}
        course={course_meta}
        unauthenticated={!session}
        guestCompletedHint={guestCompletedHint}
      />
    </>
  )
}

export default ActivityPage
