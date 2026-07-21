import React from 'react'
import LearningBadgeOverview from '@components/Learning/LearningBadgeOverview'
import { getServerSession } from '@/lib/auth/server'
import { notFound } from 'next/navigation'
import { getLearningPath } from '@services/learning/learning'

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
    return (
      <LearningBadgeOverview
        orgslug={orgslug}
        badgePath={badgePath}
      />
    )
  } catch {
    notFound()
  }
}

export default BadgeStatusPage
