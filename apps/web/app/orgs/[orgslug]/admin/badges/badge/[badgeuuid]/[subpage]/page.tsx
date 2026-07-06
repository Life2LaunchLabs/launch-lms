import { notFound } from 'next/navigation'
import AdminBadgeShell from '@components/Learning/AdminBadgeShell'
import { getServerSession } from '@/lib/auth/server'
import { getLearningBadge } from '@services/learning/learning'

export default async function AdminBadgeSubpage({
  params,
}: {
  params: Promise<{ orgslug: string; badgeuuid: string; subpage: string }>
}) {
  const { orgslug, badgeuuid, subpage } = await params
  const session = await getServerSession()

  try {
    const badge = await getLearningBadge(badgeuuid, session?.tokens?.access_token, { revalidate: 0, tags: ['learning-badges'] })
    return <AdminBadgeShell orgslug={orgslug} badge={badge} activeSubpage={subpage} />
  } catch {
    notFound()
  }
}
