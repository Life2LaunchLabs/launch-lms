import React from 'react'
import CourseClient from '../../../course/[courseuuid]/course'
import { getServerSession } from '@/lib/auth/server'
import { notFound } from 'next/navigation'
import { getLearningPath } from '@services/learning/learning'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { learningPathToLegacyCourse } from '@services/learning/legacyAdapters'

type BadgeStatusPageProps = {
  params: Promise<{ orgslug: string; uuid: string }>
}

const BadgeStatusPage = async ({ params }: BadgeStatusPageProps) => {
  const { uuid, orgslug } = await params
  const session = await getServerSession()

  try {
    const badgePath = await getLearningPath(
      uuid,
      session?.tokens?.access_token ?? undefined,
      true,
      { revalidate: 0, tags: ['learning-badges'] }
    )
    const org = await getOrganizationContextInfo(orgslug, {
      revalidate: 1800,
      tags: ['organizations'],
    })
    return (
      <CourseClient
        courseuuid={uuid}
        orgslug={orgslug}
        course={learningPathToLegacyCourse(badgePath, org)}
        access_token={session?.tokens?.access_token}
        learningBadgePath={badgePath}
      />
    )
  } catch {
    notFound()
  }
}

export default BadgeStatusPage
