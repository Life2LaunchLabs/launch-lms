import { notFound, redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import ActivityClient from '../../../../../../(withmenu)/course/[courseuuid]/activity/[activityid]/activity'
import { getActivityWithAuthHeader } from '@services/courses/activities'
import { getCourseMetadata } from '@services/courses/courses'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { getOrgQuickstartCourseUuid, normalizeCourseUuid } from '@services/org/quickstart'

type PageProps = {
  params: Promise<{ orgslug: string; courseuuid: string; activityid: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

async function fetchCourseMetadata(courseuuid: string, accessToken: string | null | undefined) {
  return await getCourseMetadata(
    courseuuid,
    { revalidate: 60, tags: ['courses'] },
    accessToken || null
  )
}

export default async function QuickstartActivityPage({ params, searchParams }: PageProps) {
  const { orgslug, courseuuid, activityid } = await params
  const session = await getServerSession()
  const accessToken = session?.tokens?.access_token || null
  const resolvedSearchParams = await searchParams
  const guestCompletedHint = resolvedSearchParams?.guest_completed === '1'

  const org = await getOrganizationContextInfo(orgslug, {
    revalidate: 0,
    tags: ['organizations'],
  })
  const configuredCourseUuid = normalizeCourseUuid(getOrgQuickstartCourseUuid(org))

  if (!configuredCourseUuid || configuredCourseUuid !== normalizeCourseUuid(courseuuid)) {
    redirect('/quickstart')
  }

  let courseMeta
  let activity

  try {
    [courseMeta, activity] = await Promise.all([
      fetchCourseMetadata(courseuuid, accessToken),
      getActivityWithAuthHeader(
        activityid,
        { revalidate: 0, tags: ['activities'] },
        accessToken || null
      ),
    ])
  } catch (error: any) {
    if (!session && (error?.status === 401 || error?.status === 403)) {
      redirect('/welcome')
    }
    notFound()
  }

  if (!courseMeta || !activity) {
    notFound()
  }

  return (
    <ActivityClient
      activityid={activityid}
      courseuuid={courseuuid}
      orgslug={orgslug}
      activity={activity}
      course={courseMeta}
      unauthenticated={!session}
      guestCompletedHint={guestCompletedHint}
      quickstartMode
    />
  )
}
