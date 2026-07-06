import { notFound } from 'next/navigation'
import AdminBadgeShell from '@components/Learning/AdminBadgeShell'
import AdminLearningPath from '@components/Learning/AdminLearningPath'
import { getServerSession } from '@/lib/auth/server'
import { getLearningPath } from '@services/learning/learning'

export default async function AdminBadgeLearningPathPage({ params }: { params: Promise<{ orgslug: string; badgeuuid: string }> }) {
  const { orgslug, badgeuuid } = await params
  const session = await getServerSession()
  try {
    const badgePath = await getLearningPath(badgeuuid, session?.tokens?.access_token, false, { revalidate: 0, tags: ['learning-badges'] })
    return (
      <AdminBadgeShell orgslug={orgslug} badge={badgePath.badge} activeSubpage="learning-path">
        <AdminLearningPath orgslug={orgslug} badgePath={badgePath} />
      </AdminBadgeShell>
    )
  } catch {
    notFound()
  }
}
