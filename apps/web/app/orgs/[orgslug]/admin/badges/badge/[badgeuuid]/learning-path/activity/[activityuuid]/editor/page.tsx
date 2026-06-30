import { notFound } from 'next/navigation'
import LearningActivityEditor from '@components/Learning/LearningActivityEditor'
import { getServerSession } from '@/lib/auth/server'
import { getLearningPath } from '@services/learning/learning'

export default async function LearningActivityEditorPage({ params }: { params: Promise<{ orgslug: string; badgeuuid: string; activityuuid: string }> }) {
  const { orgslug, badgeuuid, activityuuid } = await params
  const session = await getServerSession()
  try {
    const badgePath = await getLearningPath(badgeuuid, session?.tokens?.access_token, false, { revalidate: 0, tags: ['learning-badges'] })
    const activity = (badgePath.activities || []).find((item: any) => item.activity_uuid === activityuuid)
    if (!activity) notFound()
    return <LearningActivityEditor orgslug={orgslug} badgePath={badgePath} activity={activity} />
  } catch {
    notFound()
  }
}
