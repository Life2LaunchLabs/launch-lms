import { notFound } from 'next/navigation'
import LearningActivityEditor from '@components/Learning/LearningActivityEditor'
import { getServerSession } from '@/lib/auth/server'
import { getLearningPath } from '@services/learning/learning'

function cleanActivityId(value: string) {
  return String(value || '').replace(/^learning_activity_/, '')
}

export default async function LearningActivityEditorPage({ params, searchParams }: { params: Promise<{ orgslug: string; badgeuuid: string; activityuuid: string }>; searchParams: Promise<{ version?: string }> }) {
  const { orgslug, badgeuuid, activityuuid } = await params
  const { version } = await searchParams
  const session = await getServerSession()
  try {
    const badgePath = await getLearningPath(badgeuuid, session?.tokens?.access_token, false, { revalidate: 0, tags: ['learning-badges'] }, version)
    const activity = (badgePath.activities || []).find((item: any) => cleanActivityId(item.activity_uuid) === cleanActivityId(activityuuid))
    if (!activity) notFound()
    return <LearningActivityEditor orgslug={orgslug} badgePath={badgePath} activity={activity} />
  } catch {
    notFound()
  }
}
