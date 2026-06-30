import React from 'react'
import { BadgePathClient } from '../../../course/[courseuuid]/course'
import { getCourseMetadata } from '@services/courses/courses'
import { getServerSession } from '@/lib/auth/server'
import { notFound, redirect } from 'next/navigation'
import { getLearningPath } from '@services/learning/learning'
import { LearningPathView } from '@components/Learning/LearningBadgeViews'

type BadgePathPageProps = {
  params: Promise<{ orgslug: string; uuid: string }>
}

const BadgePathPage = async ({ params }: BadgePathPageProps) => {
  const { uuid, orgslug } = await params
  const session = await getServerSession()

  try {
    const badgePath = await getLearningPath(
      uuid,
      session?.tokens?.access_token ?? undefined,
      true,
      { revalidate: 0, tags: ['learning-badges'] }
    )
    return <LearningPathView orgslug={orgslug} badgePath={badgePath} />
  } catch {}

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

  if (!session && fetchError?.status === 401) redirect('/')
  if (!course && !fetchError) notFound()

  return (
    <BadgePathClient
      courseuuid={uuid}
      orgslug={orgslug}
      course={course}
      access_token={session?.tokens?.access_token}
      serverError={fetchError}
    />
  )
}

export default BadgePathPage
