import React from 'react'
import LearningBadgeOverview from '@components/Learning/LearningBadgeOverview'
import { getServerSession } from '@/lib/auth/server'
import { notFound } from 'next/navigation'
import { getLearningPath } from '@services/learning/learning'

type BadgePathPageProps = {
  params: Promise<{ orgslug: string; uuid: string }>
  searchParams?: Promise<{ assignment?: string; planObjective?: string }>
}

const BadgePathPage = async ({ params, searchParams }: BadgePathPageProps) => {
  const { uuid, orgslug } = await params
  const assignment = (await searchParams)?.assignment
  const planObjective = (await searchParams)?.planObjective
  const session = await getServerSession()

  try {
    const badgePath = await getLearningPath(
      uuid,
      session?.tokens?.access_token ?? undefined,
      true,
      { revalidate: 0, tags: ['learning-badges'] },
      undefined,
      assignment,
      planObjective,
    )
    return (
      <LearningBadgeOverview
        orgslug={orgslug}
        badgePath={badgePath}
        programAssignmentUuid={assignment}
        planObjectiveUuid={planObjective}
      />
    )
  } catch {
    notFound()
  }
}

export default BadgePathPage
