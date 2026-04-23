import { getActivityWithAuthHeader } from '@services/courses/activities'
import { getCourseMetadata } from '@services/courses/courses'
import ActivityClient from '../../../../../../(withmenu)/course/[courseuuid]/activity/[activityid]/activity'
import { Metadata } from 'next'
import { getServerSession } from '@/lib/auth/server'
import { notFound } from 'next/navigation'

type MetadataProps = {
  params: Promise<{ orgslug: string; courseuuid: string; activityid: string }>
}

export async function generateMetadata(props: MetadataProps): Promise<Metadata> {
  const params = await props.params
  const session = await getServerSession()
  const access_token = session?.tokens?.access_token || null

  try {
    const course = await getCourseMetadata(
      params.courseuuid,
      { revalidate: 60, tags: ['courses'] },
      access_token
    )
    const activity = await getActivityWithAuthHeader(
      params.activityid,
      { revalidate: 0, tags: ['activities'] },
      access_token
    )

    return {
      title: `${activity.name} - ${course.name}`,
      description: course.description || '',
    }
  } catch {
    return {
      title: 'Onboarding',
    }
  }
}

export default async function GuestOnboardingActivityPage(params: any) {
  const session = await getServerSession()
  const access_token = session?.tokens?.access_token || null
  const activityid = (await params.params).activityid
  const courseuuid = (await params.params).courseuuid
  const orgslug = (await params.params).orgslug
  const searchParams = await params.searchParams
  const guestCompletedHint = searchParams?.guest_completed === '1'

  try {
    const [course, activity] = await Promise.all([
      getCourseMetadata(courseuuid, { revalidate: 60, tags: ['courses'] }, access_token),
      getActivityWithAuthHeader(activityid, { revalidate: 0, tags: ['activities'] }, access_token),
    ])

    return (
      <ActivityClient
        activityid={activityid}
        courseuuid={courseuuid}
        orgslug={orgslug}
        activity={activity}
        course={course}
        guestMode={true}
        unauthenticated={!session}
        guestCompletedHint={guestCompletedHint}
      />
    )
  } catch {
    notFound()
  }
}
